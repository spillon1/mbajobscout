const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { fetchJobDescription, mapPool } from '../_shared/job-description.ts';

const ALERT_KEY = 'vc-growth-secondaries';
const ALERT_EMAIL = 'spillon@gmail.com';

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
  mode: string;
};

function normalizeText(v: string): string {
  return v.toLowerCase().replace(/[^a-z0-9]+/g, ' ').replace(/\s+/g, ' ').trim();
}

function titleCompanyKey(title: string, company: string): string {
  return `${normalizeText(title)}|||${normalizeText(company)}`;
}

function normalizeJobUrl(url: string): string {
  const decoded = url.replace(/&amp;/g, '&');
  try {
    const u = new URL(decoded);
    u.hash = '';
    if (/indeed\.com/i.test(u.hostname)) {
      const jk = u.searchParams.get('jk');
      const path = u.pathname.replace(/\/+$/, '') || '/';
      return jk ? `${u.origin}${path}?jk=${jk}` : `${u.origin}${path}`;
    }
    ['refId', 'trackingId', 'trk', 'src', 'srs', 'utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term', 'ref', 'gclid', 'fbclid'].forEach((p) => u.searchParams.delete(p));
    u.pathname = u.pathname.replace(/\/+$/, '') || '/';
    return u.toString();
  } catch {
    return decoded;
  }
}

// ── Location: London (or UK remote/hybrid) ──
const LONDON = /\blondon\b/i;
const UK_REMOTE = /\b(remote|hybrid|united\s+kingdom|uk|england)\b/i;
const NON_UK = /\b(usa|u\.s\.|united\s+states|canada|india|germany|france|spain|italy|australia|singapore|hong\s+kong|dubai|uae|netherlands|ireland|new\s+york|nyc|san\s+francisco|palo\s+alto|menlo\s+park|toronto|chicago|boston|seattle|austin|los\s+angeles|berlin|munich|paris|amsterdam|zurich|geneva|stockholm|madrid|milan|mumbai|bangalore|sydney|melbourne|tel\s+aviv|tokyo|shanghai|[a-z]{2},\s*(ca|ny|ma|tx|wa|il|co|ga|fl))\b/i;

// Named UK cities that are clearly not London
const UK_NON_LONDON = /\b(oxford|cambridge|manchester|birmingham|leeds|bristol|edinburgh|glasgow|cardiff|belfast|liverpool|newcastle|sheffield|nottingham|reading|brighton|southampton|aberdeen|dundee|york|norwich|exeter|bath|coventry|milton\s+keynes)\b/i;

function isLondonish(location: string): boolean {
  const loc = (location || '').toLowerCase();
  if (!loc.trim()) return false;
  if (NON_UK.test(loc)) return false;
  if (LONDON.test(loc)) return true;
  if (UK_NON_LONDON.test(loc)) return false;

  // "Reigate, England, United Kingdom" → named UK town that isn't London
  const city = loc.split(',')[0].trim();
  const generic = /^(england|scotland|wales|northern\s+ireland|united\s+kingdom|uk|gb|great\s+britain|remote|hybrid|remote\s*\/?\s*hybrid|anywhere)$/;
  if (city && !generic.test(city)) return false;

  return UK_REMOTE.test(loc);
}

