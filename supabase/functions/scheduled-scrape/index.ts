const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

/**
 * Scheduled scrape: runs daily at 4am UTC.
 * Fans out one scrape-jobs call per mode (vc, pe, ib, mc, st, im, tech, startups).
 * Each call uses persist=true so results are saved directly to the DB.
 * Users see pre-loaded jobs when they visit the site.
 */

interface ModeConfig {
  mode: string;
  sources: { name: string; url: string }[];
  keywords: string[];
}

const MODES: ModeConfig[] = [
  {
    mode: 'vc',
    sources: [
      { name: 'eFinancialCareers', url: 'https://www.efinancialcareers.co.uk/jobs/' },
      { name: 'Glassdoor UK', url: 'https://www.glassdoor.co.uk/Job/jobs.htm' },
      { name: 'Google Jobs', url: 'https://www.google.com/search?udm=8&q=venture+capital+jobs' },
      { name: 'Indeed UK', url: 'https://uk.indeed.com/jobs?q=%22venture+capital%22' },
      { name: 'InnovatorsRoom', url: 'https://innovatorsroom.beehiiv.com/archive?tags=%F0%9F%92%B6+Junior+Investor+JobDrop' },
      { name: 'John Gannon Blog', url: 'https://johngannonblog.com/?feed=job_feed' },
      { name: 'LinkedIn Jobs', url: 'https://www.linkedin.com/jobs/search/?keywords=%22venture+capital%22&location=London' },
      { name: 'Startup & VC', url: 'https://www.startupandvc.com/venture-capital-jobs' },
      { name: 'VC Careers', url: 'https://venturecapitalcareers.com/jobs/' },
      { name: 'Venture5', url: 'https://venture5.com/jobs/' },
      { name: 'SecondaryLink', url: 'https://secondarylink.com/seclink/jobs/board' },
      // Curated / aggregator boards; appended last so direct sources win cross-source dedup
      { name: 'Growth Equity Guide', url: 'https://growthequityinterviewguide.com/jobs?_job_strategy=venture%2Cgrowth&_job_location_category=london' },
      { name: 'Dartmouth Partners', url: 'https://www.dartmouthpartners.com/jobs' },
      { name: 'VC Jobs Newsletter', url: 'https://substack.com/@venturecapitaljobs' },
      { name: 'Learning VC', url: 'https://luisllorens.substack.com/' },
    ],

    keywords: [
      'Venture capital', 'Venture capital internship', 'Venture capital intern',
      'Venture capital graduate', 'Venture capital investor relations',
      'Venture capital platform', 'Venture capital fund operations',
      'VC fund operations', 'VC investor relations',
    ],
  },
  {
    mode: 'pe',
    sources: [
      { name: 'eFinancialCareers', url: 'https://www.efinancialcareers.co.uk/jobs/' },
      { name: 'Glassdoor UK', url: 'https://www.glassdoor.co.uk/Job/jobs.htm' },
      { name: 'Google Jobs', url: 'https://www.google.com/search?udm=8&q=private+equity+jobs' },
      { name: 'Indeed UK', url: 'https://uk.indeed.com/jobs?q=%22private+equity%22' },
      { name: 'LinkedIn Jobs', url: 'https://www.linkedin.com/jobs/search/?keywords=%22private+equity%22&location=London' },
      { name: 'SecondaryLink', url: 'https://secondarylink.com/seclink/jobs/board' },
      { name: 'Dartmouth Partners', url: 'https://www.dartmouthpartners.com/jobs' },
    ],

    keywords: [
      'Private equity', 'Private equity internship', 'Private equity intern',
      'Private equity graduate', 'Private equity analyst',
      'Private equity investor relations', 'Private equity fund operations',
      'Private equity portfolio operations', 'PE fund operations', 'PE investor relations',
    ],
  },
  {
    mode: 'ib',
    sources: [
      { name: 'eFinancialCareers', url: 'https://www.efinancialcareers.co.uk/jobs/' },
      { name: 'Glassdoor UK', url: 'https://www.glassdoor.co.uk/Job/jobs.htm' },
      { name: 'Google Jobs', url: 'https://www.google.com/search?udm=8&q=investment+banking+jobs' },
      { name: 'Indeed UK', url: 'https://uk.indeed.com/jobs?q=%22investment+banking%22' },
      { name: 'LinkedIn Jobs', url: 'https://www.linkedin.com/jobs/search/?keywords=%22investment+banking%22&location=London' },
      { name: 'Dartmouth Partners', url: 'https://www.dartmouthpartners.com/jobs' },
    ],

    keywords: [
      'Investment banking', 'Investment banking internship',
      'Investment banking intern', 'Investment banking graduate',
      'Investment banking analyst',
    ],
  },
  {
    mode: 'mc',
    sources: [
      { name: 'Glassdoor UK', url: 'https://www.glassdoor.co.uk/Job/jobs.htm' },
      { name: 'Google Jobs', url: 'https://www.google.com/search?udm=8&q=management+consulting+jobs' },
      { name: 'Indeed UK', url: 'https://uk.indeed.com/jobs?q=%22management+consulting%22' },
      { name: 'LinkedIn Jobs', url: 'https://www.linkedin.com/jobs/search/?keywords=%22management+consulting%22&location=London' },
    ],
    keywords: [
      'Management consulting', 'Management consultant', 'Strategy consulting',
      'Strategy consultant', 'Consulting analyst', 'Consulting internship',
      'Consulting graduate',
    ],
  },
  {
    mode: 'st',
    sources: [
      { name: 'eFinancialCareers', url: 'https://www.efinancialcareers.co.uk/jobs/' },
      { name: 'Glassdoor UK', url: 'https://www.glassdoor.co.uk/Job/jobs.htm' },
      { name: 'Google Jobs', url: 'https://www.google.com/search?udm=8&q=sales+trading+jobs' },
      { name: 'Indeed UK', url: 'https://uk.indeed.com/jobs?q=%22sales+and+trading%22' },
      { name: 'LinkedIn Jobs', url: 'https://www.linkedin.com/jobs/search/?keywords=%22sales+and+trading%22&location=London' },
    ],
    keywords: [
      'Sales and trading', 'Sales trading', 'Sales and trading internship',
      'Sales and trading graduate', 'Sales and trading analyst',
      'Equity sales', 'Fixed income sales', 'Rates trading', 'FX trading',
    ],
  },
  {
    mode: 'im',
    sources: [
      { name: 'eFinancialCareers', url: 'https://www.efinancialcareers.co.uk/jobs/' },
      { name: 'Glassdoor UK', url: 'https://www.glassdoor.co.uk/Job/jobs.htm' },
      { name: 'Google Jobs', url: 'https://www.google.com/search?udm=8&q=investment+management+jobs' },
      { name: 'Indeed UK', url: 'https://uk.indeed.com/jobs?q=%22investment+management%22' },
      { name: 'LinkedIn Jobs', url: 'https://www.linkedin.com/jobs/search/?keywords=%22investment+management%22&location=London' },
      { name: 'SecondaryLink', url: 'https://secondarylink.com/seclink/jobs/board' },
      { name: 'Dartmouth Partners', url: 'https://www.dartmouthpartners.com/jobs' },
    ],
    keywords: [

      'Investment management', 'Asset management', 'Hedge fund', 'Family office',
      'Portfolio manager', 'Fund manager', 'Equity research',
      'Investment analyst', 'Wealth management', 'Private wealth',
    ],
  },
  {
    mode: 'tech',
    sources: [
      { name: 'Glassdoor UK', url: 'https://www.glassdoor.co.uk/Job/jobs.htm' },
      { name: 'Google Jobs', url: 'https://www.google.com/search?udm=8&q=technology+product+management+strategy+jobs' },
      { name: 'Indeed UK', url: 'https://uk.indeed.com/jobs?q=%22product+manager%22+OR+%22strategy+and+operations%22+OR+%22bizops%22' },
      { name: 'LinkedIn Jobs', url: 'https://www.linkedin.com/jobs/search/?keywords=%22product+manager%22+OR+%22strategy+operations%22&location=London' },
    ],
    keywords: [
      'Product manager', 'Senior product manager', 'Group product manager',
      'Strategy and operations', 'Business operations', 'BizOps',
      'Corporate development', 'Corporate strategy', 'Go to market',
      'Growth manager', 'Head of growth', 'Growth lead', 'Growth marketing',
      'Growth product manager', 'Product operations', 'Tech strategy',
      'Commercial strategy', 'Revenue operations',
    ],
  },
  {
    mode: 'startups',
    sources: [
      { name: 'Glassdoor UK', url: 'https://www.glassdoor.co.uk/Job/jobs.htm' },
      { name: 'Google Jobs', url: 'https://www.google.com/search?udm=8&q=startup+chief+of+staff+OR+founder+associate+OR+growth+jobs' },
      { name: 'Indeed UK', url: 'https://uk.indeed.com/jobs?q=%22startup%22+%22chief+of+staff%22+OR+%22founder+associate%22' },
      { name: 'LinkedIn Jobs', url: 'https://www.linkedin.com/jobs/search/?keywords=%22startup%22+%22chief+of+staff%22&location=London' },
      { name: 'Startup & VC', url: 'https://www.startupandvc.com/venture-capital-jobs' },
    ],
    keywords: [
      'Chief of staff startup', 'Founder associate', 'Startup operations',
      'Startup growth', 'Head of growth', 'Growth lead', 'Startup strategy',
      'Startup product manager', 'GTM startup', 'Business operations startup',
      'Revenue operations startup',
    ],
  },
];

