import { useState, useMemo, useEffect, useRef } from 'react';

/** Parse freetext posted date into a Date for sorting. Unknown dates → now (appear first). */
function parsePostedDate(dateStr?: string): Date {
  if (!dateStr || dateStr === 'Scraped just now' || dateStr === 'Mock data') return new Date();

  const rel = dateStr.match(/(\d+)\s*(hour|day|week|month|year)s?\s*ago/i);
  if (rel) {
    const n = parseInt(rel[1]);
    const unit = rel[2].toLowerCase();
    const d = new Date();
    if (unit === 'hour') d.setHours(d.getHours() - n);
    else if (unit === 'day') d.setDate(d.getDate() - n);
    else if (unit === 'week') d.setDate(d.getDate() - n * 7);
    else if (unit === 'month') d.setMonth(d.getMonth() - n);
    else if (unit === 'year') d.setFullYear(d.getFullYear() - n);
    return d;
  }

  const parsed = new Date(dateStr);
  if (!isNaN(parsed.getTime())) return parsed;

  return new Date();
}
const isOccSource = (value: string): boolean => /occ\s*\(cambridge\)|12twenty/i.test(value);
import { Job, JobType, JobSource, Seniority } from '@/types/jobs';
import { DEFAULT_SOURCES, DEFAULT_KEYWORDS } from '@/data/jobData';
import { FilterRow, ListedPeriod, JobStatus, SortOption, DatePostedFilter } from '@/components/FilterRow';
import { JobCard } from '@/components/JobCard';
import { SourceManager } from '@/components/SourceManager';
import { scrapeJobs, loadSavedJobs } from '@/lib/api/scrapeJobs';
import { ScrapeProgress } from '@/components/ScrapeProgress';
import { AlertConfig } from '@/components/AlertConfig';
import { Briefcase, Zap } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

const LOCATION = 'London, United Kingdom';

