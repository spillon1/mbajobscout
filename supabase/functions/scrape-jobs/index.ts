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

  return parseVenture5Jobs(markdown, source, searchCity);
}

function parseVenture5Jobs(
  markdown: string,
  source: { name: string; url: string },
  searchCity: string
): any[] {
  const jobs: any[] = [];

  // Instead of complex regex for nested brackets, find all venture5 job URLs
  // and work backwards to extract the content block before each URL
  const urlPattern = /\]\((https?:\/\/(?:www\.)?venture5\.com\/(?:job\/[^\s)]+|\?post_type=job_listing[^\s)]+))\)/g;
  let urlMatch;
  
  while ((urlMatch = urlPattern.exec(markdown)) !== null) {
    const url = urlMatch[1];
    
    // Find the opening `[` for this link by searching backwards
    // Look for the list item start `- [` before this position
    const beforeUrl = markdown.substring(Math.max(0, urlMatch.index - 500), urlMatch.index);
    
    // Find the last `- [` or `- [![` in the content before the URL
    const blockStart = beforeUrl.lastIndexOf('- [');
    if (blockStart < 0) continue;
    
    const content = beforeUrl.substring(blockStart + 2); // skip "- "
    
    // Extract text fields: remove image markdown, bold markers, clean up
    const textContent = content
      .replace(/!\[[^\]]*\]\([^)]*\)/g, '') // remove images
      .replace(/\*\*/g, '') // remove bold
      .replace(/\\/g, '') // remove backslashes
      .replace(/- Posted/g, 'Posted') // normalize
      .trim();
    
    const parts = textContent
      .split(/\n/)
      .map(s => s.trim())
      .filter(s => s.length > 0 && s !== '[' && s !== ',' && s !== '-');
    
    if (parts.length < 2) continue;
    
    // First non-empty part is title, second is company
    const title = parts[0].replace(/^\[/, '').trim();
    const company = parts[1].trim();
    
    // Skip non-job entries
    if (title.length < 3 || title.length > 200) continue;
    const skipWords = ['newsletter', 'subscribe', 'cookie', 'sign in', 'load more', 'advertisement', 'menu', 'about', 'latest news'];
    if (skipWords.some(w => title.toLowerCase().includes(w))) continue;
    
    // Find location - look for "City, Region" pattern or just city name
    let jobLocation = '';
    for (const part of parts) {
      if (/london|england|uk|united kingdom/i.test(part) && !part.includes('Posted')) {
        jobLocation = part;
        break;
      }
    }
    
    // If we're scraping a pre-filtered URL, location should match
    if (searchCity && !jobLocation) continue;
    if (searchCity && jobLocation && !jobLocation.toLowerCase().includes(searchCity)) continue;
    
    // Extract posted date - search the raw content block, not just cleaned parts
    let postedDate = 'Scraped just now';
    const rawDateMatch = content.match(/Posted\s+(\d+\s*(?:hour|day|week|month)s?\s*ago)/i);
    if (rawDateMatch) {
      postedDate = rawDateMatch[1];
    }
    
    // Determine job type
    let type = 'full-time';
    const fullText = `${title} ${company}`.toLowerCase();
    if (fullText.includes('intern') && !fullText.includes('internal')) type = 'internship';
    else if (fullText.includes('graduate') || fullText.includes('entry level') || fullText.includes('visiting analyst')) type = 'graduate';
    
    // Avoid duplicates
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
  const relMatch = dateStr.match(/(\d+)\s*(hour|day|week|month)s?\s*ago/i);
  if (relMatch) {
    const num = parseInt(relMatch[1]);
    const unit = relMatch[2].toLowerCase();
    const d = new Date();
    if (unit === 'hour') d.setHours(d.getHours() - num);
    else if (unit === 'day') d.setDate(d.getDate() - num);
    else if (unit === 'week') d.setDate(d.getDate() - num * 7);
    else if (unit === 'month') d.setMonth(d.getMonth() - num);
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

async function scrapeRssFeed(
  source: { name: string; url: string },
  keywords: string[],
  location: string
): Promise<any[]> {
  const response = await fetch(source.url);
  if (!response.ok) {
    throw new Error(`RSS fetch failed: HTTP ${response.status}`);
  }

  const xml = await response.text();
  const items = parseRssItems(xml);
  const jobs: any[] = [];

  // For VC-specific job boards, all listings are relevant
  const isVcSource = /startup\s*&?\s*vc|venture5|venturecapitalcareers|john\s*gannon/i.test(source.name);

  for (const item of items) {
    const fullText = `${item.title} ${item.description}`.toLowerCase();

    // Check keyword match (skip for VC-specific sources)
    if (!isVcSource) {
      const matchesKeyword = keywords.length === 0 || keywords.some(kw =>
        fullText.includes(kw.toLowerCase())
      );
      if (!matchesKeyword) continue;
    }

    // Parse title format: "VC Internship @ Breega in London, England"
    // or "IR Analyst - Isomer Capital in London, England"
    let company = 'Unknown';
    let jobLocation = 'London, UK';
    let title = item.title;

    // Extract location from "in Location" at the end
    const locMatch = title.match(/\s+in\s+(.+?)$/i);
    if (locMatch) {
      jobLocation = locMatch[1].trim();
      title = title.substring(0, locMatch.index).trim();
    }

    // Extract company from "@ Company" or "- Company" patterns
    const companyMatch = title.match(/\s+[@]\s+(.+)$/i) || title.match(/\s+[-–—]\s+(.+)$/i);
    if (companyMatch) {
      company = companyMatch[1].trim();
      title = title.substring(0, companyMatch.index).trim();
    }

    // But keep the full title if it becomes too short
    if (title.length < 3) title = item.title.split(/\s+[@-]\s+/)[0].trim();

    // Determine job type
    let type = 'full-time';
    if (fullText.includes('intern') && !fullText.includes('internal')) type = 'internship';
    else if (fullText.includes('graduate') || fullText.includes('grad scheme') || fullText.includes('entry level') || fullText.includes('entry-level')) type = 'graduate';

    // Extract salary
    let salary: string | undefined;
    const salaryMatch = item.description.match(/[£$€]\s?[\d,]+(?:\s?[-–]\s?[£$€]?\s?[\d,]+)?(?:\s?(?:k|K|pa|p\.a\.|per annum|per year))?/);
    if (salaryMatch) salary = salaryMatch[0];

    // Clean description - strip HTML tags
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
      description: cleanDesc || undefined,
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
