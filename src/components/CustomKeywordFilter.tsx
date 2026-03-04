import { useState, useRef, useEffect } from 'react';
import { Input } from '@/components/ui/input';
import { ChevronDown, Search, Plus, X } from 'lucide-react';

interface CustomKeywordFilterProps {
  customKeywords: string[];
  onAddKeyword: (keyword: string) => void;
  onRemoveKeyword: (keyword: string) => void;
}

export function CustomKeywordFilter({ customKeywords, onAddKeyword, onRemoveKeyword }: CustomKeywordFilterProps) {
  const [open, setOpen] = useState(false);
  const [newKeyword, setNewKeyword] = useState('');
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const handleAdd = () => {
    const trimmed = newKeyword.trim();
    if (trimmed && !customKeywords.includes(trimmed)) {
      onAddKeyword(trimmed);
      setNewKeyword('');
    }
  };

  const displayLabel = customKeywords.length === 0
    ? 'Keywords'
    : customKeywords.length === 1
    ? customKeywords[0]
    : `${customKeywords.length} keywords`;

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
        <div className="absolute top-full left-0 mt-1 z-50 w-64 rounded-md border border-border bg-card shadow-lg animate-slide-in">
          <div className="p-2 border-b border-border">
            <div className="flex gap-1.5">
              <Input
                value={newKeyword}
                onChange={(e) => setNewKeyword(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') handleAdd(); }}
                placeholder="Add keyword..."
                className="h-7 text-xs bg-muted border-border flex-1"
                autoFocus
              />
              <button
                onClick={handleAdd}
                className="h-7 px-2 rounded-md border border-border bg-muted text-xs hover:border-primary/40 hover:text-primary transition-colors"
              >
                <Plus className="h-3 w-3" />
              </button>
            </div>
            <p className="text-[10px] text-muted-foreground mt-1.5">Matches anywhere in the job ad</p>
          </div>

          <div className="max-h-48 overflow-y-auto p-1">
            {customKeywords.length === 0 ? (
              <div className="px-2 py-3 text-xs text-muted-foreground text-center">No keywords added</div>
            ) : (
              customKeywords.map((kw) => (
                <div
                  key={kw}
                  className="flex items-center justify-between px-2 py-1.5 rounded-sm hover:bg-muted text-xs group"
                >
                  <span>{kw}</span>
                  <button
                    onClick={() => onRemoveKeyword(kw)}
                    className="opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-destructive transition-all"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}
