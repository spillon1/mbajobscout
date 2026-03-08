import { useState, useRef } from 'react';
import { Job } from '@/types/jobs';
import { JobTypeBadge } from './JobTypeBadge';
import { ExternalLink, Building2, MapPin, Calendar, X, Copy, Check, CheckCircle2, Bookmark } from 'lucide-react';
import { isBlockedUrl, getOutboundUrl } from '@/lib/urlSafety';

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

const SWIPE_THRESHOLD = 140;

interface JobCardProps {
  job: Job;
  onApplied?: (job: Job) => void;
  onNotInterested?: (job: Job) => void;
}

export function JobCard({ job, onApplied, onNotInterested }: JobCardProps) {
  const [copied, setCopied] = useState(false);
  const [swipeX, setSwipeX] = useState(0);
  const [isSwiping, setIsSwiping] = useState(false);
  const touchStartRef = useRef<{ x: number; y: number; time: number } | null>(null);
  const hasSwipedRef = useRef(false);

  const hasBlockedJobUrl = isBlockedUrl(job.jobUrl);
  const hasDirectJobUrl = !!job.jobUrl && !hasBlockedJobUrl;
  const outboundUrl = hasDirectJobUrl ? getOutboundUrl(job.jobUrl) : null;
  const canCopySearchLink = !!job.sourceUrl;

  const handleCopySearchLink = async (event: React.MouseEvent<HTMLButtonElement>) => {
    event.preventDefault();
    event.stopPropagation();
    const searchQuery = encodeURIComponent(`${job.title} ${job.company}`);
    const searchLink = `https://www.google.com/search?udm=8&q=${searchQuery}`;
    await navigator.clipboard.writeText(searchLink);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1500);
  };

  const handleTouchStart = (e: React.TouchEvent) => {
    touchStartRef.current = {
      x: e.touches[0].clientX,
      y: e.touches[0].clientY,
      time: Date.now(),
    };
    hasSwipedRef.current = false;
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    if (!touchStartRef.current) return;
    const dx = e.touches[0].clientX - touchStartRef.current.x;
    const dy = e.touches[0].clientY - touchStartRef.current.y;

    // If vertical scroll is dominant, cancel swipe
    if (!isSwiping && Math.abs(dy) > Math.abs(dx)) {
      touchStartRef.current = null;
      return;
    }

    if (Math.abs(dx) > 10) {
      setIsSwiping(true);
      setSwipeX(dx);
    }
  };

  const handleTouchEnd = () => {
    if (swipeX > SWIPE_THRESHOLD && onApplied) {
      hasSwipedRef.current = true;
      onApplied(job);
    } else if (swipeX < -SWIPE_THRESHOLD && onNotInterested) {
      hasSwipedRef.current = true;
      onNotInterested(job);
    }
    setSwipeX(0);
    setIsSwiping(false);
    touchStartRef.current = null;
  };

  const swipeProgress = Math.min(Math.abs(swipeX) / SWIPE_THRESHOLD, 1);
  const isSwipingRight = swipeX > 0;
  const isSwipingLeft = swipeX < 0;

  return (
    <div className="relative overflow-hidden rounded-md">
      {/* Swipe background indicators */}
      {isSwiping && isSwipingRight && (
        <div
          className="absolute inset-0 flex items-center pl-4 rounded-md bg-success/20 z-0"
          style={{ opacity: swipeProgress }}
        >
          <CheckCircle2 className="h-6 w-6 text-success" />
          <span className="ml-2 font-display text-xs uppercase tracking-wider text-success font-bold">Applied</span>
        </div>
      )}
      {isSwiping && isSwipingLeft && (
        <div
          className="absolute inset-0 flex items-center justify-end pr-4 rounded-md bg-destructive/20 z-0"
          style={{ opacity: swipeProgress }}
        >
          <span className="mr-2 font-display text-xs uppercase tracking-wider text-destructive font-bold">Pass</span>
          <X className="h-6 w-6 text-destructive" />
        </div>
      )}

      <a
        href={outboundUrl || undefined}
        target="_blank"
        rel="noopener noreferrer"
        className={`group block border border-border rounded-md p-4 bg-card transition-all duration-200 animate-slide-in no-underline relative z-10 ${
          hasDirectJobUrl ? 'hover:border-primary/40 hover:glow-primary cursor-pointer' : 'opacity-90 pointer-events-auto cursor-default'
        }`}
        style={{
          transform: isSwiping ? `translateX(${swipeX}px)` : undefined,
          transition: isSwiping ? 'none' : 'transform 0.3s ease-out',
        }}
        onClick={(e) => {
          if (hasSwipedRef.current) {
            e.preventDefault();
            return;
          }
          if (!hasDirectJobUrl) e.preventDefault();
        }}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
      >
        <div className="flex items-start justify-between gap-3">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1">
              <JobTypeBadge type={job.type} />
              <span className="text-[11px] font-display text-muted-foreground uppercase tracking-wider">{job.source}</span>
            </div>
            <h3 className="font-body font-semibold text-foreground transition-colors group-hover:text-primary">
              {job.title}
              {hasDirectJobUrl && <ExternalLink className="inline h-3.5 w-3.5 ml-1.5 opacity-0 group-hover:opacity-100 transition-opacity" />}
            </h3>
            <div className="flex flex-wrap items-center gap-3 mt-1.5 text-sm text-muted-foreground">
              <span className="flex items-center gap-1 font-semibold text-foreground/80">
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
              {job.salary && <span className="text-accent">{job.salary}</span>}
            </div>
            {job.description && (
              <p className="mt-2 text-sm text-muted-foreground line-clamp-2">{job.description}</p>
            )}

            {!hasDirectJobUrl && (
              <div className="mt-3 flex flex-wrap items-center gap-2">
                <p className="text-[11px] text-muted-foreground">Direct job posting unavailable</p>
                {canCopySearchLink && (
                  <button
                    onClick={handleCopySearchLink}
                    className="inline-flex items-center gap-1 rounded-md border border-border px-2 py-1 text-[11px] text-foreground transition-colors hover:bg-muted"
                  >
                    {copied ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
                    {copied ? 'Copied' : 'Copy search link'}
                  </button>
                )}
              </div>
            )}
          </div>

          {/* Action buttons - desktop only */}
          <div className="shrink-0 hidden sm:flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
            {onNotInterested && (
              <button
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  onNotInterested(job);
                }}
                className="p-1.5 rounded-md text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors"
                title="Not interested"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            )}
            {onApplied && (
              <button
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  onApplied(job);
                }}
                className="p-1.5 rounded-md text-muted-foreground hover:text-success hover:bg-success/10 transition-colors"
                title="Mark as Applied"
              >
                <CheckCircle2 className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
        </div>
      </a>
    </div>
  );
}
