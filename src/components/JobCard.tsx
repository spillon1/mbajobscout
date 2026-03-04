import { Job } from '@/types/jobs';
import { JobTypeBadge } from './JobTypeBadge';
import { ExternalLink, Building2, MapPin, Calendar, DollarSign, X } from 'lucide-react';

function formatPostedDate(dateStr?: string): string | null {
  if (!dateStr) return null;
  if (dateStr === 'Scraped just now') return 'Just now';
  try {
    const date = new Date(dateStr);
    if (isNaN(date.getTime())) return dateStr;
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
    if (diffDays < 1) return 'Today';
    if (diffDays === 1) return '1 day ago';
    if (diffDays < 30) return `${diffDays} days ago`;
    if (diffDays < 60) return '1 month ago';
    if (diffDays < 365) return `${Math.floor(diffDays / 30)} months ago`;
    return date.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
  } catch {
    return dateStr;
  }
}

export function JobCard({ job, onDismiss }: { job: Job; onDismiss?: (id: string) => void }) {
  // Extract real URL from Google redirect/search URLs
  const resolveUrl = (url: string): string | null => {
    try {
      const parsed = new URL(url);
      // Google redirect: extract destination from ?url= or ?q= params
      if (parsed.hostname.includes('google.com')) {
        const dest = parsed.searchParams.get('url') || parsed.searchParams.get('q');
        if (dest && dest.startsWith('http')) return dest;
        // Pure google.com/search with no extractable URL → unavailable
        if (parsed.pathname.includes('/search')) return null;
        return null;
      }
      return url;
    } catch {
      return url;
    }
  };

  const resolvedUrl = resolveUrl(job.url);
  const isAvailable = !!resolvedUrl;

  const handleClick = (event: React.MouseEvent<HTMLAnchorElement>) => {
    event.preventDefault();
    if (!isAvailable) return;
    // Use window.top for iframe breakout in preview environments
    try {
      const w = window.top || window;
      const a = w.document.createElement('a');
      a.href = resolvedUrl;
      a.target = '_blank';
      a.rel = 'noopener noreferrer';
      w.document.body.appendChild(a);
      a.click();
      w.document.body.removeChild(a);
    } catch {
      window.open(resolvedUrl, '_blank', 'noopener,noreferrer');
    }
  };

  return (
    <a
      href={resolvedUrl || '#'}
      target="_blank"
      rel="noopener noreferrer"
      referrerPolicy="no-referrer"
      onClick={handleClick}
      className={`block group border border-border rounded-md p-4 bg-card transition-all duration-200 animate-slide-in ${isAvailable ? 'hover:border-primary/40 hover:glow-primary cursor-pointer' : 'opacity-75 cursor-default'}`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <JobTypeBadge type={job.type} />
            <span className="text-[11px] font-display text-muted-foreground uppercase tracking-wider">{job.source}</span>
          </div>
          <h3 className="font-body font-semibold text-foreground truncate group-hover:text-primary transition-colors">
            {job.title}
          </h3>
          <div className="flex flex-wrap items-center gap-3 mt-1.5 text-sm text-muted-foreground">
            <span className="flex items-center gap-1">
              <Building2 className="h-3.5 w-3.5" />
              {job.company}
            </span>
            <span className="flex items-center gap-1">
              <MapPin className="h-3.5 w-3.5" />
              {job.location}
            </span>
            {formatPostedDate(job.postedDate) && (
              <span className="flex items-center gap-1">
                <Calendar className="h-3.5 w-3.5" />
                {formatPostedDate(job.postedDate)}
              </span>
            )}
            {job.salary && (
              <span className="flex items-center gap-1 text-accent">
                {job.salary}
              </span>
            )}
          </div>
          {job.description && (
            <p className="mt-2 text-sm text-muted-foreground line-clamp-2">{job.description}</p>
          )}
        </div>
        <div className="shrink-0 flex items-center gap-1">
          {onDismiss && (
            <button
              onClick={(e) => { e.preventDefault(); e.stopPropagation(); onDismiss(job.id); }}
              className="p-1.5 rounded-md text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors opacity-0 group-hover:opacity-100"
              title="Dismiss this listing"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          )}
          {isAvailable ? (
            <div className="p-2 rounded-md text-muted-foreground group-hover:text-primary transition-colors">
              <ExternalLink className="h-4 w-4" />
            </div>
          ) : (
            <span className="text-[10px] text-muted-foreground italic">Link unavailable</span>
          )}
        </div>
      </div>
    </a>
  );
}
