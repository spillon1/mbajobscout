import { supabase } from '@/integrations/supabase/client';
import { Job, JobSource, JobType, Seniority } from '@/types/jobs';
import { getSafeJobUrl } from '@/lib/urlSafety';

function inferSeniority(title: string): Seniority {
  const t = title.toLowerCase();
  if (t.includes('intern') && !t.includes('internal') && !t.includes('international')) return 'intern';
  // "Senior Associate" / "Senior VC Associate" = mid, not senior
  if (/\bsenior\s+(vc\s+)?associate\b/.test(t)) return 'mid';
  if (/\b(senior|lead|head of|director|managing director|partner|principal|vp|vice president|cio|cfo|cto)\b/.test(t)) return 'senior';
  if (/\b(junior|graduate|entry.level|trainee|visiting analyst|analyst|associate)\b/.test(t)) return 'junior';
  if (/\b(manager|investment manager)\b/.test(t)) return 'mid';
  return 'unknown';
}

interface ScrapeResult {
  success: boolean;
  jobs: Job[];
  sourceStatuses: Record<string, { status: string; error?: string; count?: number }>;
  error?: string;
}

export async function scrapeJobs(
  sources: JobSource[],
  keywords: string[],
  location: string,
  signal?: AbortSignal,
  options?: { mode?: 'vc' | 'pe' | 'ib' | 'st' | 'mc' }
): Promise<ScrapeResult> {
  const enabledSources = sources
    .filter((s) => s.enabled)
    .map((s) => ({ name: s.name, url: s.url }));

  if (enabledSources.length === 0) {
    return { success: false, jobs: [], sourceStatuses: {}, error: 'No sources enabled' };
  }

  // Use a long timeout — LinkedIn alone can take 40+ seconds with pagination
  const controller = signal
    ? undefined
    : new AbortController();
  const timeoutId = !signal ? setTimeout(() => controller?.abort(), 300_000) : undefined; // 5 min

  const mode = options?.mode || 'vc';
  const fetchOptions: any = { body: { sources: enabledSources, keywords, location, mode } };
  fetchOptions.signal = signal || controller?.signal;

  let data: any, error: any;
  try {
    const result = await supabase.functions.invoke('scrape-jobs', fetchOptions);
    data = result.data;
    error = result.error;
  } finally {
    if (timeoutId) clearTimeout(timeoutId);
  }

  if (error) {
    console.error('Scrape error:', error);
    return { success: false, jobs: [], sourceStatuses: {}, error: error.message };
  }

  if (!data.success) {
    return { success: false, jobs: [], sourceStatuses: data.sourceStatuses || {}, error: data.error };
  }

  // Filter out junk entries
  const allRaw = (data.jobs || []).map((j: any): Job => {
      const rawJobUrl = j.jobUrl ?? j.url ?? '';
      const rawSourceUrl = j.sourceUrl ?? j.source_url ?? rawJobUrl;

      return {
        id: j.id ?? crypto.randomUUID(),
        title: j.title ?? 'Untitled role',
        company: j.company ?? 'Unknown',
        location: j.location ?? 'London, UK',
        type: (j.type as JobType) || 'full-time',
        seniority: inferSeniority(j.title ?? ''),
        source: j.source ?? 'Unknown source',
        sourceUrl: rawSourceUrl,
        jobUrl: getSafeJobUrl(rawJobUrl) ?? undefined,
        postedDate: j.postedDate ?? j.posted_date ?? undefined,
        description: j.description ?? undefined,
        salary: j.salary ?? undefined,
      };
    });

  // DEBUG: trace Venture5 filtering
  const v5Before = allRaw.filter(j => j.source === 'Venture5');
  console.log(`[DEBUG] Venture5 raw from edge fn: ${v5Before.length}`);

  const allJobs = allRaw.filter((j) => {
    const valid = isValidJob(j, mode);
    if (!valid && j.source === 'Venture5') {
      console.log(`[DEBUG] Venture5 DROPPED by isValidJob: "${j.title}" @ ${j.company} | loc: ${j.location}`);
    }
    return valid;
  });

  const v5After = allJobs.filter(j => j.source === 'Venture5');
  console.log(`[DEBUG] Venture5 after isValidJob: ${v5After.length}`);

  // Cross-source deduplication: keep first occurrence by normalized title+company
  const seen = new Set<string>();
  const dedupDropped: { title: string; company: string; source: string }[] = [];
  const jobs = allJobs.filter((j) => {
    const key = `${j.title.toLowerCase().trim()}::${j.company.toLowerCase().trim()}`;
    if (seen.has(key)) {
      dedupDropped.push({ title: j.title, company: j.company, source: j.source });
      return false;
    }
    seen.add(key);
    return true;
  });

  // DEBUG: log dedup stats per source
  const dedupBySource = new Map<string, number>();
  for (const d of dedupDropped) {
    dedupBySource.set(d.source, (dedupBySource.get(d.source) || 0) + 1);
  }
  const keptBySource = new Map<string, number>();
  for (const j of jobs) {
    keptBySource.set(j.source, (keptBySource.get(j.source) || 0) + 1);
  }
  console.log(`[DEBUG] Dedup: ${allJobs.length} → ${jobs.length}. Dropped by source:`, Object.fromEntries(dedupBySource));
  console.log(`[DEBUG] Kept by source:`, Object.fromEntries(keptBySource));

  // Upsert fresh rows (preserves alerted flag for existing URLs via onConflict)
  if (jobs.length > 0) {
    const rows = jobs.map((j) => ({
      title: j.title,
      company: j.company,
      location: j.location,
      type: j.type,
      source: j.source,
      source_url: j.sourceUrl || j.jobUrl || '',
      url: j.jobUrl || j.sourceUrl,
      posted_date: j.postedDate || null,
      description: j.description || null,
      salary: j.salary || null,
      mode,
    }));

    const { error: insertError } = await supabase
      .from('scraped_jobs')
      .upsert(rows, { onConflict: 'url', ignoreDuplicates: false });

    if (insertError) {
      console.error('Failed to save jobs:', insertError);
    }
  }

  return {
    success: true,
    jobs,
    sourceStatuses: data.sourceStatuses || {},
  };
}

