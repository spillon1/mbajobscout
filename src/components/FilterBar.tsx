import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Search, MapPin, SlidersHorizontal } from 'lucide-react';

interface FilterBarProps {
  searchQuery: string;
  onSearchChange: (q: string) => void;
  location: string;
  onLocationChange: (loc: string) => void;
  onSearch: () => void;
  isSearching: boolean;
}

export function FilterBar({
  searchQuery,
  onSearchChange,
  location,
  onLocationChange,
  onSearch,
  isSearching,
}: FilterBarProps) {
  return (
    <div className="border border-border rounded-md bg-card p-4">
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
    </div>
  );
}
