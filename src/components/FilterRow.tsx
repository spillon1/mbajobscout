import { JobType } from '@/types/jobs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { SlidersHorizontal } from 'lucide-react';

export type ListedPeriod = 'any' | '1d' | '1w' | '1m' | '3m' | '6m' | '1y';
export type JobStatus = 'any' | 'open' | 'closed';

interface FilterRowProps {
  selectedType: JobType | 'any';
  onTypeChange: (type: JobType | 'any') => void;
  listedPeriod: ListedPeriod;
  onListedPeriodChange: (period: ListedPeriod) => void;
  jobStatus: JobStatus;
  onJobStatusChange: (status: JobStatus) => void;
  companyFilter: string;
  onCompanyFilterChange: (company: string) => void;
  titleFilter: string;
  onTitleFilterChange: (title: string) => void;
}

const TYPE_OPTIONS: { value: JobType | 'any'; label: string }[] = [
  { value: 'any', label: 'All Types' },
  { value: 'full-time', label: 'Full Time' },
  { value: 'internship', label: 'Internship' },
  { value: 'graduate', label: 'Graduate' },
];

const LISTED_OPTIONS: { value: ListedPeriod; label: string }[] = [
  { value: 'any', label: 'Any Time' },
  { value: '1d', label: 'Past 24 Hours' },
  { value: '1w', label: 'Past Week' },
  { value: '1m', label: 'Past Month' },
  { value: '3m', label: 'Past 3 Months' },
  { value: '6m', label: 'Past 6 Months' },
  { value: '1y', label: 'Past Year' },
];

const STATUS_OPTIONS: { value: JobStatus; label: string }[] = [
  { value: 'any', label: 'Any Status' },
  { value: 'open', label: 'Open' },
  { value: 'closed', label: 'Closed' },
];

export function FilterRow({
  selectedType,
  onTypeChange,
  listedPeriod,
  onListedPeriodChange,
  jobStatus,
  onJobStatusChange,
  companyFilter,
  onCompanyFilterChange,
  titleFilter,
  onTitleFilterChange,
}: FilterRowProps) {
  return (
    <div className="flex items-center gap-2 flex-wrap">
      <SlidersHorizontal className="h-3.5 w-3.5 text-muted-foreground" />
      <span className="text-[11px] font-display text-muted-foreground uppercase tracking-wider mr-1">Filters:</span>

      <Select value={selectedType} onValueChange={(v) => onTypeChange(v as JobType | 'any')}>
        <SelectTrigger className="h-7 w-[130px] text-xs font-display bg-card border-border">
          <SelectValue placeholder="Type" />
        </SelectTrigger>
        <SelectContent>
          {TYPE_OPTIONS.map((opt) => (
            <SelectItem key={opt.value} value={opt.value} className="text-xs">
              {opt.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Select value={listedPeriod} onValueChange={(v) => onListedPeriodChange(v as ListedPeriod)}>
        <SelectTrigger className="h-7 w-[140px] text-xs font-display bg-card border-border">
          <SelectValue placeholder="Listed" />
        </SelectTrigger>
        <SelectContent>
          {LISTED_OPTIONS.map((opt) => (
            <SelectItem key={opt.value} value={opt.value} className="text-xs">
              {opt.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Select value={jobStatus} onValueChange={(v) => onJobStatusChange(v as JobStatus)}>
        <SelectTrigger className="h-7 w-[120px] text-xs font-display bg-card border-border">
          <SelectValue placeholder="Status" />
        </SelectTrigger>
        <SelectContent>
          {STATUS_OPTIONS.map((opt) => (
            <SelectItem key={opt.value} value={opt.value} className="text-xs">
              {opt.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Input
        value={companyFilter}
        onChange={(e) => onCompanyFilterChange(e.target.value)}
        placeholder="Company..."
        className="h-7 w-[130px] text-xs font-display bg-card border-border"
      />

      <Input
        value={titleFilter}
        onChange={(e) => onTitleFilterChange(e.target.value)}
        placeholder="Title..."
        className="h-7 w-[130px] text-xs font-display bg-card border-border"
      />
    </div>
  );
}