/**
 * Several scrapers only use keywords[0] as the search query. To cover a board's
 * full range of role types we run multiple passes, each rotated so a different
 * (well-spaced) keyword leads the search. Capped to limit scraping credits.
 */
const MAX_PASSES = 4;
function buildKeywordPasses(keywords: string[]): string[][] {
  if (keywords.length <= 1) return [keywords];
  const passCount = Math.min(MAX_PASSES, keywords.length);
  const step = Math.max(1, Math.floor(keywords.length / passCount));
  const passes: string[][] = [];
  for (let p = 0; p < passCount; p++) {
    const lead = p * step;
    passes.push([...keywords.slice(lead), ...keywords.slice(0, lead)]);
  }
  return passes;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY') || Deno.env.get('SUPABASE_PUBLISHABLE_KEY')!;
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const scrapeUrl = `${supabaseUrl}/functions/v1/scrape-jobs`;

    // Each mode gets its own cron invocation so a slow board (vc) can never
    // starve the others. POST {"mode":"tech"} runs a single board; no mode runs all.
    let requestedMode: string | null = null;
    let requestedPass: number | null = null;
    try {
      const body = await req.json();
      if (body && typeof body.mode === 'string') requestedMode = body.mode;
      if (body && typeof body.pass === 'number') requestedPass = body.pass;
    } catch { /* no body */ }

    const modesToRun = requestedMode
      ? MODES.filter((m) => m.mode === requestedMode)
      : MODES;

    if (requestedMode && modesToRun.length === 0) {
      return new Response(
        JSON.stringify({ success: false, error: `Unknown mode: ${requestedMode}` }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`[Scheduled Scrape] Starting scrape for ${modesToRun.map(m => m.mode).join(', ')} at ${new Date().toISOString()}`);

    const results: Record<string, { status: string; jobCount?: number; error?: string }> = {};

    // Run modes in batches of 2 to avoid overloading Firecrawl API rate limits
    const BATCH_SIZE = 2;
    for (let i = 0; i < modesToRun.length; i += BATCH_SIZE) {
      const batch = modesToRun.slice(i, i + BATCH_SIZE);
      const batchPromises = batch.map(async (config) => {
        // The big job boards only ever search keywords[0], so one pass per mode
        // covered a single search term (e.g. "Product manager") and missed whole
        // role types. Run several passes, each leading with a different term.
        const allPasses = buildKeywordPasses(config.keywords);
        // Cron runs one pass per invocation (each scrape takes ~2.5 min, close to
        // the function time limit). Omitting `pass` runs every pass sequentially.
        const passes = requestedPass !== null
          ? [allPasses[requestedPass % allPasses.length]]
          : allPasses;
        let modeTotal = 0;
        const errors: string[] = [];

        for (const passKeywords of passes) {
          const startTime = Date.now();
          try {
            console.log(`[${config.mode}] Starting scrape (lead term: ${passKeywords[0]})...`);
            const response = await fetch(scrapeUrl, {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${serviceKey}`,
              },
              body: JSON.stringify({
                sources: config.sources,
                keywords: passKeywords,
                location: 'United Kingdom',
                persist: true,
                mode: config.mode,
              }),
            });

            const data = await response.json();
            const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);

            if (data.success) {
              const jobCount = data.jobs?.length || 0;
              modeTotal += jobCount;
              console.log(`[${config.mode}] ✓ ${jobCount} jobs in ${elapsed}s (${passKeywords[0]})`);
            } else {
              console.error(`[${config.mode}] ✗ Failed (${passKeywords[0]}): ${data.error}`);
              errors.push(`${passKeywords[0]}: ${data.error}`);
            }
          } catch (err) {
            const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
            console.error(`[${config.mode}] ✗ Exception after ${elapsed}s (${passKeywords[0]}):`, err);
            errors.push(`${passKeywords[0]}: ${err instanceof Error ? err.message : 'Unknown error'}`);
          }
        }

        results[config.mode] = errors.length === passes.length
          ? { status: 'error', error: errors.join(' | ') }
          : { status: 'success', jobCount: modeTotal };
      });

      await Promise.allSettled(batchPromises);

      // Brief pause between batches to let Firecrawl rate limits recover
      if (i + BATCH_SIZE < modesToRun.length) {
        await new Promise(r => setTimeout(r, 5000));
      }
    }

    const totalJobs = Object.values(results)
      .filter(r => r.status === 'success')
      .reduce((sum, r) => sum + (r.jobCount || 0), 0);

    console.log(`[Scheduled Scrape] Complete. ${totalJobs} total jobs across ${modesToRun.length} modes.`);
    console.log(`[Scheduled Scrape] Results:`, JSON.stringify(results));

    return new Response(
      JSON.stringify({ success: true, totalJobs, results }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('[Scheduled Scrape] Fatal error:', error);
    return new Response(
      JSON.stringify({ success: false, error: error instanceof Error ? error.message : 'Unknown error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