// ── Growth / late-stage signals ──
// Source of truth: src/data/subCategories.ts SECONDARY_FILTERS.vc "Growth / Late Stage"
// plus SECONDARY_FILTERS.pe "Growth Equity". Keep these in sync with the frontend aggregator.
const GROWTH_TERMS: RegExp[] = [
  /\bgrowth\s+(stage|equity|investing|investment|investor|investors|capital|fund|funds|team|platform|portfolio|round|buyout)\b/i,
  /\b(tech|technology|software)\s+growth\b/i,
  /\bgrowth[\s\-]?(?:stage\s+)?(?:tech|technology)\b/i,
  /\blate[\s\-]?stage\b/i,
  /\bpre[\s\-]?ipo\b/i,
  /\bseries\s+[c-z]\b/i,
  /\bexpansion\s+capital\b/i,
  /\bscale[\s\-]?up\s+(fund|invest)/i,
  /\bcontinuation\s+(fund|vehicle)\b/i,
  /\bcrossover\s+(fund|investor|investing)\b/i,
  /\b(general\s+atlantic|insight\s+partners|summit\s+partners|ta\s+associates|coatue|tiger\s+global|dragoneer|iconiq|softbank|vision\s+fund|vitruvian|highland\s+europe|eurazeo\s+growth|lightrock|sofina|bond\s+capital|g\s+squared|jmi\s+equity|kkr\s+growth|permira\s+growth|index\s+ventures\s+growth|felix\s+capital|smash\s+capital)\b/i,
];

// ── Secondaries signals (tech / VC / growth flavoured) ──
// Source of truth: src/data/subCategories.ts SECONDARY_FILTERS.vc "Secondaries (VC / Growth)"
const SECONDARY_CONTEXT = /\b(vc|venture|venture\s+capital|tech|technology|software|growth|startup|start[\s\-]up)\b/i;
const SECONDARY_TERMS: RegExp[] = [
  /\b(vc|venture|venture\s+capital|tech|technology|growth|software)\b[^.\n]{0,60}\bsecondar(y|ies)\b/i,
  /\bsecondar(y|ies)\b[^.\n]{0,60}\b(vc|venture|venture\s+capital|tech|technology|growth|software)\b/i,
  /\b(direct|lp|gp)[\s\-]?led\s+secondar(y|ies)\b/i,
  /\bsecondar(y|ies)\s+(investment|investing|investor|market|transactions?|team|fund|opportunit)/i,
  /\bcontinuation\s+(fund|vehicle)\b/i,
  /\b(stepstone|industry\s+ventures|kline\s+hill|w\s+capital|pinegrove|nasdaq\s+private\s+market|forge\s+global|nova\s+capital|hollyport|glendower|lexington\s+partners|coller\s+capital|g\s+squared)\b/i,
];

// ── Pure PE / non-tech secondaries → belongs on the PE tab ──
const PE_SECONDARY_MARKERS = /\b(buyout|lbo|leveraged|private\s+equity\s+secondar|pe\s+secondar|infrastructure\s+secondar|real\s+estate\s+secondar|credit\s+secondar|private\s+credit|real\s+assets?\s+secondar)\b/i;

// ── Sell-side / advisory, not direct investing ──
const ADVISORY = /\b(investment\s+bank(ing)?|placement\s+agent|secondary\s+advisory|secondaries\s+advisory|m&a\s+advisory|capital\s+markets\s+advisory|fund\s+placement|coverage\s+banker|investor\s+coverage|capital\s+raising|fundrais(ing|er))\b/i;

// ── Non-investment noise ──
const NOISE: RegExp[] = [
  /\bgrowth\s+(marketing|hacker|hacking|manager|lead|strategist|analytics|product|marketer|specialist|executive)\b/i,
  /\b(marketing|sales|customer\s+success|account\s+(executive|manager)|business\s+development|bdm|recruit(ment|er)?|talent|people|hr\b|human\s+resources|solicitor|lawyer|counsel|paralegal|accountant|auditor|engineer|developer|designer|data\s+scientist|product\s+manager|project\s+manager|teacher|nurse|clinical)\b/i,
  /\btreasur(y|er)\b/i,
  /\bhead\s+of\s+growth\b/i,
  /\bgo[\s\-]to[\s\-]market\b/i, /\bgtm\b/i,
];

const ROLE_SHAPE = /\b(analyst|associate|principal|partner|investor|investment|vice\s+president|\bvp\b|director|manager|head\s+of|intern|internship|graduate|summer|off[\s\-]?cycle|executive)\b/i;

