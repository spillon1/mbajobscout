import { useState, useMemo } from 'react';
import { JobType, JobSource } from '@/types/jobs';
import { MOCK_JOBS, DEFAULT_SOURCES, DEFAULT_KEYWORDS } from '@/data/jobData';
import { FilterBar } from '@/components/FilterBar';
import { JobCard } from '@/components/JobCard';
import { SourceManager } from '@/components/SourceManager';
import { KeywordBar } from '@/components/KeywordBar';
import { Briefcase, Zap } from 'lucide-react';

const Index = () => {
  const [searchQuery, setSearchQuery] = useState('');
  const [location, setLocation] = useState('London, United Kingdom');
  const [selectedTypes, setSelectedTypes] = useState<JobType[]>([]);
  const [sources, setSources] = useState<JobSource[]>(DEFAULT_SOURCES);
  const [keywords, setKeywords] = useState<string[]>(DEFAULT_KEYWORDS);
  const [isSearching, setIsSearching] = useState(false);

  const handleTypeToggle = (type: JobType) => {
    setSelectedTypes((prev) =>
      prev.includes(type) ? prev.filter((t) => t !== type) : [...prev, type]
    );
  };

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

  const filteredJobs = useMemo(() => {
    let jobs = MOCK_JOBS;

    if (selectedTypes.length > 0) {
      jobs = jobs.filter((j) => selectedTypes.includes(j.type));
    }

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      jobs = jobs.filter(
        (j) =>
          j.title.toLowerCase().includes(q) ||
          j.company.toLowerCase().includes(q) ||
          j.description?.toLowerCase().includes(q)
      );
    }

    const enabledSources = sources.filter((s) => s.enabled).map((s) => s.name);
    jobs = jobs.filter((j) => enabledSources.includes(j.source));

    return jobs;
  }, [searchQuery, selectedTypes, sources]);

  const stats = useMemo(() => ({
    total: filteredJobs.length,
    fullTime: filteredJobs.filter((j) => j.type === 'full-time').length,
    internship: filteredJobs.filter((j) => j.type === 'internship').length,
    graduate: filteredJobs.filter((j) => j.type === 'graduate').length,
  }), [filteredJobs]);

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
        {/* Filters */}
        <FilterBar
          searchQuery={searchQuery}
          onSearchChange={setSearchQuery}
          location={location}
          onLocationChange={setLocation}
          selectedTypes={selectedTypes}
          onTypeToggle={handleTypeToggle}
          onSearch={handleSearch}
          isSearching={isSearching}
        />

        {/* Keywords */}
        <KeywordBar
          keywords={keywords}
          onAddKeyword={(kw) => setKeywords((prev) => [...prev, kw])}
          onRemoveKeyword={(kw) => setKeywords((prev) => prev.filter((k) => k !== kw))}
        />

        {/* Stats */}
        <div className="grid grid-cols-4 gap-3">
          {[
            { label: 'Total', value: stats.total, color: 'text-foreground' },
            { label: 'Full Time', value: stats.fullTime, color: 'text-primary' },
            { label: 'Internship', value: stats.internship, color: 'text-warning' },
            { label: 'Graduate', value: stats.graduate, color: 'text-accent' },
          ].map(({ label, value, color }) => (
            <div key={label} className="border border-border rounded-md bg-card p-3 text-center">
              <div className={`font-display text-2xl font-bold ${color}`}>{value}</div>
              <div className="font-display text-[10px] uppercase tracking-widest text-muted-foreground">{label}</div>
            </div>
          ))}
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
