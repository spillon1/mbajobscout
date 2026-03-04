const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

interface ScrapeRequest {
  sources: { name: string; url: string }[];
  keywords: string[];
  location: string;
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

    const { sources, keywords, location } = await req.json() as ScrapeRequest;

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
          results.push(...googleJobs);
          sourceStatuses[source.name] = { status: 'connected', count: googleJobs.length };
          console.log(`Found ${googleJobs.length} total jobs from Google Jobs (paginated)`);
          continue;
        }

        // Venture5: use actions to click "Load more listings" and parse table rows
        if (source.url.includes('venture5.com')) {
          const venture5Jobs = await scrapeVenture5(apiKey, source, location);
          results.push(...venture5Jobs);
          sourceStatuses[source.name] = { status: 'connected', count: venture5Jobs.length };
          console.log(`Found ${venture5Jobs.length} jobs from Venture5 (with Load More)`);
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
          results.push(...indeedJobs);
          sourceStatuses[source.name] = { status: 'connected', count: indeedJobs.length };
          console.log(`Found ${indeedJobs.length} jobs from Indeed UK`);
          continue;
        }

        // Glassdoor UK: dedicated scraper with Firecrawl extract
        if (source.url.includes('glassdoor.co.uk')) {
          const glassdoorJobs = await scrapeGlassdoor(apiKey, source, keywords, location);
          results.push(...glassdoorJobs);
          sourceStatuses[source.name] = { status: 'connected', count: glassdoorJobs.length };
          console.log(`Found ${glassdoorJobs.length} jobs from Glassdoor UK`);
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

const GOOGLE_JOBS_PAGES = 5; // Scrape 5 pages (~50 results per page)

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

  // Try multiple Firecrawl actions approaches to click "Load more listings"
  let markdown = '';

  // Approach 1: Use click actions to hit the load more button repeatedly
  try {
    const actions: any[] = [
      { type: 'wait', milliseconds: 2000 },
    ];
    // Click "Load more listings" up to 10 times (each loads ~10 jobs)
    for (let i = 0; i < 10; i++) {
      actions.push({ type: 'click', selector: 'a.load_more_jobs' });
      actions.push({ type: 'wait', milliseconds: 1500 });
    }
    actions.push({ type: 'scrape' });

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
        waitFor: 3000,
        actions,
      }),
    });

    const data = await response.json();
    if (response.ok) {
      markdown = data.data?.markdown || data.markdown || '';
      console.log(`Venture5: actions scrape got ${markdown.length} chars`);
    } else {
      console.error('Venture5 actions scrape failed:', data);
    }
  } catch (err) {
    console.error('Venture5 actions error:', err);
  }

  // Fallback: simple scrape of the filtered URL (gets first page only)
  if (!markdown) {
    console.log('Venture5: falling back to simple scrape of filtered URL');
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

  const response = await fetch('https://api.firecrawl.dev/v1/scrape', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      url: searchUrl,
      formats: ['extract', 'html'],
      extract: { schema: jsonSchema },
      waitFor: 5000,
      timeout: 60000,
    }),
  });

  const data = await response.json();
  if (!response.ok) {
    console.error('Indeed: Firecrawl scrape failed:', JSON.stringify(data));
    throw new Error(data.error || `Firecrawl HTTP ${response.status}`);
  }

  const jsonData = data.data?.extract || data.extract;
  const html = data.data?.html || data.html || '';

  console.log(`Indeed: got JSON extraction: ${JSON.stringify(jsonData)?.substring(0, 500)}`);
  console.log(`Indeed: got ${html.length} chars HTML`);

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

        // Convert relative date like "2 days ago" to actual date string
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

  // Fallback to HTML parsing if JSON extraction failed
  console.log('Indeed: JSON extraction failed, falling back to HTML parsing');
  return parseIndeedJobs(html, source, searchCity);
}

