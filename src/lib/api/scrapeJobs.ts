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
  location: string
): Promise<ScrapeResult> {
  const enabledSources = sources
    .filter((s) => s.enabled)
    .map((s) => ({ name: s.name, url: s.url }));

  if (enabledSources.length === 0) {
    return { success: false, jobs: [], sourceStatuses: {}, error: 'No sources enabled' };
  }

  const { data, error } = await supabase.functions.invoke('scrape-jobs', {
    body: { sources: enabledSources, keywords, location },
  });

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
    const valid = isValidJob(j);
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

  // Replace saved rows for successfully scraped sources to prevent stale jobs from lingering
  const successfulSources = Object.entries(data.sourceStatuses || {})
    .filter(([, status]) => (status as { status?: string })?.status === 'connected')
    .map(([sourceName]) => sourceName);

  if (successfulSources.length > 0) {
    const { error: deleteError } = await supabase
      .from('scraped_jobs')
      .delete()
      .in('source', successfulSources);

    if (deleteError) {
      console.error('Failed to clear old jobs for sources:', deleteError);
    }
  }

  // Save fresh rows (deduplicated by URL)
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

export async function loadSavedJobs(): Promise<Job[]> {
  const { data, error } = await supabase
    .from('scraped_jobs')
    .select('*')
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
  })).filter(isValidJob);

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
function isValidJob(job: Job): boolean {
  const titleLower = job.title.toLowerCase();
  const descLower = (job.description || '').toLowerCase();

  // Exact junk titles
  const JUNK_TITLES = [
    'venture capital jobs in london', 'venture capital careers',
    "the vc industry's trusted resource", 'filters and topics',
    'search results', 'united states',
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

  // Hard-exclude non-VC role patterns (mirrors edge function isLikelyVcRole hard excludes)
  const hardExcludeTitles = [
    /\bir\s+analyst\b/i,
    /\binvestor\s+relation/i,
    /\bfund\s+controller\b/i,
    /\bportfolio\s+controller\b/i,
    /\blegal\s+counsel\b/i,
    /\bfinance\s+and\s+portfolio\b/i,
    /\bfinance\s+analyst\b/i,
    /\bfinance\s+director\b/i,
    /\bfinance\s+manager\b/i,
    /\bhead\s+of\s+finance\b/i,
    /\bfund\s+administ/i,
    /\bportfolio\s+monitor/i,
    /\bportfolio\s+manager\b/i,
    /\binvestment\s+consultant\b/i,
    /\bsolicitor\b/i,
    /\blawyer\b/i,
    /\bbarrister\b/i,
    /\baccountant\b/i,
    /\bauditor\b/i,
    /\bproduct\s+manager\b/i,
    /\bproject\s+manager\b/i,
    /\bdata\s+scientist\b/i,
    /\brecruitment\s+(consultant|manager)\b/i,
  ];
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
