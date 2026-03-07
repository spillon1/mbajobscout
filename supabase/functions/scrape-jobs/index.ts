const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

interface ScrapeRequest {
  sources: { name: string; url: string }[];
  keywords: string[];
  location: string;
  persist?: boolean; // When true, save results directly to DB (used by cron)
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const apiKey = Deno.env.get('FIRECRAWL_API_KEY');
    if (!apiKey) {
      return new Response(
        JSON.stringify({ success: false, error: 'Firecrawl API key not configured' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const { sources, keywords, location, persist } = await req.json() as ScrapeRequest;

    if (!sources || sources.length === 0) {
      return new Response(
        JSON.stringify({ success: false, error: 'No sources provided' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Expand keywords to include common abbreviations
    const expandedKeywords = expandKeywords(keywords);
    console.log(`Scraping ${sources.length} sources for keywords: ${expandedKeywords.join(', ')} in ${location}`);

    const results: any[] = [];
    const sourceStatuses: Record<string, { status: string; error?: string; count?: number }> = {};

    for (const source of sources) {
      try {
        console.log(`Scraping: ${source.name} (${source.url})`);

        // Check if this is an RSS/XML feed
        if (isRssFeedUrl(source.url)) {
          const rssJobs = await scrapeRssFeed(source, expandedKeywords, location);
          results.push(...rssJobs);
          sourceStatuses[source.name] = { status: 'connected', count: rssJobs.length };
          console.log(`Found ${rssJobs.length} jobs from RSS feed: ${source.name}`);
          continue;
        }

        // Google Jobs: paginate multiple pages
        if (isGoogleJobsUrl(source.url)) {
          const googleJobs = await scrapeGoogleJobsPages(apiKey, keywords, location, source);
          const vcGoogleJobs = googleJobs.filter((j: any) => isLikelyVcRole(j.title, j.company, j.description));
          results.push(...vcGoogleJobs);
          sourceStatuses[source.name] = { status: 'connected', count: vcGoogleJobs.length };
          console.log(`Found ${vcGoogleJobs.length} VC-relevant jobs from Google Jobs (filtered from ${googleJobs.length})`);
          continue;
        }

        // Venture5: use actions to click "Load more listings" and parse table rows
        if (source.url.includes('venture5.com')) {
          const venture5Jobs = await scrapeVenture5(apiKey, source, location);
          results.push(...venture5Jobs);
          // If we got very few jobs, the scrape was likely degraded — mark as error
          // so the client won't wipe existing good data
          if (venture5Jobs.length < 5) {
            sourceStatuses[source.name] = { status: 'error', error: `Degraded scrape: only ${venture5Jobs.length} jobs (expected 50+)`, count: venture5Jobs.length };
            console.log(`Venture5: degraded scrape — only ${venture5Jobs.length} jobs, marking as error`);
          } else {
            sourceStatuses[source.name] = { status: 'connected', count: venture5Jobs.length };
            console.log(`Found ${venture5Jobs.length} jobs from Venture5 (with Load More)`);
          }
          continue;
        }

        // eFinancialCareers: dedicated scraper with structured markdown parsing
        if (source.url.includes('efinancialcareers')) {
          const efcJobs = await scrapeEFinancialCareers(apiKey, source, location, keywords);
          results.push(...efcJobs);
          sourceStatuses[source.name] = { status: 'connected', count: efcJobs.length };
          console.log(`Found ${efcJobs.length} jobs from eFinancialCareers`);
          continue;
        }

        // OCC / 12twenty: authenticated scraper
        if (source.url.includes('12twenty.com')) {
          const occJobs = await scrapeOcc12Twenty(source, keywords, location);
          results.push(...occJobs);
          sourceStatuses[source.name] = { status: 'connected', count: occJobs.length };
          console.log(`Found ${occJobs.length} jobs from OCC (12twenty)`);
          continue;
        }

        // Indeed UK: dedicated scraper with Firecrawl
        if (source.url.includes('indeed.com')) {
          const indeedJobs = await scrapeIndeed(apiKey, source, keywords, location);
        const vcIndeedJobs = indeedJobs.filter((j: any) => isLikelyVcRole(j.title, j.company, j.description));
          results.push(...vcIndeedJobs);
          sourceStatuses[source.name] = { status: 'connected', count: vcIndeedJobs.length };
          console.log(`Found ${vcIndeedJobs.length} VC-relevant jobs from Indeed UK (light filter from ${indeedJobs.length})`);
          continue;
        }

        // Glassdoor UK: dedicated scraper with Firecrawl extract
        if (source.url.includes('glassdoor.co.uk')) {
          const glassdoorJobs = await scrapeGlassdoor(apiKey, source, keywords, location);
        const vcGlassdoorJobs = glassdoorJobs.filter((j: any) => isLikelyVcRole(j.title, j.company, j.description));
          results.push(...vcGlassdoorJobs);
          sourceStatuses[source.name] = { status: 'connected', count: vcGlassdoorJobs.length };
          console.log(`Found ${vcGlassdoorJobs.length} VC-relevant jobs from Glassdoor UK (light filter from ${glassdoorJobs.length})`);
          continue;
        }

        // LinkedIn Jobs: use guest API
        if (source.url.includes('linkedin.com')) {
          const linkedinJobs = await scrapeLinkedIn(apiKey, source, keywords, location);
        const vcLinkedinJobs = linkedinJobs.filter((j: any) => isLikelyVcRole(j.title, j.company, j.description));
          results.push(...vcLinkedinJobs);
          sourceStatuses[source.name] = { status: 'connected', count: vcLinkedinJobs.length };
          console.log(`Found ${vcLinkedinJobs.length} VC-relevant jobs from LinkedIn (light filter from ${linkedinJobs.length})`);
          continue;
        }

        // InnovatorsRoom: scrape beehiiv JobDrop newsletters
        if (source.url.includes('innovatorsroom.beehiiv.com') || source.url.includes('innovatorsroom.com/jobs')) {
          const irJobs = await scrapeInnovatorsRoom(apiKey, source, location);
          results.push(...irJobs);
          sourceStatuses[source.name] = { status: 'connected', count: irJobs.length };
          console.log(`Found ${irJobs.length} jobs from InnovatorsRoom`);
          continue;
        }

        // Otherwise use Firecrawl
        const scrapeUrl = source.url;
        const response = await fetch('https://api.firecrawl.dev/v1/scrape', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${apiKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            url: scrapeUrl,
            formats: ['markdown', 'links'],
            onlyMainContent: true,
            waitFor: 5000,
          }),
        });

        const data = await response.json();

        if (!response.ok) {
          console.error(`Failed to scrape ${source.name}:`, data);
          sourceStatuses[source.name] = { status: 'error', error: data.error || `HTTP ${response.status}`, count: 0 };
          continue;
        }

        sourceStatuses[source.name] = { status: 'connected', count: 0 };

        const markdown = data.data?.markdown || data.markdown || '';
        const links = data.data?.links || data.links || [];

        const jobs = parseJobsFromMarkdown(markdown, links, source, expandedKeywords, location);
        results.push(...jobs);
        sourceStatuses[source.name].count = jobs.length;

        console.log(`Found ${jobs.length} potential jobs from ${source.name}`);
      } catch (err) {
        console.error(`Error scraping ${source.name}:`, err);
        sourceStatuses[source.name] = { status: 'error', error: err instanceof Error ? err.message : 'Unknown error', count: 0 };
      }
    }

    // Filter out jobs older than 6 months
    const sixMonthsAgo = new Date();
    sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);
    const filteredResults = results.filter(job => {
      // Remove junk/generic entries
      const titleLower = job.title.toLowerCase();
      const junkTitles = ['venture capital jobs in london', 'venture capital careers', "the vc industry's trusted resource", 'filters and topics', 'search results', 'united states'];
      if (junkTitles.includes(titleLower)) return false;
      if (job.company === 'Unknown' && job.title.length < 10) return false;

      // Age filter
      // Don't drop Venture5 jobs without dates — they may still be valid recent postings
      if (!job.postedDate || job.postedDate === 'Scraped just now') return true;
      const parsed = tryParseDate(job.postedDate);
      if (!parsed) return true;
      return parsed >= sixMonthsAgo;
    });

    // Deduplicate by url
    const seen = new Set<string>();
    const dedupedResults = filteredResults.filter(job => {
      if (seen.has(job.url)) return false;
      seen.add(job.url);
      return true;
    });

    // Update per-source counts based on final filtered result set
    const finalSourceCounts: Record<string, number> = {};
    for (const job of dedupedResults) {
      finalSourceCounts[job.source] = (finalSourceCounts[job.source] || 0) + 1;
    }
    for (const [sourceName, status] of Object.entries(sourceStatuses)) {
      if (status.status === 'connected') {
        status.count = finalSourceCounts[sourceName] || 0;
      }
    }

    console.log(`Total jobs found: ${dedupedResults.length} (filtered from ${results.length})`);

    // Persist to DB if requested (used by scheduled cron)
    if (persist && dedupedResults.length > 0) {
      try {
        const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
        const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
        const supabase = createClient(supabaseUrl, serviceKey);

        // Delete old jobs for successfully scraped sources
        const successfulSources = Object.entries(sourceStatuses)
          .filter(([, s]) => s.status === 'connected')
          .map(([name]) => name);

        if (successfulSources.length > 0) {
          await supabase.from('scraped_jobs').delete().in('source', successfulSources);
        }

        const rows = dedupedResults.map((j: any) => ({
          title: j.title,
          company: j.company || 'Unknown',
          location: j.location || 'London, UK',
          type: j.type || 'full-time',
          source: j.source,
          source_url: j.sourceUrl || j.url || '',
          url: j.url || j.sourceUrl || '',
          posted_date: j.postedDate || j.posted_date || null,
          description: j.description || null,
          salary: j.salary || null,
        }));

        const { error: insertError } = await supabase
          .from('scraped_jobs')
          .upsert(rows, { onConflict: 'url', ignoreDuplicates: false });

        if (insertError) {
          console.error('[Persist] Failed to save jobs:', insertError.message);
        } else {
          console.log(`[Persist] Saved ${rows.length} jobs to DB`);
        }
      } catch (persistErr) {
        console.error('[Persist] Error:', persistErr);
      }
    }

    return new Response(
      JSON.stringify({ success: true, jobs: dedupedResults, sourceStatuses }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('Scrape error:', error);
    return new Response(
      JSON.stringify({ success: false, error: error instanceof Error ? error.message : 'Failed to scrape' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});

// ---- Keyword Expansion ----

function expandKeywords(keywords: string[]): string[] {
  const expanded = new Set(keywords.map(k => k.toLowerCase()));
  // Add common abbreviations
  for (const kw of keywords) {
    const lower = kw.toLowerCase();
    if (lower.includes('venture capital')) {
      expanded.add(lower.replace('venture capital', 'vc'));
    }
    if (lower.includes('vc')) {
      expanded.add(lower.replace('vc', 'venture capital'));
    }
  }
  // Always include 'vc' and 'venture capital' as standalone matches
  if (keywords.some(k => k.toLowerCase().includes('venture capital') || k.toLowerCase().includes('vc'))) {
    expanded.add('vc');
    expanded.add('venture capital');
  }
  return [...expanded];
}

// ---- Google Jobs Detection ----

function isGoogleJobsUrl(url: string): boolean {
  return url.includes('google.com/search') && (url.includes('udm=8') || url.includes('jobs'));
}

// ---- Google Jobs Pagination ----

const GOOGLE_JOBS_PAGES = 40; // Scrape 40 pages (~10 results per page)

async function scrapeGoogleJobsPages(
  apiKey: string,
  keywords: string[],
  location: string,
  source: { name: string; url: string }
): Promise<any[]> {
  const allJobs: any[] = [];
  const query = encodeURIComponent(`"${keywords[0] || 'venture capital'}" jobs ${location}`);

  for (let page = 0; page < GOOGLE_JOBS_PAGES; page++) {
    const start = page * 10;
    const scrapeUrl = `https://www.google.com/search?q=${query}&udm=8&start=${start}`;
    console.log(`Google Jobs page ${page + 1}: ${scrapeUrl}`);

    try {
      const response = await fetch('https://api.firecrawl.dev/v1/scrape', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          url: scrapeUrl,
          formats: ['markdown', 'links'],
          onlyMainContent: true,
          waitFor: 5000,
        }),
      });

      const data = await response.json();
      if (!response.ok) {
        console.error(`Google Jobs page ${page + 1} failed:`, data);
        break;
      }

      const markdown = data.data?.markdown || data.markdown || '';
      const jobs = parseGoogleJobs(markdown, source, location);
      
      // Deduplicate against already found jobs
      const newJobs = jobs.filter(j => !allJobs.some(existing => existing.title === j.title && existing.company === j.company));
      allJobs.push(...newJobs);
      
      console.log(`Google Jobs page ${page + 1}: ${newJobs.length} new jobs (${jobs.length} total on page)`);
      
      // If we got very few results, no more pages
      if (jobs.length < 3) break;
    } catch (err) {
      console.error(`Google Jobs page ${page + 1} error:`, err);
      break;
    }
  }

  return allJobs;
}

// ---- Venture5 Scraper (with location filter + Load More) ----

async function scrapeVenture5(
  apiKey: string,
  source: { name: string; url: string },
  searchLocation: string
): Promise<any[]> {
  const searchCity = searchLocation.split(',')[0]?.trim().toLowerCase();
  // Use Venture5's built-in location search to pre-filter
  const filteredUrl = `https://venture5.com/jobs/?search_location=${encodeURIComponent(searchCity)}`;
  console.log(`Venture5: scraping pre-filtered URL: ${filteredUrl}`);

  // Try the actions scrape with retries (Bad Gateway / 502 are transient)
  let markdown = '';
  const MAX_RETRIES = 3;

  for (let attempt = 1; attempt <= MAX_RETRIES && !markdown; attempt++) {
    try {
      const actions: any[] = [
        { type: 'wait', milliseconds: 3000 },
      ];
      // Firecrawl caps at 50 actions total; each click needs click+wait = 2 actions
      // Budget: 50 - 1 (initial wait) - 1 (final scrape) = 48 → 24 click+wait pairs
      for (let i = 0; i < 24; i++) {
        actions.push({ type: 'click', selector: 'a.load_more_jobs' });
        actions.push({ type: 'wait', milliseconds: 2000 });
      }
      actions.push({ type: 'scrape' });

      console.log(`Venture5: actions scrape attempt ${attempt}/${MAX_RETRIES} (24 clicks)`);
      const response = await fetch('https://api.firecrawl.dev/v1/scrape', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          url: filteredUrl,
          formats: ['markdown'],
          onlyMainContent: true,
          waitFor: 5000,
          timeout: 120000,
          actions,
        }),
      });

      const data = await response.json();
      if (response.ok) {
        const md = data.data?.markdown || data.markdown || '';
        // Sanity check: a good scrape should return >10k chars (full listings)
        if (md.length > 10000) {
          markdown = md;
          console.log(`Venture5: actions scrape succeeded on attempt ${attempt} (${markdown.length} chars)`);
        } else {
          console.log(`Venture5: actions scrape attempt ${attempt} returned only ${md.length} chars — too short, retrying`);
        }
      } else {
        console.error(`Venture5: actions scrape attempt ${attempt} failed:`, data.error || response.status);
      }
    } catch (err) {
      console.error(`Venture5: actions scrape attempt ${attempt} error:`, err);
    }

    // Wait before retry
    if (!markdown && attempt < MAX_RETRIES) {
      await new Promise(r => setTimeout(r, 2000));
    }
  }

  // Fallback: simple scrape (first page only) — only if all retries failed
  if (!markdown) {
    console.log('Venture5: all action scrape attempts failed, trying simple scrape fallback');
    try {
      const response = await fetch('https://api.firecrawl.dev/v1/scrape', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          url: filteredUrl,
          formats: ['markdown'],
          onlyMainContent: true,
          waitFor: 5000,
        }),
      });
      const data = await response.json();
      if (response.ok) {
        markdown = data.data?.markdown || data.markdown || '';
      } else {
        throw new Error(data.error || `HTTP ${response.status}`);
      }
    } catch (err) {
      console.error('Venture5 fallback error:', err);
    }
  }

