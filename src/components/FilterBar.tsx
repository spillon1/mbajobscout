import { useState, useRef, useEffect } from 'react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { MapPin, Loader2 } from 'lucide-react';

interface FilterBarProps {
  location: string;
  onLocationChange: (loc: string) => void;
  onSearch: () => void;
  isSearching: boolean;
}

const SUGGESTED_LOCATIONS = [
  'London, United Kingdom',
  'Manchester, United Kingdom',
  'Birmingham, United Kingdom',
  'Edinburgh, United Kingdom',
  'Bristol, United Kingdom',
  'Cambridge, United Kingdom',
  'Oxford, United Kingdom',
  'New York, United States',
  'San Francisco, United States',
  'Boston, United States',
  'Berlin, Germany',
  'Paris, France',
  'Amsterdam, Netherlands',
  'Singapore',
  'Hong Kong',
  'Dubai, UAE',
  'Remote',
];

export function FilterBar({ location, onLocationChange, onSearch, isSearching }: FilterBarProps) {
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [search, setSearch] = useState(location);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setShowSuggestions(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const filtered = SUGGESTED_LOCATIONS.filter((l) =>
    l.toLowerCase().includes(search.toLowerCase())
  );

  const handleSelect = (loc: string) => {
    setSearch(loc);
    onLocationChange(loc);
    setShowSuggestions(false);
  };

  return (
    <div className="flex items-center gap-2">
      <div ref={ref} className="relative w-64">
        <MapPin className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
        <Input
          value={search}
          onChange={(e) => {
            setSearch(e.target.value);
            setShowSuggestions(true);
          }}
          onFocus={() => setShowSuggestions(true)}
          placeholder="Location..."
          className="pl-8 h-8 text-xs bg-muted border-border font-body"
        />
        {showSuggestions && (
          <div className="absolute top-full left-0 right-0 mt-1 z-50 rounded-md border border-border bg-card shadow-lg max-h-48 overflow-y-auto animate-slide-in">
            {filtered.length === 0 ? (
              <button
                className="w-full text-left px-3 py-2 text-xs text-muted-foreground hover:bg-muted"
                onClick={() => handleSelect(search)}
              >
                Use "{search}"
              </button>
            ) : (
              filtered.map((loc) => (
                <button
                  key={loc}
                  className="w-full text-left px-3 py-2 text-xs hover:bg-muted transition-colors"
                  onClick={() => handleSelect(loc)}
                >
                  {loc}
                </button>
              ))
            )}
          </div>
        )}
      </div>
      <Button onClick={onSearch} disabled={isSearching} size="sm" className="font-display text-[10px] uppercase tracking-wider h-8 px-6">
        {isSearching ? (
          <span className="flex items-center gap-1.5">
            <Loader2 className="h-3 w-3 animate-spin" />
            Scraping
          </span>
        ) : (
          'Scrape'
        )}
      </Button>
    </div>
  );
}
