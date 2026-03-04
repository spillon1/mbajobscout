import { useState } from 'react';
import { Input } from '@/components/ui/input';
import { Tag, Plus, X } from 'lucide-react';

interface KeywordBarProps {
  keywords: string[];
  onAddKeyword: (keyword: string) => void;
  onRemoveKeyword: (keyword: string) => void;
}

export function KeywordBar({ keywords, onAddKeyword, onRemoveKeyword }: KeywordBarProps) {
  const [newKeyword, setNewKeyword] = useState('');
  const [showInput, setShowInput] = useState(false);

  const handleAdd = () => {
    const trimmed = newKeyword.trim();
    if (trimmed && !keywords.includes(trimmed)) {
      onAddKeyword(trimmed);
      setNewKeyword('');
      setShowInput(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') handleAdd();
    if (e.key === 'Escape') { setShowInput(false); setNewKeyword(''); }
  };

  return (
    <div className="flex items-center gap-2 flex-wrap">
      <Tag className="h-3.5 w-3.5 text-muted-foreground" />
      <span className="text-[11px] font-display text-muted-foreground uppercase tracking-wider">Keywords:</span>
      {keywords.map((kw) => (
        <span
          key={kw}
          className="flex items-center gap-1 px-2.5 py-1 rounded-sm text-[11px] font-display uppercase tracking-wider border bg-primary/10 text-primary border-primary/25"
        >
          {kw}
          <button
            onClick={() => onRemoveKeyword(kw)}
            className="ml-0.5 hover:text-destructive transition-colors"
          >
            <X className="h-3 w-3" />
          </button>
        </span>
      ))}
      {showInput ? (
        <Input
          value={newKeyword}
          onChange={(e) => setNewKeyword(e.target.value)}
          onKeyDown={handleKeyDown}
          onBlur={() => { if (!newKeyword.trim()) setShowInput(false); }}
          placeholder="Type keyword..."
          className="h-7 w-48 text-xs bg-card"
          autoFocus
        />
      ) : (
        <button
          onClick={() => setShowInput(true)}
          className="flex items-center gap-1 px-2.5 py-1 rounded-sm text-[11px] font-display uppercase tracking-wider border border-dashed border-border text-muted-foreground hover:border-primary hover:text-primary transition-colors"
        >
          <Plus className="h-3 w-3" />
          Add
        </button>
      )}
    </div>
  );
}
