import { createContext, useContext, useRef, useState, useCallback, ReactNode } from 'react';
import { Job, JobSource } from '@/types/jobs';
import { scrapeJobs } from '@/lib/api/scrapeJobs';
import { useToast } from '@/hooks/use-toast';

interface ScrapeState {
  isSearching: boolean;
  jobs: Job[] | null; // null = not finished yet
  sourceStatuses: Record<string, { status: string; error?: string; count?: number }>;
}

interface ScrapeContextValue {
  getState: (mode: 'vc' | 'pe') => ScrapeState;
  startScrape: (
    mode: 'vc' | 'pe',
    sources: JobSource[],
    keywords: string[],
    location: string,
  ) => void;
  stopScrape: (mode: 'vc' | 'pe') => void;
  consumeResults: (mode: 'vc' | 'pe') => { jobs: Job[]; sourceStatuses: Record<string, { status: string; error?: string; count?: number }> } | null;
}

const ScrapeContext = createContext<ScrapeContextValue | null>(null);

const defaultState: ScrapeState = { isSearching: false, jobs: null, sourceStatuses: {} };

export function ScrapeProvider({ children }: { children: ReactNode }) {
  const { toast } = useToast();
  const [states, setStates] = useState<Record<string, ScrapeState>>({});
  const abortRefs = useRef<Record<string, AbortController>>({});

  const getState = useCallback((mode: 'vc' | 'pe'): ScrapeState => {
    return states[mode] || defaultState;
  }, [states]);

  const startScrape = useCallback((
    mode: 'vc' | 'pe',
    sources: JobSource[],
    keywords: string[],
    location: string,
  ) => {
    // Abort any existing scrape for this mode
    abortRefs.current[mode]?.abort();

    const controller = new AbortController();
    abortRefs.current[mode] = controller;

    setStates(prev => ({
      ...prev,
      [mode]: { isSearching: true, jobs: null, sourceStatuses: {} },
    }));

    scrapeJobs(sources, keywords, location, controller.signal, { mode })
      .then(result => {
        if (controller.signal.aborted) return;
        delete abortRefs.current[mode];

        if (result.success) {
          setStates(prev => ({
            ...prev,
            [mode]: { isSearching: false, jobs: result.jobs, sourceStatuses: result.sourceStatuses },
          }));
          toast({
            title: `${mode.toUpperCase()} scrape complete`,
            description: `Found ${result.jobs.length} jobs from ${Object.keys(result.sourceStatuses).length} sources`,
          });
        } else {
          setStates(prev => ({
            ...prev,
            [mode]: { isSearching: false, jobs: null, sourceStatuses: result.sourceStatuses },
          }));
          toast({
            title: 'Scrape failed',
            description: result.error || 'Unknown error',
            variant: 'destructive',
          });
        }
      })
      .catch(err => {
        if (controller.signal.aborted) return;
        delete abortRefs.current[mode];
        setStates(prev => ({
          ...prev,
          [mode]: { isSearching: false, jobs: null, sourceStatuses: {} },
        }));
        toast({
          title: 'Scrape error',
          description: 'Failed to connect to scraping service',
          variant: 'destructive',
        });
      });
  }, [toast]);

  const stopScrape = useCallback((mode: 'vc' | 'pe') => {
    abortRefs.current[mode]?.abort();
    delete abortRefs.current[mode];
    setStates(prev => ({
      ...prev,
      [mode]: { ...prev[mode], isSearching: false },
    }));
    toast({ title: 'Search stopped' });
  }, [toast]);

  const consumeResults = useCallback((mode: 'vc' | 'pe') => {
    const state = states[mode];
    if (!state?.jobs) return null;
    const result = { jobs: state.jobs, sourceStatuses: state.sourceStatuses };
    // Clear consumed results
    setStates(prev => ({
      ...prev,
      [mode]: { ...prev[mode], jobs: null },
    }));
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
