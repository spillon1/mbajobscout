import { useState, useMemo, useEffect, useRef } from 'react';

/** Parse freetext posted date into a Date for sorting. Unknown dates → now (appear first). */
function parsePostedDate(dateStr?: string): Date {
  if (!dateStr || dateStr === 'Scraped just now' || dateStr === 'Mock data') return new Date();

  const rel = dateStr.match(/(\d+)\s*(hour|day|week|month|year)s?\s*ago/i);
  if (rel) {
    const n = parseInt(rel[1]);
    const unit = rel[2].toLowerCase();
    const d = new Date();
    if (unit === 'hour') d.setHours(d.getHours() - n);else
    if (unit === 'day') d.setDate(d.getDate() - n);else
    if (unit === 'week') d.setDate(d.getDate() - n * 7);else
    if (unit === 'month') d.setMonth(d.getMonth() - n);else
    if (unit === 'year') d.setFullYear(d.getFullYear() - n);
    return d;
  }

  const parsed = new Date(dateStr);
  if (!isNaN(parsed.getTime())) return parsed;

  return new Date();
}
const isOccSource = (value: string): boolean => /occ\s*\(cambridge\)|12twenty/i.test(value);
import { Job, JobType, JobSource, Seniority } from '@/types/jobs';
import { getDefaultSources, DEFAULT_KEYWORDS } from '@/data/jobData';
import { UK_CITIES, getLocationString, getSourceUrlForLocation } from '@/data/ukLocations';
import { FilterRow, ListedPeriod, JobStatus, SortOption, DatePostedFilter } from '@/components/FilterRow';
import { JobCard } from '@/components/JobCard';
import { SourceManager } from '@/components/SourceManager';
import { scrapeJobs, loadSavedJobs } from '@/lib/api/scrapeJobs';
import { ScrapeProgress } from '@/components/ScrapeProgress';
import { AlertConfig } from '@/components/AlertConfig';
import { Briefcase, Zap, CheckCircle2, XCircle, Undo2, MapPin } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { useJobActions } from '@/hooks/useJobActions';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ToastAction } from '@/components/ui/toast';


