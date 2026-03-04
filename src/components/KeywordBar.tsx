import { DEFAULT_KEYWORDS } from '@/data/jobData';
import { Badge } from '@/components/ui/badge';
import { Tag } from 'lucide-react';

interface KeywordBarProps {
  keywords: string[];
  activeKeyword: string | null;
  onKeywordClick: (keyword: string | null) => void;
}

export function KeywordBar({ keywords, activeKeyword, onKeywordClick }: KeywordBarProps) {
  return (
    <div className="flex items-center gap-2 flex-wrap">
      <Tag className="h-3.5 w-3.5 text-muted-foreground" />
      <button
        onClick={() => onKeywordClick(null)}
        className={`px-2.5 py-1 rounded-sm text-[11px] font-display uppercase tracking-wider border transition-colors ${
          activeKeyword === null
            ? 'bg-primary/15 text-primary border-primary/40'
            : 'bg-transparent text-muted-foreground border-border hover:border-muted-foreground/30'
        }`}
      >
        All
      </button>
      {keywords.map((kw) => (
        <button
          key={kw}
          onClick={() => onKeywordClick(kw)}
          className={`px-2.5 py-1 rounded-sm text-[11px] font-display uppercase tracking-wider border transition-colors ${
            activeKeyword === kw
              ? 'bg-primary/15 text-primary border-primary/40'
              : 'bg-transparent text-muted-foreground border-border hover:border-muted-foreground/30'
          }`}
        >
          {kw}
        </button>
      ))}
    </div>
  );
}
