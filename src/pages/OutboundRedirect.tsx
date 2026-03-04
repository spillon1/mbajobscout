import { useEffect, useState } from 'react';
import { Copy, Check, ExternalLink } from 'lucide-react';

/**
 * Outbound redirect page — strips referrer/opener context so destination
 * sites never see the Lovable preview origin, eliminating ERR_BLOCKED_BY_RESPONSE.
 */
export default function OutboundRedirect() {
  const [url, setUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const raw = params.get('u');

    if (!raw) {
      setError('No URL provided');
      return;
    }

    const validated = validateAndNormalise(raw);
    if (!validated) {
      setError('Invalid or unsafe URL');
      return;
    }

    setUrl(validated);

    // Redirect after a tiny delay so the meta referrer tag is active
    const timer = setTimeout(() => {
      window.location.replace(validated);
    }, 100);

    return () => clearTimeout(timer);
  }, []);

  const handleCopy = async () => {
    if (!url) return;
    await navigator.clipboard.writeText(url);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <>
      {/* Strip referrer at the document level */}
      <meta name="referrer" content="no-referrer" />

      <div className="min-h-screen bg-background flex items-center justify-center p-4">
        <div className="text-center space-y-4 max-w-md">
          {error ? (
            <>
              <p className="text-destructive font-semibold">{error}</p>
              <a
                href="/"
                className="text-sm text-primary hover:underline"
              >
                ← Back to VCScout
              </a>
            </>
          ) : (
            <>
              <div className="animate-pulse">
                <ExternalLink className="h-8 w-8 text-primary mx-auto mb-2" />
                <p className="text-foreground font-display text-sm">Redirecting…</p>
              </div>

              {url && (
                <div className="space-y-3 pt-4">
                  <p className="text-xs text-muted-foreground">
                    If you are not redirected automatically:
                  </p>

                  <a
                    href={url}
                    target="_blank"
                    rel="noopener noreferrer"
                    referrerPolicy="no-referrer"
                    className="inline-flex items-center gap-1.5 rounded-md border border-border px-3 py-2 text-sm font-medium text-foreground hover:bg-muted transition-colors"
                  >
                    <ExternalLink className="h-3.5 w-3.5" />
                    Continue to site
                  </a>

                  <div>
                    <button
                      onClick={handleCopy}
                      className="inline-flex items-center gap-1.5 rounded-md border border-border px-3 py-2 text-xs text-muted-foreground hover:bg-muted transition-colors"
                    >
                      {copied ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
                      {copied ? 'Copied!' : 'Copy link'}
                    </button>
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </>
  );
}

/** Validate and normalise a URL for safe external navigation. */
function validateAndNormalise(raw: string): string | null {
  let cleaned = raw.trim();

  if (!cleaned) return null;

  // Block dangerous schemes
  if (/^(javascript|data|vbscript|blob):/i.test(cleaned)) return null;

  // Add https:// if missing
  if (/^www\./i.test(cleaned)) {
    cleaned = 'https://' + cleaned;
  } else if (!/^https?:\/\//i.test(cleaned)) {
    cleaned = 'https://' + cleaned;
  }

  try {
    const parsed = new URL(cleaned);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return null;
    return parsed.href;
  } catch {
    return null;
  }
}
