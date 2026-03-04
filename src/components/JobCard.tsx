import { Job } from '@/types/jobs';
import { JobTypeBadge } from './JobTypeBadge';
import { ExternalLink, Building2, MapPin, Clock, DollarSign } from 'lucide-react';

export function JobCard({ job }: { job: Job }) {
  return (
    <div className="group border border-border rounded-md p-4 bg-card hover:border-primary/40 hover:glow-primary transition-all duration-200 animate-slide-in">
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
            {job.postedDate && (
              <span className="flex items-center gap-1">
                <Clock className="h-3.5 w-3.5" />
                {job.postedDate}
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
            <p className="mt-2 text-sm text-secondary-foreground/70 line-clamp-2">{job.description}</p>
          )}
        </div>
        <a
          href={job.url}
          target="_blank"
          rel="noopener noreferrer"
          className="shrink-0 p-2 rounded-md text-muted-foreground hover:text-primary hover:bg-primary/10 transition-colors"
        >
          <ExternalLink className="h-4 w-4" />
        </a>
      </div>
    </div>
  );
}
