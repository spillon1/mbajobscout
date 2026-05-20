import { useState } from 'react';
import { JobActionRecord } from '@/hooks/useJobActions';
import { CheckCircle2, XCircle, Undo2, ChevronDown, ChevronUp } from 'lucide-react';
import { getOutboundUrl } from '@/lib/urlSafety';

interface ApplicationsPanelProps {
  appliedJobs: JobActionRecord[];
  notInterestedJobs: JobActionRecord[];
  onRemove: (id: string) => void;
}

export function ApplicationsPanel({ appliedJobs, notInterestedJobs, onRemove }: ApplicationsPanelProps) {
  const [appliedOpen, setAppliedOpen] = useState(true);
  const [notInterestedOpen, setNotInterestedOpen] = useState(false);

  return (
    <div className="border border-border rounded-md bg-card overflow-hidden">
      {/* Applied section */}
      <button
        onClick={() => setAppliedOpen(!appliedOpen)}
        className="w-full flex items-center justify-between px-3 py-2.5 text-left hover:bg-muted/50 transition-colors"
      >
        <div className="flex items-center gap-2">
          <CheckCircle2 className="h-3.5 w-3.5 text-success" />
          <span className="font-display text-xs font-semibold uppercase tracking-wider text-foreground">
            Applied ({appliedJobs.length})
          </span>
        </div>
        {appliedOpen ? <ChevronUp className="h-3.5 w-3.5 text-muted-foreground" /> : <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />}
      </button>

      {appliedOpen && (
        <div className="border-t border-border">
          {appliedJobs.length === 0 ? (
            <p className="px-3 py-3 text-[11px] text-muted-foreground">No applications yet</p>
          ) : (
            <ul className="divide-y divide-border">
              {appliedJobs.map((job) => (
                <li key={job.id} className="px-3 py-2 flex items-start justify-between gap-2 group">
                  <div className="min-w-0">
                    <a
                      href={getOutboundUrl(job.job_url) ?? undefined}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-xs font-medium text-foreground truncate hover:text-primary hover:underline block"
                    >
                      {job.job_title}
                    </a>
                    <p className="text-[11px] text-muted-foreground truncate">{job.job_company} · {job.job_source}</p>
                  </div>
                  <button
                    onClick={() => onRemove(job.id)}
                    className="shrink-0 p-1 rounded text-muted-foreground hover:text-foreground hover:bg-muted transition-colors opacity-0 group-hover:opacity-100"
                    title="Remove from list (re-shows in results)"
                  >
                    <Undo2 className="h-3 w-3" />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {/* Not Interested section */}
      <button
        onClick={() => setNotInterestedOpen(!notInterestedOpen)}
        className="w-full flex items-center justify-between px-3 py-2.5 text-left border-t border-border hover:bg-muted/50 transition-colors"
      >
        <div className="flex items-center gap-2">
          <XCircle className="h-3.5 w-3.5 text-destructive" />
          <span className="font-display text-xs font-semibold uppercase tracking-wider text-foreground">
            Not Interested ({notInterestedJobs.length})
          </span>
        </div>
        {notInterestedOpen ? <ChevronUp className="h-3.5 w-3.5 text-muted-foreground" /> : <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />}
      </button>

      {notInterestedOpen && (
        <div className="border-t border-border">
          {notInterestedJobs.length === 0 ? (
            <p className="px-3 py-3 text-[11px] text-muted-foreground">No dismissed roles</p>
          ) : (
            <ul className="divide-y divide-border">
              {notInterestedJobs.map((job) => (
                <li key={job.id} className="px-3 py-2 flex items-start justify-between gap-2 group">
                  <div className="min-w-0">
                    <p className="text-xs font-medium text-foreground truncate">{job.job_title}</p>
                    <p className="text-[11px] text-muted-foreground truncate">{job.job_company} · {job.job_source}</p>
                  </div>
                  <button
                    onClick={() => onRemove(job.id)}
                    className="shrink-0 p-1 rounded text-muted-foreground hover:text-foreground hover:bg-muted transition-colors opacity-0 group-hover:opacity-100"
                    title="Remove from list (re-shows in results)"
                  >
                    <Undo2 className="h-3 w-3" />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
