import { useState, useMemo, useEffect, useRef } from 'react';
import { usePersistedState } from '@/hooks/usePersistedState';

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

import { Job, JobType, JobSource, Seniority } from '@/types/jobs';
import { getIMDefaultSources, IM_DEFAULT_KEYWORDS } from '@/data/imData';
import { UK_CITIES, getLocationString, getSourceUrlForLocation } from '@/data/ukLocations';
import { FilterRow, ListedPeriod, JobStatus, SortOption, DatePostedFilter } from '@/components/FilterRow';
import { JobCard } from '@/components/JobCard';
import { SourceManager } from '@/components/SourceManager';
import { scrapeJobs, loadSavedJobs } from '@/lib/api/scrapeJobs';
import { useScrape } from '@/contexts/ScrapeContext';
import { ScrapeProgress } from '@/components/ScrapeProgress';
import { NavBar } from '@/components/NavBar';
import { jobMatchesSubCategories, jobMatchesSecondaryFilter } from '@/data/subCategories';

import { Briefcase, Zap, CheckCircle2, XCircle, Undo2, Loader2, Bookmark } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { useJobActions } from '@/hooks/useJobActions';
import { useAuth } from '@/hooks/useAuth';
import { AuthModal } from '@/components/AuthModal';
import { ToastAction } from '@/components/ui/toast';

function toIMUrl(url: string): string {
  return url
    .replace(/venture\+capital/gi, 'investment+management')
    .replace(/venture%20capital/gi, 'investment%20management')
    .replace(/%22venture\+capital%22/gi, '%22investment+management%22')
    .replace(/%22venture%20capital%22/gi, '%22investment%20management%22')
    .replace(/venture-capital/gi, 'investment-management');
}

