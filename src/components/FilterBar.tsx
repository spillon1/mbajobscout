import { JobType } from '@/types/jobs';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Search, MapPin, SlidersHorizontal } from 'lucide-react';

interface FilterBarProps {
  searchQuery: string;
  onSearchChange: (q: string) => void;
  location: string;
  onLocationChange: (loc: string) => void;
  selectedTypes: JobType[];
  onTypeToggle: (type: JobType) => void;
  onSearch: () => void;
  isSearching: boolean;
}

const JOB_TYPES: { value: JobType; label: string }[] = [
  { value: 'full-time', label: 'Full Time' },
  { value: 'internship', label: 'Internship' },
  { value: 'graduate', label: 'Graduate' },
];

export function FilterBar({
  searchQuery,
  onSearchChange,
  location,
  onLocationChange,
  selectedTypes,
  onTypeToggle,
  onSearch,
  isSearching,
}: FilterBarProps) {
  return (
    <div className="border border-border rounded-md bg-card p-4 space-y-3">
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            value={searchQuery}
            onChange={(e) => onSearchChange(e.target.value)}
            placeholder="Search jobs..."
            className="pl-9 bg-muted border-border font-body"
          />
        </div>
        <div className="relative w-full sm:w-56">
          <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            value={location}
            onChange={(e) => onLocationChange(e.target.value)}
            placeholder="Location"
            className="pl-9 bg-muted border-border font-body"
          />
        </div>
        <Button onClick={onSearch} disabled={isSearching} className="font-display text-xs uppercase tracking-wider">
          {isSearching ? (
            <span className="flex items-center gap-2">
              <span className="h-3 w-3 border-2 border-primary-foreground/30 border-t-primary-foreground rounded-full animate-spin" />
              Scanning...
            </span>
          ) : (
            <span className="flex items-center gap-2">
              <SlidersHorizontal className="h-3.5 w-3.5" />
              Search
            </span>
          )}
        </Button>
      </div>
      <div className="flex items-center gap-2">
        <span className="text-[11px] font-display text-muted-foreground uppercase tracking-wider mr-1">Type:</span>
        {JOB_TYPES.map(({ value, label }) => {
          const active = selectedTypes.includes(value);
          return (
            <button
              key={value}
              onClick={() => onTypeToggle(value)}
              className={`px-3 py-1 rounded-sm text-[11px] font-display uppercase tracking-wider border transition-colors ${
                active
                  ? 'bg-primary/15 text-primary border-primary/40'
                  : 'bg-transparent text-muted-foreground border-border hover:border-muted-foreground/30'
              }`}
            >
              {label}
            </button>
          );
        })}
      </div>
    </div>
  );
}
