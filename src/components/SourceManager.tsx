import { useState } from 'react';
import { JobSource } from '@/types/jobs';
import { Switch } from '@/components/ui/switch';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { CheckCircle2, AlertCircle, Loader2, HelpCircle, Trash2, ExternalLink } from 'lucide-react';
import { MANUAL_SOURCES } from '@/data/jobData';
import { getOutboundUrl } from '@/lib/urlSafety';

export type ConnectionStatus = 'connected' | 'error' | 'checking' | 'unknown';

interface SourceManagerProps {
  sources: JobSource[];
  onToggleSource: (id: string) => void;
  onToggleAll: (enabled: boolean) => void;
  onRemoveSource: (id: string) => void;
  hideManualSources?: boolean;
}

const statusConfig: Record<ConnectionStatus, { icon: typeof CheckCircle2; className: string; label: string }> = {
  connected: { icon: CheckCircle2, className: 'text-success', label: 'Successfully scraped' },
  error: { icon: AlertCircle, className: 'text-destructive', label: 'Scrape failed' },
  checking: { icon: Loader2, className: 'text-warning animate-spin', label: 'Scraping...' },
  unknown: { icon: HelpCircle, className: 'text-muted-foreground', label: 'Not yet scraped' },
};

export function SourceManager({ sources, onToggleSource, onToggleAll, onRemoveSource, hideManualSources }: SourceManagerProps) {
  const [openTooltip, setOpenTooltip] = useState<string | null>(null);

  return (
    <div className="border border-border rounded-md bg-card p-4">
      <div className="flex items-center justify-between mb-3">
        <h3 className="font-display text-xs uppercase tracking-wider text-muted-foreground">
          Sources ({sources.filter(s => s.enabled).length}/{sources.length})
        </h3>
        <button
          onClick={() => {
            const allEnabled = sources.every(s => s.enabled);
            onToggleAll(!allEnabled);
          }}
          className="text-xs font-display uppercase tracking-wider text-muted-foreground hover:text-primary transition-colors"
        >
          {sources.every(s => s.enabled) ? 'None' : 'All'}
        </button>
      </div>

      <div className="space-y-1 max-h-64 overflow-y-auto">
        {sources.map((source) => {
          const status = (source.status || 'unknown') as ConnectionStatus;
          const StatusIcon = statusConfig[status].icon;
          const tooltipText = source.statusMessage
            ? source.statusMessage
            : statusConfig[status].label;

          return (
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
                <Tooltip open={openTooltip === source.id} onOpenChange={(open) => setOpenTooltip(open ? source.id : null)}>
                  <TooltipTrigger asChild>
                    <span className="cursor-help" onClick={() => setOpenTooltip(openTooltip === source.id ? null : source.id)}>
                      <StatusIcon
                        className={`h-3.5 w-3.5 shrink-0 ${statusConfig[status].className}`}
                      />
                    </span>
                  </TooltipTrigger>
                  <TooltipContent side="right" className="max-w-[250px] text-xs">
                    <p className="font-semibold">{source.name}</p>
                    <p className={status === 'error' ? 'text-destructive' : ''}>{tooltipText}</p>
                  </TooltipContent>
                </Tooltip>
                <a
                  href={getOutboundUrl(source.url) || source.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className={`text-sm truncate hover:underline ${source.enabled ? 'text-foreground' : 'text-muted-foreground'}`}
                  onClick={(e) => e.stopPropagation()}
                >
                  {source.name}
                </a>
                {source.lastJobCount !== undefined && (
                  <span className="text-[10px] font-display text-muted-foreground ml-auto mr-1 tabular-nums">
                    {source.lastJobCount}
                  </span>
                )}
              </div>
              <button
                onClick={() => onRemoveSource(source.id)}
                className="opacity-0 group-hover:opacity-100 p-1 text-muted-foreground hover:text-destructive transition-all"
              >
                <Trash2 className="h-3 w-3" />
              </button>
            </div>
          );
        })}
      </div>

      {/* Other Sources - manual check only */}
      {!hideManualSources && MANUAL_SOURCES.length > 0 && (
        <div className="mt-4 pt-3 border-t border-border">
          <h3 className="font-display text-xs uppercase tracking-wider text-muted-foreground mb-2">
            Other Sources (manual)
          </h3>
          <div className="space-y-1">
            {MANUAL_SOURCES.map((source) => (
              <a
                key={source.id}
                href={getOutboundUrl(source.url) || source.url}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-2 py-1.5 px-2 rounded-sm hover:bg-muted/50 transition-colors text-sm text-muted-foreground hover:text-foreground"
              >
                <ExternalLink className="h-3.5 w-3.5 shrink-0" />
                <span className="truncate">{source.name}</span>
              </a>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
