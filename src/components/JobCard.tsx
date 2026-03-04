import { Job } from '@/types/jobs';
import { JobTypeBadge } from './JobTypeBadge';
import { ExternalLink, Building2, MapPin, Calendar, DollarSign } from 'lucide-react';

const FRAME_BLOCKED_DOMAINS = ['venturecapitalcareers.com'];

function formatPostedDate(dateStr?: string): string | null {
  if (!dateStr || dateStr === 'Scraped just now') return null;
  try {
    const date = new Date(dateStr);
    if (isNaN(date.getTime())) return dateStr;
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
    if (diffDays < 1) return 'Today';
    if (diffDays === 1) return 'Yesterday';
    if (diffDays < 7) return `${diffDays}d ago`;
    if (diffDays < 30) return `${Math.floor(diffDays / 7)}w ago`;
    if (diffDays < 365) return `${Math.floor(diffDays / 30)}mo ago`;
    return date.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
  } catch {
    return dateStr;
  }
}

function isFrameBlockedUrl(url: string): boolean {
  try {
    const { hostname } = new URL(url);
    return FRAME_BLOCKED_DOMAINS.some(
      (domain) => hostname === domain || hostname.endsWith(`.${domain}`)
    );
  } catch {
    return false;
  }
}

function openExternalLink(url: string, forceTopLevel: boolean) {
  const popup = window.open('about:blank', '_blank', 'noopener,noreferrer');
  if (popup) {
    popup.opener = null;
    popup.location.replace(url);
    return;
  }

  if (forceTopLevel) {
    window.top?.location.assign(url);
    return;
  }

  window.location.assign(url);
}

export function JobCard({ job }: { job: Job }) {
  const handleClick = (event: React.MouseEvent<HTMLAnchorElement>) => {
    event.preventDefault();
    openExternalLink(job.url, isFrameBlockedUrl(job.url));
  };

  return (
    <a
      href={job.url}
      target="_blank"
      rel="noopener noreferrer"
      referrerPolicy="no-referrer"
      onClick={handleClick}
      className="block group border border-border rounded-md p-4 bg-card hover:border-primary/40 hover:glow-primary transition-all duration-200 animate-slide-in cursor-pointer"
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
                <DollarSign className="h-3.5 w-3.5" />
                {job.salary}
              </span>
            )}
          </div>
          {job.description && (
            <p className="mt-2 text-sm text-muted-foreground line-clamp-2">{job.description}</p>
          )}
        </div>
        <div className="shrink-0 p-2 rounded-md text-muted-foreground group-hover:text-primary transition-colors">
          <ExternalLink className="h-4 w-4" />
        </div>
      </div>
    </a>
  );
}