export async function loadSavedJobs(mode: 'vc' | 'pe' | 'ib' | 'st' | 'mc' = 'vc'): Promise<Job[]> {
  const { data, error } = await supabase
    .from('scraped_jobs')
    .select('*')
    .eq('mode', mode)
    .order('scraped_at', { ascending: false });

  if (error) {
    console.error('Failed to load jobs:', error);
    return [];
  }

  const allSaved = (data || []).map((row): Job => ({
    id: row.id,
    title: row.title,
    company: row.company,
    location: row.location,
    type: row.type as JobType,
    seniority: inferSeniority(row.title),
    source: row.source,
    sourceUrl: row.source_url || row.url,
    jobUrl: getSafeJobUrl(row.url) ?? undefined,
    postedDate: row.posted_date || undefined,
    description: row.description || undefined,
    salary: row.salary || undefined,
  })).filter(j => isValidJob(j, mode));

  // Cross-source dedup
  const seen = new Set<string>();
  return allSaved.filter((j) => {
    const key = `${j.title.toLowerCase().trim()}::${j.company.toLowerCase().trim()}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

/** Returns false for non-job entries like category headers, newsletter prompts, etc. */
function isValidJob(job: Job, mode: 'vc' | 'pe' | 'ib' | 'st' | 'mc' = 'vc'): boolean {
  const titleLower = job.title.toLowerCase();
  const descLower = (job.description || '').toLowerCase();

  // Exact junk titles
  const JUNK_TITLES = [
    'venture capital jobs in london', 'venture capital careers',
    "the vc industry's trusted resource", 'filters and topics',
    'search results', 'united states',
    'the best vc jobs in your city',
  ];
  if (JUNK_TITLES.includes(titleLower)) return false;
  if (titleLower.includes('trusted resource')) return false;

  // Raw markdown fragments or taglines that aren't job titles
  if (job.title.includes('](http') || job.title.includes('](https')) return false;
  if (/^invest\.|^amplify\.|^grow\./i.test(job.company)) return false;

  // Pattern-based junk: generic category/location headers
  if (/^(venture capital|vc)\s+(jobs|careers)\s+(in|near)\s+/i.test(job.title)) return false;
  if (/^jobs\s+(in|near)\s+/i.test(job.title)) return false;

  // Title matches source name exactly
  if (titleLower === job.source.toLowerCase()) return false;

  // Unknown company with short or generic title
  if (job.company === 'Unknown' && job.title.length < 15) return false;


  // Description contains newsletter/subscribe spam (not a real job)
  const spamSignals = ['subscribing to our', 'newsletter', 'subscribe to', 'terms & conditions', 'something went wrong while submitting'];
  const spamCount = spamSignals.filter(s => descLower.includes(s)).length;
  if (spamCount >= 2) return false;

  // Hard-exclude non-relevant role patterns
  const hardExcludeTitles: RegExp[] = [
    // Legal
    /\bsolicitor\b/i, /\blawyer\b/i, /\bbarrister\b/i, /\bparalegal\b/i,
    /\blegal\s+counsel\b/i, /\blegal\s+associate\b/i,
    /\blegal\s+(officer|advisor|specialist|director|manager)\b/i,
    /\bcorporate\s+(solicitor|lawyer|counsel|attorney)/i,
    // Chief of Staff / Compliance
    /\bchief\s+of\s+staff\b/i,
    // Finance ops
    /\baccountant\b/i, /\bauditor\b/i, /\bfund\s+controller\b/i, /\bfinancial\s+controller\b/i,
    /\bportfolio\s+(controller|monitor|manager)\b/i, /\bfund\s+administ/i,
    /\bfinance\s+(analyst|director|manager|business\s+partner|and\s+portfolio)\b/i,
    /\bhead\s+of\s+finance\b/i,
    // Tech / product
    /\bproduct\s+manager\b/i, /\bproject\s+manager\b/i, /\bdata\s+scientist\b/i,
    /\bdesigner\b/i, /\bengineer(?:ing)?\b/i, /\bdeveloper\b/i, /\b(?:co-?)?founder\b/i,
    // HR / admin / sales / marketing
    /\brecruitment\s+(consultant|manager)\b/i, /\bcompliance\s+(administrator|officer|manager|analyst|specialist|director)\b/i,
    /\bbusiness\s+development\b/i, /\bbdm\b/i, /\bprogram\s+director\b/i,
    /\bir\s+analyst\b/i, /\binvestor\s+relation/i,
    /\bmarketing\s+(executive|manager|specialist|coordinator|lead|director)\b/i,
    /\bcontent\s+(manager|writer|specialist)\b/i,
    /\bcustomer\s+success/i, /\baccount\s+(executive|manager)\b/i,
    /\bsales\s+(dev|representative|exec|associate|manager|lead|director)/i,
    /\bsearch\s+consultant\b/i, /\bexecutive\s+search\b/i,
    /\bheadhunt/i, /\btalent\s+(acquisition|partner|manager)\b/i,
    // HR / People
    /\bpeople\s+(partner|manager|director|lead|officer|operations)\b/i,
    /\bhr\s+(partner|manager|director|business\s+partner|advisor)\b/i,
    /\bhuman\s+resources\b/i,
  ];

  // Only add consulting exclusion for modes that aren't MC
  if (mode !== 'mc') {
    hardExcludeTitles.push(/\bconsulting\b/i, /\bconsultant\b/i);
  }

  // Mode-specific exclusions
  if (mode === 'vc') {
    hardExcludeTitles.push(
      /\bprivate\s+equity\b/i, /\bm&a\b/i, /\bmergers?\s+(and|&)\s+acquisitions?\b/i,
      /\bcorporate\s+development\b/i, /\bcorporate\s+(finance|m&a)\b/i,
      /\binvestment\s+banking\b/i, /\binvestment\s+bank\b/i, /\binvestment\s+consultant\b/i,
      /\binvestment\s+fund\w*\s+(senior\s+)?associate\b/i,
      /\bstrategy\s+consult/i, /\bmanagement\s+consult/i,
      /\bquantitative\s+(researcher|trader|analyst)\b/i, /\bcommodities\b/i,
      /\bstructurer\b/i, /\breal\s+estate\b/i, /\breic\b/i, /\breit\b/i,
      /\bproperty\s*(\/|\s+and\s+|\s+&\s+)?\s*invest/i, /\bproperty\s+director/i, /\bproperty\s+fund/i,
      /\bcredit\b/i,
      /\bcapital\s+markets?\b/i, /\bsearch\s+fund\b/i,
      // Hedge funds & operations roles
      /\bhedge\s+fund\b/i, /\bfund\s+of\s+(hedge\s+)?funds?\b/i,
      /\boperations\s+(associate|executive|manager|director|analyst|officer|lead|specialist|coordinator)\b/i,
      /\bstrategy\s+(&|and)\s+operations\b/i,
      /\b(nav|net\s+asset\s+value)\s+(and|&)\s+operations\b/i,
      /\bfund\s+account/i,
      // Non-VC finance roles
      /\brisk\s+(&|and)\s+valuation\b/i, /\brisk\s+retention\b/i,
      /\bpublic\s+markets?\b/i,
      /\btransactions?\s+management\b/i,
      /\bopportunistic\b/i,
      /\bprivate\s+assets?\b/i,
      /\bdebt\s+advisory\b/i, /\bdebt\s+capital\b/i, /\bdebt\s+finance\b/i,
      /\blarge.cap\s+pe\b/i, /\bmid.cap\s+pe\b/i,
      /\bpan.european\b.*\bpe\b/i,
      /\bmerchant\s+capital\b/i,
      /\bgp\s+stakes?\b/i, /\bemerging\s+manager/i, /\bfund\s+of\s+funds\b/i,
      /\binfra(structure)?\s*\/?\s*real\s+assets?\b/i, /\breal\s+assets?\s+invest/i,
      /\binfrastructure\s+invest/i,
    );
  } else if (mode === 'pe') {
    hardExcludeTitles.push(
      /\bventure\s+capital\b/i,
      /\binvestment\s+banking\b/i, /\binvestment\s+bank\b/i, /\binvestment\s+consultant\b/i,
      /\bstrategy\s+consult/i, /\bmanagement\s+consult/i,
      /\bquantitative\s+(researcher|trader|analyst)\b/i, /\bcommodities\b/i,
      /\bstructurer\b/i, /\breal\s+estate\b/i, /\breic\b/i, /\breit\b/i,
      /\bproperty\s*(\/|\s+and\s+|\s+&\s+)?\s*invest/i, /\bproperty\s+director/i, /\bproperty\s+fund/i,
      /\bcredit\s+invest/i,
      /\bcapital\s+markets?\b/i, /\bsearch\s+fund\b/i,
      /\bequity\s+sales\b/i, /\bequity\s+trading\b/i, /\bequity\s+research\b/i,
      /\bhedge\s+fund\b/i, /\basset\s+management\b/i, /\bwealth\s+management\b/i,
      /\bfund\s+accounting\b/i, /\bfund\s+operations\b/i,
      /\btrading\b/i, /\btrader\b/i,
      /\binvestor\s+relation/i,
    );
  } else if (mode === 'ib') {
    hardExcludeTitles.push(
      /\bventure\s+capital\b/i,
      /\bprivate\s+equity\b/i,
      /\breal\s+estate\b/i, /\breic\b/i, /\breit\b/i,
      /\bproperty\s*(\/|\s+and\s+|\s+&\s+)?\s*invest/i,
      /\bhedge\s+fund\b/i, /\basset\s+management\b/i, /\bwealth\s+management\b/i,
      /\btrading\b/i, /\btrader\b/i,
      /\bcommodities\b/i,
      /\bsearch\s+fund\b/i,
      /\bfund\s+of\s+funds\b/i,
    );
  } else if (mode === 'st') {
    // S&T: remove non-S&T finance roles but keep trading/sales
    hardExcludeTitles.push(
      /\bventure\s+capital\b/i,
      /\bprivate\s+equity\b/i,
      /\binvestment\s+banking\b/i, /\binvestment\s+bank\b/i,
      /\breal\s+estate\b/i, /\breic\b/i, /\breit\b/i,
      /\bsearch\s+fund\b/i,
      /\bfund\s+of\s+funds\b/i,
    );
    // Remove generic consulting exclusion for S&T — it doesn't apply
  } else if (mode === 'mc') {
    // MC: remove non-consulting finance roles but keep consulting/consultant
    hardExcludeTitles.push(
      /\bventure\s+capital\b/i,
      /\bprivate\s+equity\b/i,
      /\binvestment\s+banking\b/i, /\binvestment\s+bank\b/i,
      /\breal\s+estate\b/i, /\breic\b/i, /\breit\b/i,
      /\bhedge\s+fund\b/i, /\basset\s+management\b/i, /\bwealth\s+management\b/i,
      /\btrading\b/i, /\btrader\b/i,
      /\bcommodities\b/i,
      /\bsearch\s+fund\b/i,
      /\bfund\s+of\s+funds\b/i,
    );
  }
  if (hardExcludeTitles.some(p => p.test(titleLower))) return false;

  // Skip entries that are clearly not job postings
  const skipWords = ['cookie policy', 'privacy policy', 'sign in', 'log in', 'contact us'];
  if (skipWords.some(w => titleLower.includes(w))) return false;

  // Filter out jobs older than 6 months
  if (job.postedDate && job.postedDate !== 'Scraped just now') {
    const parsed = tryParseDate(job.postedDate);
    if (parsed) {
      const sixMonthsAgo = new Date();
      sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);
      if (parsed < sixMonthsAgo) return false;
    }
  }

  // Exclude portfolio-company roles advertised as "at VC Backed Startup" etc.
  if (mode === 'vc' && /\bvc[\s-]backed\b/i.test(titleLower)) return false;

  // For VC mode + LinkedIn source: require positive VC signals (matches edge function logic)
  if (mode === 'vc' && job.source.toLowerCase().includes('linkedin')) {
    const combined = `${titleLower} ${job.company.toLowerCase()} ${descLower}`;
    const vcSignals = [
      /venture\s+capital/,
      /\bvc\s+(fund|firm|portfolio|investment|analyst|associate|partner|principal|director)/,
      /\bventure(s|\s+partners?)\b/,
    ];
    if (!vcSignals.some(p => p.test(combined))) return false;
  }

  return true;
}

/** Parse freetext date strings into Date objects */
function tryParseDate(dateStr: string): Date | null {
  const rel = dateStr.match(/(\d+)\s*(hour|day|week|month|year)s?\s*ago/i);
  if (rel) {
    const n = parseInt(rel[1]);
    const unit = rel[2].toLowerCase();
    const d = new Date();
    if (unit === 'hour') d.setHours(d.getHours() - n);
    else if (unit === 'day') d.setDate(d.getDate() - n);
    else if (unit === 'week') d.setDate(d.getDate() - n * 7);
    else if (unit === 'month') d.setMonth(d.getMonth() - n);
    else if (unit === 'year') d.setFullYear(d.getFullYear() - n);
    return d;
  }
  const parsed = new Date(dateStr);
  if (!isNaN(parsed.getTime())) return parsed;
  const monthMatch = dateStr.match(/(\w+)\s+(\d{1,2}),?\s+(\d{4})/);
  if (monthMatch) {
    const attempt = new Date(`${monthMatch[1]} ${monthMatch[2]}, ${monthMatch[3]}`);
    if (!isNaN(attempt.getTime())) return attempt;
  }
  return null;
}