const Index = () => {
  const { toast } = useToast();
  const sourcesRef = useRef<HTMLDivElement>(null);
  const [sources, setSources] = useState<JobSource[]>(() =>
    DEFAULT_SOURCES.filter((s) => !isOccSource(`${s.name} ${s.url}`))
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

  const handleToggleSource = (id: string) => {
    setSources((prev) =>
      prev.map((s) => (s.id === id ? { ...s, enabled: !s.enabled } : s))
    );
  };

  const handleToggleAll = (enabled: boolean) => {
    setSources((prev) => prev.map((s) => ({ ...s, enabled })));
  };

  const handleAddSource = (name: string, url: string) => {
    setSources((prev) => [
      ...prev,
      { id: crypto.randomUUID(), name, url, enabled: true },
    ]);
  };

  const handleRemoveSource = (id: string) => {
    setSources((prev) => prev.filter((s) => s.id !== id));
  };

  const handleScrape = async () => {
    setIsSearching(true);
    try {
      const result = await scrapeJobs(sources, keywords, LOCATION);

      if (result.sourceStatuses) {
        setSources((prev) =>
          prev.map((s) => {
            const sourceStatus = result.sourceStatuses[s.name];
            return {
              ...s,
              status: (sourceStatus?.status as any) || s.status,
              statusMessage: sourceStatus?.error || (sourceStatus?.status === 'connected'
                ? `Scraped successfully (${sourceStatus?.count ?? 0} jobs found)`
                : undefined),
              lastJobCount: sourceStatus?.count ?? undefined,
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
          description: `Found ${result.jobs.length} jobs from ${Object.keys(result.sourceStatuses).length} sources`,
        });
      } else {
        toast({
          title: 'Scrape failed',
          description: result.error || 'Unknown error',
          variant: 'destructive',
        });
      }
    } catch (err) {
      console.error('Scrape error:', err);
      toast({
        title: 'Scrape error',
        description: 'Failed to connect to scraping service',
        variant: 'destructive',
      });
    } finally {
      setIsSearching(false);
    }
  };

  const allCompanies = useMemo(() => [...new Set(jobs.map((j) => j.company))].sort(), [jobs]);
  const allTitles = useMemo(() => [...new Set(jobs.map((j) => j.title))].sort(), [jobs]);
  const allSources = useMemo(
    () => [...new Set(jobs.map((j) => j.source).filter((sourceName) => !isOccSource(sourceName) && sources.some((s) => s.name === sourceName)))].sort(),
    [jobs, sources]
  );

  const baseFilteredJobs = useMemo(() => {
    let filtered = jobs.filter((j) => !dismissedIds.has(j.id));

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

    // Always filter to London
    const searchCity = LOCATION.split(',')[0]?.trim().toLowerCase();
    if (searchCity) {
      filtered = filtered.filter((j) => {
        const locationText = `${j.location} ${j.title}`.toLowerCase();
        return locationText.includes(searchCity);
      });
    }

    if (datePostedFilter === 'with-date') {
      filtered = filtered.filter((j) => j.postedDate && j.postedDate !== 'Scraped just now');
    } else if (datePostedFilter === 'without-date') {
      filtered = filtered.filter((j) => !j.postedDate || j.postedDate === 'Scraped just now');
    }

    if (listedPeriod !== 'any') {
      const now = new Date();
      const cutoff = new Date();
      if (listedPeriod === '1d') cutoff.setDate(now.getDate() - 1);
      else if (listedPeriod === '1w') cutoff.setDate(now.getDate() - 7);
      else if (listedPeriod === '1m') cutoff.setMonth(now.getMonth() - 1);
      else if (listedPeriod === '3m') cutoff.setMonth(now.getMonth() - 3);
      else if (listedPeriod === '6m') cutoff.setMonth(now.getMonth() - 6);
      filtered = filtered.filter((j) => {
        const d = parsePostedDate(j.postedDate);
        return d >= cutoff;
      });
    }

    if (selectedSeniorities.length > 0) {
      filtered = filtered.filter((j) => selectedSeniorities.includes(j.seniority));
    }

    return filtered;
  }, [jobs, dismissedIds, selectedCompanies, selectedTitles, filterKeywords, selectedSources, sources, datePostedFilter, listedPeriod, selectedSeniorities]);

  const filteredJobs = useMemo(() => {
    const typed = selectedType === 'any' ? baseFilteredJobs : baseFilteredJobs.filter((j) => j.type === selectedType);
    return [...typed].sort((a, b) => {
      switch (sortBy) {
        case 'date-asc': {
          const da = parsePostedDate(a.postedDate);
          const db = parsePostedDate(b.postedDate);
          return da.getTime() - db.getTime();
        }
        case 'company-asc':
          return a.company.localeCompare(b.company);
        case 'title-asc':
          return a.title.localeCompare(b.title);
        case 'date-desc':
        default: {
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
    graduate: baseFilteredJobs.filter((j) => j.type === 'graduate').length,
  }), [baseFilteredJobs]);

  return (
    <div className="min-h-screen bg-background bg-grid">
      {/* Header */}
      <header className="border-b border-border bg-card/80 backdrop-blur-sm sticky top-0 z-50">
        <div className="container max-w-6xl mx-auto px-4 py-3 flex items-center justify-between gap-4">
          <div className="flex items-center gap-2 shrink-0">
            <div className="h-8 w-8 rounded-sm bg-primary/15 border border-primary/30 flex items-center justify-center">
              <Zap className="h-4 w-4 text-primary" />
            </div>
            <div>
              <h1 className="font-display text-sm font-bold tracking-tight text-foreground">
                VC<span className="text-primary">SCOUT</span>
              </h1>
              <p className="text-[10px] font-display text-muted-foreground uppercase tracking-widest">
                Job Aggregator
              </p>
            </div>
          </div>

          <div className="flex items-center gap-4 font-display text-[11px] uppercase tracking-wider text-muted-foreground shrink-0">
            <span>{stats.total} jobs</span>
            <span className="h-3 w-px bg-border" />
            <button
              className="lg:cursor-default hover:text-foreground lg:hover:text-muted-foreground transition-colors"
              onClick={() => sourcesRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })}
            >
              {sources.filter((s) => s.enabled).length} sources
            </button>
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
          isSearching={isSearching}
        />

        {/* Stats - clickable filters */}
        <div className="grid grid-cols-4 gap-3">
          {[
            { label: 'Total', value: stats.total, color: 'text-foreground', type: 'any' as const },
            { label: 'Full Time', value: stats.fullTime, color: 'text-primary', type: 'full-time' as const },
            { label: 'Internship', value: stats.internship, color: 'text-warning', type: 'internship' as const },
            { label: 'Graduate', value: stats.graduate, color: 'text-accent', type: 'graduate' as const },
          ].map(({ label, value, color, type }) => {
            const isActive = selectedType === type;
            return (
              <button
                key={label}
                onClick={() => setSelectedType(isActive && type !== 'any' ? 'any' : type)}
                className={`border rounded-md bg-card p-3 text-center transition-all cursor-pointer hover:glow-primary ${
                  isActive ? 'border-primary/50 glow-primary' : 'border-border hover:border-primary/30'
                }`}
              >
                <div className={`font-display text-2xl font-bold ${color}`}>{value}</div>
                <div className="font-display text-[10px] uppercase tracking-widest text-muted-foreground">{label}</div>
              </button>
            );
          })}
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-4 gap-4">
          {/* Job list */}
          <div className="lg:col-span-3 space-y-2">
            {isSearching ? (
              <ScrapeProgress isSearching={isSearching} sourceCount={sources.filter(s => s.enabled).length} />
            ) : !hasScraped ? (
              <div className="border border-border rounded-md bg-card p-12 text-center">
                <Zap className="h-8 w-8 text-primary mx-auto mb-3" />
                <p className="font-display text-sm text-foreground mb-1">Ready to scrape</p>
                <p className="text-xs text-muted-foreground">Configure your sources, then click Scrape</p>
              </div>
            ) : filteredJobs.length === 0 ? (
              <div className="border border-border rounded-md bg-card p-12 text-center">
                <Briefcase className="h-8 w-8 text-muted-foreground mx-auto mb-3" />
                <p className="font-display text-sm text-muted-foreground">No jobs match your filters</p>
              </div>
            ) : (
              filteredJobs.map((job) => (
                <JobCard
                  key={job.id}
                  job={job}
                  onDismiss={(id) => {
                    setDismissedIds((prev) => new Set(prev).add(id));
                    toast({
                      title: 'Listing dismissed',
                      description: job.title,
                      action: (
                        <button
                          className="text-xs font-medium text-primary hover:underline"
                          onClick={() => setDismissedIds((prev) => {
                            const next = new Set(prev);
                            next.delete(id);
                            return next;
                          })}
                        >
                          Undo
                        </button>
                      ),
                    });
                  }}
                />
              ))
            )}
          </div>

          {/* Sidebar */}
          <div ref={sourcesRef} className="space-y-4">
            <AlertConfig />
            <SourceManager
              sources={sources}
              onToggleSource={handleToggleSource}
              onToggleAll={handleToggleAll}
              onAddSource={handleAddSource}
              onRemoveSource={handleRemoveSource}
            />
          </div>
        </div>
      </main>
    </div>
  );
};

export default Index;
