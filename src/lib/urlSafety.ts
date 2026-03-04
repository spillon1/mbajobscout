export function isBlockedUrl(url?: string | null): boolean {
  if (!url) return true;

  try {
    const parsed = new URL(url);
    return parsed.hostname.includes('google.com') && parsed.pathname.includes('/search');
  } catch {
    return url.includes('google.com/search');
  }
}

export function getSafeJobUrl(url?: string | null): string | null {
  if (!url || isBlockedUrl(url)) return null;
  return url;
}

export function openExternal(url?: string | null): boolean {
  const safeUrl = getSafeJobUrl(url);
  if (!safeUrl) return false;

  try {
    const w = window.top || window;
    const a = w.document.createElement('a');
    a.href = safeUrl;
    a.target = '_blank';
    a.rel = 'noopener noreferrer';
    w.document.body.appendChild(a);
    a.click();
    w.document.body.removeChild(a);
    return true;
  } catch {
    window.open(safeUrl, '_blank', 'noopener,noreferrer');
    return true;
  }
}
