const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

// Hardcoded alert config
const ALERT_EMAIL = 'spillon@gmail.com';
const ALERT_MODE = 'vc';

type ScrapedJob = {
  id: string;
  title: string;
  company: string;
  location: string;
  type: string;
  source: string;
  url: string;
  description: string | null;
  salary: string | null;
  posted_date: string | null;
};

function normalizeText(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function titleCompanyKey(title: string, company: string): string {
  return `${normalizeText(title)}|||${normalizeText(company)}`;
}

function normalizeJobUrl(url: string): string {
  const decodedUrl = url.replace(/&amp;/g, '&');

  try {
    const u = new URL(decodedUrl);
    u.hash = '';

    // Indeed: keep only the stable job key (jk) when present
    if (/indeed\.com/i.test(u.hostname)) {
      const jk = u.searchParams.get('jk');
      const path = u.pathname.replace(/\/+$/, '') || '/';
      return jk ? `${u.origin}${path}?jk=${jk}` : `${u.origin}${path}`;
    }

    // LinkedIn: drop volatile tracking params
    if (/linkedin\.com/i.test(u.hostname)) {
      ['refId', 'trackingId', 'trk', 'midToken', 'midSig'].forEach((p) => u.searchParams.delete(p));
    }

    // Glassdoor: drop volatile tracking params
    if (/glassdoor/i.test(u.hostname)) {
      ['src', 'srs', 't', 'pos'].forEach((p) => u.searchParams.delete(p));
    }

    // Default: strip common tracking params
    ['utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term', 'ref', 'fbclid', 'gclid'].forEach((p) => u.searchParams.delete(p));

    u.pathname = u.pathname.replace(/\/+$/, '') || '/';
    return u.toString();
  } catch {
    return decodedUrl;
  }
}

function dedupeJobsByCanonicalKey(jobs: ScrapedJob[]): ScrapedJob[] {
  const seenUrls = new Set<string>();
  const seenTitleCompany = new Set<string>();
  const unique: ScrapedJob[] = [];

  for (const job of jobs) {
    const byUrl = normalizeJobUrl(job.url);
    const byTitleCompany = titleCompanyKey(job.title, job.company);

    // Dedupe by either URL or title+company (matches website behavior)
    if (seenUrls.has(byUrl) || seenTitleCompany.has(byTitleCompany)) continue;
    seenUrls.add(byUrl);
    seenTitleCompany.add(byTitleCompany);
    unique.push(job);
  }

  return unique;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY');
    if (!RESEND_API_KEY) {
      return new Response(
        JSON.stringify({ success: false, error: 'RESEND_API_KEY not configured' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Resolve alert owner + last checkpoint
    let lastAlertedAt: string | null = null;
    const { data: alertConfig, error: alertConfigError } = await supabase
      .from('job_alerts')
      .select('last_alerted_at')
      .eq('email', ALERT_EMAIL)
      .eq('enabled', true)
      .maybeSingle();

    if (alertConfigError) {
      console.error('Failed to read alert config:', alertConfigError.message);
    } else {
      lastAlertedAt = alertConfig?.last_alerted_at ?? null;
    }

    const fallbackSince = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const sinceIso = lastAlertedAt ?? fallbackSince;

    const updateLastAlertedAt = async () => {
      const { error: updateAlertError } = await supabase
        .from('job_alerts')
        .update({ last_alerted_at: new Date().toISOString() })
        .eq('email', ALERT_EMAIL)
        .eq('enabled', true);

      if (updateAlertError) {
        console.error('Failed to update last_alerted_at checkpoint:', updateAlertError.message);
      }
    };

    // Fetch un-alerted VC jobs created since the last alert checkpoint
    const { data: rawJobs, error: jobsError } = await supabase
      .from('scraped_jobs')
      .select('*')
      .eq('alerted', false)
      .eq('mode', ALERT_MODE)
      .gt('scraped_at', sinceIso)
      .order('scraped_at', { ascending: false });

    if (jobsError) {
      console.error('Failed to fetch un-alerted jobs:', jobsError.message);
      return new Response(
        JSON.stringify({ success: false, error: jobsError.message }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (!rawJobs || rawJobs.length === 0) {
      await updateLastAlertedAt();
      console.log(`No new (un-alerted) VC jobs to send since ${sinceIso}`);
      return new Response(
        JSON.stringify({ success: true, message: 'No new jobs', count: 0 }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // De-duplicate freshly scraped rows by canonical URL + title/company
    const uniqueRawJobs = dedupeJobsByCanonicalKey(rawJobs as unknown as ScrapedJob[]);

    // Cross-day dedup: fetch previously-alerted jobs to avoid re-sending
    const previouslyAlertedTitleCompany = new Set<string>();
    {
      const { data: alertedRows, error: alertedError } = await supabase
        .from('scraped_jobs')
        .select('title, company')
        .eq('alerted', true)
        .eq('mode', ALERT_MODE);

      if (alertedError) {
        console.error('Failed to fetch previously alerted jobs:', alertedError.message);
      } else if (alertedRows) {
        for (const row of alertedRows) {
          previouslyAlertedTitleCompany.add(titleCompanyKey(row.title, row.company));
        }
      }
    }

    // Pull actioned jobs for this alert user and hide them from emails
    let actionedUrls = new Set<string>();
    let actionedTitleCompany = new Set<string>();

    const { data: actionRows, error: actionsError } = await supabase
      .from('job_actions')
      .select('job_url, job_title, job_company');

    if (actionsError) {
      console.error('Failed to fetch job actions for alert filtering:', actionsError.message);
    } else if (actionRows) {
      actionedUrls = new Set(actionRows.map((a) => normalizeJobUrl(a.job_url)));
      actionedTitleCompany = new Set(actionRows.map((a) => titleCompanyKey(a.job_title, a.job_company)));
    }

    // ── Location filter: London only ──
    const londonPattern = /\blondon\b/i;
    const remoteUkPattern = /\b(remote|united\s+kingdom|uk)\b/i;
    const nonUkPattern = /\b(usa|canada|us\b|u\.s\.|india|germany|france|spain|italy|australia|singapore|hong\s+kong|dubai|netherlands|ireland|new\s+york|san\s+francisco|toronto|chicago|boston|seattle|los\s+angeles|berlin|paris|amsterdam|mumbai|bangalore|sydney|melbourne)\b/i;

    // ── Investment sub-category patterns (from subCategories.ts) ──
    const investmentPatterns = [
      /\binvestment\b(?!\s+(admin|operat|account|support|report|service|compli|process|back\s*office))/i,
      /\bdeal\b/i,
      /\borigination\b/i,
      /\binvestment\s+analyst\b/i,
      /\binvestment\s+associate\b/i,
      /\bvc\s+analyst\b/i,
      /\bvc\s+associate\b/i,
      /\bventure\s+(capital\s+)?(analyst|associate|principal|partner)\b/i,
    ];

    let actionedExcludedCount = 0;
    const newJobs = uniqueRawJobs.filter(job => {
      // 1. London filter
      const loc = (job.location || '').toLowerCase();
      const isLondon = londonPattern.test(loc) || (remoteUkPattern.test(loc) && !nonUkPattern.test(loc));
      if (!isLondon) return false;

      // 2. Same VC relevance filter used by the scraper
      if (!isValidJob(job.title, job.company, job.location, job.description ?? undefined, job.posted_date ?? undefined, job.source)) return false;

      // 3. Investment role type filter (sub-category)
      const text = `${job.title} ${job.description || ''}`;
      const isInvestmentRole = investmentPatterns.some(p => p.test(text));
      if (!isInvestmentRole) return false;

      // 4. Cross-day dedup: skip jobs already sent in previous alerts
      const titleCompany = titleCompanyKey(job.title, job.company);
      if (previouslyAlertedTitleCompany.has(titleCompany)) return false;

      // 5. Match search behavior: hide actioned jobs (URL OR title+company)
      const normalizedUrl = normalizeJobUrl(job.url);
      const isActioned = actionedUrls.has(normalizedUrl) || actionedTitleCompany.has(titleCompany);
      if (isActioned) {
        actionedExcludedCount += 1;
        return false;
      }

      return true;
    });

    // Mark ALL fetched VC jobs as alerted (not just matched ones)
    const allIds = rawJobs.map(j => j.id);
    const markAllAsAlerted = async () => {
      if (allIds.length === 0) return;
      const { error: markAllError } = await supabase
        .from('scraped_jobs')
        .update({ alerted: true })
        .in('id', allIds);
      if (markAllError) {
        console.error('Failed to mark jobs as alerted:', markAllError.message);
      }
    };

    if (newJobs.length === 0) {
      await markAllAsAlerted();
      await updateLastAlertedAt();
      console.log(`No VC London Investment jobs after filtering (raw=${rawJobs.length}, unique=${uniqueRawJobs.length}, actionedExcluded=${actionedExcludedCount})`);
      return new Response(
        JSON.stringify({ success: true, message: 'No matching jobs after filtering', total: uniqueRawJobs.length, matched: 0, actionedExcluded: actionedExcludedCount }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`Found ${newJobs.length} London Investment jobs to send to ${ALERT_EMAIL} (raw=${rawJobs.length}, unique=${uniqueRawJobs.length}, actionedExcluded=${actionedExcludedCount})`);

    // Build HTML email
    const jobRows = newJobs.map(job => `
      <tr>
        <td style="padding: 12px 16px; border-bottom: 1px solid #e5e7eb;">
          <a href="${escapeHtml(job.url)}" style="color: #3b82f6; text-decoration: none; font-weight: 600; font-size: 15px;">
            ${escapeHtml(job.title)}
          </a>
          <div style="color: #6b7280; font-size: 13px; margin-top: 4px;">
            ${escapeHtml(job.company)} · ${escapeHtml(job.location)}
            ${job.salary ? ` · <span style="color: #059669; font-weight: 500;">${escapeHtml(job.salary)}</span>` : ''}
            ${job.posted_date ? ` · ${escapeHtml(job.posted_date)}` : ''}
          </div>
          <div style="margin-top: 4px;">
            <span style="display: inline-block; padding: 2px 8px; border-radius: 4px; font-size: 11px; font-weight: 600; text-transform: uppercase; background: ${job.type === 'internship' ? '#fef3c7' : job.type === 'graduate' ? '#dbeafe' : '#dcfce7'}; color: ${job.type === 'internship' ? '#92400e' : job.type === 'graduate' ? '#1e40af' : '#166534'};">
              ${escapeHtml(job.type)}
            </span>
            <span style="color: #9ca3af; font-size: 11px; margin-left: 8px;">${escapeHtml(job.source)}</span>
          </div>
        </td>
      </tr>
    `).join('');

    const html = `
      <!DOCTYPE html>
      <html>
      <body style="margin: 0; padding: 0; background-color: #f9fafb; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;">
        <div style="max-width: 600px; margin: 0 auto; padding: 24px;">
          <div style="text-align: center; margin-bottom: 24px;">
            <h1 style="font-size: 20px; color: #111827; margin: 0;">
              ⚡ VC<span style="color: #3b82f6;">SCOUT</span> Daily Alert
            </h1>
            <p style="color: #6b7280; font-size: 14px; margin: 4px 0 0;">
              ${newJobs.length} new VC Investment job${newJobs.length === 1 ? '' : 's'} in London since your last alert
            </p>
          </div>
          <table style="width: 100%; border-collapse: collapse; background: #ffffff; border-radius: 8px; overflow: hidden; box-shadow: 0 1px 3px rgba(0,0,0,0.1);">
            ${jobRows}
          </table>
          <p style="text-align: center; color: #9ca3af; font-size: 12px; margin-top: 24px;">
            Sent by VCScout Job Aggregator
          </p>
        </div>
      </body>
      </html>
    `;

    const emailResponse = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${RESEND_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: 'VCScout <onboarding@resend.dev>',
        to: [ALERT_EMAIL],
        subject: `⚡ ${newJobs.length} new VC Investment job${newJobs.length === 1 ? '' : 's'} in London`,
        html,
      }),
    });

    const emailData = await emailResponse.json();

    if (!emailResponse.ok) {
      console.error(`Resend error:`, emailData);
      return new Response(
        JSON.stringify({ success: false, error: emailData }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`Email sent to ${ALERT_EMAIL}:`, emailData.id);
    await markAllAsAlerted();
    await updateLastAlertedAt();

    return new Response(
      JSON.stringify({ success: true, sent: 1, jobCount: newJobs.length }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('Alert error:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return new Response(
      JSON.stringify({ success: false, error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});

// ── Exact same isValidJob logic as the website scraper (scrapeJobs.ts) ──

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

function isValidJob(title: string, company: string, location: string, description: string | undefined, postedDate: string | undefined, source: string): boolean {
  const titleLower = title.toLowerCase();
  const descLower = (description || '').toLowerCase();

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
  if (title.includes('](http') || title.includes('](https')) return false;
  if (/^invest\.|^amplify\.|^grow\./i.test(company)) return false;

  // Pattern-based junk: generic category/location headers
  if (/^(venture capital|vc)\s+(jobs|careers)\s+(in|near)\s+/i.test(title)) return false;
  if (/^jobs\s+(in|near)\s+/i.test(title)) return false;

  // Title matches source name exactly
  if (titleLower === source.toLowerCase()) return false;

  // Unknown company with short or generic title
  if (company === 'Unknown' && title.length < 15) return false;

  // Description contains newsletter/subscribe spam (not a real job)
  const spamSignals = ['subscribing to our', 'newsletter', 'subscribe to', 'terms & conditions', 'something went wrong while submitting'];
  const spamCount = spamSignals.filter(s => descLower.includes(s)).length;
  if (spamCount >= 2) return false;

  // Hard-exclude patterns for VC mode (universal + finance + VC-specific)
  const universalExcludes: RegExp[] = [
    /\bsolicitor\b/i, /\blawyer\b/i, /\bbarrister\b/i, /\bparalegal\b/i,
    /\blegal\s+counsel\b/i, /\blegal\s+associate\b/i,
    /\blegal\s+(officer|advisor|specialist|director|manager)\b/i,
    /\bcorporate\s+(solicitor|lawyer|counsel|attorney)/i,
    /\baccountant\b/i, /\bauditor\b/i,
    /\bteacher\b/i, /\bnurse\b/i, /\bdoctor\b/i, /\bpharmac/i, /\bclinical\b/i,
    /\brecruitment\b/i,
  ];

  const financeExcludes: RegExp[] = [
    /\bfund\s+controller\b/i, /\bfinancial\s+controller\b/i,
    /\bportfolio\s+(controller|monitor)\b/i, /\bfund\s+administ/i,
    /\bfinance\s+(analyst|director|manager|business\s+partner|and\s+portfolio)\b/i,
    /\bhead\s+of\s+finance\b/i,
    /\bcompliance\s+(administrator|officer|manager|analyst|specialist|director)\b/i,
    /\bsearch\s+consultant\b/i, /\bexecutive\s+search\b/i,
    /\bheadhunt/i, /\btalent\s+(acquisition|partner|manager)\b/i,
    /\bpeople\s+(partner|manager|director|lead|officer|operations)\b/i,
    /\bhr\s+(partner|manager|director|business\s+partner|advisor)\b/i,
    /\bhuman\s+resources\b/i,
  ];

  const vcSpecificExcludes: RegExp[] = [
    /\bproduct\s+manager\b/i, /\bproject\s+manager\b/i, /\bdata\s+scientist\b/i,
    /\bdesigner\b/i, /\bengineer(?:ing)?\b/i, /\bdeveloper\b/i, /\b(?:co-?)?founder\b/i,
    /\bbusiness\s+development\b/i, /\bbdm\b/i, /\bprogram\s+director\b/i,
    /\bmarketing\s+(executive|manager|specialist|coordinator|lead|director)\b/i,
    /\bcontent\s+(manager|writer|specialist)\b/i,
    /\bcustomer\s+success/i, /\baccount\s+(executive|manager)\b/i,
    /\bsales\s+(dev|representative|exec|associate|manager|lead|director)/i,
    /\bconsulting\b/i, /\bconsultant\b/i,
    /\bchief\s+of\s+staff\b/i,
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
    /\bhedge\s+fund\b/i, /\bfund\s+of\s+(hedge\s+)?funds?\b/i,
    /\boperations\s+(associate|executive|manager|director|analyst|officer|lead|specialist|coordinator)\b/i,
    /\bstrategy\s+(&|and)\s+operations\b/i,
    /\b(nav|net\s+asset\s+value)\s+(and|&)\s+operations\b/i,
    /\bfund\s+account/i,
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
    /\bproduct\s+(owner|analyst|lead|director|head|specialist)\b/i,
    /\bgo[\s\-]to[\s\-]market\b/i, /\bgtm\b/i,
    /\btesting\s+(manager|lead|engineer|analyst)\b/i, /\bqa\s+(manager|lead|engineer|analyst)\b/i,
    /\btest\s+(manager|lead|engineer|analyst)\b/i,
    /\bmiddle\s+east\s+sales\b/i, /\bmacro\s+(research|sales|data)\b/i,
    /\bsales,/i, /\bresearch\s+sales\b/i,
    /\btechnical\s+business\s+analyst\b/i, /\bbusiness\s+analyst\b/i,
    /\bassociate\s+general\s+counsel\b/i,
    /\bgrant\s+writer\b/i, /\bwriter\b/i,
    /\bmember\s+of\s+technical\s+staff\b/i, /\btechnical\s+staff\b/i,
    /\bpre[\s\-]?training\b/i,
  ];

  const allExcludes = [...universalExcludes, ...financeExcludes, ...vcSpecificExcludes];
  if (allExcludes.some(p => p.test(titleLower))) return false;

  // Skip entries that are clearly not job postings
  const skipWords = ['cookie policy', 'privacy policy', 'sign in', 'log in', 'contact us'];
  if (skipWords.some(w => titleLower.includes(w))) return false;

  // Filter out jobs older than 6 months
  if (postedDate && postedDate !== 'Scraped just now') {
    const parsed = tryParseDate(postedDate);
    if (parsed) {
      const sixMonthsAgo = new Date();
      sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);
      if (parsed < sixMonthsAgo) return false;
    }
  }

  // Exclude portfolio-company roles
  if (/\bvc[\s-]backed\b/i.test(titleLower)) return false;

  // Require positive VC signals
  const companyLower = company.toLowerCase();
  const titleAndDesc = `${titleLower} ${descLower}`;

  const strongSignals = [
    /venture\s+capital/,
    /\bvc\b/,
    /\bventure\s+partners?\b/,
    /\bventure\s+(fund|firm|portfolio|investment|studio|builder)/,
  ];

  const hasSignalInContent = strongSignals.some(p => p.test(titleAndDesc));
  const hasStrongCompanySignal = strongSignals.some(p => p.test(companyLower));

  if (!hasSignalInContent && !hasStrongCompanySignal) return false;

  return true;
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
