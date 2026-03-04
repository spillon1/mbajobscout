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
  const jobs: Job[] = (data.jobs || [])
    .map((j: any) => ({ ...j, type: j.type as JobType }))
    .filter(isValidJob);

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
  })).filter(isValidJob);
}

/** Returns false for non-job entries like category headers, newsletter prompts, etc. */
function isValidJob(job: Job): boolean {
  const titleLower = job.title.toLowerCase();
  const descLower = (job.description || '').toLowerCase();

  // Exact junk titles
  const JUNK_TITLES = [
    'venture capital jobs in london', 'venture capital careers',
    "the vc industry's trusted resource", 'filters and topics',
    'search results', 'united states',
  ];
  if (JUNK_TITLES.includes(titleLower)) return false;
  if (titleLower.includes('trusted resource')) return false;

  // Pattern-based junk: generic category/location headers
  if (/^(venture capital|vc)\s+(jobs|careers)\s+(in|near)\s+/i.test(job.title)) return false;
  if (/^jobs\s+(in|near)\s+/i.test(job.title)) return false;

  // Title matches source name exactly
  if (titleLower === job.source.toLowerCase()) return false;

  // Unknown company with short or generic title
  if (job.company === 'Unknown' && job.title.length < 15) return false;

  // Description contains newsletter/subscribe spam (not a real job)
  const spamSignals = ['subscribing to our', 'newsletter', 'subscribe to', 'terms & conditions', 'something went wrong while submitting'];
  const spamCount = spamSignals.filter(s => descLower.includes(s)).length;
  if (spamCount >= 2) return false;

  // Skip entries that are clearly not job postings
  const skipWords = ['cookie policy', 'privacy policy', 'sign in', 'log in', 'contact us'];
  if (skipWords.some(w => titleLower.includes(w))) return false;

  // Filter out jobs older than 6 months
  if (job.postedDate && job.postedDate !== 'Scraped just now') {
    const parsed = tryParseDate(job.postedDate);
    if (parsed) {
      const sixMonthsAgo = new Date();
      sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);
      if (parsed < sixMonthsAgo) return false;
    }
  }

  return true;
}

/** Parse freetext date strings into Date objects */
function tryParseDate(dateStr: string): Date | null {
  const rel = dateStr.match(/(\d+)\s*(hour|day|week|month)s?\s*ago/i);
  if (rel) {
    const n = parseInt(rel[1]);
    const unit = rel[2].toLowerCase();
    const d = new Date();
    if (unit === 'hour') d.setHours(d.getHours() - n);
    else if (unit === 'day') d.setDate(d.getDate() - n);
    else if (unit === 'week') d.setDate(d.getDate() - n * 7);
    else if (unit === 'month') d.setMonth(d.getMonth() - n);
    return d;
  }
  const parsed = new Date(dateStr);
  if (!isNaN(parsed.getTime())) return parsed;
  const monthMatch = dateStr.match(/(\w+)\s+(\d{1,2}),?\s+(\d{4})/);
  if (monthMatch) {
    const attempt = new Date(`${monthMatch[1]} ${monthMatch[2]}, ${monthMatch[3]}`);
    if (!isNaN(attempt.getTime())) return attempt;
  }
  return null;
}
