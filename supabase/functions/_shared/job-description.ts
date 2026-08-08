// Fetches full job descriptions on demand so stage/relevance matching can look
// beyond the job title (many roles are simply titled "Investor").

function stripHtml(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|li|h[1-6]|tr)>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&#39;|&rsquo;/g, "'")
    .replace(/&quot;|&ldquo;|&rdquo;/g, '"')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

const UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36';

function linkedInJobId(url: string): string | null {
  const decoded = url.replace(/&amp;/g, '&');
  const m = decoded.match(/\/jobs\/view\/(?:[^/?#]*?-)?(\d{6,})/) ||
    decoded.match(/currentJobId=(\d{6,})/) ||
    decoded.match(/jobPosting\/(\d{6,})/);
  return m ? m[1] : null;
}

async function withTimeout(url: string, init: RequestInit, ms: number): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ms);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

async function fetchLinkedIn(url: string): Promise<string> {
  const id = linkedInJobId(url);
  if (!id) return '';
  try {
    const res = await withTimeout(
      `https://www.linkedin.com/jobs-guest/jobs/api/jobPosting/${id}`,
      { headers: { 'User-Agent': UA, 'Accept-Language': 'en-GB,en;q=0.9' } },
      12000,
    );
    if (!res.ok) return '';
    return stripHtml(await res.text());
  } catch {
    return '';
  }
}

async function fetchDirect(url: string): Promise<string> {
  try {
    const res = await withTimeout(url, { headers: { 'User-Agent': UA, 'Accept-Language': 'en-GB,en;q=0.9' } }, 12000);
    if (!res.ok) return '';
    const html = await res.text();
    // Prefer JSON-LD JobPosting description when present
    const ld = html.match(/<script[^>]+application\/ld\+json[^>]*>([\s\S]*?)<\/script>/gi) ?? [];
    for (const block of ld) {
      const json = block.replace(/^[\s\S]*?>/, '').replace(/<\/script>$/i, '');
      try {
        const parsed = JSON.parse(json);
        const nodes = Array.isArray(parsed) ? parsed : [parsed];
        for (const n of nodes) {
          if (n && typeof n.description === 'string' && n.description.length > 120) {
            return stripHtml(n.description);
          }
        }
      } catch { /* ignore malformed ld+json */ }
    }
    return stripHtml(html).slice(0, 20000);
  } catch {
    return '';
  }
}

async function fetchFirecrawl(url: string, apiKey: string): Promise<string> {
  try {
    const res = await withTimeout('https://api.firecrawl.dev/v1/scrape', {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ url, formats: ['markdown'], onlyMainContent: true, timeout: 20000 }),
    }, 30000);
    if (!res.ok) return '';
    const data = await res.json();
    return (data?.data?.markdown ?? '').toString();
  } catch {
    return '';
  }
}

/** Best-effort full job description. Returns '' when it cannot be retrieved. */
export async function fetchJobDescription(url: string, opts?: { firecrawlKey?: string }): Promise<string> {
  if (!url) return '';
  let text = '';

  if (/linkedin\.com/i.test(url)) {
    text = await fetchLinkedIn(url);
  }
  if (text.length < 200) {
    const direct = await fetchDirect(url);
    if (direct.length > text.length) text = direct;
  }
  if (text.length < 200 && opts?.firecrawlKey) {
    const fc = await fetchFirecrawl(url, opts.firecrawlKey);
    if (fc.length > text.length) text = fc;
  }

  return text.slice(0, 12000);
}

/** Runs an async mapper over items with a bounded concurrency pool. */
export async function mapPool<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let cursor = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (cursor < items.length) {
      const i = cursor++;
      results[i] = await fn(items[i]);
    }
  });
  await Promise.all(workers);
  return results;
}
