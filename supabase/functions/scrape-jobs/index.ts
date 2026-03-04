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

    console.log(`Scraping ${sources.length} sources for keywords: ${keywords.join(', ')} in ${location}`);

    const results: any[] = [];
    const sourceStatuses: Record<string, { status: string; error?: string }> = {};

    // Scrape each source
    for (const source of sources) {
      try {
        console.log(`Scraping: ${source.name} (${source.url})`);

        // Build search URL with keywords and location for sources that support search
        let scrapeUrl = source.url;

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
            waitFor: 3000,
          }),
        });

        const data = await response.json();

        if (!response.ok) {
          console.error(`Failed to scrape ${source.name}:`, data);
          sourceStatuses[source.name] = { status: 'error', error: data.error || `HTTP ${response.status}` };
          continue;
        }

        sourceStatuses[source.name] = { status: 'connected' };

        // Extract job-like content from markdown
        const markdown = data.data?.markdown || data.markdown || '';
        const links = data.data?.links || data.links || [];

        // Parse the markdown to find job listings
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

function parseJobsFromMarkdown(
  markdown: string,
  links: string[],
  source: { name: string; url: string },
  keywords: string[],
  location: string
): any[] {
  const jobs: any[] = [];
  const lines = markdown.split('\n');
  const lowerLocation = location.toLowerCase();

  // Split into sections by headers or list items
  let currentTitle = '';
  let currentContent = '';
  let sectionStart = -1;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();

    // Detect job-like headers (## Title, ### Title, or **Title**)
    const headerMatch = line.match(/^#{1,4}\s+(.+)/) || line.match(/^\*\*(.+?)\*\*/);

    if (headerMatch || i === lines.length - 1) {
      // Process previous section
      if (currentTitle && sectionStart >= 0) {
        const fullText = `${currentTitle} ${currentContent}`.toLowerCase();

        // Check if it matches any keyword
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

  // Also look for list-based job entries (- Job Title at Company)
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
        // Avoid duplicates
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

function extractJobDetails(
  title: string,
  content: string,
  source: { name: string; url: string },
  links: string[]
): any | null {
  // Skip navigation items, headers, footers
  if (title.length < 4 || title.length > 200) return null;
  const skipWords = ['menu', 'navigation', 'footer', 'header', 'cookie', 'privacy', 'terms', 'sign in', 'log in', 'subscribe'];
  if (skipWords.some(w => title.toLowerCase().includes(w))) return null;

  const fullText = `${title} ${content}`.toLowerCase();

  // Extract company
  let company = 'Unknown';
  const companyPatterns = [
    /(?:at|@)\s+([A-Z][A-Za-z0-9\s&.]+)/,
    /company[:\s]+([A-Za-z0-9\s&.]+)/i,
    /([A-Z][A-Za-z0-9]+(?:\s[A-Z][A-Za-z0-9]+)*)\s+(?:is hiring|is looking|seeks)/,
  ];
  for (const pattern of companyPatterns) {
    const match = content.match(pattern) || title.match(pattern);
    if (match) {
      company = match[1].trim();
      break;
    }
  }

  // Determine job type
  let type: string = 'full-time';
  if (fullText.includes('intern') && !fullText.includes('internal')) type = 'internship';
  else if (fullText.includes('graduate') || fullText.includes('grad scheme') || fullText.includes('entry level')) type = 'graduate';

  // Extract salary
  let salary: string | undefined;
  const salaryMatch = content.match(/[£$€]\s?[\d,]+(?:\s?[-–]\s?[£$€]?\s?[\d,]+)?(?:\s?(?:k|K|pa|p\.a\.|per annum|per year))?/);
  if (salaryMatch) salary = salaryMatch[0];

  // Find a relevant link
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