/** Convert relative date strings like "2 days ago" to ISO date strings */
function convertRelativeDate(relStr: string): string | undefined {
  if (!relStr) return undefined;
  const lower = relStr.toLowerCase().trim();

  if (lower === 'just posted' || lower === 'today' || lower === 'just now') {
    return new Date().toISOString();
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
        postedDate: postedDate || undefined,
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
          postedDate: postedDate || undefined,
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
          postedDate: postedDate || undefined,
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
  const datePatterns = [
    /data-testid="[^"]*date[^"]*"[^>]*>([^<]+)/i,
    /class="[^"]*date[^"]*"[^>]*>([^<]+)/i,
    /class="[^"]*result-footer[^"]*"[\s\S]*?(\d+\+?\s*(?:day|hour|week|month)s?\s*ago|just posted|today|posted\s+\d+)/i,
    />(Posted\s+\d+\+?\s*(?:day|hour|week|month)s?\s*ago)<\//i,
    />(\d+\+?\s*(?:day|hour|week|month)s?\s*ago)<\//i,
    />(just posted|today)<\//i,
    /(\d+\+?\s*(?:day|hour|week|month)s?\s*ago|just posted|today)/i,
  ];
  for (const pat of datePatterns) {
    const dm = context.match(pat);
    if (dm) {
      const raw = (dm[1] || dm[0]).replace(/<[^>]*>/g, '').trim();
      // Clean up "Posted 5 days ago" → "5 days ago", "PostedPosted 30+ days ago" → "30+ days ago"
      postedDate = raw.replace(/^(posted\s*)+/i, '').trim();
      if (postedDate) break;
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

      // Location
      if (/london|uk|england|united kingdom|remote|hybrid/i.test(nextLine) && nextLine.length < 100) {
        jobLocation = nextLine.replace(/[*\[\]]/g, '').trim();
      }

      // Date
      const dateMatch = nextLine.match(/(\d+[hd]\+?|just now|today|\d+\s*(?:hour|day|week|month)s?\s*ago)/i);
      if (dateMatch) {
        postedDate = convertRelativeDate(dateMatch[1]);
      }

      // Salary
      const salaryMatch = nextLine.match(/[£$€]\s?[\d,]+(?:\s?[-–]\s?[£$€]?\s?[\d,]+)?(?:\s?(?:k|K|pa|p\.a\.|per annum|per year))?/);
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

function isLikelyVcRole(title: string, company: string, description: string | undefined): boolean {
  const text = ` ${title} ${company} ${description || ''} `.toLowerCase();

  // Strong VC signals in title, company, or description
  const vcPatterns = [
    /venture\s+capital/,
    /\bvc\b/,
    /ventures?\b/,           // "Octopus Ventures", "BlackRock Ventures"
    /growth\s+equity/,
    /growth\s+debt/,
    /private\s+equity/,
    /pre-?seed|seed\s+(stage|fund)/,
    /series\s+[a-d]/,
    /early[-\s]?stage/,
    /startup|start-up/,
    /portfolio\s+(company|companies|management|monitoring|controller|principal|manager|analyst)/,
    /fund\s+(admin|management|of\s+funds|raising|operations|accounting|controller)/,
    /limited\s+partner|general\s+partner|\blp\b|\bgp\b/,
    /carried\s+interest|co-?invest/,
    /deal\s+(flow|sourcing|origination)/,
    /investment\s+(analyst|associate|manager|director|principal|partner|team)/,
    /investor\s+relations/,
  ];

  return vcPatterns.some(pattern => pattern.test(text));
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
  const MAX_PAGES = 6;
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
  const MAX_PAGES = 10;
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
    const company = parts.length >= 2 ? parts[1].trim() : 'Unknown';
    let jobLocation = parts.length >= 3 ? parts[2].trim() : 'London, UK';
    jobLocation = jobLocation.replace(/\s*•\s*via\s+.+$/i, '').trim() || 'London, UK';

    const skipWords = ['filter', 'menu', 'sign in', 'cookie', 'follow', 'saved jobs', 'ai mode', 'forums', 'images', 'news'];
    if (skipWords.some(w => title.toLowerCase().includes(w))) continue;
    if (title.length < 5 || title.length > 300) continue;

    // Enforce location filter from user search (e.g. London)
    if (searchCity) {
      const locationText = `${jobLocation} ${title} ${company}`.toLowerCase();
      if (!locationText.includes(searchCity)) continue;
    }

    let type = 'full-time';
    const fullText = `${title} ${company}`.toLowerCase();
    if (fullText.includes('intern') && !fullText.includes('internal')) type = 'internship';
    else if (fullText.includes('graduate') || fullText.includes('entry level')) type = 'graduate';

    let salary: string | undefined;
    const salaryMatch = content.match(/[£$€]\s?[\d,]+(?:\s?[-–]\s?[£$€]?\s?[\d,]+)?(?:\s?(?:k|K|pa|p\.a\.|per annum|per year|a year))?/);
    if (salaryMatch) salary = salaryMatch[0];

    let postedDate = 'Scraped just now';
    const timeMatch = content.match(/(\d+\s*(?:hour|day|week|month)s?\s*ago)/i);
    if (timeMatch) postedDate = timeMatch[1];

    if (jobs.some(j => j.title === title && j.company === company)) continue;

    jobs.push({
      id: crypto.randomUUID(),
      title,
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

  console.log(`Google Jobs parser found ${jobs.length} jobs for location: ${searchCity || 'any'}`);
  return jobs;
}