function isJunk(title: string, company: string, source: string, description: string): boolean {
  const t = title.toLowerCase();
  if (!title.trim()) return true;
  if (title.includes('](http')) return true;
  if (t === source.toLowerCase()) return true;
  if (/^(venture capital|vc|growth equity|private equity)\s+(jobs|careers)\s+(in|near)\s+/i.test(title)) return true;
  if (/^jobs\s+(in|near)\s+/i.test(title)) return true;
  if (company === 'Unknown' && title.length < 15) return true;
  const spam = ['subscribing to our', 'newsletter', 'subscribe to', 'terms & conditions'];
  if (spam.filter((s) => description.toLowerCase().includes(s)).length >= 2) return true;
  return false;
}

/** Cheap gate: is this even an investment role in the right shape? */
function isCandidate(job: ScrapedJob): boolean {
  const title = job.title || '';
  const company = job.company || '';
  if (isJunk(title, company, job.source || '', job.description || '')) return false;
  if (NOISE.some((p) => p.test(title) || p.test(company))) return false;
  if (ADVISORY.test(title) || ADVISORY.test(company)) return false;
  // Wrong asset class for a VC/growth alert
  if (/\b(private\s+credit|private\s+debt|direct\s+lending|infrastructure|real\s+estate|real\s+assets?|distressed|mezzanine)\b/i.test(title)) return false;
  // Title names a non-London UK city (feeds mislabelled source locations)
  if (UK_NON_LONDON.test(title) && !LONDON.test(title)) return false;
  if (!ROLE_SHAPE.test(title)) return false;
  return true;
}

// Strong, unambiguous stage phrases — used when the signal comes from the body
// of a job description rather than the title (descriptions mention "growth" in
// boilerplate all the time, so a single loose hit is not enough).
const STRONG_GROWTH_TERMS: RegExp[] = [
  /\bgrowth\s+(equity|investing|investment|investments|investor|capital)\b/i,
  /\b(tech|technology|software)\s+growth\b/i,
  /\blate[\s\-]?stage\b/i,
  /\bpre[\s\-]?ipo\b/i,
  /\bexpansion\s+capital\b/i,
  /\bseries\s+[c-z]\b/i,
  /\bsecondar(y|ies)\b/i,
  /\b(general\s+atlantic|insight\s+partners|summit\s+partners|ta\s+associates|coatue|tiger\s+global|dragoneer|iconiq|softbank|vision\s+fund|vitruvian|highland\s+europe|eurazeo\s+growth|lightrock|sofina|bond\s+capital|g\s+squared|jmi\s+equity|kkr\s+growth|permira\s+growth|index\s+ventures\s+growth|felix\s+capital|smash\s+capital)\b/i,
];

function countStrongHits(text: string): number {
  return STRONG_GROWTH_TERMS.reduce((n, p) => n + (p.test(text) ? 1 : 0), 0);
}

/**
 * Stage match. `fromDescription` = the text includes a fetched job description,
 * so we demand stronger evidence to avoid boilerplate false positives.
 */