const IMScout = () => {
  const { toast } = useToast();
  const { user } = useAuth();
  const { addAction, removeAction, actionedUrls, appliedJobs, notInterestedJobs, savedJobs, isAuthenticated } = useJobActions();
  const [showAuthModal, setShowAuthModal] = useState(false);
  const { getState, startScrape, stopScrape, consumeResults } = useScrape();
  const scrapeState = getState('im');
  const sourcesRef = useRef<HTMLDivElement>(null);
  const [selectedCity, setSelectedCity] = usePersistedState<string>('im-city', 'London');
  const location = getLocationString(selectedCity);
  const [sources, setSources] = useState<JobSource[]>(() => getIMDefaultSources('London'));
  const [keywords, setKeywords] = useState<string[]>(IM_DEFAULT_KEYWORDS);
  const [jobs, setJobs] = useState<Job[]>([]);
  const [dismissedIds, setDismissedIds] = useState<Set<string>>(new Set());
  const [hasScraped, setHasScraped] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => { loadSavedJobs('im').then((saved) => { if (saved.length > 0) { setJobs(saved); setHasScraped(true); } setIsLoading(false); }); }, []);
  useEffect(() => { const result = consumeResults('im'); if (result) { setJobs(result.jobs); setDismissedIds(new Set()); setHasScraped(true); setSources((prev) => prev.map((s) => { const ss = result.sourceStatuses[s.name]; return { ...s, status: ss?.status as any || s.status, statusMessage: ss?.error || (ss?.status === 'connected' ? `Scraped successfully (${ss?.count ?? 0} jobs found)` : undefined), lastJobCount: ss?.count ?? undefined }; })); } }, [scrapeState.isSearching, consumeResults]);

  const [viewMode, setViewMode] = useState<'search' | 'applied' | 'not_interested' | 'saved'>('search');
  const [selectedType, setSelectedType] = usePersistedState<JobType | 'any'>('im-type', 'any');
  const [listedPeriod, setListedPeriod] = usePersistedState<ListedPeriod>('im-period', 'any');
  const [jobStatus, setJobStatus] = usePersistedState<JobStatus>('im-status', 'any');
  const [selectedCompanies, setSelectedCompanies] = usePersistedState<string[]>('im-companies', []);
  const [selectedTitles, setSelectedTitles] = usePersistedState<string[]>('im-titles', []);
  const [selectedSources, setSelectedSources] = usePersistedState<string[]>('im-sources', []);
  const [filterKeywords, setFilterKeywords] = usePersistedState<string[]>('im-keywords', []);
  const [sortBy, setSortBy] = usePersistedState<SortOption>('im-sort', 'date-desc');
  const [datePostedFilter, setDatePostedFilter] = usePersistedState<DatePostedFilter>('im-datePosted', 'all');
  const [selectedSeniorities, setSelectedSeniorities] = usePersistedState<Seniority[]>('im-seniorities', []);
  const [selectedSubCategories, setSelectedSubCategories] = usePersistedState<string[]>('im-subcats', []);
  const [selectedSecondaryFilter, setSelectedSecondaryFilter] = usePersistedState<string[]>('im-secondary', []);

  const handleCityChange = (city: string) => { setSelectedCity(city); setSources((prev) => prev.map((s) => ({ ...s, url: toIMUrl(getSourceUrlForLocation(s.name, city) || s.url), status: 'unknown' as const, statusMessage: undefined }))); setJobs([]); setHasScraped(false); setDismissedIds(new Set()); };
  const handleToggleSource = (id: string) => { setSources((prev) => prev.map((s) => s.id === id ? { ...s, enabled: !s.enabled } : s)); };
  const handleToggleAll = (enabled: boolean) => { setSources((prev) => prev.map((s) => ({ ...s, enabled }))); };
  const handleAddSource = (name: string, url: string) => { setSources((prev) => [...prev, { id: crypto.randomUUID(), name, url, enabled: true }]); };
  const handleRemoveSource = (id: string) => { setSources((prev) => prev.filter((s) => s.id !== id)); };

  const isSearching = scrapeState.isSearching;
  const handleScrape = () => { startScrape('im', sources, keywords, location); };
  const handleStopScrape = () => { stopScrape('im'); };

  const allCompanies = useMemo(() => [...new Set(jobs.map((j) => j.company))].sort(), [jobs]);
  const allTitles = useMemo(() => [...new Set(jobs.map((j) => j.title))].sort(), [jobs]);
  const allSources = useMemo(() => [...new Set(jobs.map((j) => j.source).filter((sn) => sources.some((s) => s.name === sn)))].sort(), [jobs, sources]);

  const baseFilteredJobs = useMemo(() => {
    let filtered = jobs.filter((j) => !dismissedIds.has(j.id));
    const jobUrl = (j: Job) => j.jobUrl || j.sourceUrl;
    filtered = filtered.filter((j) => !actionedUrls.has(jobUrl(j)));
    if (selectedCompanies.length > 0) filtered = filtered.filter((j) => selectedCompanies.includes(j.company));
    if (selectedTitles.length > 0) filtered = filtered.filter((j) => selectedTitles.includes(j.title));
    if (filterKeywords.length > 0) filtered = filtered.filter((j) => { const text = `${j.title} ${j.description || ''} ${j.company}`.toLowerCase(); return filterKeywords.some((kw) => text.includes(kw.toLowerCase())); });
    if (selectedSources.length > 0) filtered = filtered.filter((j) => selectedSources.includes(j.source));
    const enabledSources = sources.filter((s) => s.enabled).map((s) => s.name);
    filtered = filtered.filter((j) => enabledSources.includes(j.source));
    const NON_UK_INDICATORS = [/,\s*\b(AL|AK|AZ|AR|CA|CO|CT|DE|FL|GA|HI|ID|IL|IN|IA|KS|KY|LA|ME|MD|MA|MI|MN|MS|MO|MT|NE|NV|NH|NJ|NM|NY|NC|ND|OH|OK|OR|PA|RI|SC|SD|TN|TX|UT|VT|VA|WA|WV|WI|WY)\b/, /\b(massachusetts|california|new york|texas|florida|illinois|pennsylvania|ohio|georgia|michigan|connecticut|new jersey|virginia|maryland|colorado|washington state|minnesota|north carolina)\b/i, /\b(united states|usa|\bUS\b|canada|australia|germany|france|india|singapore|hong kong|japan|china|brazil|israel|netherlands|switzerland|ireland|spain|italy|sweden|denmark|norway|finland|austria|belgium|portugal|south korea|taiwan|thailand|vietnam|mexico|argentina|chile|south africa|nigeria|kenya|uae|dubai|saudi|qatar)\b/i];
    filtered = filtered.filter((j) => { const loc = j.location; if (!loc || loc === 'London, UK') return true; return !NON_UK_INDICATORS.some((pattern) => pattern.test(loc)); });
    if (selectedCity !== 'United Kingdom') {
      const cityLower = selectedCity.toLowerCase();
      const CITY_ALIASES: Record<string, string[]> = { oxford: ['oxfordshire'], cambridge: ['cambridgeshire'], bristol: ['avon'], newcastle: ['tyne and wear', 'tyneside'], nottingham: ['nottinghamshire'], sheffield: ['south yorkshire'], leeds: ['west yorkshire'], liverpool: ['merseyside'], manchester: ['greater manchester'], birmingham: ['west midlands'], southampton: ['hampshire'], bath: ['somerset', 'bath and north east somerset'], aberdeen: ['aberdeenshire'] };
      const aliases = CITY_ALIASES[cityLower] || [];
      filtered = filtered.filter((j) => { const loc = j.location.toLowerCase(); if (loc.includes(cityLower)) return true; if (aliases.some((a) => loc.includes(a))) return true; if (loc.includes('united kingdom') || loc === 'uk' || loc.includes('remote') || loc.includes('various')) return true; const otherCities = UK_CITIES.filter((c) => c.value !== 'United Kingdom' && c.value.toLowerCase() !== cityLower).map((c) => c.value.toLowerCase()); if (otherCities.some((c) => loc.includes(c))) return false; return false; });
    }
    if (datePostedFilter === 'with-date') filtered = filtered.filter((j) => j.postedDate && j.postedDate !== 'Scraped just now');
    else if (datePostedFilter === 'without-date') filtered = filtered.filter((j) => !j.postedDate || j.postedDate === 'Scraped just now');
    if (listedPeriod !== 'any') { const now = new Date(); const cutoff = new Date(); if (listedPeriod === '1d') cutoff.setDate(now.getDate() - 1); else if (listedPeriod === '1w') cutoff.setDate(now.getDate() - 7); else if (listedPeriod === '1m') cutoff.setMonth(now.getMonth() - 1); else if (listedPeriod === '3m') cutoff.setMonth(now.getMonth() - 3); else if (listedPeriod === '6m') cutoff.setMonth(now.getMonth() - 6); filtered = filtered.filter((j) => parsePostedDate(j.postedDate) >= cutoff); }
    if (selectedSeniorities.length > 0) filtered = filtered.filter((j) => selectedSeniorities.includes(j.seniority));
    filtered = filtered.filter((j) => jobMatchesSubCategories(j, 'im', selectedSubCategories));
    filtered = filtered.filter((j) => jobMatchesSecondaryFilter(j, 'im', selectedSecondaryFilter));
    return filtered;
  }, [jobs, dismissedIds, actionedUrls, selectedCompanies, selectedTitles, filterKeywords, selectedSources, sources, datePostedFilter, listedPeriod, selectedSeniorities, selectedCity, selectedSubCategories, selectedSecondaryFilter]);

  const filteredJobs = useMemo(() => {
    const typed = selectedType === 'any' ? baseFilteredJobs : baseFilteredJobs.filter((j) => j.type === selectedType);
    return [...typed].sort((a, b) => { switch (sortBy) { case 'date-asc': return parsePostedDate(a.postedDate).getTime() - parsePostedDate(b.postedDate).getTime(); case 'company-asc': return a.company.localeCompare(b.company); case 'title-asc': return a.title.localeCompare(b.title); default: return parsePostedDate(b.postedDate).getTime() - parsePostedDate(a.postedDate).getTime(); } });
  }, [baseFilteredJobs, selectedType, sortBy]);

  const stats = useMemo(() => ({ total: baseFilteredJobs.length, fullTime: baseFilteredJobs.filter((j) => j.type === 'full-time').length, internship: baseFilteredJobs.filter((j) => j.type === 'internship').length, graduate: baseFilteredJobs.filter((j) => j.type === 'graduate').length }), [baseFilteredJobs]);

  return (<>
    <div className="min-h-screen bg-background bg-grid">
      <NavBar activeTab="/im" selectedCity={selectedCity} onCityChange={handleCityChange} isSearching={isSearching} onSearch={handleScrape} onStop={handleStopScrape} onSignInClick={() => setShowAuthModal(true)} />

      <div className="border-b border-border bg-muted sticky top-[53px] z-40">
        <div className="container max-w-6xl mx-auto px-4 py-1.5 flex items-center gap-4 font-display text-[11px] uppercase tracking-wider text-muted-foreground">
          <span className="whitespace-nowrap">Investment Management</span>
          <span className="h-3 w-px bg-border" />
          <button className="hover:text-foreground transition-colors whitespace-nowrap" onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}>{stats.total} Jobs</button>
          <span className="h-3 w-px bg-border" />
          <button className="hover:text-foreground transition-colors whitespace-nowrap" onClick={() => sourcesRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })}>{sources.filter((s) => s.enabled).length} Sources</button>
        </div>
      </div>

      <main className="container max-w-6xl mx-auto px-4 py-6 space-y-4">
        <FilterRow listedPeriod={listedPeriod} onListedPeriodChange={setListedPeriod} sortBy={sortBy} onSortByChange={setSortBy} datePostedFilter={datePostedFilter} onDatePostedFilterChange={setDatePostedFilter} selectedSeniorities={selectedSeniorities} onSenioritiesChange={setSelectedSeniorities} selectedCompanies={selectedCompanies} onCompaniesChange={setSelectedCompanies} selectedTitles={selectedTitles} onTitlesChange={setSelectedTitles} selectedSources={selectedSources} onSourcesChange={setSelectedSources} filterKeywords={filterKeywords} onAddFilterKeyword={(kw) => setFilterKeywords((prev) => [...prev, kw])} onRemoveFilterKeyword={(kw) => setFilterKeywords((prev) => prev.filter((k) => k !== kw))} allCompanies={allCompanies} allTitles={allTitles} allSources={allSources} mode="im" selectedSubCategories={selectedSubCategories} onSubCategoriesChange={setSelectedSubCategories} selectedSecondaryFilter={selectedSecondaryFilter} onSecondaryFilterChange={setSelectedSecondaryFilter} onClearFilters={() => { setListedPeriod('any'); setDatePostedFilter('all'); setSelectedSeniorities([]); setSelectedCompanies([]); setSelectedTitles([]); setSelectedSources([]); setFilterKeywords([]); setSelectedType('any'); setSelectedSubCategories([]); setSelectedSecondaryFilter([]); }} />

        <div className="grid grid-cols-3 sm:grid-cols-4 gap-1.5 sm:gap-3">
          <button onClick={() => isAuthenticated ? setViewMode(viewMode === 'saved' ? 'search' : 'saved') : setShowAuthModal(true)} className={`border rounded-md bg-card p-2 sm:p-3 text-center transition-all cursor-pointer hover:glow-primary overflow-hidden ${viewMode === 'saved' ? 'border-primary/50 glow-primary' : 'border-border hover:border-primary/30'}`}><div className="font-display text-lg sm:text-2xl font-bold text-primary">{isAuthenticated ? savedJobs.length : '–'}</div><div className="font-display text-[8px] sm:text-[10px] uppercase tracking-widest text-muted-foreground truncate">Saved</div></button>
          <button onClick={() => isAuthenticated ? setViewMode(viewMode === 'applied' ? 'search' : 'applied') : setShowAuthModal(true)} className={`border rounded-md bg-card p-2 sm:p-3 text-center transition-all cursor-pointer hover:glow-primary overflow-hidden ${viewMode === 'applied' ? 'border-success/50 glow-primary' : 'border-border hover:border-success/30'}`}><div className="font-display text-lg sm:text-2xl font-bold text-success">{isAuthenticated ? appliedJobs.length : '–'}</div><div className="font-display text-[8px] sm:text-[10px] uppercase tracking-widest text-muted-foreground truncate">Applied</div></button>
          <button onClick={() => isAuthenticated ? setViewMode(viewMode === 'not_interested' ? 'search' : 'not_interested') : setShowAuthModal(true)} className={`border rounded-md bg-card p-2 sm:p-3 text-center transition-all cursor-pointer hover:glow-primary overflow-hidden ${viewMode === 'not_interested' ? 'border-destructive/50 glow-primary' : 'border-border hover:border-destructive/30'}`}><div className="font-display text-lg sm:text-2xl font-bold text-destructive">{isAuthenticated ? notInterestedJobs.length : '–'}</div><div className="font-display text-[8px] sm:text-[10px] uppercase tracking-widest text-muted-foreground truncate">Dismissed</div></button>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-4 gap-4">
          <div className="lg:col-span-3 space-y-2">
            {viewMode === 'saved' ? (
              savedJobs.length === 0 ? (<div className="border border-border rounded-md bg-card p-12 text-center"><Bookmark className="h-8 w-8 text-primary mx-auto mb-3" /><p className="font-display text-sm text-muted-foreground">No saved jobs yet</p></div>) : savedJobs.map((action) => (<div key={action.id} className="group flex items-center justify-between border border-border rounded-md p-4 bg-card transition-all"><div className="min-w-0"><div className="flex items-center gap-2 mb-1"><Bookmark className="h-3.5 w-3.5 text-primary" /><span className="text-[11px] font-display text-muted-foreground uppercase tracking-wider">{action.job_source}</span></div><h3 className="font-body font-semibold text-foreground">{action.job_title}</h3><p className="text-sm text-muted-foreground">{action.job_company}</p></div><button onClick={() => { removeAction(action.id); toast({ title: 'Removed from Saved', description: action.job_title }); }} className="shrink-0 p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted transition-colors sm:opacity-0 sm:group-hover:opacity-100" title="Remove"><Undo2 className="h-3.5 w-3.5" /></button></div>))
            ) : viewMode === 'applied' ? (
              appliedJobs.length === 0 ? (<div className="border border-border rounded-md bg-card p-12 text-center"><CheckCircle2 className="h-8 w-8 text-success mx-auto mb-3" /><p className="font-display text-sm text-muted-foreground">No applications yet</p></div>) : appliedJobs.map((action) => (<div key={action.id} className="group flex items-center justify-between border border-border rounded-md p-4 bg-card transition-all"><div className="min-w-0"><div className="flex items-center gap-2 mb-1"><CheckCircle2 className="h-3.5 w-3.5 text-success" /><span className="text-[11px] font-display text-muted-foreground uppercase tracking-wider">{action.job_source}</span></div><h3 className="font-body font-semibold text-foreground">{action.job_title}</h3><p className="text-sm text-muted-foreground">{action.job_company}</p></div><button onClick={() => { removeAction(action.id); toast({ title: 'Removed from Applied', description: action.job_title }); }} className="shrink-0 p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted transition-colors sm:opacity-0 sm:group-hover:opacity-100" title="Remove"><Undo2 className="h-3.5 w-3.5" /></button></div>))
            ) : viewMode === 'not_interested' ? (
              notInterestedJobs.length === 0 ? (<div className="border border-border rounded-md bg-card p-12 text-center"><XCircle className="h-8 w-8 text-destructive mx-auto mb-3" /><p className="font-display text-sm text-muted-foreground">No dismissed roles</p></div>) : notInterestedJobs.map((action) => (<div key={action.id} className="group flex items-center justify-between border border-border rounded-md p-4 bg-card transition-all"><div className="min-w-0"><div className="flex items-center gap-2 mb-1"><XCircle className="h-3.5 w-3.5 text-destructive" /><span className="text-[11px] font-display text-muted-foreground uppercase tracking-wider">{action.job_source}</span></div><h3 className="font-body font-semibold text-foreground">{action.job_title}</h3><p className="text-sm text-muted-foreground">{action.job_company}</p></div><button onClick={() => { removeAction(action.id); toast({ title: 'Removed from Dismissed', description: action.job_title }); }} className="shrink-0 p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted transition-colors sm:opacity-0 sm:group-hover:opacity-100" title="Remove"><Undo2 className="h-3.5 w-3.5" /></button></div>))
            ) : isSearching ? (
              <ScrapeProgress isSearching={isSearching} sourceCount={sources.filter((s) => s.enabled).length} startedAt={scrapeState.startedAt} />
            ) : !hasScraped ? (
              <div className="border border-border rounded-md bg-card p-12 text-center"><Zap className="h-8 w-8 text-primary mx-auto mb-3" /><p className="font-display text-sm text-foreground mb-1">Ready to scrape IM jobs</p><p className="text-xs text-muted-foreground">Configure your sources, then click Scrape jobs</p></div>
            ) : filteredJobs.length === 0 ? (
              <div className="border border-border rounded-md bg-card p-12 text-center"><Briefcase className="h-8 w-8 text-muted-foreground mx-auto mb-3" /><p className="font-display text-sm text-muted-foreground">No jobs match your filters</p></div>
            ) : filteredJobs.map((job) => (
              <JobCard key={job.id} job={job}
                onSaved={isAuthenticated ? async (j) => { const url = j.jobUrl || j.sourceUrl; const actionId = await addAction(url, j.title, j.company, j.source, 'saved'); toast({ title: 'Saved', description: j.title, action: actionId ? <ToastAction altText="Undo" onClick={() => removeAction(actionId)}>Undo</ToastAction> : undefined }); } : () => setShowAuthModal(true)}
                onApplied={isAuthenticated ? async (j) => { const url = j.jobUrl || j.sourceUrl; const actionId = await addAction(url, j.title, j.company, j.source, 'applied'); toast({ title: 'Marked as Applied', description: j.title, action: actionId ? <ToastAction altText="Undo" onClick={() => removeAction(actionId)}>Undo</ToastAction> : undefined }); } : () => setShowAuthModal(true)}
                onNotInterested={isAuthenticated ? async (j) => { const url = j.jobUrl || j.sourceUrl; const actionId = await addAction(url, j.title, j.company, j.source, 'not_interested'); toast({ title: 'Not interested', description: j.title, action: actionId ? <ToastAction altText="Undo" onClick={() => removeAction(actionId)}>Undo</ToastAction> : undefined }); } : () => setShowAuthModal(true)}
              />
            ))}
          </div>
          <div ref={sourcesRef} className="space-y-4">
            <SourceManager sources={sources} onToggleSource={handleToggleSource} onToggleAll={handleToggleAll} onAddSource={handleAddSource} onRemoveSource={handleRemoveSource} hideManualSources />
          </div>
        </div>
      </main>
    </div>
    <AuthModal open={showAuthModal} onClose={() => setShowAuthModal(false)} onSuccess={() => setShowAuthModal(false)} />
  </>);
};

export default IMScout;