  if (!markdown) {
    console.log('Venture5: no markdown retrieved');
    return [];
  }

  console.log(`Venture5 markdown length: ${markdown.length}`);
  console.log(`Venture5 markdown preview: ${markdown.substring(0, 500)}`);

  const parsedJobs = parseVenture5Jobs(markdown, source, searchCity);
  return await enrichVenture5PostedDates(parsedJobs, searchCity);
}

async function enrichVenture5PostedDates(jobs: any[], searchCity: string): Promise<any[]> {
  const missingDateJobs = jobs.filter((j) => !j.postedDate || j.postedDate === 'Scraped just now');
  if (missingDateJobs.length === 0) return jobs;

  console.log(`Venture5: ${missingDateJobs.length} jobs missing dates, trying RSS enrichment`);

  try {
    const rssUrl = `https://venture5.com/jobs/?feed=job_feed&search_location=${encodeURIComponent(searchCity)}`;
    const response = await fetch(rssUrl);
    if (!response.ok) {
      console.log('Venture5 RSS feed failed, keeping jobs without dates');
      return jobs;
    }

    const xml = await response.text();
    const rssItems = parseRssItems(xml);

    const dateByUrl = new Map<string, string>();
    for (const item of rssItems) {
      const key = normalizeVenture5Url(item.link);
      if (key && item.pubDate) dateByUrl.set(key, item.pubDate);
    }

    console.log(`Venture5 RSS date enrichment loaded ${dateByUrl.size} dated URLs`);

    const enriched = jobs.map((job) => {
      if (job.postedDate && job.postedDate !== 'Scraped just now') return job;
      const rssDate = dateByUrl.get(normalizeVenture5Url(job.url));
      if (rssDate) {
        return { ...job, postedDate: rssDate };
      }
      console.log(`Venture5: no date found for "${job.title}" at ${job.company} (${job.url})`);
      return job;
    });

    // Keep ALL jobs — don't drop ones without dates
    return enriched;
  } catch (err) {
    console.error('Venture5 RSS date enrichment failed:', err);
    return jobs;
  }
}

function normalizeVenture5Url(url: string): string {
  return (url || '')
    .trim()
    .replace(/^https?:\/\/(www\.)?/i, 'https://')
    .replace(/\/$/, '');
}

function parseVenture5Jobs(
  markdown: string,
  source: { name: string; url: string },
  searchCity: string
): any[] {
  const jobs: any[] = [];

  // Find venture5 job URLs and parse the listing content around each URL
  const urlPattern = /\]\((https?:\/\/(?:www\.)?venture5\.com\/(?:job\/[^\s)]+|\?post_type=job_listing[^\s)]+))\)/g;
  let urlMatch;

  while ((urlMatch = urlPattern.exec(markdown)) !== null) {
    const url = urlMatch[1];

    // Proven extraction block: content before URL carries title/company/location for most listings
    const windowStart = Math.max(0, urlMatch.index - 700);
    const beforeUrl = markdown.substring(windowStart, urlMatch.index);
    const blockStart = beforeUrl.lastIndexOf('- [');
    if (blockStart < 0) continue;

    const absoluteBlockStart = windowStart + blockStart;
    const blockEnd = markdown.indexOf('\n- [', urlMatch.index);
    const itemWindow = markdown.substring(
      absoluteBlockStart,
      blockEnd === -1 ? Math.min(markdown.length, urlMatch.index + 1200) : blockEnd
    );

    const content = beforeUrl.substring(blockStart + 2);
    const textContent = content
      .replace(/!\[[^\]]*\]\([^)]*\)/g, '')
      .replace(/\*\*/g, '')
      .replace(/\\/g, '')
      .replace(/- Posted/g, 'Posted')
      .trim();

    const parts = textContent
      .split(/\n/)
      .map((s) => s.trim())
      .filter((s) => s.length > 0 && s !== '[' && s !== ',' && s !== '-');

    if (parts.length < 2) continue;

    const title = parts[0].replace(/^\[/, '').trim();
    const company = parts[1].trim();

    if (title.length < 3 || title.length > 200) continue;
    const skipWords = ['newsletter', 'subscribe', 'cookie', 'sign in', 'load more', 'advertisement', 'menu', 'about', 'latest news'];
    if (skipWords.some((w) => title.toLowerCase().includes(w))) continue;

    let jobLocation = '';
    for (const part of parts) {
      if (/london|england|uk|united kingdom/i.test(part) && !part.includes('Posted')) {
        jobLocation = part;
        break;
      }
    }

    if (searchCity && !jobLocation) continue;
    if (searchCity && jobLocation && !jobLocation.toLowerCase().includes(searchCity)) continue;

    // Capture posted date from the full listing item
    let postedDate = 'Scraped just now';

    const rawDateMatch =
      itemWindow.match(/Posted\s+(\d+\s*(?:hour|day|week|month|year)s?\s*ago)/i) ||
      itemWindow.match(/\b(\d+\s*(?:hour|day|week|month|year)s?\s*ago)\b/i);

    if (rawDateMatch) {
      postedDate = rawDateMatch[1];
    } else {
      const absoluteDateMatch = itemWindow.match(/\b([A-Za-z]+\s+\d{1,2},?\s+\d{4})\b/);
      if (absoluteDateMatch) postedDate = absoluteDateMatch[1];
    }

    let type = 'full-time';
    const fullText = `${title} ${company}`.toLowerCase();
    if (fullText.includes('intern') && !fullText.includes('internal')) type = 'internship';
    else if (fullText.includes('graduate') || fullText.includes('entry level') || fullText.includes('visiting analyst')) type = 'graduate';

    if (jobs.some((j) => j.url === url || (j.title === title && j.company === company))) continue;

    jobs.push({
      id: crypto.randomUUID(),
      title,
      company,
      location: jobLocation,
      type,
      source: source.name,
      sourceUrl: source.url,
      url,
      postedDate,
    });
  }

  console.log(`Venture5 parser found ${jobs.length} jobs matching location: ${searchCity}`);
  return jobs;
}

// ---- Date Parsing Helper ----

function tryParseDate(dateStr: string): Date | null {
  if (!dateStr || dateStr === 'Scraped just now') return null;
  
  // Handle relative dates like "5 days ago", "2 weeks ago"
  const relMatch = dateStr.match(/(\d+)\s*(hour|day|week|month|year)s?\s*ago/i);
  if (relMatch) {
    const num = parseInt(relMatch[1]);
    const unit = relMatch[2].toLowerCase();
    const d = new Date();
    if (unit === 'hour') d.setHours(d.getHours() - num);
    else if (unit === 'day') d.setDate(d.getDate() - num);
    else if (unit === 'week') d.setDate(d.getDate() - num * 7);
    else if (unit === 'month') d.setMonth(d.getMonth() - num);
    else if (unit === 'year') d.setFullYear(d.getFullYear() - num);
    return d;
  }

  // Try standard date parsing
  const parsed = new Date(dateStr);
  if (!isNaN(parsed.getTime())) return parsed;

  // Try "January 30, 2026" style
  const monthMatch = dateStr.match(/(\w+)\s+(\d{1,2}),?\s+(\d{4})/);
  if (monthMatch) {
    const attempt = new Date(`${monthMatch[1]} ${monthMatch[2]}, ${monthMatch[3]}`);
    if (!isNaN(attempt.getTime())) return attempt;
  }

  return null;
}

// ---- RSS Feed Support ----

function isRssFeedUrl(url: string): boolean {
  const lower = url.toLowerCase();
  return lower.includes('/feed') || lower.includes('feed=') || lower.includes('.rss') || lower.includes('.xml') || lower.includes('format=xml');
}

// ---- Indeed UK Scraper ----

async function scrapeIndeed(
  apiKey: string,
  source: { name: string; url: string },
  keywords: string[],
  location: string
): Promise<any[]> {
  const searchCity = location.split(',')[0]?.trim() || 'London';
  const searchQuery = keywords[0] || 'venture capital';

  let searchUrl = source.url;
  if (!searchUrl.includes('?q=') && !searchUrl.includes('&q=')) {
    searchUrl = `https://uk.indeed.com/jobs?q=${encodeURIComponent('"' + searchQuery + '"')}&l=${encodeURIComponent(searchCity)}`;
  }

  console.log(`Indeed: scraping URL: ${searchUrl}`);

  // Use Firecrawl JSON extraction to get structured data including dates
  const jsonSchema = {
    type: 'object',
    properties: {
      jobs: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            title: { type: 'string', description: 'Job title' },
            company: { type: 'string', description: 'Company name' },
            location: { type: 'string', description: 'Job location' },
            posted: { type: 'string', description: 'When the job was posted, e.g. "2 days ago", "Just posted", "30+ days ago"' },
            salary: { type: 'string', description: 'Salary if shown' },
            url: { type: 'string', description: 'Link to the job posting' },
          },
          required: ['title', 'company'],
        },
      },
    },
    required: ['jobs'],
  };

  // Try JSON extraction first, fall back to markdown if it times out
  let jsonData: any = null;
  let html = '';

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 30000);

    const response = await fetch('https://api.firecrawl.dev/v1/scrape', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        url: searchUrl,
        formats: ['extract'],
        extract: { schema: jsonSchema },
        waitFor: 3000,
        timeout: 30000,
      }),
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    const data = await response.json();
    if (response.ok) {
      jsonData = data.data?.extract || data.extract;
      html = data.data?.html || data.html || '';
      console.log(`Indeed: got JSON extraction: ${JSON.stringify(jsonData)?.substring(0, 500)}`);
    } else {
      console.error('Indeed: Firecrawl extract failed:', JSON.stringify(data).substring(0, 300));
    }
  } catch (extractErr) {
    console.warn(`Indeed: JSON extraction timed out or failed, falling back to markdown scrape`);
  }

  // If JSON extraction succeeded, use it directly
  if (jsonData?.jobs && jsonData.jobs.length > 0) {
    console.log(`Indeed: JSON extraction found ${jsonData.jobs.length} jobs`);
    return jsonData.jobs
      .filter((j: any) => j.title && j.title.length >= 3 && j.title.length <= 200)
      .filter((j: any) => !/sign in|menu|filter|skip|salary estimate|location|remote|miles/i.test(j.title))
      .map((j: any) => {
        let type = 'full-time';
        const tl = (j.title || '').toLowerCase();
        if (tl.includes('intern') && !tl.includes('internal')) type = 'internship';
        else if (tl.includes('graduate') || tl.includes('entry level')) type = 'graduate';

        let jobUrl = j.url || '';
        if (jobUrl.startsWith('/')) jobUrl = `https://uk.indeed.com${jobUrl}`;
        if (!jobUrl) jobUrl = searchUrl;

        const postedDate = j.posted ? convertRelativeDate(j.posted) : undefined;

        return {
          id: crypto.randomUUID(),
          title: j.title,
          company: j.company || 'Unknown',
          location: j.location || searchCity,
          type,
          source: source.name,
          sourceUrl: source.url,
          url: jobUrl,
          postedDate,
          salary: j.salary || undefined,
        };
      });
  }

  // Fallback: try markdown scrape (faster, no LLM extraction)
  console.log('Indeed: JSON extraction failed or empty, trying markdown fallback');
  try {
    const fallbackController = new AbortController();
    const fallbackTimeoutId = setTimeout(() => fallbackController.abort(), 20000);

    const fallbackResp = await fetch('https://api.firecrawl.dev/v1/scrape', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        url: searchUrl,
        formats: ['markdown', 'html'],
        waitFor: 3000,
        timeout: 15000,
      }),
      signal: fallbackController.signal,
    });

    clearTimeout(fallbackTimeoutId);
    const fallbackData = await fallbackResp.json();
    if (fallbackResp.ok) {
      html = fallbackData.data?.html || fallbackData.html || '';
      console.log(`Indeed: markdown fallback got ${html.length} chars HTML`);
    }
  } catch (fallbackErr) {
    console.warn('Indeed: markdown fallback also failed');
  }

  if (html) {
    return parseIndeedJobs(html, source, searchCity);
  }

  console.warn('Indeed: all scraping methods failed, returning empty');
  return [];
}