function matchesGrowthAlert(job: ScrapedJob, description?: string, fromDescription = false): boolean {
  const title = job.title || '';
  const desc = description ?? job.description ?? '';
  const company = job.company || '';
  const text = `${title} ${desc} ${company}`;

  if (!isCandidate(job)) return false;

  const isGrowth = GROWTH_TERMS.some((p) => p.test(text));
  const growthInTitle = GROWTH_TERMS.some((p) => p.test(title));

  // Early-stage veto: postings that state an early / seed / multistage focus are not
  // growth or late-stage roles, even if the body mentions "growth equity" in passing
  // (typically inside an experience wishlist).
  const EARLY_STAGE_SIGNALS =
    /\b(early[\s\-]?stage|pre[\s\-]?seed|seed[\s\-]?stage|first[\s\-]?cheque|multi[\s\-]?stage|multistage)\b/i;
  const GROWTH_BOILERPLATE =
    /\b(experience|background)\b[^.\n]{0,160}\bgrowth\s+equity\b|\bgrowth\s+equity\b[^.\n]{0,40}\bor\s+private\s+equity\b/i;
  // A title that says early stage / pre-seed / multistage is never a growth role.
  if (EARLY_STAGE_SIGNALS.test(title)) return false;
  const secondariesInTitle = SECONDARY_TERMS.some((p) => p.test(title));
  if (!growthInTitle && !secondariesInTitle) {
    if (EARLY_STAGE_SIGNALS.test(text)) return false;
    if (GROWTH_BOILERPLATE.test(text)) return false;
  }

  const mentionsSecondaries = SECONDARY_TERMS.some((p) => p.test(text));
  const secondariesIsTechFlavoured =
    mentionsSecondaries &&
    (SECONDARY_CONTEXT.test(text) || GROWTH_TERMS.some((p) => p.test(text)));

  // Exclude pure PE secondaries unless there is a clear VC/tech/growth signal
  if (mentionsSecondaries && PE_SECONDARY_MARKERS.test(text) && !SECONDARY_CONTEXT.test(text)) {
    return false;
  }

  // A secondaries title explicitly badged private equity / buyout belongs on the
  // PE tab unless the title itself carries a VC / tech / growth signal.
  if (/\bsecondar(y|ies)\b/i.test(title) &&
      /\b(private\s+equity|\bpe\b|buyout|lbo|infrastructure|real\s+estate|credit)\b/i.test(title) &&
      !/\b(vc|venture|tech|technology|software|growth|startup)\b/i.test(title)) {
    return false;
  }

  if (!isGrowth && !secondariesIsTechFlavoured) return false;

  // Guard: a plain "private equity buyout" role that only mentions growth in passing.
  // Allow titles that explicitly pair buyout with a growth/tech signal (e.g. "Tech Growth Buyout").
  if (!mentionsSecondaries && /\b(buyout|lbo|leveraged\s+finance)\b/i.test(title) && !GROWTH_TERMS.some((p) => p.test(title))) return false;

  if (fromDescription) {
    // Description-driven hit: require either an explicit stage phrase in the
    // opening of the posting, or two distinct strong signals anywhere.
    const head = desc.slice(0, 1200);
    const strongHead = STRONG_GROWTH_TERMS.some((p) => p.test(head));
    if (!strongHead && countStrongHits(desc) < 2) return false;
    // A buyout/PE-heavy description wins over a passing growth mention.
    const peHits = (desc.match(/\b(buyout|lbo|leveraged\s+buyout|large[\s\-]?cap\s+private\s+equity)\b/gi) ?? []).length;
    const growthHits = (desc.match(/\b(growth\s+(equity|capital|investing|investment)|late[\s\-]?stage|pre[\s\-]?ipo|venture)\b/gi) ?? []).length;
    if (peHits > growthHits) return false;
  }

  return true;
}