const Index = () => {
  const { toast } = useToast();
  const { addAction, removeAction, actionedUrls, appliedJobs, notInterestedJobs } = useJobActions();
  const sourcesRef = useRef<HTMLDivElement>(null);
  const [selectedCity, setSelectedCity] = useState<string>('London');
  const location = getLocationString(selectedCity);
  const [sources, setSources] = useState<JobSource[]>(() =>
    getDefaultSources('London').filter((s) => !isOccSource(`${s.name} ${s.url}`))
  );
  const [keywords, setKeywords] = useState<string[]>(DEFAULT_KEYWORDS);
  const [isSearching, setIsSearching] = useState(false);
  const [jobs, setJobs] = useState<Job[]>([]);
  const [dismissedIds, setDismissedIds] = useState<Set<string>>(new Set());
  const [hasScraped, setHasScraped] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  // Load saved jobs on mount
  useEffect(() => {
    loadSavedJobs().then((savedJobs) => {
      const cleanedJobs = savedJobs.filter((j) => !isOccSource(`${j.source} ${j.sourceUrl}`));
      if (cleanedJobs.length > 0) {
        setJobs(cleanedJobs);
        setHasScraped(true);
      }
      setIsLoading(false);
    });
  }, []);

  // Filters
  const [viewMode, setViewMode] = useState<'search' | 'applied' | 'not_interested'>('search');
  const [selectedType, setSelectedType] = useState<JobType | 'any'>('any');
  const [listedPeriod, setListedPeriod] = useState<ListedPeriod>('any');
  const [jobStatus, setJobStatus] = useState<JobStatus>('any');
  const [selectedCompanies, setSelectedCompanies] = useState<string[]>([]);
  const [selectedTitles, setSelectedTitles] = useState<string[]>([]);
  const [selectedSources, setSelectedSources] = useState<string[]>([]);
  const [filterKeywords, setFilterKeywords] = useState<string[]>([]);
  const [sortBy, setSortBy] = useState<SortOption>('date-desc');
  const [datePostedFilter, setDatePostedFilter] = useState<DatePostedFilter>('all');
  const [selectedSeniorities, setSelectedSeniorities] = useState<Seniority[]>([]);

  useEffect(() => {
    setSources((prev) => prev.filter((s) => !isOccSource(`${s.name} ${s.url}`)));
    setSelectedSources((prev) => prev.filter((name) => !isOccSource(name)));
  }, []);

  // When city changes, update source URLs
  const handleCityChange = (city: string) => {
    setSelectedCity(city);
    setSources((prev) =>
      prev.map((s) => ({
        ...s,
        url: getSourceUrlForLocation(s.name, city) || s.url,
        status: 'unknown' as const,
        statusMessage: undefined,
      }))
    );
    // Clear existing jobs since they're for a different location
    setJobs([]);
    setHasScraped(false);
    setDismissedIds(new Set());
  };

  const handleToggleSource = (id: string) => {
    setSources((prev) =>
    prev.map((s) => s.id === id ? { ...s, enabled: !s.enabled } : s)
    );
  };

  const handleToggleAll = (enabled: boolean) => {
    setSources((prev) => prev.map((s) => ({ ...s, enabled })));
  };

  const handleAddSource = (name: string, url: string) => {
    setSources((prev) => [
    ...prev,
    { id: crypto.randomUUID(), name, url, enabled: true }]
    );
  };

  const handleRemoveSource = (id: string) => {
    setSources((prev) => prev.filter((s) => s.id !== id));
  };

  const abortControllerRef = useRef<AbortController | null>(null);

  const handleScrape = async () => {
    setIsSearching(true);
    const controller = new AbortController();
    abortControllerRef.current = controller;
    try {
      const result = await scrapeJobs(sources, keywords, location, controller.signal);

      if (controller.signal.aborted) return;

      if (result.sourceStatuses) {
        setSources((prev) =>
        prev.map((s) => {
          const sourceStatus = result.sourceStatuses[s.name];
          return {
            ...s,
            status: sourceStatus?.status as any || s.status,
            statusMessage: sourceStatus?.error || (sourceStatus?.status === 'connected' ?
            `Scraped successfully (${sourceStatus?.count ?? 0} jobs found)` :
            undefined),
            lastJobCount: sourceStatus?.count ?? undefined
          };
        })
        );
      }

      if (result.success) {
        setJobs(result.jobs);
        setDismissedIds(new Set());
        setHasScraped(true);
        toast({
          title: 'Scrape complete',
          description: `Found ${result.jobs.length} jobs from ${Object.keys(result.sourceStatuses).length} sources`
        });
      } else {
        toast({
          title: 'Scrape failed',
          description: result.error || 'Unknown error',
          variant: 'destructive'
        });
      }
    } catch (err) {
      if (controller.signal.aborted) return;
      console.error('Scrape error:', err);
      toast({
        title: 'Scrape error',
        description: 'Failed to connect to scraping service',
        variant: 'destructive'
      });
    } finally {
      abortControllerRef.current = null;
      setIsSearching(false);
    }
  };

  const handleStopScrape = () => {
    abortControllerRef.current?.abort();
    abortControllerRef.current = null;
    setIsSearching(false);
    toast({ title: 'Search stopped' });
  };

  const allCompanies = useMemo(() => [...new Set(jobs.map((j) => j.company))].sort(), [jobs]);
  const allTitles = useMemo(() => [...new Set(jobs.map((j) => j.title))].sort(), [jobs]);
  const allSources = useMemo(
    () => [...new Set(jobs.map((j) => j.source).filter((sourceName) => !isOccSource(sourceName) && sources.some((s) => s.name === sourceName)))].sort(),
    [jobs, sources]
  );

  const baseFilteredJobs = useMemo(() => {
    let filtered = jobs.filter((j) => !dismissedIds.has(j.id));

    // Exclude jobs that have been actioned (applied or not interested)
    const jobUrl = (j: Job) => j.jobUrl || j.sourceUrl;
    filtered = filtered.filter((j) => !actionedUrls.has(jobUrl(j)));

    if (selectedCompanies.length > 0) {
      filtered = filtered.filter((j) => selectedCompanies.includes(j.company));
    }

    if (selectedTitles.length > 0) {
      filtered = filtered.filter((j) => selectedTitles.includes(j.title));
    }

    if (filterKeywords.length > 0) {
      filtered = filtered.filter((j) => {
        const text = `${j.title} ${j.description || ''} ${j.company}`.toLowerCase();
        return filterKeywords.some((kw) => text.includes(kw.toLowerCase()));
      });
    }

    if (selectedSources.length > 0) {
      filtered = filtered.filter((j) => selectedSources.includes(j.source));
    }

    const enabledSources = sources.filter((s) => s.enabled).map((s) => s.name);
    filtered = filtered.filter((j) => enabledSources.includes(j.source));

    // No client-side city filter: the scrape already targets city-specific URLs,
    // and many sources don't embed the exact city name in the job location field.

    if (datePostedFilter === 'with-date') {
      filtered = filtered.filter((j) => j.postedDate && j.postedDate !== 'Scraped just now');
    } else if (datePostedFilter === 'without-date') {
      filtered = filtered.filter((j) => !j.postedDate || j.postedDate === 'Scraped just now');
    }

    if (listedPeriod !== 'any') {
      const now = new Date();
      const cutoff = new Date();
      if (listedPeriod === '1d') cutoff.setDate(now.getDate() - 1);else
      if (listedPeriod === '1w') cutoff.setDate(now.getDate() - 7);else
      if (listedPeriod === '1m') cutoff.setMonth(now.getMonth() - 1);else
      if (listedPeriod === '3m') cutoff.setMonth(now.getMonth() - 3);else
      if (listedPeriod === '6m') cutoff.setMonth(now.getMonth() - 6);
      filtered = filtered.filter((j) => {
        const d = parsePostedDate(j.postedDate);
        return d >= cutoff;
      });
    }

    if (selectedSeniorities.length > 0) {
      filtered = filtered.filter((j) => selectedSeniorities.includes(j.seniority));
    }

    return filtered;
  }, [jobs, dismissedIds, actionedUrls, selectedCompanies, selectedTitles, filterKeywords, selectedSources, sources, datePostedFilter, listedPeriod, selectedSeniorities]);

  const filteredJobs = useMemo(() => {
    const typed = selectedType === 'any' ? baseFilteredJobs : baseFilteredJobs.filter((j) => j.type === selectedType);
    return [...typed].sort((a, b) => {
      switch (sortBy) {
        case 'date-asc':{
            const da = parsePostedDate(a.postedDate);
            const db = parsePostedDate(b.postedDate);
            return da.getTime() - db.getTime();
          }
        case 'company-asc':
          return a.company.localeCompare(b.company);
        case 'title-asc':
          return a.title.localeCompare(b.title);
        case 'date-desc':
        default:{
            const da = parsePostedDate(a.postedDate);
            const db = parsePostedDate(b.postedDate);
            return db.getTime() - da.getTime();
          }
      }
    });
  }, [baseFilteredJobs, selectedType, sortBy]);

  const stats = useMemo(() => ({
    total: baseFilteredJobs.length,
    fullTime: baseFilteredJobs.filter((j) => j.type === 'full-time').length,
    internship: baseFilteredJobs.filter((j) => j.type === 'internship').length,
    graduate: baseFilteredJobs.filter((j) => j.type === 'graduate').length
  }), [baseFilteredJobs]);

  return (
    <div className="min-h-screen bg-background bg-grid">
      {/* Header */}
      <header className="border-b border-border bg-card/80 backdrop-blur-sm sticky top-0 z-50">
        <div className="container max-w-6xl mx-auto px-4 py-3 flex items-center justify-between gap-2 min-w-0">
          <div className="flex items-center gap-2 shrink-0">
            <div className="h-8 w-8 rounded-sm bg-primary/15 border border-primary/30 flex items-center justify-center">
              <Zap className="h-4 w-4 text-primary" />
            </div>
            <div className="hidden sm:block">
              <h1 className="font-display text-sm font-bold tracking-tight text-foreground">
                VC<span className="text-primary">SCOUT</span>
              </h1>
              <p className="text-[10px] font-display text-muted-foreground uppercase tracking-widest">
                {selectedCity} VC Job Aggregator   
              </p>
            </div>
           </div>

          <div className="flex items-center gap-2 sm:gap-3 min-w-0">
            <div className="flex items-center gap-1.5 shrink-0">
              <MapPin className="h-3.5 w-3.5 text-primary" />
              <Select value={selectedCity} onValueChange={handleCityChange}>
                <SelectTrigger className="h-7 w-[110px] sm:w-[140px] text-xs font-display bg-card border-border">
                  <SelectValue placeholder="Location" />
                </SelectTrigger>
                <SelectContent>
                  {UK_CITIES.map((loc) => (
                    <SelectItem key={loc.value} value={loc.value} className="text-xs">
                      {loc.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <span className="h-3 w-px bg-border" />
            <div className="flex items-center gap-2 sm:gap-4 font-display text-[11px] uppercase tracking-wider text-muted-foreground">
              <button
                className="hover:text-foreground transition-colors whitespace-nowrap"
                onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}>
                {stats.total} Jobs
              </button>
              <span className="h-3 w-px bg-border" />
              <button
                className="hover:text-foreground transition-colors whitespace-nowrap"
                onClick={() => sourcesRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })}>
                {sources.filter((s) => s.enabled).length} Sources
              </button>
            </div>
          </div>
        </div>
      </header>

      {/* Main */}
      <main className="container max-w-6xl mx-auto px-4 py-6 space-y-4">
        {/* Filters */}
        <FilterRow
          listedPeriod={listedPeriod}
          onListedPeriodChange={setListedPeriod}
          sortBy={sortBy}
          onSortByChange={setSortBy}
          datePostedFilter={datePostedFilter}
          onDatePostedFilterChange={setDatePostedFilter}
          selectedSeniorities={selectedSeniorities}
          onSenioritiesChange={setSelectedSeniorities}
          selectedCompanies={selectedCompanies}
          onCompaniesChange={setSelectedCompanies}
          selectedTitles={selectedTitles}
          onTitlesChange={setSelectedTitles}
          selectedSources={selectedSources}
          onSourcesChange={setSelectedSources}
          filterKeywords={filterKeywords}
          onAddFilterKeyword={(kw) => setFilterKeywords((prev) => [...prev, kw])}
          onRemoveFilterKeyword={(kw) => setFilterKeywords((prev) => prev.filter((k) => k !== kw))}
          allCompanies={allCompanies}
          allTitles={allTitles}
          allSources={allSources}
          onClearFilters={() => {
            setListedPeriod('any');
            setDatePostedFilter('all');
            setSelectedSeniorities([]);
            setSelectedCompanies([]);
            setSelectedTitles([]);
            setSelectedSources([]);
            setFilterKeywords([]);
            setSelectedType('any');
          }}
          onScrape={handleScrape}
          isSearching={isSearching} />
        

        {/* Stats - clickable filters */}
        <div className="grid grid-cols-3 sm:grid-cols-6 gap-2 sm:gap-3">
          {[
          { label: 'Total', value: stats.total, color: 'text-foreground', type: 'any' as const },
          { label: 'Full Time', value: stats.fullTime, color: 'text-primary', type: 'full-time' as const },
          { label: 'Internship', value: stats.internship, color: 'text-warning', type: 'internship' as const },
          { label: 'Graduate', value: stats.graduate, color: 'text-accent', type: 'graduate' as const }].
          map(({ label, value, color, type }) => {
            const isActive = viewMode === 'search' && selectedType === type;
            return (
              <button
                key={label}
                onClick={() => {
                  setViewMode('search');
                  setSelectedType(isActive && type !== 'any' ? 'any' : type);
                }}
                className={`border rounded-md bg-card p-2 sm:p-3 text-center transition-all cursor-pointer hover:glow-primary overflow-hidden ${
                isActive ? 'border-primary/50 glow-primary' : 'border-border hover:border-primary/30'}`
                }>
                
                <div className={`font-display text-lg sm:text-2xl font-bold ${color}`}>{value}</div>
                <div className="font-display text-[8px] sm:text-[10px] uppercase tracking-widest text-muted-foreground truncate">{label}</div>
              </button>);

          })}
          <button
            onClick={() => setViewMode(viewMode === 'applied' ? 'search' : 'applied')}
            className={`border rounded-md bg-card p-2 sm:p-3 text-center transition-all cursor-pointer hover:glow-primary overflow-hidden ${
              viewMode === 'applied' ? 'border-success/50 glow-primary' : 'border-border hover:border-success/30'
            }`}
          >
            <div className="font-display text-lg sm:text-2xl font-bold text-success">{appliedJobs.length}</div>
            <div className="font-display text-[8px] sm:text-[10px] uppercase tracking-widest text-muted-foreground truncate">Applied</div>
          </button>
          <button
            onClick={() => setViewMode(viewMode === 'not_interested' ? 'search' : 'not_interested')}
            className={`border rounded-md bg-card p-2 sm:p-3 text-center transition-all cursor-pointer hover:glow-primary overflow-hidden ${
              viewMode === 'not_interested' ? 'border-destructive/50 glow-primary' : 'border-border hover:border-destructive/30'
            }`}
          >
            <div className="font-display text-lg sm:text-2xl font-bold text-destructive">{notInterestedJobs.length}</div>
            <div className="font-display text-[8px] sm:text-[10px] uppercase tracking-widest text-muted-foreground truncate">Dismissed</div>
          </button>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-4 gap-4">
          {/* Job list */}
          <div className="lg:col-span-3 space-y-2">
            {viewMode === 'applied' ? (
              appliedJobs.length === 0 ? (
                <div className="border border-border rounded-md bg-card p-12 text-center">
                  <CheckCircle2 className="h-8 w-8 text-success mx-auto mb-3" />
                  <p className="font-display text-sm text-muted-foreground">No applications yet</p>
                </div>
              ) : (
                appliedJobs.map((action) => (
                  <div key={action.id} className="group flex items-center justify-between border border-border rounded-md p-4 bg-card transition-all">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <CheckCircle2 className="h-3.5 w-3.5 text-success" />
                        <span className="text-[11px] font-display text-muted-foreground uppercase tracking-wider">{action.job_source}</span>
                      </div>
                      <h3 className="font-body font-semibold text-foreground">{action.job_title}</h3>
                      <p className="text-sm text-muted-foreground">{action.job_company}</p>
                    </div>
                    <button
                      onClick={() => {
                        removeAction(action.id);
                        toast({ title: 'Removed from Applied', description: action.job_title });
                      }}
                      className="shrink-0 p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted transition-colors sm:opacity-0 sm:group-hover:opacity-100"
                      title="Remove (re-shows in results)"
                    >
                      <Undo2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                ))
              )
            ) : viewMode === 'not_interested' ? (
              notInterestedJobs.length === 0 ? (
                <div className="border border-border rounded-md bg-card p-12 text-center">
                  <XCircle className="h-8 w-8 text-destructive mx-auto mb-3" />
                  <p className="font-display text-sm text-muted-foreground">No dismissed roles</p>
                </div>
              ) : (
                notInterestedJobs.map((action) => (
                  <div key={action.id} className="group flex items-center justify-between border border-border rounded-md p-4 bg-card transition-all">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <XCircle className="h-3.5 w-3.5 text-destructive" />
                        <span className="text-[11px] font-display text-muted-foreground uppercase tracking-wider">{action.job_source}</span>
                      </div>
                      <h3 className="font-body font-semibold text-foreground">{action.job_title}</h3>
                      <p className="text-sm text-muted-foreground">{action.job_company}</p>
                    </div>
                    <button
                      onClick={() => {
                        removeAction(action.id);
                        toast({ title: 'Removed from Dismissed', description: action.job_title });
                      }}
                      className="shrink-0 p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted transition-colors sm:opacity-0 sm:group-hover:opacity-100"
                      title="Remove (re-shows in results)"
                    >
                      <Undo2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                ))
              )
            ) : isSearching ?
            <ScrapeProgress isSearching={isSearching} sourceCount={sources.filter((s) => s.enabled).length} /> :
            !hasScraped ?
            <div className="border border-border rounded-md bg-card p-12 text-center">
                <Zap className="h-8 w-8 text-primary mx-auto mb-3" />
                <p className="font-display text-sm text-foreground mb-1">Ready to scrape</p>
                <p className="text-xs text-muted-foreground">Configure your sources, then click Scrape</p>
              </div> :
            filteredJobs.length === 0 ?
            <div className="border border-border rounded-md bg-card p-12 text-center">
                <Briefcase className="h-8 w-8 text-muted-foreground mx-auto mb-3" />
                <p className="font-display text-sm text-muted-foreground">No jobs match your filters</p>
              </div> :

            filteredJobs.map((job) =>
            <JobCard
              key={job.id}
              job={job}
              onApplied={async (j) => {
                const url = j.jobUrl || j.sourceUrl;
                const actionId = await addAction(url, j.title, j.company, j.source, 'applied');
                toast({
                  title: 'Marked as Applied',
                  description: j.title,
                  action: actionId ? (
                    <ToastAction altText="Undo" onClick={() => removeAction(actionId)}>
                      Undo
                    </ToastAction>
                  ) : undefined,
                });
              }}
              onNotInterested={async (j) => {
                const url = j.jobUrl || j.sourceUrl;
                const actionId = await addAction(url, j.title, j.company, j.source, 'not_interested');
                toast({
                  title: 'Not interested',
                  description: j.title,
                  action: actionId ? (
                    <ToastAction altText="Undo" onClick={() => removeAction(actionId)}>
                      Undo
                    </ToastAction>
                  ) : undefined,
                });
              }} />
            )
            }
          </div>

          {/* Sidebar */}
          <div ref={sourcesRef} className="space-y-4">
            <AlertConfig />
            <SourceManager
              sources={sources}
              onToggleSource={handleToggleSource}
              onToggleAll={handleToggleAll}
              onAddSource={handleAddSource}
              onRemoveSource={handleRemoveSource} />
            
          </div>
        </div>
      </main>
    </div>);

};

export default Index;