/** Convert relative date strings like "2 days ago" to ISO date strings */
function convertRelativeDate(relStr: string): string | undefined {
  if (!relStr) return undefined;
  const lower = relStr.toLowerCase().trim();

  // Treat vague "today"/"just posted" as unknown — no reliable date
  if (lower === 'just posted' || lower === 'today' || lower === 'just now') {
    return undefined;
  }

  // Handle compact formats like "30d+", "24h", "2d", "1w"
  const compactMatch = lower.match(/^(\d+)\s*(h|d|w|m)\+?$/);
  if (compactMatch) {
    const n = parseInt(compactMatch[1]);
    const unit = compactMatch[2];
    const d = new Date();
    if (unit === 'h') d.setHours(d.getHours() - n);
    else if (unit === 'd') d.setDate(d.getDate() - n);
    else if (unit === 'w') d.setDate(d.getDate() - n * 7);
    else if (unit === 'm') d.setMonth(d.getMonth() - n);
    return d.toISOString();
  }

  const match = lower.match(/(\d+)\+?\s*(hour|day|week|month)s?\s*ago/i);
  if (match) {
    const n = parseInt(match[1]);
    const unit = match[2].toLowerCase();
    const d = new Date();
    if (unit === 'hour') d.setHours(d.getHours() - n);
    else if (unit === 'day') d.setDate(d.getDate() - n);
    else if (unit === 'week') d.setDate(d.getDate() - n * 7);
    else if (unit === 'month') d.setMonth(d.getMonth() - n);
    return d.toISOString();
  }

  return relStr; // Return as-is if not a relative format
}

function parseIndeedJobs(
  html: string,
  source: { name: string; url: string },
  searchCity: string,
  markdown?: string
): any[] {
  const jobs: any[] = [];

  // Indeed job cards use specific data attributes and classes.
  // Each job card is typically inside a <div> with class "job_seen_beacon" or similar,
  // with an <a> containing class "jcs-JobTitle" and an <h2> with the title text.

  // Strategy: extract job card blocks from HTML using multiple patterns.

  // Pattern 1: jcs-JobTitle links (most reliable)
  const titlePattern = /<a[^>]*?href="([^"]*)"[^>]*?class="[^"]*jcs-JobTitle[^"]*"[^>]*>([\s\S]*?)<\/a>/gi;
  let match;
  while ((match = titlePattern.exec(html)) !== null) {
    let url = match[1];
    // Extract text from inner HTML (strip tags)
    const title = match[2].replace(/<[^>]*>/g, '').trim();
    if (url.startsWith('/')) url = `https://uk.indeed.com${url}`;
    if (title.length < 3 || title.length > 200) continue;

    // Get surrounding context (next ~2000 chars) for company/location/salary
    const context = html.substring(match.index, match.index + 3000);
    const { company, jobLocation, salary, postedDate, description } = extractIndeedCardDetails(context, searchCity);

    let type: string = 'full-time';
    const tl = title.toLowerCase();
    if (tl.includes('intern') && !tl.includes('internal')) type = 'internship';
    else if (tl.includes('graduate') || tl.includes('entry level')) type = 'graduate';

    if (!jobs.some(j => j.title === title && j.company === company)) {
      jobs.push({
        id: crypto.randomUUID(),
        title,
        company,
        location: jobLocation,
        type,
        source: source.name,
        sourceUrl: source.url,
        url,
        postedDate: postedDate ? convertRelativeDate(postedDate) : undefined,
        description: description || undefined,
        salary: salary || undefined,
      });
    }
  }

  // Pattern 2: Fallback — look for <h2> with jobTitle class
  if (jobs.length === 0) {
    const h2Pattern = /<h2[^>]*class="[^"]*jobTitle[^"]*"[^>]*>([\s\S]*?)<\/h2>/gi;
    while ((match = h2Pattern.exec(html)) !== null) {
      const innerHtml = match[1];
      // Extract link and title
      const linkMatch = innerHtml.match(/<a[^>]*href="([^"]*)"[^>]*>([\s\S]*?)<\/a>/);
      if (!linkMatch) continue;
      let url = linkMatch[1];
      const title = linkMatch[2].replace(/<[^>]*>/g, '').trim();
      if (url.startsWith('/')) url = `https://uk.indeed.com${url}`;
      if (title.length < 3) continue;

      const context = html.substring(match.index, match.index + 3000);
      const { company, jobLocation, salary, postedDate, description } = extractIndeedCardDetails(context, searchCity);

      let type: string = 'full-time';
      const tl = title.toLowerCase();
      if (tl.includes('intern') && !tl.includes('internal')) type = 'internship';
      else if (tl.includes('graduate') || tl.includes('entry level')) type = 'graduate';

      if (!jobs.some(j => j.title === title && j.company === company)) {
        jobs.push({
          id: crypto.randomUUID(),
          title,
          company,
          location: jobLocation,
          type,
          source: source.name,
          sourceUrl: source.url,
          url,
        postedDate: postedDate ? convertRelativeDate(postedDate) : undefined,
          description: description || undefined,
          salary: salary || undefined,
        });
      }
    }
  }

  // Pattern 3: data-jk attribute cards (Indeed uses data-jk for job keys)
  if (jobs.length === 0) {
    const cardPattern = /<a[^>]*data-jk="([^"]*)"[^>]*href="([^"]*)"[^>]*>([\s\S]*?)<\/a>/gi;
    while ((match = cardPattern.exec(html)) !== null) {
      let url = match[2];
      const title = match[3].replace(/<[^>]*>/g, '').trim();
      if (url.startsWith('/')) url = `https://uk.indeed.com${url}`;
      if (title.length < 5 || title.length > 200) continue;
      if (/sign in|menu|filter|skip|salary|location|remote|miles/i.test(title)) continue;

      const context = html.substring(match.index, match.index + 3000);
      const { company, jobLocation, salary, postedDate } = extractIndeedCardDetails(context, searchCity);

      if (!jobs.some(j => j.title === title)) {
        jobs.push({
          id: crypto.randomUUID(),
          title,
          company,
          location: jobLocation,
          type: 'full-time',
          source: source.name,
          sourceUrl: source.url,
          url,
          postedDate: postedDate ? convertRelativeDate(postedDate) : undefined,
          salary: salary || undefined,
        });
      }
    }
  }

  console.log(`Indeed parser found ${jobs.length} jobs`);
  if (jobs.length > 0) {
    console.log(`Indeed sample titles: ${jobs.slice(0, 5).map(j => j.title).join(' | ')}`);
  }
  return jobs;
}

function extractIndeedCardDetails(context: string, fallbackCity: string) {
  let company = 'Unknown';
  let jobLocation = fallbackCity;
  let salary = '';
  let postedDate = '';
  let description = '';

  // Company: often in <span data-testid="company-name"> or class containing "company"
  const companyMatch = context.match(/data-testid="company-name"[^>]*>([^<]+)/i)
    || context.match(/class="[^"]*company[^"]*"[^>]*>([^<]+)/i)
    || context.match(/class="[^"]*companyName[^"]*"[^>]*>([^<]+)/i);
  if (companyMatch) {
    company = companyMatch[1].replace(/&amp;/g, '&').trim();
  }

  // Location: often in <div data-testid="text-location"> or class containing "companyLocation"
  const locMatch = context.match(/data-testid="text-location"[^>]*>([^<]+)/i)
    || context.match(/class="[^"]*companyLocation[^"]*"[^>]*>([^<]+)/i)
    || context.match(/class="[^"]*job-location[^"]*"[^>]*>([^<]+)/i);
  if (locMatch) {
    jobLocation = locMatch[1].trim();
  }

  // Salary: look for salary-related content
  const salaryMatch = context.match(/class="[^"]*salary[^"]*"[^>]*>([\s\S]*?)<\/(?:div|span)>/i)
    || context.match(/data-testid="[^"]*salary[^"]*"[^>]*>([^<]+)/i);
  if (salaryMatch) {
    salary = salaryMatch[1].replace(/<[^>]*>/g, '').trim();
  }

  // Posted date — Indeed uses various patterns
  // Only match strong signals: explicit "X days ago" patterns, not vague "today"/"just posted"
  const datePatterns = [
    /data-testid="[^"]*date[^"]*"[^>]*>([^<]+)/i,
    /class="[^"]*date[^"]*"[^>]*>([^<]+)/i,
    /class="[^"]*result-footer[^"]*"[\s\S]*?(\d+\+?\s*(?:day|hour|week|month)s?\s*ago)/i,
    />(Posted\s+\d+\+?\s*(?:day|hour|week|month)s?\s*ago)<\//i,
    />(\d+\+?\s*(?:day|hour|week|month)s?\s*ago)<\//i,
  ];
  for (const pat of datePatterns) {
    const dm = context.match(pat);
    if (dm) {
      const raw = (dm[1] || dm[0]).replace(/<[^>]*>/g, '').trim();
      const cleaned = raw.replace(/^(posted\s*)+/i, '').trim();
      // Skip vague dates like "today" or "just posted" — these are unreliable from Indeed
      if (/^(today|just\s*posted|just\s*now)$/i.test(cleaned)) continue;
      if (cleaned) {
        postedDate = cleaned;
        break;
      }
    }
  }

  // Description snippet
  const descMatch = context.match(/class="[^"]*job-snippet[^"]*"[^>]*>([\s\S]*?)<\/(?:div|ul|table)>/i);
  if (descMatch) {
    description = descMatch[1].replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim().substring(0, 300);
  }

  return { company, jobLocation, salary, postedDate, description };
}

// ---- Glassdoor UK Scraper ----

async function scrapeGlassdoor(
  apiKey: string,
  source: { name: string; url: string },
  keywords: string[],
  location: string
): Promise<any[]> {
  const searchCity = location.split(',')[0]?.trim() || 'London';

  // Always use the targeted search URL regardless of what the client sends
  // Glassdoor redirects generic URLs to homepage
  const glassdoorSearchUrl = 'https://www.glassdoor.co.uk/Job/jobs.htm?sc.occupationParam=%22venture+capital%22&sc.locationSeoString=London%2C+England+%28UK%29&locId=2671300&locT=C';

  console.log(`Glassdoor: scraping URL: ${glassdoorSearchUrl}`);

  const response = await fetch('https://api.firecrawl.dev/v1/scrape', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      url: glassdoorSearchUrl,
      formats: ['markdown'],
      onlyMainContent: false,
      waitFor: 10000,
      timeout: 120000,
    }),
  });

  const data = await response.json();
  if (!response.ok) {
    console.error('Glassdoor: Firecrawl scrape failed:', JSON.stringify(data));
    throw new Error(data.error || `Firecrawl HTTP ${response.status}`);
  }

  const markdown = data.data?.markdown || data.markdown || '';
  console.log(`Glassdoor: got ${markdown.length} chars markdown`);
  console.log(`Glassdoor markdown preview: ${markdown.substring(0, 800)}`);

  return parseGlassdoorJobs(markdown, source, searchCity);
}

function parseGlassdoorJobs(
  markdown: string,
  source: { name: string; url: string },
  searchCity: string
): any[] {
  const jobs: any[] = [];

  // Glassdoor markdown typically shows job cards with titles, companies, locations, and dates
  // Pattern: job titles appear as links or bold text, followed by company/location/date info
  
  // Split into lines and look for job-like patterns
  const lines = markdown.split('\n').map(l => l.trim()).filter(l => l.length > 0);

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // Only match links that point to actual job listings (job-listing URL pattern)
    const linkMatch = line.match(/\[([^\]]{5,200})\]\(((?:\/job-listing\/|https:\/\/www\.glassdoor\.co\.uk\/job-listing\/)[^\s)]+)\)/);

    if (!linkMatch) continue;
    let title = linkMatch[1].replace(/\*\*/g, '').trim();
    let jobUrl = linkMatch[2];

    if (title.length < 3) continue;

    // Skip navigation/junk
    if (/sign in|log in|menu|filter|search|cookie|salary estimate|glassdoor|privacy|terms|jobs in|salaries in|employee reviews/i.test(title)) continue;

    if (jobUrl.startsWith('/')) jobUrl = `https://www.glassdoor.co.uk${jobUrl}`;
    if (!jobUrl) jobUrl = source.url;

    // Extract company from Glassdoor URL slug: /job-listing/{title-slug}-{company-slug}-JV_IC...
    let company = 'Unknown';
    const slugMatch = jobUrl.match(/\/job-listing\/(.+)-JV_IC/);
    if (slugMatch) {
      const slug = slugMatch[1];
      // The URL contains _KO{start},{end}_KE{start},{end} — KE range is the company
      const keMatch = jobUrl.match(/_KO(\d+),(\d+)_KE(\d+),(\d+)/);
      if (keMatch) {
        const companyStart = parseInt(keMatch[3]);
        const companyEnd = parseInt(keMatch[4]);
        // Company is in the slug after the title portion
        const parts = slug.split('-');
        // Use the KE range to extract from the full slug
        const fullTitle = slug.replace(/-/g, ' ');
        // Actually extract company name from the URL slug by finding the segment after title
        // Glassdoor format: {title-words}-{company-words}-JV_IC
        // Title length in chars = KO end value, company starts at KE start
        const titleCharLen = parseInt(keMatch[2]);
        const allWords = parts;
        let charCount = 0;
        let companyStartIdx = 0;
        for (let w = 0; w < allWords.length; w++) {
          charCount += allWords[w].length + (w > 0 ? 1 : 0); // +1 for space
          if (charCount >= titleCharLen) {
            companyStartIdx = w + 1;
            break;
          }
        }
        if (companyStartIdx > 0 && companyStartIdx < allWords.length) {
          company = allWords.slice(companyStartIdx).join(' ')
            .replace(/\b\w/g, c => c.toUpperCase()); // Title case
        }
      }
    }

    let jobLocation = searchCity;
    let postedDate: string | undefined;
    let salary: string | undefined;

    // Check next 5 lines for metadata
    for (let j = 1; j <= 5 && i + j < lines.length; j++) {
      const nextLine = lines[i + j];
      if (!nextLine) continue;

      // Stop if we hit another job listing link
      if (/\[.{5,200}\]\(.*\/job-listing\//.test(nextLine)) break;

      // Skip lines containing URLs (these are not location data)
      if (/https?:\/\/|glassdoor\.co\.uk/i.test(nextLine)) continue;

      // Location — must be a short plain-text line, no markdown links
      if (!jobLocation.includes(',') && /london|uk|england|united kingdom|remote|hybrid/i.test(nextLine) && nextLine.length < 60 && !nextLine.includes('](')) {
        jobLocation = nextLine.replace(/[*\[\]]/g, '').replace(/^[-–•·]\s*/, '').trim();
      }

      // Date
      const dateMatch = nextLine.match(/(\d+[hd]\+?|just now|today|\d+\s*(?:hour|day|week|month)s?\s*ago)/i);
      if (dateMatch) {
        postedDate = convertRelativeDate(dateMatch[1]);
      }

      // Salary — prefer £ for UK site
      const salaryMatch = nextLine.match(/£\s?[\d,]+(?:\s?[-–]\s?£?\s?[\d,]+)?(?:\s?(?:k|K|pa|p\.a\.|per annum|per year))?/);
      if (salaryMatch) salary = salaryMatch[0];
    }

    let type = 'full-time';
    const tl = title.toLowerCase();
    if (tl.includes('intern') && !tl.includes('internal')) type = 'internship';
    else if (tl.includes('graduate') || tl.includes('entry level')) type = 'graduate';

    if (!jobs.some(j => j.title === title && j.company === company)) {
      jobs.push({
        id: crypto.randomUUID(),
        title,
        company,
        location: jobLocation,
        type,
        source: source.name,
        sourceUrl: source.url,
        url: jobUrl,
        postedDate,
        salary,
      });
    }
  }

  console.log(`Glassdoor parser found ${jobs.length} jobs`);
  if (jobs.length > 0) {
    console.log(`Glassdoor sample: ${jobs.slice(0, 3).map(j => `${j.title} @ ${j.company}`).join(' | ')}`);
  }
  return jobs;
}

