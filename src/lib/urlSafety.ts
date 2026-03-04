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

/** Check if a URL is blocked (no longer blocks Google search URLs — /out redirector handles CSP). */
export function isBlockedUrl(url?: string | null): boolean {
  if (!url) return true;
  return false;
}

/** Get a safe job URL, returning null if blocked. */
export function getSafeJobUrl(url?: string | null): string | null {
  if (!url || isBlockedUrl(url)) return null;
  return url;
}
