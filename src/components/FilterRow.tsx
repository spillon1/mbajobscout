import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { CheckboxFilter } from '@/components/CheckboxFilter';
import { CustomKeywordFilter } from '@/components/CustomKeywordFilter';
import { SlidersHorizontal, X } from 'lucide-react';
import { Seniority } from '@/types/jobs';
import { SUB_CATEGORIES, ScrapeMode, SECONDARY_FILTERS, TERTIARY_FILTERS } from '@/data/subCategories';

export type ListedPeriod = 'any' | '1d' | '1w' | '1m' | '3m' | '6m';
export type JobStatus = 'any' | 'open' | 'closed';
export type SortOption = 'date-desc' | 'date-asc' | 'company-asc' | 'title-asc';
export type DatePostedFilter = 'all' | 'with-date' | 'without-date';

interface FilterRowProps {
  listedPeriod: ListedPeriod;
  onListedPeriodChange: (period: ListedPeriod) => void;
  sortBy: SortOption;
  onSortByChange: (sort: SortOption) => void;
  datePostedFilter: DatePostedFilter;
  onDatePostedFilterChange: (filter: DatePostedFilter) => void;
  selectedSeniorities: Seniority[];
  onSenioritiesChange: (seniorities: Seniority[]) => void;
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
  onClearFilters?: () => void;
  // Sub-category filter
  mode?: ScrapeMode;
  selectedSubCategories?: string[];
  onSubCategoriesChange?: (cats: string[]) => void;
  // Secondary filter (asset class for S&T, strategy for PE, etc.)
  selectedSecondaryFilter?: string[];
  onSecondaryFilterChange?: (values: string[]) => void;
  // Tertiary filter (firm type for PE)
  selectedTertiaryFilter?: string[];
  onTertiaryFilterChange?: (values: string[]) => void;
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

const DATE_POSTED_OPTIONS: { value: DatePostedFilter; label: string }[] = [
  { value: 'all', label: 'All Roles' },
  { value: 'with-date', label: 'With Date' },
  { value: 'without-date', label: 'Without Date' },
];

const SENIORITY_OPTIONS = ['intern', 'junior', 'graduate', 'mid', 'senior', 'unknown'] as const;
const SENIORITY_LABELS: Record<string, string> = {
  intern: 'Intern',
  junior: 'Junior / Entry',
  graduate: 'Graduate',
  mid: 'Mid-level',
  senior: 'Senior / Lead',
  unknown: 'Unclassified',
};

export function FilterRow({
  listedPeriod,
  onListedPeriodChange,
  sortBy,
  onSortByChange,
  datePostedFilter,
  onDatePostedFilterChange,
  selectedSeniorities,
  onSenioritiesChange,
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
  onClearFilters,
  mode,
  selectedSubCategories,
  onSubCategoriesChange,
  selectedSecondaryFilter,
  onSecondaryFilterChange,
}: FilterRowProps) {
  const subCats = mode ? SUB_CATEGORIES[mode] || [] : [];
  const secondaryFilter = mode ? SECONDARY_FILTERS[mode] : undefined;

  const hasActiveFilters =
    listedPeriod !== 'any' ||
    datePostedFilter !== 'all' ||
    selectedSeniorities.length > 0 ||
    selectedCompanies.length > 0 ||
    selectedTitles.length > 0 ||
    selectedSources.length > 0 ||
    filterKeywords.length > 0 ||
    (selectedSubCategories && selectedSubCategories.length > 0) ||
    (selectedSecondaryFilter && selectedSecondaryFilter.length > 0);

  return (
    <div className="flex items-center gap-2 flex-wrap">
      <SlidersHorizontal className="h-3.5 w-3.5 text-muted-foreground" />
      <span className="text-[11px] font-display text-muted-foreground uppercase tracking-wider mr-1">Filters:</span>

      {subCats.length > 0 && onSubCategoriesChange && (
        <CheckboxFilter
          label="Role Type"
          options={subCats.map((c) => c.label)}
          selected={(selectedSubCategories || []).map((val) => subCats.find((c) => c.value === val)?.label || val)}
          onChange={(labels) => {
            const values = labels.map((l) => subCats.find((c) => c.label === l)?.value || l);
            onSubCategoriesChange(values);
          }}
        />
      )}

      {secondaryFilter && onSecondaryFilterChange && (
        <CheckboxFilter
          label={secondaryFilter.label}
          options={secondaryFilter.options.map((c) => c.label)}
          selected={(selectedSecondaryFilter || []).map((val) => secondaryFilter.options.find((c) => c.value === val)?.label || val)}
          onChange={(labels) => {
            const values = labels.map((l) => secondaryFilter.options.find((c) => c.label === l)?.value || l);
            onSecondaryFilterChange(values);
          }}
        />
      )}

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

      <Select value={datePostedFilter} onValueChange={(v) => onDatePostedFilterChange(v as DatePostedFilter)}>
        <SelectTrigger className="h-7 w-[130px] text-xs font-display bg-card border-border">
          <SelectValue placeholder="Date Posted" />
        </SelectTrigger>
        <SelectContent>
          {DATE_POSTED_OPTIONS.map((opt) => (
            <SelectItem key={opt.value} value={opt.value} className="text-xs">
              {opt.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <CheckboxFilter
        label="Seniority"
        options={SENIORITY_OPTIONS.map(s => SENIORITY_LABELS[s])}
        selected={selectedSeniorities.map(s => SENIORITY_LABELS[s])}
        onChange={(labels) => {
          const reversed = Object.fromEntries(Object.entries(SENIORITY_LABELS).map(([k, v]) => [v, k]));
          onSenioritiesChange(labels.map(l => reversed[l] as Seniority));
        }}
      />

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

      {hasActiveFilters && onClearFilters && (
        <button
          onClick={onClearFilters}
          className="flex items-center gap-1 h-7 px-2.5 text-xs font-display rounded-md border border-destructive/30 text-destructive hover:bg-destructive/10 transition-colors"
        >
          <X className="h-3 w-3" />
          Clear
        </button>
      )}
    </div>
  );
}