// ---- OCC / 12twenty Authenticated Scraper ----

async function scrapeOcc12Twenty(
  source: { name: string; url: string },
  keywords: string[],
  location: string
): Promise<any[]> {
  const email = Deno.env.get('OCC_EMAIL');
  const password = Deno.env.get('OCC_PASSWORD');
  const firecrawlKey = Deno.env.get('FIRECRAWL_API_KEY');

  if (!email || !password) {
    console.error('OCC credentials not configured (OCC_EMAIL / OCC_PASSWORD)');
    throw new Error('OCC credentials not configured');
  }

  if (!firecrawlKey) {
    console.error('FIRECRAWL_API_KEY not configured for OCC scraping');
    throw new Error('Firecrawl API key not configured');
  }

  const urlObj = new URL(source.url);
  const baseUrl = `${urlObj.protocol}//${urlObj.host}`;
  const searchQuery = keywords[0] || 'venture';

  // Use Firecrawl actions to login in-browser, then navigate to job postings
  const loginUrl = `${baseUrl}/login?ReturnUrl=%2FjobPostings`;
  console.log(`OCC: Using Firecrawl actions to login at ${loginUrl}`);

  // The correct post-login URL with search query (SPA hash route)
  const jobsPageUrl = `${baseUrl}/jobPostings#/jobPostings/index?tab=all&quickSearch=${encodeURIComponent(searchQuery)}`;
  console.log(`OCC: Target job listings URL: ${jobsPageUrl}`);

  const actions: any[] = [
    { type: 'wait', milliseconds: 3000 },
    // Fill login form
    { type: 'click', selector: '#UserName' },
    { type: 'write', text: email },
    { type: 'click', selector: '#Password' },
    { type: 'write', text: password },
    { type: 'click', selector: 'button.submit-login-form' },
    { type: 'wait', milliseconds: 8000 },
    // After login, we may land on a profile update modal or the job postings page.
    // Dismiss any modal (Save & Continue, Skip, etc.) and navigate to the search page.
    { type: 'executeJavascript', script: `
      // Try to dismiss any modal/interstitial
      document.querySelectorAll('button, a, input[type=submit]').forEach(function(el) {
        var t = (el.textContent || el.value || '').toLowerCase().trim();
        if (t === 'save & continue' || t === 'save and continue' || t === 'skip' || t === 'continue' || t === 'close' || t === 'no' || t === 'dismiss') {
          el.click();
        }
      });
    ` },
    { type: 'wait', milliseconds: 3000 },
    // Now navigate to the job postings search page
    { type: 'executeJavascript', script: `window.location.href = '${jobsPageUrl}';` },
    { type: 'wait', milliseconds: 12000 },
    { type: 'scrape' },
  ];

  const firecrawlRes = await fetch('https://api.firecrawl.dev/v1/scrape', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${firecrawlKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      url: loginUrl,
      formats: ['markdown', 'html'],
      waitFor: 3000,
      actions,
      timeout: 120000,
    }),
  });

  const firecrawlData = await firecrawlRes.json();
  if (!firecrawlRes.ok) {
    console.error('OCC: Firecrawl scrape failed:', JSON.stringify(firecrawlData));
    throw new Error(firecrawlData.error || `Firecrawl HTTP ${firecrawlRes.status}`);
  }

  let markdown = firecrawlData.data?.markdown || firecrawlData.markdown || '';
  let html = firecrawlData.data?.html || firecrawlData.html || '';
  console.log(`OCC: Firecrawl returned ${markdown.length} chars markdown, ${html.length} chars HTML`);
  console.log(`OCC markdown preview: ${markdown.substring(0, 3000)}`);

  // Check if we landed on the job listings or still on login/modal
  const hasJobContent = markdown.includes('Job') || markdown.includes('Internship') || markdown.includes('Application') || html.includes('jobPosting');
  const isLoginPage = markdown.includes('You must be logged in') || markdown.includes('Login to continue');
  const isProfileModal = markdown.includes('Help keep us up to date') || markdown.includes('Save & Continue');

  if (isLoginPage) {
    console.error('OCC: Still on login page - credentials may be wrong or reCAPTCHA blocked login');
    throw new Error('OCC login failed - check credentials or reCAPTCHA is blocking');
  }

  if (isProfileModal) {
    console.warn('OCC: Landed on profile update modal - navigation to job postings failed');
    console.log('OCC: Attempting fallback - will try direct navigation without modal dismiss');
  }

  // Parse jobs from the rendered content
  const jobs = parseOcc12TwentyJobs(markdown, html, source, baseUrl);
  console.log(`OCC: Parsed ${jobs.length} jobs from rendered page`);

  if (jobs.length === 0 && hasJobContent) {
    console.log('OCC: Page seems to have job content but parser found nothing. Full markdown:');
    console.log(markdown.substring(0, 5000));
  }

  return jobs;
}
function parseOcc12TwentyJobs(
  markdown: string,
  html: string,
  source: { name: string; url: string },
  baseUrl: string
): any[] {
  const jobs: any[] = [];

  // Pattern 1: Markdown links with job titles
  // 12twenty renders job cards - look for patterns like [Job Title](url) or **Job Title**
  const linkPattern = /\[([^\]]{5,200})\]\((\/jobPostings[^\s)]*|https?:\/\/[^\s)]*jobPosting[^\s)]*)\)/g;
  let match;
  while ((match = linkPattern.exec(markdown)) !== null) {
    const title = match[1].replace(/\*\*/g, '').trim();
    let url = match[2];
    if (url.startsWith('/')) url = `${baseUrl}${url}`;

    if (title.length < 5 || /sign in|log in|menu|filter|search|cookie/i.test(title)) continue;

    // Look for company/location in the lines after the title
    const afterText = markdown.substring(match.index + match[0].length, match.index + match[0].length + 500);
    const afterLines = afterText.split('\n').map(l => l.trim()).filter(l => l.length > 0);

    let company = 'Unknown';
    let jobLocation = 'Cambridge, UK';

    for (const line of afterLines.slice(0, 5)) {
      // Skip UI elements
      if (/apply|save|bookmark|share|view|detail/i.test(line) && line.length < 20) continue;
      if (line.startsWith('[') || line.startsWith('!')) continue;

      if (company === 'Unknown' && line.length > 1 && line.length < 100) {
        company = line.replace(/\*\*/g, '').trim();
        continue;
      }
      if (company !== 'Unknown' && /[A-Z][a-z]+,?\s*[A-Z]/.test(line)) {
        jobLocation = line.replace(/\*\*/g, '').trim();
        break;
      }
    }

    let type = 'full-time';
    const titleLower = title.toLowerCase();
    if (titleLower.includes('intern') && !titleLower.includes('internal')) type = 'internship';
    else if (titleLower.includes('graduate') || titleLower.includes('entry level')) type = 'graduate';

    if (!jobs.some(j => j.title === title && j.company === company)) {
      jobs.push({
        id: crypto.randomUUID(),
        title: title.slice(0, 200),
        company,
        location: jobLocation,
        type,
        source: source.name,
        sourceUrl: source.url,
        url,
        postedDate: 'Scraped just now',
      });
    }
  }

  // Pattern 2: If no markdown links found, try parsing HTML directly
  if (jobs.length === 0 && html) {
    console.log('OCC: No markdown links found, trying HTML parsing');

    // 12twenty job cards typically have structured elements
    const cardPatterns = [
      /<a[^>]*href="([^"]*jobPosting[^"]*)"[^>]*>([^<]+)<\/a>/gi,
      /<[^>]*class="[^"]*job-title[^"]*"[^>]*>([^<]+)/gi,
      /<td[^>]*>([^<]{5,200})<\/td>/gi,
    ];

    for (const pattern of cardPatterns) {
      let htmlMatch;
      while ((htmlMatch = pattern.exec(html)) !== null) {
        const title = (htmlMatch[2] || htmlMatch[1]).trim();
        const url = htmlMatch[1]?.startsWith('/') ? `${baseUrl}${htmlMatch[1]}` :
                    htmlMatch[1]?.startsWith('http') ? htmlMatch[1] : '';

        if (title.length < 5 || title.length > 200) continue;
        if (/sign in|log in|menu|cookie|navigation|header|footer/i.test(title)) continue;

        if (!jobs.some(j => j.title === title)) {
          jobs.push({
            id: crypto.randomUUID(),
            title,
            company: 'Unknown',
            location: 'Cambridge, UK',
            type: 'full-time',
            source: source.name,
            sourceUrl: source.url,
            url: url || source.url,
            postedDate: 'Scraped just now',
          });
        }
      }
      if (jobs.length > 0) break;
    }
  }

  // Pattern 3: Try to find structured text blocks (title + company + location patterns)
  if (jobs.length === 0) {
    console.log('OCC: Trying block-based markdown parsing');
    const lines = markdown.split('\n').map(l => l.trim()).filter(l => l.length > 0);

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      // Look for bold titles or heading-like patterns
      const boldMatch = line.match(/^\*\*(.{5,200})\*\*$/);
      const headingMatch = line.match(/^#{1,4}\s+(.{5,200})$/);
      const title = boldMatch?.[1] || headingMatch?.[1];

      if (!title) continue;
      if (/sign in|log in|menu|filter|search|cookie|navigation/i.test(title)) continue;

      let company = 'Unknown';
      let jobLocation = 'Cambridge, UK';

      // Next lines might have company and location
      if (i + 1 < lines.length && !lines[i + 1].startsWith('*') && !lines[i + 1].startsWith('#')) {
        company = lines[i + 1].replace(/\*\*/g, '').trim();
      }
      if (i + 2 < lines.length) {
        const possibleLoc = lines[i + 2].replace(/\*\*/g, '').trim();
        if (/[A-Z][a-z]+/.test(possibleLoc) && possibleLoc.length < 100) {
          jobLocation = possibleLoc;
        }
      }

      let type = 'full-time';
      const titleLower = title.toLowerCase();
      if (titleLower.includes('intern') && !titleLower.includes('internal')) type = 'internship';
      else if (titleLower.includes('graduate') || titleLower.includes('entry level')) type = 'graduate';

      const hash = Array.from(new TextEncoder().encode(title)).reduce((a, b) => ((a << 5) - a + b) | 0, 0);

      jobs.push({
        id: crypto.randomUUID(),
        title: title.slice(0, 200),
        company,
        location: jobLocation,
        type,
        source: source.name,
        sourceUrl: source.url,
        url: `${source.url}#job-${Math.abs(hash)}`,
        postedDate: 'Scraped just now',
      });
    }
  }

  return jobs;
}


// ---- eFinancialCareers Scraper ----

