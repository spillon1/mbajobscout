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

    // Fetch un-alerted VC-mode jobs only
    const { data: rawJobs, error: jobsError } = await supabase
      .from('scraped_jobs')
      .select('*')
      .eq('alerted', false)
      .eq('mode', ALERT_MODE)
      .order('scraped_at', { ascending: false });

    if (jobsError) {
      console.error('Failed to fetch un-alerted jobs:', jobsError.message);
      return new Response(
        JSON.stringify({ success: false, error: jobsError.message }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (!rawJobs || rawJobs.length === 0) {
      console.log('No new (un-alerted) VC jobs to send');
      return new Response(
        JSON.stringify({ success: true, message: 'No new jobs', count: 0 }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Resolve alert owner (so we can hide actioned jobs exactly like search)
    let alertUserId: string | null = null;
    const { data: alertConfig, error: alertConfigError } = await supabase
      .from('job_alerts')
      .select('user_id')
      .eq('email', ALERT_EMAIL)
      .eq('enabled', true)
      .maybeSingle();

    if (alertConfigError) {
      console.error('Failed to read alert config:', alertConfigError.message);
    } else {
      alertUserId = alertConfig?.user_id ?? null;
    }

    // De-duplicate freshly scraped rows by canonical URL + title/company
    const uniqueRawJobs = dedupeJobsByCanonicalKey(rawJobs as unknown as ScrapedJob[]);

    // Pull actioned jobs for this alert user and hide them from emails
    let actionedUrls = new Set<string>();
    let actionedTitleCompany = new Set<string>();

    if (alertUserId) {
      const { data: actionRows, error: actionsError } = await supabase
        .from('job_actions')
        .select('job_url, job_title, job_company')
        .eq('user_id', alertUserId);

      if (actionsError) {
        console.error('Failed to fetch job actions for alert user:', actionsError.message);
      } else if (actionRows) {
        actionedUrls = new Set(actionRows.map((a) => normalizeJobUrl(a.job_url)));
        actionedTitleCompany = new Set(actionRows.map((a) => titleCompanyKey(a.job_title, a.job_company)));
      }
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
      if (!isLikelyVcRole(job.title, job.company, job.description ?? undefined)) return false;

      // 3. Investment role type filter (sub-category)
      const text = `${job.title} ${job.description || ''}`;
      const isInvestmentRole = investmentPatterns.some(p => p.test(text));
      if (!isInvestmentRole) return false;

      // 4. Match search behavior: hide actioned jobs (URL OR title+company)
      const normalizedUrl = normalizeJobUrl(job.url);
      const titleCompany = titleCompanyKey(job.title, job.company);
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

// ── Same VC relevance filter used by scrape-jobs ──
function isLikelyVcRole(title: string, company: string, description: string | undefined): boolean {
  const titleLower = title.toLowerCase();
  const companyLower = company.toLowerCase();
  const descLower = (description || '').toLowerCase();

  // Hard exclusions: clearly non-VC roles (identical to scrape-jobs)
  const nonVcRoles = [
    /\bmarketing\s+(executive|manager|specialist|coordinator|lead|director|officer)\b/i,
    /\bcontent\s+(manager|writer|specialist|strategist)\b/i,
    /\bsocial\s+media\b/i,
    /\bcommunications?\s+(manager|director|officer|lead)\b/i,
    /\bpr\s+(manager|director|officer)\b/i,
    /\boffice\s+manager\b/i, /\badmin\s+(assistant|coordinator|manager)\b/i,
    /\bexecutive\s+assistant\b/i, /\bpersonal\s+assistant\b/i,
    /\blegal\s+counsel\b/i, /\bsolicitor\b/i, /\blawyer\b/i, /\bparalegal\b/i,
    /\bgeneral\s+counsel\b/i,
    /\bhr\s+(manager|director|business\s+partner|specialist|officer)\b/i,
    /\bhuman\s+resources\b/i, /\bpeople\s+(partner|manager|director|lead|officer|operations)\b/i,
    /\btalent\s+(acquisition|partner|manager)\b/i, /\brecruitment\b/i,
    /\bheadhunt/i, /\bexecutive\s+search\b/i,
    /\bengineer(?:ing)?\b/i, /\bdeveloper\b/i, /\bsoftware\b/i,
    /\bdata\s+scientist\b/i, /\bdata\s+engineer\b/i,
    /\bproduct\s+manager\b/i, /\bproject\s+manager\b/i,
    /\bdesigner\b/i, /\bux\b/i, /\bcreative\s+director\b/i,
    /\bcustomer\s+success/i, /\baccount\s+(executive|manager)\b/i,
    /\bsales\s+(dev|representative|exec|manager|director)/i,
    /\bbusiness\s+development\b/i, /\bbdm\b/i,
    /\btax\s+(manager|analyst|advisor|specialist|director)\b/i,
    /\bprocurement\b/i, /\bsupply\s+chain\b/i,
    /\bevent\s+(manager|coordinator|director|operations)\b/i,
    /\b(?:co-?)?founder\b/i,
    // S&T / Trading roles
    /\bsales\s+trader\b/i, /\bderivatives\b/i, /\btrader\b/i, /\btrading\b/i,
    /\bficc\b/i, /\bequities\s*\(/i, /\bfutures\b/i, /\boptions\b/i,
    /\bstructur(er|ing)\b/i,
    // IM / Asset Management roles
    /\brisk\s+manag/i, /\bmacro\s+strategist\b/i,
    /\bresearch\s+associate\b/i, /\bresearch\s+analyst\b/i,
    /\bfixed\s+income\b/i, /\brfp\s+writer\b/i,
    /\bcorporate\s+access\b/i, /\bclient\s+transitions?\b/i,
    /\btrade\s+coordinator\b/i, /\btrade\s+support\b/i,
    // Non-VC misc
    /\bentrepreneur\s+in\s+residence\b/i,
    /\bfinancial\s+report/i, /\bfinancial\s+control/i,
    /\bactuari/i, /\bunderwriter\b/i, /\bclaims\b/i,
    // Product roles (not VC)
    /\bproduct\s+(owner|analyst|lead|director|head|specialist)\b/i,
    // GTM / Go-To-Market roles
    /\bgo[\s\-]to[\s\-]market\b/i, /\bgtm\b/i,
    // Testing / QA roles
    /\btesting\s+(manager|lead|engineer|analyst)\b/i, /\bqa\s+(manager|lead|engineer|analyst)\b/i,
    /\btest\s+(manager|lead|engineer|analyst)\b/i,
    // Sales roles (broader)
    /\bmiddle\s+east\s+sales\b/i, /\bmacro\s+(research|sales|data)\b/i,
    /\bsales,/i, /\bresearch\s+sales\b/i,
    // Technical / non-finance roles
    /\btechnical\s+business\s+analyst\b/i, /\bbusiness\s+analyst\b/i,
    /\bassociate\s+general\s+counsel\b/i,
    /\bgrant\s+writer\b/i, /\bwriter\b/i,
    /\bmember\s+of\s+technical\s+staff\b/i, /\btechnical\s+staff\b/i,
    /\bpre[\s\-]?training\b/i,
    // IB / PE / consulting leakage
    /\binvestment\s+bank(ing)?\b/i,
    /\bm\s*&\s*a\b/i, /\bmergers?\s+(and|&)\s+acquisitions?\b/i,
    /\bprivate\s+equity\b/i,
    /\bcorporate\s+development\b/i, /\bcorporate\s+(finance|m\s*&\s*a)\b/i,
    /\bcapital\s+markets?\b/i,
    /\bmanagement\s+consult/i, /\bstrategy\s+consult/i,
    /\bconsulting\b/i, /\bconsultant\b/i,
  ];
  if (nonVcRoles.some(p => p.test(titleLower))) return false;

  // VC signals
  const vcSignals = [
    /venture\s+capital/,
    /\bvc\s+(fund|firm|portfolio|backed|investment|analyst|associate|partner|principal|director)/,
    /\bventure(s|\s+partners?)\b/,
  ];

  // Strong signal: VC keyword in title or company name
  if (vcSignals.some(p => p.test(titleLower))) return true;
  if (vcSignals.some(p => p.test(companyLower))) return true;

  // Weak signal: VC keyword only in description → require VC-compatible title
  const hasDescVcSignal = /venture\s+capital/.test(descLower) || /\bvc\s+(fund|firm|portfolio|backed|investment)/.test(descLower);
  if (hasDescVcSignal) {
    const vcCompatibleTitles = [
      /\b(analyst|associate|principal|partner|director|vp|vice\s+president|managing\s+director)\b/i,
      /\binvestment\b/i,
      /\bdeal\b/i, /\borigination\b/i,
      /\bplatform\b/i, /\bportfolio\b/i,
      /\bvalue\s+creation\b/i, /\boperating\s+partner\b/i,
      /\binvestor\s+relations?\b/i, /\bfundraising\b/i,
      /\bfund\s+(operations?|manag)/i,
      /\bwealth\b/i, /\basset\b/i, /\bstrategist\b/i,
    ];
    if (vcCompatibleTitles.some(p => p.test(titleLower))) return true;
    return false;
  }

  // IR / Fundraising roles are core VC fund roles
  const irTitlePatterns = [
    /\binvestor\s+relations?\b/,
    /\bir\s+(analyst|associate|manager|director|officer|lead|head|vp|vice\s+president)\b/,
    /\bfundraising\b/,
    /\bcapital\s+raising\b/,
    /\blp\s+relations?\b/,
    /\blimited\s+partner\b/,
  ];
  if (irTitlePatterns.some(p => p.test(titleLower))) return true;

  return false;
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
