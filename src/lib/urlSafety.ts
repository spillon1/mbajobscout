/**
 * Build a /out redirect URL for safely opening external links.
 * Strips referrer/opener context to avoid ERR_BLOCKED_BY_RESPONSE.
 */
export function getOutboundUrl(externalUrl?: string | null): string | null {
  if (!externalUrl) return null;

  let cleaned = externalUrl.trim();
  if (!cleaned) return null;

  // Block dangerous schemes
  if (/^(javascript|data|vbscript|blob):/i.test(cleaned)) return null;

  // Normalise missing scheme
  if (/^www\./i.test(cleaned)) {
    cleaned = 'https://' + cleaned;
  } else if (!/^https?:\/\//i.test(cleaned)) {
    cleaned = 'https://' + cleaned;
  }

  try {
    new URL(cleaned); // validate
  } catch {
    return null;
  }

  return `/out?u=${encodeURIComponent(cleaned)}`;
}

/** Check if a URL is a Google search URL (not a direct job posting). */
export function isBlockedUrl(url?: string | null): boolean {
  if (!url) return true;

  try {
    const parsed = new URL(url);
    return parsed.hostname.includes('google.com') && parsed.pathname.includes('/search');
  } catch {
    return url.includes('google.com/search');
  }
}

/** Get a safe job URL, returning null if blocked. */
export function getSafeJobUrl(url?: string | null): string | null {
  if (!url || isBlockedUrl(url)) return null;
  return url;
}