function normalizeKeyword(keyword: string): string {
  return keyword
    .toLowerCase()
    .replace(/["']/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function matchesUserKeywords(title: string, company: string, description: string | undefined, keywords: string[]): boolean {
  const text = ` ${title} ${company} ${description || ''} `.toLowerCase();

  return keywords.some((rawKw) => {
    const kw = normalizeKeyword(rawKw);
    if (!kw) return false;

    // Exact phrase match first
    if (text.includes(kw)) return true;

    // Handle "vc" safely as a full token
    if (kw === 'vc') {
      return /\bvc\b/i.test(text);
    }

    // Fuzzy token fallback for multi-word keywords (e.g. "venture capital internship")
    const tokens = kw
      .split(/[^a-z0-9]+/)
      .filter((t) => t.length > 1 && !['job', 'jobs', 'role', 'roles', 'london', 'uk', 'united', 'kingdom'].includes(t));

    if (tokens.length === 0) return false;

    const matchedTokens = tokens.filter((token) => {
      if (token === 'vc') return /\bvc\b/i.test(text);
      return text.includes(token);
    }).length;

    // Require strong overlap, but not perfect phrase equality
    return matchedTokens >= Math.min(2, tokens.length);
  });
}

/**
 * Light filter: only hard-exclude clearly non-VC professions.
 * Use this for sources where the search engine already filtered by VC keywords
 * (LinkedIn, Indeed, Glassdoor, eFinancialCareers) — the search already matched
 * "venture capital" in title/description, so we just need to remove obvious noise.
 */
function isNotExcludedRole(title: string): boolean {
  const titleLower = title.toLowerCase();

  // ── Hard profession exclusions (clearly not VC investment roles) ──
  const hardExclude = [
    // Tech / engineering
    /\bsoftware\s+engineer/i, /\bengineer(?:ing)?\b/i, /\bdeveloper\b/i,
    /\bdata\s+scientist\b/i, /\bproduct\s+manager\b/i, /\bproject\s+manager\b/i,
    /\bux\s+(designer|researcher)\b/i, /\bdesigner\b/i, /\bcreative\s+director\b/i,

    // Legal
    /\bsolicitor\b/i, /\blawyer\b/i, /\bbarrister\b/i, /\bparalegal\b/i,
    /\bconveyancing\b/i, /\blegal\s+counsel\b/i,
    /\bcorporate\s+(solicitor|lawyer|counsel|attorney)/i,

    // Finance ops / accounting
    /\baccountant\b/i, /\bauditor\b/i, /\bfund\s+controller\b/i,
    /\bportfolio\s+controller\b/i, /\bfund\s+administ/i, /\bportfolio\s+monitor/i,
    /\bfinance\s+(analyst|director|manager|business\s+partner)\b/i,
    /\bhead\s+of\s+finance\b/i,
    /\btax\s+(manager|analyst|advisor|specialist|consultant|director)\b/i,

    // HR / admin / content
    /\bhr\s+(manager|director|business\s+partner|specialist)\b/i,
    /\bhuman\s+resources\b/i, /\brecruitment\s+(consultant|manager|specialist)\b/i,
    /\bprocurement\b/i, /\bsupply\s+chain\b/i,
    /\bcontent\s+(manager|writer|specialist)\b/i,
    /\bteacher\b/i, /\bnurse\b/i, /\bdoctor\b/i, /\bpharmac/i, /\bclinical\b/i,
    /\bcompliance\s+(administrator|officer|manager|analyst)\b/i,

    // Non-VC finance roles (by title, not company)
    /\bprivate\s+equity\b/i,                  // PE roles (company can still be PE recruiter)
    /\bm&a\b/i, /\bmergers?\s+(and|&)\s+acquisitions?\b/i,
    /\bcorporate\s+development\b/i,
    /\bcorporate\s+(finance|m&a|private\s+equity)\b/i,
    /\binvestment\s+banking\b/i, /\binvestment\s+bank\b/i,
    /\binvestment\s+consultant\b/i,
    /\binvestment\s+fund\w*\s+(senior\s+)?associate\b/i,  // law firm fund roles
    /\bstrategy\s+consult/i, /\bmanagement\s+consult/i,
    /\bquantitative\s+(researcher|trader|analyst)\b/i,
    /\bcommodities\b/i,
    /\bstructurer\b/i,
    /\breal\s+estate\b/i,
    /\bcredit\s+invest/i,
    /\bsearch\s+fund\b/i,
    /\bcapital\s+markets?\b/i,

    // Sales / marketing / ops
    /\bb2b\b/i, /\bsales\s+(dev|representative|exec)/i,
    /\bbdr\b/i, /\bsdr\b/i,
    /\bmarketing\s+(executive|manager|specialist|coordinator|lead)\b/i,
    /\bcustomer\s+success/i, /\baccount\s+(executive|manager)\b/i,
    /\bbusiness\s+development\b/i,
    /\bprogram\s+director\b/i,

    // IR
    /\bir\s+analyst\b/i, /\binvestor\s+relation/i,
  ];
  if (hardExclude.some(p => p.test(titleLower))) return false;

  // Exclude portfolio company roles
  if (/vc[\s-]*backed/i.test(titleLower)) return false;
  if (/venture[\s-]*backed/i.test(titleLower)) return false;
  if (/\bat\s+(a\s+)?vc\b/i.test(titleLower)) return false;

  return true;
}

function isLikelyVcRole(title: string, company: string, description: string | undefined): boolean {
  const titleLower = title.toLowerCase();
  const companyLower = company.toLowerCase();
  const descLower = (description || '').toLowerCase();

  // ── Hard exclusions (title-only, always block) ──
  const hardExclude = [
    /vc[\s-]*backed/i,
    /venture[\s-]*backed/i,
    /\bat\s+(a\s+)?vc\b/i,
    /\b(for|within)\s+(a\s+)?vc\b/i,
    /\bsoftware\s+engineer/i,
    /\bengineer(?:ing)?\b/i,
    /\bdeveloper\b/i,
    /\bstrategic\s+advisory/i,
    /\bcapital\s+markets?\b/i,
    /\bevent\s+(operations|manager|lead|coordinator|director)/i,
    /\bbusiness\s+development\b/i,
    /\breal\s+estate\b/i,
    /\bm&a\b/i,
    /\bsearch\s+fund\b/i,                // search funds ≠ VC
    /\bcorporate\s+development\b/i,       // corp dev roles
    /\bfund\s+administ/i,                 // fund administrator/administration
    /\bcredit\s+invest/i,                 // credit/debt fund roles
    /\bportfolio\s+monitor/i,             // PE ops/fund services
    /\bportfolio\s+manager\b/i,           // asset mgmt, not VC (VC uses "portfolio lead/director")
    /\bbook\s+portfolio/i,                // quant trading
    /\bir\s+analyst\b/i,                   // investor relations analyst
    /\bfund\s+controller\b/i,               // fund ops/accounting
    /\bportfolio\s+controller\b/i,          // fund admin
    /\blegal\s+counsel\b/i,                 // legal roles
    /\bfinance\s+and\s+portfolio\b/i,       // fund services
    /\bfinance\s+analyst\b/i,               // accounting/recruitment, not VC investment
    /\bfinance\s+director\b/i,              // CFO-type roles
    /\bfinance\s+manager\b/i,               // finance ops
    /\bhead\s+of\s+finance\b/i,             // finance leadership
    /\binvestment\s+consultant\b/i,          // consulting, not VC investment
    /\bsolicitor\b/i,                       // legal profession
    /\blawyer\b/i,                          // legal profession
    /\bbarrister\b/i,                       // legal profession
    /\bparalegal\b/i,                       // legal profession
    /\bconveyancing\b/i,                    // legal/property
    /\bcorporate\s+(solicitor|lawyer|counsel|attorney)/i,  // corporate legal
    /\baccountant\b/i,                      // accounting
    /\bauditor\b/i,                         // audit
    /\btax\s+(manager|analyst|advisor|specialist|consultant|director)\b/i,
    /\bhr\s+(manager|director|business\s+partner|specialist)\b/i,
    /\bhuman\s+resources\b/i,
    /\brecruitment\s+(consultant|manager|specialist)\b/i,
    /\bprocurement\b/i,
    /\bsupply\s+chain\b/i,
    /\bdata\s+scientist\b/i,
    /\bproduct\s+manager\b/i,
    /\bproject\s+manager\b/i,
    /\bux\s+(designer|researcher)\b/i,
    /\bdesigner\b/i,
    /\bcreative\s+director\b/i,
    /\bcontent\s+(manager|writer|specialist)\b/i,
    /\bteacher\b/i,
    /\bnurse\b/i,
    /\bdoctor\b/i,
    /\bpharmac/i,
    /\bclinical\b/i,
  ];
  if (hardExclude.some(p => p.test(titleLower))) return false;

  // ── Soft exclusions: private equity in title blocks even ultra-strong signals ──
  // (PE co-investment roles should not pass via co-invest signal)
  if (/\bprivate\s+equity\b/i.test(titleLower)) return false;

  // ── Tier 1a: Ultra-strong VC signals → pass always ──
  const ultraStrongVcPatterns = [
    /deal\s+(flow|sourcing|origination)/,
    /carried\s+interest/,
    /co-?invest/,
  ];
  if (ultraStrongVcPatterns.some(p => p.test(titleLower))) return true;

  // "limited partner" / "general partner" as role context (not product names at fintech co's)
  const fundServicesCompanies = [
    /\bss&c\b/i, /\bcarta\b/i, /\bcitco\b/i, /\bjuniper\s+square/i,
    /\bprivate\s+equity\s+insights/i, /\bpreqin\b/i, /\bpitchbook\b/i,
    /\bstate\s+street\b/i, /\bnt\s+global/i, /\bnorthern\s+trust/i,
    /\bbritish\s+business\s+bank/i,       // government development bank
    /\bprivate\s+equity\s+recruitment/i,   // PE recruitment agency
    /\bfinancial\s+services\s+limited/i,   // fund services companies
  ];
  const isFundServices = fundServicesCompanies.some(p => p.test(companyLower));

  // "limited partner" / "general partner" as role context (not product names)
  // Only pass if not at a fund services/fintech company
  if (/limited\s+partner|general\s+partner|\blp\b|\bgp\b/.test(titleLower) && !isFundServices) return true;

  // ── Tier 1b: Strong VC signals in TITLE → pass unless fund services ──
  const titleVcPatterns = [
    /venture\s+capital/,
    /\bvc\s+(fund|firm|analyst|associate|partner|principal|director|investment)/,
    /fund\s+(management|of\s+funds|raising|operations|accounting|controller)/,
    /investment\s+(analyst|associate|manager|director|principal|partner)/,
  ];
  if (titleVcPatterns.some(p => p.test(titleLower))) {
    if (isFundServices) return false;
    return true;
  }

  // ── Soft exclusions (title-only): block generic non-VC roles ──
  const nonVcRoles = [
    /\bb2b\b/i, /\bsales\s+(dev|representative|exec)/i,
    /\bbdr\b/i, /\bsdr\b/i,
    /\bmarketing\s+(executive|manager|specialist|coordinator|lead)\b/i,
    /\bcustomer\s+success/i, /\baccount\s+(executive|manager)\b/i,
    /\bquantitative\s+equity\s+researcher/i,
    /\bequity\s+research(?!.*private\s+equity)/i,
    /\bgrowth\s+specialist/i, /\bgrowth\s+marketing/i,
    /\bgrowth\s+hacker/i,
    /\bfounding\s+(business|sales|marketing|product|engineer)/i,
    // private equity already caught by hard exclude above
    /\binvestment\s+banking\b/i,        // IB in title only
    /\binvestment\s+bank\b/i,
    /\bmanagement\s+consult/i,          // consulting in title only
  ];
  if (nonVcRoles.some(p => p.test(titleLower))) return false;

  // ── Tier 2: company looks like a VC fund + title is a fund-type role ──
  if (!isFundServices) {
    const companyVcPatterns = [
      /venture(s|\s+capital|\s+partners?)\b/,
      /\bcapital\b/,
      /\bpartners?\b/,
      /\bvc\b/,
    ];
    const companyIsVc = companyVcPatterns.some(p => p.test(companyLower));
    if (companyIsVc) {
      // Any plausible fund role (broad — includes ops, chief of staff, etc.)
      const fundRoleTitles = /\b(analyst|associate|partner|principal|director|vp|vice\s+president|head|manager|controller|admin|investor\s+relations|investment|fund|portfolio|ir\b|fundrais|chief\s+of\s+staff|operations|finance|legal|compliance|coo|cfo)\b/i;
      if (fundRoleTitles.test(titleLower)) return true;
    }
  }

  // ── Tier 3: description-only signals (weakest — need 2+ signals) ──
  if (descLower) {
    const descSignals = [
      /venture\s+capital/, /\bvc\s+fund/, /deal\s+flow/, /carried\s+interest/,
      /portfolio\s+companies/, /fund\s+raising/, /limited\s+partners?/,
      /general\s+partners?/, /co-?investment/,
    ];
    const matchCount = descSignals.filter(p => p.test(descLower)).length;
    if (matchCount >= 2) return true;
  }

  return false;
}

function pickPrimaryEfcKeyword(keywords: string[]): string {
  const cleaned = keywords.map(normalizeKeyword).filter(Boolean);
  const preferred = cleaned.find((kw) => kw.includes('venture capital'));
  return preferred || cleaned[0] || 'venture capital';
}

function buildEfcSearchUrl(sourceUrl: string, keywords: string[], location: string): string {
  const city = (location.split(',')[0] || 'London').trim();
  const keyword = pickPrimaryEfcKeyword(keywords);

  const phraseForPath = encodeURIComponent(`"${keyword.replace(/\s+/g, '-')}"`);
  const citySlug = encodeURIComponent(city.toLowerCase());
  const q = encodeURIComponent(`"${keyword}"`);
  const locationParam = encodeURIComponent(`${city}, UK`);

  // Build a deterministic keyword/location URL from user search settings
  const dynamicUrl = `https://www.efinancialcareers.co.uk/jobs/${phraseForPath}/in-${citySlug}%2C-uk?q=${q}&location=${locationParam}&radius=40&radiusUnit=km&pageSize=50&currencyCode=GBP&language=en&includeUnspecifiedSalary=true&enableVectorSearch=false`;

  // If source already has keyword query, still force vector search off + larger page size
  if (sourceUrl.includes('/jobs/') && sourceUrl.includes('q=')) {
    try {
      const existing = new URL(sourceUrl);
      existing.searchParams.set('location', `${city}, UK`);
      existing.searchParams.set('q', `"${keyword}"`);
      existing.searchParams.set('pageSize', '50');
      existing.searchParams.set('enableVectorSearch', 'false');
      return existing.toString();
    } catch {
      return dynamicUrl;
    }
  }

  return dynamicUrl;
}

function parseEfcTotalJobs(markdown: string): number | null {
  const patterns = [
    /"[^"]+"\s+jobs\s+in\s+[^\n(]+\((\d+)\)/i,
    /jobs\s+in\s+[^\n(]+\((\d+)\)/i,
  ];

  for (const pattern of patterns) {
    const match = markdown.match(pattern);
    if (match) {
      const value = parseInt(match[1], 10);
      if (!Number.isNaN(value) && value > 0) return value;
    }
  }

  return null;
}

async function fetchEfcPageJobs(
  apiKey: string,
  pageUrl: string,
  source: { name: string; url: string }
): Promise<{ jobs: any[]; markdown: string }> {
  const response = await fetch('https://api.firecrawl.dev/v1/scrape', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      url: pageUrl,
      formats: ['markdown'],
      onlyMainContent: true,
      waitFor: 5000,
    }),
  });

  const data = await response.json();
  if (!response.ok) {
    throw new Error(data.error || `HTTP ${response.status}`);
  }

  const markdown = data.data?.markdown || data.markdown || '';
  const jobs = parseEFinancialCareersJobs(markdown, source);
  return { jobs, markdown };
}

