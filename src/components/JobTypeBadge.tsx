import { Badge } from '@/components/ui/badge';
import { JobType } from '@/types/jobs';

const typeConfig: Record<JobType, { label: string; className: string }> = {
  'full-time': { label: 'Full Time', className: 'bg-primary/10 text-primary border-primary/25' },
  'internship': { label: 'Internship', className: 'bg-warning/10 text-warning border-warning/25' },
  'graduate': { label: 'Graduate', className: 'bg-accent/10 text-accent border-accent/25' },
  'unknown': { label: 'Unknown', className: 'bg-muted text-muted-foreground border-border' },
};

export function JobTypeBadge({ type }: { type: JobType }) {
  const config = typeConfig[type];
  return (
    <Badge variant="outline" className={`font-display text-[10px] uppercase tracking-wider ${config.className}`}>
      {config.label}
    </Badge>
  );
}
