import { createContext, useContext, useRef, useState, useCallback, ReactNode } from 'react';
import { Job, JobSource } from '@/types/jobs';
import { scrapeJobs } from '@/lib/api/scrapeJobs';
import { useToast } from '@/hooks/use-toast';
import { ScrapeMode } from '@/data/subCategories';

interface ScrapeState {
  isSearching: boolean;
  jobs: Job[] | null;
  sourceStatuses: Record<string, { status: string; error?: string; count?: number }>;
  startedAt: number | null;
}

interface ScrapeContextValue {
  getState: (mode: ScrapeMode) => ScrapeState;
  startScrape: (mode: ScrapeMode, sources: JobSource[], keywords: string[], location: string) => void;
  stopScrape: (mode: ScrapeMode) => void;
  consumeResults: (mode: ScrapeMode) => { jobs: Job[]; sourceStatuses: Record<string, { status: string; error?: string; count?: number }> } | null;
}

const ScrapeContext = createContext<ScrapeContextValue | null>(null);

const defaultState: ScrapeState = { isSearching: false, jobs: null, sourceStatuses: {}, startedAt: null };

export function ScrapeProvider({ children }: { children: ReactNode }) {
  const { toast } = useToast();
  const [states, setStates] = useState<Record<string, ScrapeState>>({});
  const abortRefs = useRef<Record<string, AbortController>>({});

  const getState = useCallback((mode: ScrapeMode): ScrapeState => {
    return states[mode] || defaultState;
  }, [states]);

  const startScrape = useCallback((mode: ScrapeMode, sources: JobSource[], keywords: string[], location: string) => {
    abortRefs.current[mode]?.abort();
    const controller = new AbortController();
    abortRefs.current[mode] = controller;

    setStates(prev => ({ ...prev, [mode]: { isSearching: true, jobs: null, sourceStatuses: {}, startedAt: Date.now() } }));

    scrapeJobs(sources, keywords, location, controller.signal, { mode })
      .then(result => {
        if (controller.signal.aborted) return;
        delete abortRefs.current[mode];
        if (result.success) {
          setStates(prev => ({ ...prev, [mode]: { isSearching: false, jobs: result.jobs, sourceStatuses: result.sourceStatuses, startedAt: null } }));
          toast({ title: `${mode.toUpperCase()} scrape complete`, description: `Found ${result.jobs.length} jobs from ${Object.keys(result.sourceStatuses).length} sources` });
        } else {
          setStates(prev => ({ ...prev, [mode]: { isSearching: false, jobs: null, sourceStatuses: result.sourceStatuses, startedAt: null } }));
          toast({ title: 'Scrape failed', description: result.error || 'Unknown error', variant: 'destructive' });
        }
      })
      .catch(err => {
        if (controller.signal.aborted) return;
        delete abortRefs.current[mode];
        setStates(prev => ({ ...prev, [mode]: { isSearching: false, jobs: null, sourceStatuses: {}, startedAt: null } }));
        toast({ title: 'Scrape error', description: 'Failed to connect to scraping service', variant: 'destructive' });
      });
  }, [toast]);

  const stopScrape = useCallback((mode: ScrapeMode) => {
    abortRefs.current[mode]?.abort();
    delete abortRefs.current[mode];
    setStates(prev => ({ ...prev, [mode]: { ...prev[mode], isSearching: false, startedAt: null } }));
    toast({ title: 'Search stopped' });
  }, [toast]);

  const consumeResults = useCallback((mode: ScrapeMode) => {
    const state = states[mode];
    if (!state?.jobs) return null;
    const result = { jobs: state.jobs, sourceStatuses: state.sourceStatuses };
    setStates(prev => ({ ...prev, [mode]: { ...prev[mode], jobs: null } }));
    return result;
  }, [states]);

  return (
    <ScrapeContext.Provider value={{ getState, startScrape, stopScrape, consumeResults }}>
      {children}
    </ScrapeContext.Provider>
  );
}

export function useScrape() {
  const ctx = useContext(ScrapeContext);
  if (!ctx) throw new Error('useScrape must be used within ScrapeProvider');
  return ctx;
}