async function scrapeEFinancialCareers(
  apiKey: string,
  source: { name: string; url: string },
  location: string,
  keywords: string[]
): Promise<any[]> {
  const PAGE_SIZE = 50;
  const MAX_PAGES = 20;
  const allJobs: any[] = [];
  const baseUrl = buildEfcSearchUrl(source.url, keywords, location);

  const firstPageUrl = new URL(baseUrl).toString();
  console.log(`eFinancialCareers page 1: ${firstPageUrl}`);

  const firstPage = await fetchEfcPageJobs(apiKey, firstPageUrl, source);
  allJobs.push(...firstPage.jobs);
  console.log(`eFinancialCareers page 1: ${firstPage.jobs.length} new jobs (${firstPage.jobs.length} on page)`);

  const totalJobs = parseEfcTotalJobs(firstPage.markdown);
  const fallbackPageCount = firstPage.jobs.length >= 40 ? 4 : 2;
  const targetPages = Math.max(
    1,
    Math.min(MAX_PAGES, totalJobs ? Math.ceil(totalJobs / PAGE_SIZE) : fallbackPageCount)
  );

  if (targetPages > 1) {
    const pagePromises: Promise<{ page: number; jobs: any[]; error?: string }>[] = [];

    for (let page = 2; page <= targetPages; page++) {
      const pageUrlObj = new URL(baseUrl);
      pageUrlObj.searchParams.set('page', String(page));
      const pageUrl = pageUrlObj.toString();
      console.log(`eFinancialCareers page ${page}: ${pageUrl}`);

      pagePromises.push(
        fetchEfcPageJobs(apiKey, pageUrl, source)
          .then((result) => ({ page, jobs: result.jobs }))
          .catch((err) => ({
            page,
            jobs: [],
            error: err instanceof Error ? err.message : String(err),
          }))
      );
    }

    const pageResults = await Promise.all(pagePromises);

    for (const result of pageResults) {
      if (result.error) {
        console.log(`eFinancialCareers page ${result.page} failed: ${result.error}`);
        continue;
      }

      const newJobs = result.jobs.filter((j) => !allJobs.some((existing) => existing.url === j.url));
      allJobs.push(...newJobs);
      console.log(`eFinancialCareers page ${result.page}: ${newJobs.length} new jobs (${result.jobs.length} on page)`);
    }
  }

  const vcJobs = allJobs.filter((j) => isLikelyVcRole(j.title, j.company, j.description));
  console.log(`eFinancialCareers: ${vcJobs.length} VC-likely jobs out of ${allJobs.length} total`);
  return vcJobs;
}

function parseEFinancialCareersJobs(
  markdown: string,
  source: { name: string; url: string }
): any[] {
  const jobs: any[] = [];

  // Pattern: [**Job Title**](url "Job Title")
  const jobPattern = /\[\*\*(.+?)\*\*\]\((https:\/\/www\.efinancialcareers\.co\.uk\/jobs-[^\s"]+)\s*(?:"[^"]*")?\)/g;
  let match;

  while ((match = jobPattern.exec(markdown)) !== null) {
    const title = match[1].trim();
    const url = match[2].trim();

    if (title.toLowerCase() === 'apply now') continue;

    const afterMatch = markdown.substring(match.index + match[0].length, match.index + match[0].length + 500);
    const lines = afterMatch.split('\n').map(l => l.trim()).filter(l => l.length > 0);

    let lineIdx = 0;
    while (lineIdx < lines.length && (lines[lineIdx].startsWith('[Apply') || lines[lineIdx] === 'Save' || lines[lineIdx].includes('Apply now'))) {
      lineIdx++;
    }

    let company = 'Unknown';
    if (lineIdx < lines.length && !lines[lineIdx].startsWith('![') && !lines[lineIdx].startsWith('[')) {
      company = lines[lineIdx].trim();
      lineIdx++;
    }

    let jobLocation = 'London, UK';
    let contractType = 'Permanent';
    if (lineIdx < lines.length) {
      const locLine = lines[lineIdx];
      const typeMatch = locLine.match(/(Permanent|Contract|Temporary|Freelance|Part Time|Internship)\s*$/i);
      if (typeMatch) {
        contractType = typeMatch[1];
        jobLocation = locLine.substring(0, typeMatch.index).trim();
      } else {
        jobLocation = locLine;
      }
      lineIdx++;
    }

    let salary: string | undefined;
    if (lineIdx < lines.length) {
      const salaryLine = lines[lineIdx];
      if (salaryLine !== 'Competitive' && /[£$€\d]/.test(salaryLine)) {
        salary = salaryLine.replace(/^Hybrid/, '').trim();
      }
      lineIdx++;
    }

    let postedDate = 'Scraped just now';
    if (lineIdx < lines.length) {
      const dateLine = lines[lineIdx];
      if (/\d+\s*(hour|day|week|month|year)s?\s*ago/i.test(dateLine)) {
        postedDate = dateLine;
      }
    }

    let type = 'full-time';
    const titleLower = title.toLowerCase();
    if (titleLower.includes('intern') && !titleLower.includes('internal')) type = 'internship';
    else if (titleLower.includes('graduate') || titleLower.includes('entry level')) type = 'graduate';

    if (jobs.some(j => j.url === url)) continue;

    jobs.push({
      id: crypto.randomUUID(),
      title: title.slice(0, 200),
      company,
      location: jobLocation,
      type,
      source: source.name,
      sourceUrl: source.url,
      url,
      salary,
      postedDate,
    });
  }

  return jobs;
}

async function scrapeRssFeed(
  source: { name: string; url: string },
  keywords: string[],
  location: string
): Promise<any[]> {
  const allItems: Array<{ title: string; link: string; description: string; pubDate: string }> = [];
  const MAX_PAGES = 50; // Cap at 50 pages (500 items) to avoid timeouts
  const baseUrl = source.url;

  // WordPress RSS feeds default to 10 items — paginate with &paged=N
  for (let page = 1; page <= MAX_PAGES; page++) {
    const separator = baseUrl.includes('?') ? '&' : '?';
    const pageUrl = page === 1 ? baseUrl : `${baseUrl}${separator}paged=${page}`;

    try {
      const response = await fetch(pageUrl);
      if (!response.ok) {
        if (page === 1) throw new Error(`RSS fetch failed: HTTP ${response.status}`);
        break; // No more pages
      }

      const xml = await response.text();
      const items = parseRssItems(xml);

      if (items.length === 0) break; // Empty page = done

      allItems.push(...items);
      console.log(`RSS page ${page}: ${items.length} items from ${source.name}`);

      // If fewer than 10 items, likely the last page
      if (items.length < 10) break;
    } catch (err) {
      if (page === 1) throw err;
      console.log(`RSS pagination stopped at page ${page}: ${err}`);
      break;
    }
  }

  console.log(`RSS total: ${allItems.length} items from ${source.name}`);

  const jobs: any[] = [];

  // For VC-specific job boards, all listings are relevant
  const isVcSource = /startup\s*&?\s*vc|venture5|venturecapitalcareers|john\s*gannon/i.test(source.name);

  for (const item of allItems) {
    const fullText = `${item.title} ${item.description}`.toLowerCase();

    // Check keyword match (skip for VC-specific sources)
    if (!isVcSource) {
      const matchesKeyword = keywords.length === 0 || keywords.some(kw =>
        fullText.includes(kw.toLowerCase())
      );
      if (!matchesKeyword) continue;
    }

    // Parse title format: "VC Internship @ Breega in London, England"
    let company = 'Unknown';
    let jobLocation = 'London, UK';
    let title = item.title;

    const locMatch = title.match(/\s+in\s+(.+?)$/i);
    if (locMatch) {
      jobLocation = locMatch[1].trim();
      title = title.substring(0, locMatch.index).trim();
    }

    const companyMatch = title.match(/\s+[@]\s+(.+)$/i) || title.match(/\s+[-–—]\s+(.+)$/i);
    if (companyMatch) {
      company = companyMatch[1].trim();
      title = title.substring(0, companyMatch.index).trim();
    }

    if (title.length < 3) title = item.title.split(/\s+[@-]\s+/)[0].trim();

    let type = 'full-time';
    if (fullText.includes('intern') && !fullText.includes('internal')) type = 'internship';
    else if (fullText.includes('graduate') || fullText.includes('grad scheme') || fullText.includes('entry level') || fullText.includes('entry-level')) type = 'graduate';

    let salary: string | undefined;
    const salaryMatch = item.description.match(/[£$€]\s?[\d,]+(?:\s?[-–]\s?[£$€]?\s?[\d,]+)?(?:\s?(?:k|K|pa|p\.a\.|per annum|per year))?/);
    if (salaryMatch) salary = salaryMatch[0];

    const cleanDesc = item.description
      .replace(/<[^>]+>/g, '')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 500);

    jobs.push({
      id: crypto.randomUUID(),
      title: title.slice(0, 200),
      company,
      location: jobLocation,
      type,
      source: source.name,
      sourceUrl: source.url,
      url: item.link || source.url,
      description: undefined,
      salary,
      postedDate: item.pubDate || 'Scraped just now',
    });
  }

  return jobs;
}

function parseRssItems(xml: string): Array<{ title: string; link: string; description: string; pubDate: string }> {
  const items: Array<{ title: string; link: string; description: string; pubDate: string }> = [];

  // Split by <item> tags
  const itemBlocks = xml.split(/<item>/i).slice(1);

  for (const block of itemBlocks) {
    const endIdx = block.indexOf('</item>');
    const itemXml = endIdx >= 0 ? block.substring(0, endIdx) : block;

    const title = extractTag(itemXml, 'title');
    const link = extractTag(itemXml, 'link') || extractTag(itemXml, 'guid');
    const description = extractTag(itemXml, 'description') || extractTag(itemXml, 'content:encoded');
    const pubDate = extractTag(itemXml, 'pubDate');

    if (title) {
      items.push({ title, link, description, pubDate });
    }
  }

  return items;
}

function extractTag(xml: string, tag: string): string {
  // Handle CDATA sections
  const cdataPattern = new RegExp(`<${tag}[^>]*>\\s*<!\\[CDATA\\[([\\s\\S]*?)\\]\\]>\\s*</${tag}>`, 'i');
  const cdataMatch = xml.match(cdataPattern);
  if (cdataMatch) return cdataMatch[1].trim();

  // Handle regular tags
  const pattern = new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`, 'i');
  const match = xml.match(pattern);
  if (match) return match[1].trim();

  // Handle self-closing or empty link tags (some RSS feeds put link as text after tag)
  if (tag === 'link') {
    const linkPattern = /<link[^>]*\/?\s*>\s*\n?\s*(https?:\/\/[^\s<]+)/i;
    const linkMatch = xml.match(linkPattern);
    if (linkMatch) return linkMatch[1].trim();
  }

  return '';
}

// ---- Firecrawl Markdown Parsing (existing) ----

function parseJobsFromMarkdown(
  markdown: string,
  links: string[],
  source: { name: string; url: string },
  keywords: string[],
  location: string
): any[] {
  // Google Jobs has a specific format
  if (isGoogleJobsUrl(source.url)) {
    return parseGoogleJobs(markdown, source, location);
  }

  // Try structured card parsing first (e.g. Startup & VC format)
  const cardJobs = parseStructuredCards(markdown, source, keywords, location);
  if (cardJobs.length > 0) return cardJobs;

  // Fall back to generic header-based parsing
  const jobs: any[] = [];
  const lines = markdown.split('\n');

  let currentTitle = '';
  let currentContent = '';
  let sectionStart = -1;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    const headerMatch = line.match(/^#{1,4}\s+(.+)/) || line.match(/^\*\*(.+?)\*\*/);

    if (headerMatch || i === lines.length - 1) {
      if (currentTitle && sectionStart >= 0) {
        const fullText = `${currentTitle} ${currentContent}`.toLowerCase();
        const matchesKeyword = keywords.length === 0 || keywords.some(kw =>
          fullText.includes(kw.toLowerCase())
        );

        if (matchesKeyword) {
          const job = extractJobDetails(currentTitle, currentContent, source, links);
          if (job) {
            jobs.push(job);
          }
        }
      }

      if (headerMatch) {
        currentTitle = headerMatch[1].replace(/\*\*/g, '').trim();
        currentContent = '';
        sectionStart = i;
      }
    } else if (sectionStart >= 0) {
      currentContent += ' ' + line;
    }
  }

  const listPattern = /^[-*]\s+\[?(.+?)\]?\(?.*?\)?\s*[-–—]?\s*(.*)/;
  for (const line of lines) {
    const match = line.trim().match(listPattern);
    if (match) {
      const title = match[1].replace(/[\[\]]/g, '').trim();
      const rest = match[2];
      const fullText = `${title} ${rest}`.toLowerCase();

      const matchesKeyword = keywords.length === 0 || keywords.some(kw =>
        fullText.includes(kw.toLowerCase())
      );

      if (matchesKeyword && title.length > 5 && title.length < 200) {
        if (!jobs.some(j => j.title === title)) {
          const job = extractJobDetails(title, rest, source, links);
          if (job) {
            jobs.push(job);
          }
        }
      }
    }
  }

  return jobs;
}

/**
 * Parse structured card-style listings (e.g. Startup & VC).
 * Pattern: [![](img) content fields separated by \\ or newlines ](url)
 */
function parseStructuredCards(
  markdown: string,
  source: { name: string; url: string },
  keywords: string[],
  searchLocation: string = ''
): any[] {
  const jobs: any[] = [];

  // Match card blocks: [![...](...)...](job-url)
  // Use dotAll via [\s\S] to span multiple lines
  const cardPattern = /\[!\[[^\]]*\]\([^)]*\)([\s\S]*?)\]\((https?:\/\/[^\s)]+)\)/g;

  let match;
  while ((match = cardPattern.exec(markdown)) !== null) {
    const content = match[1];
    const url = match[2];

    // Split the content by backslashes and newlines to get fields
    const fields = content
      .split(/\\+|\n/)
      .map(s => s.replace(/\*\*/g, '').replace(/^\s*[-•]\s*/, '').trim())
      .filter(s => s.length > 0 && s !== ',' && !s.startsWith('![') && !s.startsWith('['));

    // We expect at least: Title, Company
    if (fields.length < 2) continue;

    const title = fields[0];
    const company = fields[1];

    // Startup & VC cards always include location as the 3rd field; use that directly.
    // For other sources, keep heuristic detection.
    const isStartupVcSource = /startup\s*&?\s*vc/i.test(source.name) || source.url.includes('startupandvc.com');
    const rawLocation = isStartupVcSource
      ? (fields[2] || '')
      : (fields.find(f => {
          const fl = f.toLowerCase();
          return /^(london|new york|san francisco|boston|berlin|paris|amsterdam|singapore|hong kong|dubai|remote|cambridge|oxford|los angeles|chicago|mumbai|toronto|sydney|tokyo)/i.test(fl)
            || /,\s*[A-Z]{2}\b/.test(f);
        }) || '');

    const jobLocation = rawLocation.replace(/,$/, '').trim();

    // Filter by user's search location if provided
    if (searchLocation) {
      const searchCity = searchLocation.split(',')[0].trim().toLowerCase();
      if (searchCity) {
        if (!jobLocation) continue;
        if (!jobLocation.toLowerCase().includes(searchCity)) continue;
      }
    }

    // Find type field
    const typeField = fields.find(f => /full.time|part.time|internship|other|graduate/i.test(f)) || '';

    // Find date field: "Posted X days ago" or contains a year/month
    let dateStr = '';
    const postedField = fields.find(f => /posted\s+\d+\s*(hour|day|week|month)s?\s*ago/i.test(f));
    if (postedField) {
      const m = postedField.match(/(\d+\s*(?:hour|day|week|month)s?\s*ago)/i);
      if (m) dateStr = m[1];
    }
    if (!dateStr) {
      dateStr = fields.find(f =>
        /\b(20\d{2})\b/.test(f) ||
        /\b(january|february|march|april|may|june|july|august|september|october|november|december)\b/i.test(f)
      ) || '';
    }

    const fullText = `${title} ${company} ${typeField}`.toLowerCase();

    // For VC-specific job boards, all listings are relevant — skip keyword filtering
    const isVcSource = /startup\s*&?\s*vc|venture5|venturecapitalcareers|john\s*gannon/i.test(source.name);
    if (!isVcSource) {
      const matchesKeyword = keywords.length === 0 || keywords.some(kw =>
        fullText.includes(kw.toLowerCase())
      );
      if (!matchesKeyword) continue;
    }

    // Skip non-job entries (page headers, newsletter, etc.)
    const skipWords = ['newsletter', 'subscribe', 'terms', 'sign in', 'cookie', 'trusted resource', 'playbook'];
    if (skipWords.some(w => title.toLowerCase().includes(w))) continue;

    let type = 'full-time';
    const typeLower = typeField.toLowerCase();
    if (typeLower.includes('intern')) type = 'internship';
    else if (typeLower.includes('graduate') || typeLower.includes('grad')) type = 'graduate';
    else if (typeLower.includes('other')) type = 'full-time';

    jobs.push({
      id: crypto.randomUUID(),
      title,
      company,
      location: jobLocation,
      type,
      source: source.name,
      sourceUrl: source.url,
      url,
      postedDate: dateStr || 'Scraped just now',
    });
  }

  return jobs;
}

function extractJobDetails(
  title: string,
  content: string,
  source: { name: string; url: string },
  links: string[]
): any | null {
  if (title.length < 4 || title.length > 200) return null;
  const skipWords = ['menu', 'navigation', 'footer', 'header', 'cookie', 'privacy', 'terms', 'sign in', 'log in', 'subscribe', 'newsletter', 'don\'t miss'];
  if (skipWords.some(w => title.toLowerCase().includes(w))) return null;

  const fullText = `${title} ${content}`.toLowerCase();

  let company = 'Unknown';
  const companyPatterns = [
    /(?:at|@)\s+([A-Z][A-Za-z0-9\s&.'-]+?)(?:\s+in\s+|\s*[,.]|\s*$)/,
    /company[:\s]+([A-Za-z0-9\s&.'-]+)/i,
    /([A-Z][A-Za-z0-9&.']+(?:\s[A-Z][A-Za-z0-9&.']+)*)\s+(?:is hiring|is looking|seeks|are looking)/,
    /[-–—]\s+([A-Z][A-Za-z0-9\s&.'-]+?)(?:\s+in\s+|\s*$)/,
  ];
  for (const pattern of companyPatterns) {
    const match = title.match(pattern) || content.match(pattern);
    if (match) {
      company = match[1].trim();
      break;
    }
  }

  let type: string = 'full-time';
  if (fullText.includes('intern') && !fullText.includes('internal')) type = 'internship';
  else if (fullText.includes('graduate') || fullText.includes('grad scheme') || fullText.includes('entry level')) type = 'graduate';

  let salary: string | undefined;
  const salaryMatch = content.match(/[£$€]\s?[\d,]+(?:\s?[-–]\s?[£$€]?\s?[\d,]+)?(?:\s?(?:k|K|pa|p\.a\.|per annum|per year))?/);
  if (salaryMatch) salary = salaryMatch[0];

  let url = source.url;
  const titleWords = title.toLowerCase().split(/\s+/).filter(w => w.length > 3);
  for (const link of links) {
    const linkLower = link.toLowerCase();
    if (titleWords.some(w => linkLower.includes(w)) && (linkLower.includes('job') || linkLower.includes('career') || linkLower.includes('position') || linkLower.includes('apply'))) {
      url = link;
      break;
    }
  }

  // If URL is still the source URL, make it unique by appending a hash of the title
  if (url === source.url) {
    const hash = Array.from(new TextEncoder().encode(title)).reduce((a, b) => ((a << 5) - a + b) | 0, 0);
    url = `${source.url}#job-${Math.abs(hash)}`;
  }

  return {
    id: crypto.randomUUID(),
    title: title.slice(0, 200),
    company,
    location: 'London, UK',
    type,
    source: source.name,
    sourceUrl: source.url,
    url,
    description: content.trim().slice(0, 500) || undefined,
    salary,
    postedDate: 'Scraped just now',
  };
}

