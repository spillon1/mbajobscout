import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { CheckboxFilter } from '@/components/CheckboxFilter';
import { CustomKeywordFilter } from '@/components/CustomKeywordFilter';
import { SlidersHorizontal } from 'lucide-react';

export type ListedPeriod = 'any' | '1d' | '1w' | '1m' | '3m' | '6m';
export type JobStatus = 'any' | 'open' | 'closed';
export type SortOption = 'date-desc' | 'date-asc' | 'company-asc' | 'title-asc';

interface FilterRowProps {
  listedPeriod: ListedPeriod;
  onListedPeriodChange: (period: ListedPeriod) => void;
  sortBy: SortOption;
  onSortByChange: (sort: SortOption) => void;
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

const LISTED_OPTIONS: { value: ListedPeriod; label: string }[] = [
  { value: 'any', label: 'Any Time' },
  { value: '1d', label: 'Past 24 Hours' },
  { value: '1w', label: 'Past Week' },
  { value: '1m', label: 'Past Month' },
  { value: '3m', label: 'Past 3 Months' },
  { value: '6m', label: 'Past 6 Months' },
];

const SORT_OPTIONS: { value: SortOption; label: string }[] = [
  { value: 'date-desc', label: 'Newest First' },
  { value: 'date-asc', label: 'Oldest First' },
  { value: 'company-asc', label: 'Company A–Z' },
  { value: 'title-asc', label: 'Title A–Z' },
];

export function FilterRow({
  listedPeriod,
  onListedPeriodChange,
  sortBy,
  onSortByChange,
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

      <CheckboxFilter
        label="Sources"
        options={allSources}
        selected={selectedSources}
        onChange={onSourcesChange}
      />

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

      <CustomKeywordFilter
        customKeywords={filterKeywords}
        onAddKeyword={onAddFilterKeyword}
        onRemoveKeyword={onRemoveFilterKeyword}
      />

      <div className="ml-auto flex items-center gap-1.5">
        <span className="text-[11px] font-display text-muted-foreground uppercase tracking-wider">Sort:</span>
        <Select value={sortBy} onValueChange={(v) => onSortByChange(v as SortOption)}>
          <SelectTrigger className="h-7 w-[140px] text-xs font-display bg-card border-border">
            <SelectValue placeholder="Sort by" />
          </SelectTrigger>
          <SelectContent>
            {SORT_OPTIONS.map((opt) => (
              <SelectItem key={opt.value} value={opt.value} className="text-xs">
                {opt.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    </div>
  );
}
