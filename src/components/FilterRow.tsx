import { JobType } from '@/types/jobs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { CheckboxFilter } from '@/components/CheckboxFilter';
import { CustomKeywordFilter } from '@/components/CustomKeywordFilter';
import { SlidersHorizontal } from 'lucide-react';

export type ListedPeriod = 'any' | '1d' | '1w' | '1m' | '3m' | '6m';
export type JobStatus = 'any' | 'open' | 'closed';

interface FilterRowProps {
  selectedType: JobType | 'any';
  onTypeChange: (type: JobType | 'any') => void;
  listedPeriod: ListedPeriod;
  onListedPeriodChange: (period: ListedPeriod) => void;
  jobStatus: JobStatus;
  onJobStatusChange: (status: JobStatus) => void;
  selectedCompanies: string[];
  onCompaniesChange: (companies: string[]) => void;
  selectedTitles: string[];
  onTitlesChange: (titles: string[]) => void;
  selectedSources: string[];
  onSourcesChange: (sources: string[]) => void;
  filterKeywords: string[];
  onAddFilterKeyword: (keyword: string) => void;
  onRemoveFilterKeyword: (keyword: string) => void;
  allCompanies: string[];
  allTitles: string[];
  allSources: string[];
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
  selectedCompanies,
  onCompaniesChange,
  selectedTitles,
  onTitlesChange,
  selectedSources,
  onSourcesChange,
  filterKeywords,
  onAddFilterKeyword,
  onRemoveFilterKeyword,
  allCompanies,
  allTitles,
  allSources,
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

      <CheckboxFilter
        label="Companies"
        options={allCompanies}
        selected={selectedCompanies}
        onChange={onCompaniesChange}
      />

      <CheckboxFilter
        label="Titles"
        options={allTitles}
        selected={selectedTitles}
        onChange={onTitlesChange}
      />

      <CheckboxFilter
        label="Sources"
        options={allSources}
        selected={selectedSources}
        onChange={onSourcesChange}
      />

      <CustomKeywordFilter
        customKeywords={filterKeywords}
        onAddKeyword={onAddFilterKeyword}
        onRemoveKeyword={onRemoveFilterKeyword}
      />
    </div>
  );
}
