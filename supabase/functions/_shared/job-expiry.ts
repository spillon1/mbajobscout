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

/** True when a page/description body contains an explicit "listing closed" marker. */
export function hasExpiredMarker(text: string): boolean {
  if (!text) return false;
  return EXPIRED_MARKERS.some((re) => re.test(text));
}

/** Listing URLs often arrive HTML-escaped (`&amp;`), which breaks query params. */
function normalizeUrl(url: string): string {
  return (url || '').replace(/&amp;/gi, '&').trim();
}

/**
 * Fetch a listing and decide whether it is still open.
 * Returns 'unknown' when we can't tell (blocked, timeout, non-2xx) so callers never
 * drop a job on a transient failure.
 */
export async function checkListingStatus(rawUrl: string, timeoutMs = 8000): Promise<ExpiryStatus> {
  const url = normalizeUrl(rawUrl);
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
  const endpoints = [
    `https://www.linkedin.com/jobs-guest/jobs/api/jobPosting/${id}`,
    `https://www.linkedin.com/jobs/view/${id}`,
  ];

  for (const endpoint of endpoints) {
    try {
      const res = await fetch(endpoint, {
      redirect: 'follow',
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36',
        'Accept': 'text/html',
      },
      signal: AbortSignal.timeout(timeoutMs),
      });

      if (res.status === 404 || res.status === 410) return 'expired';
      // Try the public page when the guest endpoint throttles or blocks us.
      if (res.status === 429 || res.status === 999 || !res.ok) continue;

      const html = await res.text();
      if (html.trim().length < 200) return 'expired';

      if (/closed-job__flavor--closed|class="[^"]*closed-job\b/i.test(html)) return 'expired';

      const validThrough = html.match(/"validThrough"\s*:\s*"([^"]+)"/)?.[1];
      if (validThrough) {
        const ts = Date.parse(validThrough);
        if (!Number.isNaN(ts) && ts < Date.now()) return 'expired';
      }

      const text = html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');
      if (EXPIRED_MARKERS.some((re) => re.test(text))) return 'expired';

      // Closed guest postings still render the top card + description, but LinkedIn
      // strips every apply CTA (apply button / contextual sign-in modal). A fully
      // rendered card with no apply affordance means applications are closed.
      if (endpoint.includes('jobs-guest')) {
        const rendered = /top-card-layout__title|topcard__title/i.test(html);
        // Generic sign-in modals are injected for unrelated controls (AI, save,
        // ellipsis, etc.) and therefore are not evidence that applications are
        // open. Only count markup explicitly tied to applying for this job.
        const hasApplyCta =
          /apply-button|apply-modal|apply-link-offsite|"applyMethod"|data-tracking-control-name="[^"]*apply/i.test(
            html,
          );
        if (rendered && !hasApplyCta) return 'expired';
      }

      return 'live';

    } catch {
      // Fall through to the alternate endpoint.
    }
  }
  return 'unknown';
}

/** Run status checks with bounded concurrency. */
export async function checkListingsBatch<T>(
  items: T[],
  getUrl: (item: T) => string,
  concurrency = 8,
  timeoutMs = 8000
): Promise<Array<{ item: T; status: ExpiryStatus }>> {
  const out: Array<{ item: T; status: ExpiryStatus }> = [];
  const linkedIn = items.filter((item) => /linkedin\.com/i.test(getUrl(item)));
  const other = items.filter((item) => !/linkedin\.com/i.test(getUrl(item)));

  async function run(group: T[], limit: number) {
    for (let i = 0; i < group.length; i += limit) {
      const batch = group.slice(i, i + limit);
      const results = await Promise.all(
        batch.map(async (item) => ({ item, status: await checkListingStatus(getUrl(item), timeoutMs) }))
      );
      out.push(...results);
    }
  }

  // LinkedIn aggressively throttles bursts; large batches were turning almost every
  // check into `unknown`, allowing visibly closed roles to survive indefinitely.
  await Promise.all([run(linkedIn, Math.min(2, concurrency)), run(other, concurrency)]);
  return out;
}
