// Shared listing-expiry verification.
// Source of truth = the listing page itself, not the posting date.

const EXPIRED_MARKERS = [
  /this listing has expired/i,
  /this job (listing )?has expired/i,
  /this (job|position|vacancy|role) is (no longer|not) (available|active|accepting)/i,
  /no longer accepting applications/i,
  /applications? (are |is )?(now )?closed/i,
  /(position|role|vacancy) (has been )?filled/i,
  /this job (post|posting) is no longer/i,
  /job expired/i,
];

export type ExpiryStatus = 'live' | 'expired' | 'unknown';

/**
 * Fetch a listing and decide whether it is still open.
 * Returns 'unknown' when we can't tell (blocked, timeout, non-2xx) so callers never
 * drop a job on a transient failure.
 */
export async function checkListingStatus(url: string, timeoutMs = 8000): Promise<ExpiryStatus> {
  if (!url || /^https?:\/\//i.test(url) === false) return 'unknown';
  if (/linkedin\.com/i.test(url)) return await checkLinkedInStatus(url, timeoutMs);

  try {
    const res = await fetch(url, {
      redirect: 'follow',
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml',
      },
      signal: AbortSignal.timeout(timeoutMs),
    });

    if (res.status === 404 || res.status === 410) return 'expired';
    if (!res.ok) return 'unknown';

    const html = (await res.text()).slice(0, 300000);
    // Strip scripts/styles so JS strings don't create false positives
    const text = html
      .replace(/<script[\s\S]*?<\/script>/gi, ' ')
      .replace(/<style[\s\S]*?<\/style>/gi, ' ')
      .replace(/<[^>]+>/g, ' ')
      .replace(/\s+/g, ' ');

    return EXPIRED_MARKERS.some((re) => re.test(text)) ? 'expired' : 'live';
  } catch {
    return 'unknown';
  }
}

/**
 * LinkedIn hides the "no longer accepting applications" banner from logged-out
 * visitors, so the public page always looks live. The guest posting endpoint is the
 * only signal available: removed/closed posts return 404/410 (or an empty body),
 * and JSON-LD sometimes carries a past `validThrough` date.
 */
async function checkLinkedInStatus(url: string, timeoutMs: number): Promise<ExpiryStatus> {
  const id = url.match(/(?:jobs\/view\/(?:[^/?#]*-)?)(\d{6,})/)?.[1];
  if (!id) return 'unknown';
  try {
    const res = await fetch(`https://www.linkedin.com/jobs-guest/jobs/api/jobPosting/${id}`, {
      redirect: 'follow',
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36',
        'Accept': 'text/html',
      },
      signal: AbortSignal.timeout(timeoutMs),
    });

    if (res.status === 404 || res.status === 410) return 'expired';
    if (res.status === 429 || res.status === 999 || !res.ok) return 'unknown';

    const html = await res.text();
    if (html.trim().length < 200) return 'expired';

    const validThrough = html.match(/"validThrough"\s*:\s*"([^"]+)"/)?.[1];
    if (validThrough) {
      const ts = Date.parse(validThrough);
      if (!Number.isNaN(ts) && ts < Date.now()) return 'expired';
    }

    const text = html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');
    if (EXPIRED_MARKERS.some((re) => re.test(text))) return 'expired';

    return 'live';
  } catch {
    return 'unknown';
  }
}

/** Run status checks with bounded concurrency. */
export async function checkListingsBatch<T>(
  items: T[],
  getUrl: (item: T) => string,
  concurrency = 8,
  timeoutMs = 8000
): Promise<Array<{ item: T; status: ExpiryStatus }>> {
  const out: Array<{ item: T; status: ExpiryStatus }> = [];
  for (let i = 0; i < items.length; i += concurrency) {
    const batch = items.slice(i, i + concurrency);
    const results = await Promise.all(
      batch.map(async (item) => ({ item, status: await checkListingStatus(getUrl(item), timeoutMs) }))
    );
    out.push(...results);
  }
  return out;
}
