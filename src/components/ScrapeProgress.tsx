import { useState, useEffect } from 'react';
import { Loader2 } from 'lucide-react';
import { Progress } from '@/components/ui/progress';

interface ScrapeProgressProps {
  isSearching: boolean;
  sourceCount: number;
}

export function ScrapeProgress({ isSearching, sourceCount }: ScrapeProgressProps) {
  const [elapsed, setElapsed] = useState(0);
  const [phase, setPhase] = useState(0);

  useEffect(() => {
    if (!isSearching) {
      setElapsed(0);
      setPhase(0);
      return;
    }

    const start = Date.now();
    const interval = setInterval(() => {
      const seconds = Math.floor((Date.now() - start) / 1000);
      setElapsed(seconds);
      // Estimate phases based on time
      if (seconds < 5) setPhase(0);
      else if (seconds < 15) setPhase(1);
      else if (seconds < 30) setPhase(2);
      else setPhase(3);
    }, 1000);

    return () => clearInterval(interval);
  }, [isSearching]);

  if (!isSearching) return null;

  const phases = [
    'Connecting to sources...',
    `Scraping ${sourceCount} sources...`,
    'Parsing job listings...',
    'Almost done, processing results...',
  ];

  // Fake progress that slows down over time (never reaches 100)
  const progress = Math.min(95, (1 - Math.exp(-elapsed / 40)) * 100);

  const formatTime = (s: number) => {
    const mins = Math.floor(s / 60);
    const secs = s % 60;
    return mins > 0 ? `${mins}m ${secs}s` : `${secs}s`;
  };

  return (
    <div className="border border-primary/30 rounded-md bg-card p-4 glow-primary animate-slide-in">
      <div className="flex items-center gap-3 mb-3">
        <Loader2 className="h-4 w-4 text-primary animate-spin" />
        <span className="font-display text-xs uppercase tracking-wider text-foreground">
          {phases[phase]}
        </span>
        <span className="ml-auto font-display text-xs text-muted-foreground tabular-nums">
          {formatTime(elapsed)}
        </span>
      </div>
      <Progress value={progress} className="h-1.5" />
      <p className="text-[11px] text-muted-foreground mt-2">
        Scraping {sourceCount} source{sourceCount !== 1 ? 's' : ''} with your configured keywords. This may take 30-60 seconds.
      </p>
    </div>
  );
}
