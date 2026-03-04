import { useState } from 'react';
import { JobSource } from '@/types/jobs';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Plus, Globe, Trash2 } from 'lucide-react';

interface SourceManagerProps {
  sources: JobSource[];
  onToggleSource: (id: string) => void;
  onAddSource: (name: string, url: string) => void;
  onRemoveSource: (id: string) => void;
}

export function SourceManager({ sources, onToggleSource, onAddSource, onRemoveSource }: SourceManagerProps) {
  const [newName, setNewName] = useState('');
  const [newUrl, setNewUrl] = useState('');
  const [showAdd, setShowAdd] = useState(false);

  const handleAdd = () => {
    if (newName.trim() && newUrl.trim()) {
      onAddSource(newName.trim(), newUrl.trim());
      setNewName('');
      setNewUrl('');
      setShowAdd(false);
    }
  };

  return (
    <div className="border border-border rounded-md bg-card p-4">
      <div className="flex items-center justify-between mb-3">
        <h3 className="font-display text-xs uppercase tracking-wider text-muted-foreground">
          Sources ({sources.filter(s => s.enabled).length}/{sources.length})
        </h3>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => setShowAdd(!showAdd)}
          className="h-7 px-2 text-xs font-display uppercase tracking-wider text-muted-foreground hover:text-primary"
        >
          <Plus className="h-3 w-3 mr-1" />
          Add
        </Button>
      </div>

      {showAdd && (
        <div className="flex gap-2 mb-3 p-3 rounded-sm bg-muted border border-border">
          <Input
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            placeholder="Source name"
            className="text-sm bg-background"
          />
          <Input
            value={newUrl}
            onChange={(e) => setNewUrl(e.target.value)}
            placeholder="https://..."
            className="text-sm bg-background"
          />
          <Button size="sm" onClick={handleAdd} className="shrink-0 font-display text-xs">
            Add
          </Button>
        </div>
      )}

      <div className="space-y-1 max-h-64 overflow-y-auto">
        {sources.map((source) => (
          <div
            key={source.id}
            className="flex items-center justify-between py-1.5 px-2 rounded-sm hover:bg-muted/50 transition-colors group"
          >
            <div className="flex items-center gap-2 min-w-0 flex-1">
              <Switch
                checked={source.enabled}
                onCheckedChange={() => onToggleSource(source.id)}
                className="scale-75"
              />
              <Globe className="h-3 w-3 text-muted-foreground shrink-0" />
              <span className={`text-sm truncate ${source.enabled ? 'text-foreground' : 'text-muted-foreground'}`}>
                {source.name}
              </span>
            </div>
            <button
              onClick={() => onRemoveSource(source.id)}
              className="opacity-0 group-hover:opacity-100 p-1 text-muted-foreground hover:text-destructive transition-all"
            >
              <Trash2 className="h-3 w-3" />
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