function escapeHtml(str: string): string {
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  try {
    const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY');
    if (!RESEND_API_KEY) {
      return new Response(JSON.stringify({ success: false, error: 'RESEND_API_KEY not configured' }), {
        status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const url = new URL(req.url);
    let body: Record<string, unknown> = {};
    try { body = await req.json(); } catch { /* no body */ }
    const dryRun = url.searchParams.get('dry_run') === 'true' || body?.dry_run === true;

    const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);

    const { data: checkpoint } = await supabase
      .from('alert_checkpoints')
      .select('last_alerted_at')
      .eq('alert_key', ALERT_KEY)
      .maybeSingle();

    const daysParam = Number(url.searchParams.get('days') ?? (body?.days as number) ?? 0);
    const sinceIso = daysParam > 0
      ? new Date(Date.now() - daysParam * 24 * 60 * 60 * 1000).toISOString()
      : (checkpoint?.last_alerted_at ?? new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString());

    // Paginate: PostgREST caps each response at 1000 rows
    const jobs: ScrapedJob[] = [];
    const PAGE = 1000;
    for (let page = 0; page < 12; page++) {
      const { data, error: jobsError } = await supabase
        .from('scraped_jobs')
        .select('*')
        .in('mode', ['vc', 'pe'])
        .gt('scraped_at', sinceIso)
        .order('scraped_at', { ascending: false })
        .range(page * PAGE, page * PAGE + PAGE - 1);

      if (jobsError) {
        return new Response(JSON.stringify({ success: false, error: jobsError.message }), {
          status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      const batch = (data ?? []) as ScrapedJob[];
      jobs.push(...batch);
      if (batch.length < PAGE) break;
    }

    // Already-sent dedupe
    const { data: sentRows } = await supabase
      .from('alert_sent_log')
      .select('dedupe_key')
      .eq('alert_key', ALERT_KEY);
    const alreadySent = new Set((sentRows ?? []).map((r: { dedupe_key: string }) => r.dedupe_key));

    // Actioned jobs are hidden
    const { data: actionRows } = await supabase.from('job_actions').select('job_url, job_title, job_company');
    const actionedUrls = new Set((actionRows ?? []).map((a) => normalizeJobUrl(a.job_url)));
    const actionedTC = new Set((actionRows ?? []).map((a) => titleCompanyKey(a.job_title, a.job_company)));

    const seen = new Set<string>();
    const matched: ScrapedJob[] = [];
    const needsDescription: ScrapedJob[] = [];

    // Pass 1 — decide from what we already have (title/company + any stored description)
    for (const job of jobs) {
      const key = titleCompanyKey(job.title, job.company);
      const nUrl = normalizeJobUrl(job.url);
      const titleKey = normalizeText(job.title);
      if (seen.has(key) || seen.has(nUrl) || seen.has(titleKey)) continue;
      if (alreadySent.has(key)) continue;
      if (actionedUrls.has(nUrl) || actionedTC.has(key)) continue;
      if (!isLondonish(job.location)) continue;
      if (!isCandidate(job)) continue;

      seen.add(key);
      seen.add(nUrl);
      seen.add(titleKey);

      const storedDesc = (job.description ?? '').trim();
      // Title-only signal, or a stored description judged with the strict rules
      if (matchesGrowthAlert({ ...job, description: '' }) ||
          (storedDesc && matchesGrowthAlert(job, storedDesc, true))) {
        matched.push(job);
      } else if (!storedDesc) {
        // Ambiguous title (e.g. plain "Investor") and no description stored —
        // fetch the posting so stage can be judged from the full text.
        needsDescription.push(job);
      }
    }

    // Pass 2 — fetch full descriptions for the ambiguous ones, then re-test
    const maxEnrich = Number(url.searchParams.get('max_enrich') ?? (body?.max_enrich as number) ?? 150);
    const toEnrich = needsDescription.slice(0, maxEnrich);
    let enriched = 0;
    let enrichedMatches = 0;

    if (toEnrich.length > 0) {
      const firecrawlKey = Deno.env.get('FIRECRAWL_API_KEY') ?? undefined;
      const descriptions = await mapPool(toEnrich, 3, (job) =>
        fetchJobDescription(job.url, { firecrawlKey }).catch(() => ''));

      const updates: { id: string; description: string }[] = [];
      toEnrich.forEach((job, i) => {
        const desc = descriptions[i] ?? '';
        if (desc.length > 120) {
          enriched++;
          updates.push({ id: job.id, description: desc });
          if (matchesGrowthAlert(job, desc, true)) {
            enrichedMatches++;
            matched.push({ ...job, description: desc });
          }
        }
      });

      // Cache descriptions back so the app's filters improve too
      for (const u of updates) {
        await supabase.from('scraped_jobs').update({ description: u.description }).eq('id', u.id);
      }
    }

    console.log(`Growth alert: scanned=${jobs.length} ambiguous=${needsDescription.length} enriched=${enriched} enrichedMatches=${enrichedMatches} matched=${matched.length}`);


    if (dryRun) {
      return new Response(JSON.stringify({
        success: true, dryRun: true, since: sinceIso, scanned: jobs.length, matched: matched.length,
        ambiguous: needsDescription.length, enriched, enrichedMatches,
        jobs: matched.slice(0, 40).map((j) => ({ title: j.title, company: j.company, location: j.location, source: j.source, mode: j.mode, url: j.url })),
      }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    const advanceCheckpoint = async () => {
      await supabase.from('alert_checkpoints')
        .upsert({ alert_key: ALERT_KEY, last_alerted_at: new Date().toISOString(), updated_at: new Date().toISOString() }, { onConflict: 'alert_key' });
    };

    if (matched.length === 0) {
      await advanceCheckpoint();
      console.log(`No growth/secondaries jobs since ${sinceIso} (scanned ${jobs.length})`);
      return new Response(JSON.stringify({ success: true, matched: 0, scanned: jobs.length }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const rows = matched.map((job) => `
      <tr>
        <td style="padding:12px 16px;border-bottom:1px solid #e5e7eb;">
          <a href="${escapeHtml(job.url)}" style="color:#2660CC;text-decoration:none;font-weight:600;font-size:15px;">${escapeHtml(job.title)}</a>
          <div style="color:#6b7280;font-size:13px;margin-top:4px;">
            ${escapeHtml(job.company)} · ${escapeHtml(job.location)}${job.salary ? ` · <span style="color:#059669;font-weight:500;">${escapeHtml(job.salary)}</span>` : ''}${job.posted_date ? ` · ${escapeHtml(job.posted_date)}` : ''}
          </div>
          <div style="margin-top:4px;color:#9ca3af;font-size:11px;">${escapeHtml(job.source)} · ${escapeHtml(job.mode.toUpperCase())}</div>
        </td>
      </tr>`).join('');

    const html = `<!DOCTYPE html><html><body style="margin:0;padding:0;background:#f9fafb;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
      <div style="max-width:600px;margin:0 auto;padding:24px;">
        <div style="text-align:center;margin-bottom:24px;">
          <h1 style="font-size:20px;color:#111827;margin:0;">⚡ MBA<span style="color:#2660CC;">JOBSCOUT</span> · Tech Growth &amp; Secondaries</h1>
          <p style="color:#6b7280;font-size:14px;margin:4px 0 0;">${matched.length} new growth equity / late-stage VC / tech secondaries role${matched.length === 1 ? '' : 's'} in London</p>
        </div>
        <table style="width:100%;border-collapse:collapse;background:#fff;border-radius:8px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,0.1);">${rows}</table>
        <p style="text-align:center;color:#9ca3af;font-size:12px;margin-top:24px;">Sent by MBAJOBSCOUT</p>
      </div></body></html>`;

    const emailResponse = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${RESEND_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from: 'MBAJobScout <onboarding@resend.dev>',
        to: [ALERT_EMAIL],
        subject: `⚡ ${matched.length} new tech growth / secondaries role${matched.length === 1 ? '' : 's'} in London`,
        html,
      }),
    });

    const emailData = await emailResponse.json();
    if (!emailResponse.ok) {
      console.error('Resend error:', emailData);
      return new Response(JSON.stringify({ success: false, error: emailData }), {
        status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    await supabase.from('alert_sent_log').upsert(
      matched.map((j) => ({
        alert_key: ALERT_KEY,
        dedupe_key: titleCompanyKey(j.title, j.company),
        job_title: j.title,
        job_company: j.company,
        job_url: j.url,
      })),
      { onConflict: 'alert_key,dedupe_key' },
    );
    await advanceCheckpoint();

    return new Response(JSON.stringify({ success: true, matched: matched.length, emailId: emailData.id }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    console.error('Growth alert error:', message);
    return new Response(JSON.stringify({ success: false, error: message }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