// ---- Google Jobs Parser ----

function parseGoogleJobs(markdown: string, source: { name: string; url: string }, searchLocation: string = ''): any[] {
  const jobs: any[] = [];
  const searchCity = searchLocation.split(',')[0]?.trim().toLowerCase();

  // Google Jobs markdown contains blocks like:
  // [Title\\ \\ Company\\ \\ Location • via Source](url)
  const linkPattern = /\[([^\]]*\\\\[^\]]*)\]\((https?:\/\/[^\s)]+)\)/g;

  let match;
  while ((match = linkPattern.exec(markdown)) !== null) {
    const content = match[1];
    const url = match[2];

    const parts = content
      .split(/\\+\s*\\*/)
      .map(s => s.replace(/\\\\/g, '').trim())
      .filter(s => s.length > 0);

    if (parts.length < 2) continue;

    const title = parts[0].trim();

    // Google Jobs format: Title \\ Location \\ • via Company
    // Extract company from "• via X" suffix in the last part
    let company = 'Unknown';
    let jobLocation = 'London, UK';

    // Find "via Company" in any part
    const viaPattern = /•?\s*via\s+(.+)$/i;
    for (const part of parts.slice(1)) {
      const viaMatch = part.trim().match(viaPattern);
      if (viaMatch) {
        company = viaMatch[1].trim();
        // The text before "via" in this part might be location info
        const beforeVia = part.replace(viaPattern, '').trim();
        if (beforeVia) jobLocation = beforeVia;
      }
    }

    // parts[1] is typically the location (e.g. "London, UK")
    if (parts.length >= 2) {
      const p1 = parts[1].trim().replace(viaPattern, '').trim();
      if (p1 && !viaPattern.test(parts[1])) {
        jobLocation = p1;
      } else if (p1) {
        jobLocation = p1 || jobLocation;
      }
    }

    if (!jobLocation || jobLocation === '') jobLocation = 'London, UK';

    const skipWords = ['filter', 'menu', 'sign in', 'cookie', 'follow', 'saved jobs', 'ai mode', 'forums', 'images', 'news', 'county', 'from your ip'];
    if (skipWords.some(w => title.toLowerCase().includes(w))) continue;
    if (skipWords.some(w => company.toLowerCase().includes(w))) continue;
    if (title.length < 5 || title.length > 300) continue;

    // Skip entries where title looks like a bare geographic label, not a job title
    // e.g. "Adams County, Nebraska" or "Logan County, Colorado"
    // Real job titles contain role words like analyst, manager, associate, director, etc.
    const roleWords = /\b(analyst|associate|manager|director|officer|lead|head|engineer|developer|assistant|coordinator|specialist|consultant|partner|principal|intern|advisor|administrator|accountant|controller|recruiter|designer|scientist|researcher|strategist|president|vice\s+president|vp)\b/i;
    if (!roleWords.test(title)) continue;

    // Enforce location filter from user search (e.g. London)
    if (searchCity) {
      const locationText = `${jobLocation} ${title} ${company}`.toLowerCase();
      if (!locationText.includes(searchCity)) continue;
    }

    let type = 'full-time';
    const fullText = `${title} ${company}`.toLowerCase();
    if (fullText.includes('intern') && !fullText.includes('internal') && !fullText.includes('international')) type = 'internship';
    else if (fullText.includes('graduate') || fullText.includes('entry level')) type = 'graduate';

    let salary: string | undefined;
    const salaryMatch = content.match(/[£$€]\s?[\d,]+(?:\s?[-–]\s?[£$€]?\s?[\d,]+)?(?:\s?(?:k|K|pa|p\.a\.|per annum|per year|a year))?/);
    if (salaryMatch) salary = salaryMatch[0];

    let postedDate = 'Scraped just now';
    const timeMatch = content.match(/(\d+\s*(?:hour|day|week|month)s?\s*ago)/i);
    if (timeMatch) {
      postedDate = timeMatch[1];
    } else {
      // Date appears after the link but before the next job link.
      // Google injects large Share/social blocks (base64 images, URLs) between
      // the job link and the date text, so we need a large window — but stop at
      // the next job link to avoid grabbing a neighbour's date.
      const afterStart = match.index! + match[0].length;
      const afterEnd = Math.min(markdown.length, afterStart + 5000);
      let afterLink = markdown.substring(afterStart, afterEnd);
      // Truncate at the next job-style link to avoid cross-contamination
      const nextLinkIdx = afterLink.search(/\[([^\]]*\\\\[^\]]*)\]\(https?:\/\//);
      if (nextLinkIdx > 0) afterLink = afterLink.substring(0, nextLinkIdx);
      const afterTimeMatch = afterLink.match(/(\d+\s*(?:hour|day|week|month|year)s?\s*ago)/i);
      if (afterTimeMatch) postedDate = afterTimeMatch[1];
      // Also check before the link
      if (postedDate === 'Scraped just now') {
        const beforeStart = Math.max(0, match.index! - 500);
        const beforeLink = markdown.substring(beforeStart, match.index!);
        const beforeTimeMatch = beforeLink.match(/(\d+\s*(?:hour|day|week|month|year)s?\s*ago)/i);
        if (beforeTimeMatch) postedDate = beforeTimeMatch[1];
      }
    }

    // DEBUG: log first 3 jobs to see markdown context
    if (jobs.length < 3) {
      const ctxStart = Math.max(0, match.index! - 200);
      const ctxEnd = Math.min(markdown.length, match.index! + match[0].length + 300);
      console.log(`[DEBUG] Google Job "${title}" date="${postedDate}" context: ...${markdown.substring(ctxStart, ctxEnd).replace(/\n/g, '\\n')}...`);
    }

    if (jobs.some(j => j.title === title && j.company === company)) continue;

    // Build a Google Jobs search URL with udm=8 using job title + company
    const jobSearchQuery = encodeURIComponent(`${title} ${company}`);
    const jobUrl = `https://www.google.com/search?udm=8&q=${jobSearchQuery}`;

    jobs.push({
      id: crypto.randomUUID(),
      title,
      company,
      location: jobLocation,
      type,
      source: source.name,
      sourceUrl: source.url,
      url: jobUrl,
      salary,
      postedDate,
    });
  }

  console.log(`Google Jobs parser found ${jobs.length} jobs for location: ${searchCity || 'any'}`);
  return jobs;
}

// ---- InnovatorsRoom Scraper (beehiiv JobDrop newsletters) ----

async function scrapeInnovatorsRoom(
  apiKey: string,
  source: { name: string; url: string },
  location: string
): Promise<any[]> {
  const searchCity = location.split(',')[0]?.trim().toLowerCase() || 'london';
  const allJobs: any[] = [];

  // Scrape the latest Junior and Senior Investor JobDrop newsletters
  const archiveUrls = [
    'https://innovatorsroom.beehiiv.com/archive?tags=%F0%9F%92%B6+Junior+Investor+JobDrop',
    'https://innovatorsroom.beehiiv.com/archive?tags=%F0%9F%92%B6+Senior+Investor+JobDrop',
  ];

  const jobDropUrls: string[] = [];

  // Step 1: Get the latest JobDrop URLs from archive pages
  for (const archiveUrl of archiveUrls) {
    try {
      console.log(`InnovatorsRoom: fetching archive: ${archiveUrl}`);
      const response = await fetch('https://api.firecrawl.dev/v1/scrape', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          url: archiveUrl,
          formats: ['markdown', 'links'],
          onlyMainContent: true,
          waitFor: 3000,
        }),
      });

      const data = await response.json();
      if (!response.ok) {
        console.error(`InnovatorsRoom archive failed:`, data);
        continue;
      }

      const links: string[] = data.data?.links || data.links || [];
      const markdown: string = data.data?.markdown || data.markdown || '';

      // Extract JobDrop post URLs from links
      const dropLinks = links.filter((l: string) =>
        l.includes('innovatorsroom.beehiiv.com/p/inv-')
      );

      // Also extract from markdown in case links array misses some
      const mdLinkPattern = /\(https:\/\/innovatorsroom\.beehiiv\.com\/p\/inv-[^)]+\)/g;
      let mdMatch;
      while ((mdMatch = mdLinkPattern.exec(markdown)) !== null) {
        const url = mdMatch[0].slice(1, -1); // remove parens
        if (!dropLinks.includes(url)) dropLinks.push(url);
      }

      // Only take the most recent 2 drops per category
      const uniqueDrops = [...new Set(dropLinks)].slice(0, 2);
      jobDropUrls.push(...uniqueDrops);

      console.log(`InnovatorsRoom: found ${uniqueDrops.length} JobDrop URLs from archive`);
    } catch (err) {
      console.error(`InnovatorsRoom archive error:`, err);
    }
  }

  if (jobDropUrls.length === 0) {
    console.log('InnovatorsRoom: no JobDrop URLs found');
    return [];
  }

  // Step 2: Scrape each JobDrop page for job listings
  const uniqueDropUrls = [...new Set(jobDropUrls)];
  console.log(`InnovatorsRoom: scraping ${uniqueDropUrls.length} JobDrop pages`);

  for (const dropUrl of uniqueDropUrls) {
    try {
      console.log(`InnovatorsRoom: scraping JobDrop: ${dropUrl}`);
      const response = await fetch('https://api.firecrawl.dev/v1/scrape', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          url: dropUrl,
          formats: ['markdown'],
          onlyMainContent: true,
          waitFor: 3000,
        }),
      });

      const data = await response.json();
      if (!response.ok) {
        console.error(`InnovatorsRoom JobDrop scrape failed:`, data);
        continue;
      }

      const markdown: string = data.data?.markdown || data.markdown || '';
      console.log(`InnovatorsRoom: JobDrop markdown length: ${markdown.length}`);

      // Extract the newsletter date from the page
      const dateMatch = markdown.match(/(January|February|March|April|May|June|July|August|September|October|November|December)\s+\d{1,2},?\s+\d{4}/i);
      const newsletterDate = dateMatch ? dateMatch[0] : undefined;

      const jobs = parseInnovatorsRoomJobs(markdown, source, searchCity, newsletterDate);
      allJobs.push(...jobs);

      console.log(`InnovatorsRoom: found ${jobs.length} London jobs from ${dropUrl}`);
    } catch (err) {
      console.error(`InnovatorsRoom JobDrop error:`, err);
    }
  }

  // Deduplicate by URL
  const seen = new Set<string>();
  const deduped = allJobs.filter(job => {
    if (seen.has(job.url)) return false;
    seen.add(job.url);
    return true;
  });

  console.log(`InnovatorsRoom: total ${deduped.length} unique London jobs`);
  return deduped;
}

