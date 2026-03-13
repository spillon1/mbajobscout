import { useState, useRef, useEffect } from 'react';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import { ChevronDown, Search } from 'lucide-react';

interface CheckboxFilterProps {
  label: string;
  options: string[];
  selected: string[];
  onChange: (selected: string[]) => void;
  preserveOrder?: boolean;
}

export function CheckboxFilter({ label, options, selected, onChange, preserveOrder }: CheckboxFilterProps) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const searched = options.filter((o) => o.toLowerCase().includes(search.toLowerCase()));
  const filtered = preserveOrder ? searched : searched.sort((a, b) => a.localeCompare(b));

  const allSelected = selected.length === 0;
  const displayLabel = allSelected
    ? `All ${label}`
    : selected.length === 1
    ? selected[0]
    : `${selected.length} ${label}`;

  const handleToggle = (option: string) => {
    onChange(
      selected.includes(option)
        ? selected.filter((s) => s !== option)
        : [...selected, option]
    );
  };

  const handleSelectAll = () => onChange([]);

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center gap-1.5 h-7 px-3 rounded-md border border-border bg-card text-xs font-display hover:border-primary/40 transition-colors"
      >
        <span className="truncate max-w-[120px]">{displayLabel}</span>
        <ChevronDown className={`h-3 w-3 text-muted-foreground transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && (
        <div className="absolute top-full left-0 mt-1 z-50 w-56 rounded-md border border-border bg-card shadow-lg animate-slide-in">
          <div className="p-2 border-b border-border">
            <div className="relative">
              <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3 w-3 text-muted-foreground" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder={`Search ${label.toLowerCase()}...`}
                className="h-7 pl-7 text-xs bg-muted border-border"
                autoFocus
              />
            </div>
          </div>

          <div className="max-h-48 overflow-y-auto p-1">
            <label
              className="flex items-center gap-2 px-2 py-1.5 rounded-sm hover:bg-muted cursor-pointer text-xs"
              onClick={handleSelectAll}
            >
              <Checkbox checked={allSelected} onCheckedChange={handleSelectAll} className="h-3.5 w-3.5" />
              <span className="text-muted-foreground italic">Select All</span>
            </label>

            {filtered.length === 0 ? (
              <div className="px-2 py-3 text-xs text-muted-foreground text-center">No matches</div>
            ) : (
              filtered.map((option) => (
                <label
                  key={option}
                  className="flex items-center gap-2 px-2 py-1.5 rounded-sm hover:bg-muted cursor-pointer text-xs"
                >
                  <Checkbox
                    checked={selected.includes(option)}
                    onCheckedChange={() => handleToggle(option)}
                    className="h-3.5 w-3.5"
                  />
                  <span className="truncate">{option}</span>
                </label>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}
