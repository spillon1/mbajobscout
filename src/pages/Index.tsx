import { useState, useMemo } from 'react';
import { JobType, JobSource } from '@/types/jobs';
import { MOCK_JOBS, DEFAULT_SOURCES, DEFAULT_KEYWORDS } from '@/data/jobData';
import { FilterBar } from '@/components/FilterBar';
import { FilterRow, ListedPeriod, JobStatus } from '@/components/FilterRow';
import { JobCard } from '@/components/JobCard';
import { SourceManager } from '@/components/SourceManager';
import { KeywordBar } from '@/components/KeywordBar';
import { Briefcase, Zap } from 'lucide-react';

const Index = () => {
  const [location, setLocation] = useState('London, United Kingdom');
  const [sources, setSources] = useState<JobSource[]>(DEFAULT_SOURCES);
  const [keywords, setKeywords] = useState<string[]>(DEFAULT_KEYWORDS);
  const [isSearching, setIsSearching] = useState(false);

  // Filters
  const [selectedType, setSelectedType] = useState<JobType | 'any'>('any');
  const [listedPeriod, setListedPeriod] = useState<ListedPeriod>('any');
  const [jobStatus, setJobStatus] = useState<JobStatus>('any');
  const [selectedCompanies, setSelectedCompanies] = useState<string[]>([]);
  const [selectedTitles, setSelectedTitles] = useState<string[]>([]);
  const [filterKeywords, setFilterKeywords] = useState<string[]>([]);

  const handleToggleSource = (id: string) => {
    setSources((prev) =>
      prev.map((s) => (s.id === id ? { ...s, enabled: !s.enabled } : s))
    );
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

  const handleSearch = () => {
    setIsSearching(true);
    setTimeout(() => setIsSearching(false), 2000);
  };

  // Derive unique companies and titles from all jobs
  const allCompanies = useMemo(() => [...new Set(MOCK_JOBS.map((j) => j.company))].sort(), []);
  const allTitles = useMemo(() => [...new Set(MOCK_JOBS.map((j) => j.title))].sort(), []);

  // Jobs filtered by everything EXCEPT type (for stable stat counts)
  const baseFilteredJobs = useMemo(() => {
    let jobs = MOCK_JOBS;

    if (selectedCompanies.length > 0) {
      jobs = jobs.filter((j) => selectedCompanies.includes(j.company));
    }

    if (selectedTitles.length > 0) {
      jobs = jobs.filter((j) => selectedTitles.includes(j.title));
    }

    if (filterKeywords.length > 0) {
      jobs = jobs.filter((j) => {
        const text = `${j.title} ${j.description || ''} ${j.company}`.toLowerCase();
        return filterKeywords.some((kw) => text.includes(kw.toLowerCase()));
      });
    }

    const enabledSources = sources.filter((s) => s.enabled).map((s) => s.name);
    jobs = jobs.filter((j) => enabledSources.includes(j.source));

    return jobs;
  }, [selectedCompanies, selectedTitles, filterKeywords, sources]);

  const filteredJobs = useMemo(() => {
    if (selectedType === 'any') return baseFilteredJobs;
    return baseFilteredJobs.filter((j) => j.type === selectedType);
  }, [baseFilteredJobs, selectedType]);

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
        <div className="container max-w-6xl mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
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
          <div className="flex items-center gap-4 font-display text-[11px] uppercase tracking-wider text-muted-foreground">
            <span>{stats.total} jobs</span>
            <span className="h-3 w-px bg-border" />
            <span>{sources.filter((s) => s.enabled).length} sources</span>
          </div>
        </div>
      </header>

      {/* Main */}
      <main className="container max-w-6xl mx-auto px-4 py-6 space-y-4">
        {/* Location & Scrape */}
        <FilterBar
          location={location}
          onLocationChange={setLocation}
          onSearch={handleSearch}
          isSearching={isSearching}
        />

        {/* Keywords */}
        <KeywordBar
          keywords={keywords}
          onAddKeyword={(kw) => setKeywords((prev) => [...prev, kw])}
          onRemoveKeyword={(kw) => setKeywords((prev) => prev.filter((k) => k !== kw))}
        />

        {/* Filters */}
        <FilterRow
          selectedType={selectedType}
          onTypeChange={setSelectedType}
          listedPeriod={listedPeriod}
          onListedPeriodChange={setListedPeriod}
          jobStatus={jobStatus}
          onJobStatusChange={setJobStatus}
          selectedCompanies={selectedCompanies}
          onCompaniesChange={setSelectedCompanies}
          selectedTitles={selectedTitles}
          onTitlesChange={setSelectedTitles}
          filterKeywords={filterKeywords}
          onAddFilterKeyword={(kw) => setFilterKeywords((prev) => [...prev, kw])}
          onRemoveFilterKeyword={(kw) => setFilterKeywords((prev) => prev.filter((k) => k !== kw))}
          allCompanies={allCompanies}
          allTitles={allTitles}
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
            {filteredJobs.length === 0 ? (
              <div className="border border-border rounded-md bg-card p-12 text-center">
                <Briefcase className="h-8 w-8 text-muted-foreground mx-auto mb-3" />
                <p className="font-display text-sm text-muted-foreground">No jobs match your filters</p>
              </div>
            ) : (
              filteredJobs.map((job) => <JobCard key={job.id} job={job} />)
            )}
          </div>

          {/* Sidebar */}
          <div className="space-y-4">
            <SourceManager
              sources={sources}
              onToggleSource={handleToggleSource}
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
