import { supabase } from '@/integrations/supabase/client';
import { Job, JobSource, JobType } from '@/types/jobs';

interface ScrapeResult {
  success: boolean;
  jobs: Job[];
  sourceStatuses: Record<string, { status: string; error?: string; count?: number }>;
  error?: string;
}

export async function scrapeJobs(
  sources: JobSource[],
  keywords: string[],
  location: string
): Promise<ScrapeResult> {
  const enabledSources = sources
    .filter((s) => s.enabled)
    .map((s) => ({ name: s.name, url: s.url }));

  if (enabledSources.length === 0) {
    return { success: false, jobs: [], sourceStatuses: {}, error: 'No sources enabled' };
  }

  const { data, error } = await supabase.functions.invoke('scrape-jobs', {
    body: { sources: enabledSources, keywords, location },
  });

  if (error) {
    console.error('Scrape error:', error);
    return { success: false, jobs: [], sourceStatuses: {}, error: error.message };
  }

  if (!data.success) {
    return { success: false, jobs: [], sourceStatuses: data.sourceStatuses || {}, error: data.error };
  }

  // Filter out junk entries
  const JUNK_TITLES = ['venture capital jobs in london', 'venture capital careers', "the vc industry's trusted resource", 'filters and topics', 'search results'];
  const jobs: Job[] = (data.jobs || [])
    .map((j: any) => ({ ...j, type: j.type as JobType }))
    .filter((j: Job) => {
      const titleLower = j.title.toLowerCase();
      if (JUNK_TITLES.includes(titleLower)) return false;
      if (j.company === 'Unknown' && j.title.length < 10) return false;
      if (titleLower === j.source.toLowerCase()) return false;
      return true;
    });

  // Save to database using upsert (deduplicate by url)
  if (jobs.length > 0) {
    const rows = jobs.map((j) => ({
      title: j.title,
      company: j.company,
      location: j.location,
      type: j.type,
      source: j.source,
      source_url: j.sourceUrl,
      url: j.url,
      posted_date: j.postedDate || null,
      description: j.description || null,
      salary: j.salary || null,
    }));

    const { error: insertError } = await supabase
      .from('scraped_jobs')
      .upsert(rows, { onConflict: 'url', ignoreDuplicates: false });

    if (insertError) {
      console.error('Failed to save jobs:', insertError);
    }
  }

  return {
    success: true,
    jobs,
    sourceStatuses: data.sourceStatuses || {},
  };
}

export async function loadSavedJobs(): Promise<Job[]> {
  const { data, error } = await supabase
    .from('scraped_jobs')
    .select('*')
    .order('scraped_at', { ascending: false });

  if (error) {
    console.error('Failed to load jobs:', error);
    return [];
  }

  return (data || []).map((row) => ({
    id: row.id,
    title: row.title,
    company: row.company,
    location: row.location,
    type: row.type as JobType,
    source: row.source,
    sourceUrl: row.source_url,
    url: row.url,
    postedDate: row.posted_date || undefined,
    description: row.description || undefined,
    salary: row.salary || undefined,
  }));
}
