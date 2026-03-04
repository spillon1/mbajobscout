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

        // Otherwise use Firecrawl
        const response = await fetch('https://api.firecrawl.dev/v1/scrape', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${apiKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            url: source.url,
            formats: ['markdown', 'links'],
            onlyMainContent: true,
            waitFor: 3000,
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

        const jobs = parseJobsFromMarkdown(markdown, links, source, keywords, location);
        results.push(...jobs);

        console.log(`Found ${jobs.length} potential jobs from ${source.name}`);
      } catch (err) {
        console.error(`Error scraping ${source.name}:`, err);
        sourceStatuses[source.name] = { status: 'error', error: err instanceof Error ? err.message : 'Unknown error' };
      }
    }

    console.log(`Total jobs found: ${results.length}`);

    return new Response(
      JSON.stringify({ success: true, jobs: results, sourceStatuses }),
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

  for (const item of items) {
    const fullText = `${item.title} ${item.description}`.toLowerCase();

    // Check keyword match
    const matchesKeyword = keywords.length === 0 || keywords.some(kw =>
      fullText.includes(kw.toLowerCase())
    );

    if (!matchesKeyword) continue;

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

    // Clean title prefix like "VC " from "VC Internship"
    title = title.replace(/^VC\s+/i, '').trim();
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
  // Try structured card parsing first (e.g. Startup & VC format)
  const cardJobs = parseStructuredCards(markdown, source, keywords);
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
  keywords: string[]
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
      .map(s => s.trim())
      .filter(s => s.length > 0 && !s.startsWith('![') && !s.startsWith('['));

    // We expect at least: Title, Company, Type
    if (fields.length < 3) continue;

    // Fields are typically: [Title, Company, Type, "Posted", Date]
    const title = fields[0];
    const company = fields[1];
    const typeStr = fields[2];

    // Find date field (contains a year or month name)
    const dateStr = fields.find(f =>
      /\b(20\d{2})\b/.test(f) ||
      /\b(january|february|march|april|may|june|july|august|september|october|november|december)\b/i.test(f)
    ) || '';

    const fullText = `${title} ${company} ${typeStr}`.toLowerCase();

    const matchesKeyword = keywords.length === 0 || keywords.some(kw =>
      fullText.includes(kw.toLowerCase())
    );

    if (!matchesKeyword) continue;

    // Skip non-job entries (page headers, newsletter, etc.)
    const skipWords = ['newsletter', 'subscribe', 'terms', 'sign in', 'cookie'];
    if (skipWords.some(w => title.toLowerCase().includes(w))) continue;

    let type = 'full-time';
    const typeLower = typeStr.toLowerCase();
    if (typeLower.includes('intern')) type = 'internship';
    else if (typeLower.includes('graduate') || typeLower.includes('grad')) type = 'graduate';
    else if (typeLower.includes('other')) type = 'full-time';

    jobs.push({
      id: crypto.randomUUID(),
      title,
      company,
      location: 'London, UK',
      type,
      source: source.name,
      sourceUrl: source.url,
      url,
      postedDate: dateStr,
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