function parseInnovatorsRoomJobs(
  markdown: string,
  source: { name: string; url: string },
  searchCity: string,
  newsletterDate?: string
): any[] {
  const jobs: any[] = [];

  // Pattern 1: Top picks format (table rows)
  // **[Company Name](url)**<br>🇬🇧 London | [🔗](apply_url) **[Job Title](job_url)**<br>Full-time |
  const topPickPattern = /\*\*\[([^\]]+)\]\([^)]*\)\*\*[^|]*?(🇬🇧[^|]*?(?:London|UK|United Kingdom)[^|]*?)\|[^|]*?\*\*\[([^\]]+)\]\((https:\/\/www\.innovatorsroom\.com\/jobs\/profile\?recordId=[^&)]+[^)]*)\)\*\*[^|]*?(Full-time|Part-time|Intern|Contract)?/gi;

  let match;
  while ((match = topPickPattern.exec(markdown)) !== null) {
    const company = match[1].trim();
    const locationStr = match[2].replace(/🇬🇧/g, '').trim();
    const title = match[3].trim();
    const url = match[4].split('&utm_')[0] + '&utm_source=techjobs_newsletter';
    const typeStr = (match[5] || '').toLowerCase();

    if (!locationStr.toLowerCase().includes(searchCity)) continue;

    jobs.push({
      id: crypto.randomUUID(),
      title,
      company,
      location: locationStr,
      type: inferInnovatorsRoomType(title, typeStr),
      source: source.name,
      sourceUrl: source.url,
      url,
      postedDate: newsletterDate || undefined,
    });
  }

  // Pattern 2: Compact list format
  // **[Company](url)**<br>FT **[Title](job_url)** [🔗](apply_url)<br>🇬🇧 London |
  const compactPattern = /\*\*\[([^\]]+)\]\([^)]*\)\*\*[^*]*?(?:FT|PT|IN)\s*\*\*\[([^\]]+)\]\((https:\/\/www\.innovatorsroom\.com\/jobs\/profile\?recordId=[^&)]+[^)]*)\)\*\*[^🇬🇧]*?(🇬🇧[^|]*)/gi;

  while ((match = compactPattern.exec(markdown)) !== null) {
    const company = match[1].trim();
    const title = match[2].trim();
    const url = match[3].split('&utm_')[0] + '&utm_source=techjobs_newsletter';
    const locationStr = match[4].replace(/🇬🇧/g, '').trim();

    if (!locationStr.toLowerCase().includes(searchCity)) continue;
    if (jobs.some(j => j.url === url)) continue;

    jobs.push({
      id: crypto.randomUUID(),
      title,
      company,
      location: locationStr,
      type: inferInnovatorsRoomType(title, ''),
      source: source.name,
      sourceUrl: source.url,
      url,
      postedDate: newsletterDate || undefined,
    });
  }

  // Pattern 3: Generic fallback - find any innovatorsroom job profile URLs and extract context
  const genericPattern = /\*\*\[([^\]]+)\]\((https:\/\/www\.innovatorsroom\.com\/jobs\/profile\?recordId=[^&)]+[^)]*)\)\*\*/g;

  while ((match = genericPattern.exec(markdown)) !== null) {
    const title = match[1].trim();
    const url = match[2].split('&utm_')[0] + '&utm_source=techjobs_newsletter';

    if (jobs.some(j => j.url === url)) continue;

    // Look backwards for company and location context
    const before = markdown.substring(Math.max(0, match.index - 500), match.index);

    // Find company name
    const companyMatch = before.match(/\*\*\[([^\]]+)\]\(https:\/\/www\.innovatorsroom\.com\/companies\/[^)]+\)\*\*/g);
    const company = companyMatch
      ? companyMatch[companyMatch.length - 1].match(/\*\*\[([^\]]+)\]/)?.[1] || 'Unknown'
      : 'Unknown';

    // Check for London/UK in surrounding context
    const context = before + markdown.substring(match.index, Math.min(markdown.length, match.index + 200));
    const hasLondon = /🇬🇧[^|]*london/i.test(context) || /london/i.test(context);

    if (!hasLondon) continue;

    // Extract location string
    const locMatch = context.match(/🇬🇧\s*([^|<\n]+)/);
    const locationStr = locMatch ? locMatch[1].trim() : 'London';

    jobs.push({
      id: crypto.randomUUID(),
      title,
      company,
      location: locationStr,
      type: inferInnovatorsRoomType(title, ''),
      source: source.name,
      sourceUrl: source.url,
      url,
      postedDate: newsletterDate || undefined,
    });
}

  return jobs;
}

// ---- LinkedIn Jobs Guest API Scraper ----

const LINKEDIN_PAGES_CITY = 40; // 25 jobs per page — for city-specific searches
const LINKEDIN_PAGES_COUNTRY = 15; // Cap for broad country-wide searches to avoid timeout

async function scrapeLinkedIn(
  apiKey: string,
  source: { name: string; url: string },
  keywords: string[],
  location: string
): Promise<any[]> {
  const searchCity = location.split(',')[0]?.trim() || 'London';
  const isCountryWide = searchCity.toLowerCase() === 'united kingdom';
  const maxPages = isCountryWide ? LINKEDIN_PAGES_COUNTRY : LINKEDIN_PAGES_CITY;
  const searchQuery = keywords[0] || 'venture capital';
  const allJobs: any[] = [];

  for (let page = 0; page < maxPages; page++) {
    const start = page * 25;
    const guestUrl = `https://www.linkedin.com/jobs-guest/jobs/api/seeMoreJobPostings/search?keywords=${encodeURIComponent(searchQuery)}&location=${encodeURIComponent(searchCity)}&start=${start}`;
    console.log(`LinkedIn page ${page + 1}: ${guestUrl}`);

    try {
      // Direct fetch — LinkedIn guest API returns static HTML, no JS rendering needed
      const response = await fetch(guestUrl, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
          'Accept-Language': 'en-US,en;q=0.5',
        },
      });

      if (!response.ok) {
        console.error(`LinkedIn page ${page + 1} failed: HTTP ${response.status}`);
        await response.text(); // consume body
        break;
      }

      const html = await response.text();
      console.log(`LinkedIn page ${page + 1}: ${html.length} chars HTML`);

      const pageJobs = parseLinkedInGuestJobs(html, '', source, searchCity);
      const newJobs = pageJobs.filter(j => !allJobs.some(e => e.title === j.title && e.company === j.company));
      allJobs.push(...newJobs);
      console.log(`LinkedIn page ${page + 1}: ${newJobs.length} new jobs`);

      if (pageJobs.length < 5) break;
      // Delay between pages to avoid rate limiting
      if (page < maxPages - 1) await new Promise(r => setTimeout(r, 1000));
    } catch (err) {
      console.error(`LinkedIn page ${page + 1} error:`, err);
      break;
    }
  }

  console.log(`LinkedIn total: ${allJobs.length} jobs`);
  return allJobs;
}

function decodeHtmlEntities(str: string): string {
  return str
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&#x27;/g, "'")
    .replace(/&#x2F;/g, '/')
    .replace(/&nbsp;/g, ' ');
}

function parseLinkedInGuestJobs(
  html: string,
  markdown: string,
  source: { name: string; url: string },
  searchCity: string
): any[] {
  const jobs: any[] = [];

  // Strategy 1: Parse HTML — LinkedIn guest API returns <li> cards with specific classes
  // Each card has: base-card__full-link (title+url), base-search-card__subtitle (company),
  // job-search-card__location (location), <time datetime="..."> (date)

  // Extract job cards using base-card pattern
  const cardPattern = /<li[\s\S]*?<\/li>/gi;
  let cardMatch;
  while ((cardMatch = cardPattern.exec(html)) !== null) {
    const card = cardMatch[0];

    // Title + URL
    const titleMatch = card.match(/<a[^>]*class="[^"]*base-card__full-link[^"]*"[^>]*href="([^"]*)"[^>]*>([\s\S]*?)<\/a>/i)
      || card.match(/<h3[^>]*class="[^"]*base-search-card__title[^"]*"[^>]*>([\s\S]*?)<\/h3>/i);
    if (!titleMatch) continue;

    let url = '';
    let title = '';
    if (titleMatch[2] !== undefined) {
      url = titleMatch[1].trim();
      title = decodeHtmlEntities(titleMatch[2].replace(/<[^>]*>/g, '').trim());
    } else {
      title = decodeHtmlEntities(titleMatch[1].replace(/<[^>]*>/g, '').trim());
    }

    if (title.length < 3 || title.length > 200) continue;
    if (/sign in|log in|cookie|privacy|menu/i.test(title)) continue;

    // If no URL from title link, look for any linkedin job URL in the card
    if (!url) {
      const urlMatch = card.match(/href="(https:\/\/[^"]*linkedin\.com\/jobs\/view\/[^"]*)"/i);
      if (urlMatch) url = urlMatch[1];
    }
    if (!url) continue;

    // Company
    let company = 'Unknown';
    const companyMatch = card.match(/<h4[^>]*class="[^"]*base-search-card__subtitle[^"]*"[^>]*>([\s\S]*?)<\/h4>/i)
      || card.match(/<a[^>]*class="[^"]*hidden-nested-link[^"]*"[^>]*>([\s\S]*?)<\/a>/i);
    if (companyMatch) {
      company = decodeHtmlEntities(companyMatch[1].replace(/<[^>]*>/g, '').trim());
    }

    // Location
    let jobLocation = searchCity;
    const locMatch = card.match(/<span[^>]*class="[^"]*job-search-card__location[^"]*"[^>]*>([\s\S]*?)<\/span>/i);
    if (locMatch) {
      jobLocation = locMatch[1].replace(/<[^>]*>/g, '').trim();
    }

    // Posted date
    let postedDate: string | undefined;
    const timeMatch = card.match(/<time[^>]*datetime="([^"]*)"[^>]*>/i);
    if (timeMatch) {
      postedDate = timeMatch[1]; // ISO date like "2026-02-28"
    }

    let type = 'full-time';
    const tl = title.toLowerCase();
    if (tl.includes('intern') && !tl.includes('internal')) type = 'internship';
    else if (tl.includes('graduate') || tl.includes('entry level')) type = 'graduate';

    if (!jobs.some(j => j.title === title && j.company === company)) {
      jobs.push({
        id: crypto.randomUUID(),
        title,
        company,
        location: jobLocation,
        type,
        source: source.name,
        sourceUrl: source.url,
        url: url.split('?')[0], // Clean tracking params
        postedDate,
      });
    }
  }

  // Strategy 2: Fallback to markdown parsing if HTML parsing found nothing
  if (jobs.length === 0 && markdown.length > 100) {
    console.log('LinkedIn: HTML parsing found nothing, trying markdown fallback');
    const lines = markdown.split('\n').map(l => l.trim()).filter(l => l.length > 0);

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      // Look for markdown links to linkedin job views
      const linkMatch = line.match(/\[([^\]]{5,200})\]\((https:\/\/[^\s)]*linkedin\.com\/jobs\/view\/[^\s)]+)\)/);
      if (!linkMatch) continue;

      const title = linkMatch[1].replace(/\*\*/g, '').trim();
      const url = linkMatch[2].split('?')[0];

      if (/sign in|log in|cookie|privacy/i.test(title)) continue;

      let company = 'Unknown';
      let jobLocation = searchCity;

      // Check next lines for company/location
      for (let j = 1; j <= 3 && i + j < lines.length; j++) {
        const next = lines[i + j].replace(/\*\*/g, '').replace(/\[.*?\]\(.*?\)/g, '').trim();
        if (!next || next.startsWith('#')) break;
        if (company === 'Unknown' && next.length > 1 && next.length < 100) {
          company = next;
        } else if (/london|uk|england|remote|hybrid/i.test(next) && next.length < 60) {
          jobLocation = next;
        }
      }

      let type = 'full-time';
      const tl = title.toLowerCase();
      if (tl.includes('intern') && !tl.includes('internal')) type = 'internship';
      else if (tl.includes('graduate') || tl.includes('entry level')) type = 'graduate';

      if (!jobs.some(j => j.title === title && j.company === company)) {
        jobs.push({
          id: crypto.randomUUID(),
          title,
          company,
          location: jobLocation,
          type,
          source: source.name,
          sourceUrl: source.url,
          url,
        });
      }
    }
  }

  return jobs;
}

function inferInnovatorsRoomType(title: string, typeHint: string): string {
  const lower = (title + ' ' + typeHint).toLowerCase();
  if (lower.includes('intern') && !lower.includes('internal')) return 'internship';
  if (/\b(graduate|entry.level|trainee)\b/.test(lower)) return 'graduate';
  return 'full-time';
}
