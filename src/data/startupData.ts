import { JobSource } from '@/types/jobs';
import { getSourceUrlForLocation } from './ukLocations';

function getStartupSourceUrl(sourceName: string, city: string): string | undefined {
  const vcUrl = getSourceUrlForLocation(sourceName, city);
  if (!vcUrl) return undefined;
  return vcUrl
    .replace(/venture\+capital/gi, 'startup')
    .replace(/venture%20capital/gi, 'startup')
    .replace(/%22venture\+capital%22/gi, '%22startup%22')
    .replace(/%22venture%20capital%22/gi, '%22startup%22')
    .replace(/venture-capital/gi, 'startup');
}

const STARTUP_SOURCE_TEMPLATES: { id: string; name: string; defaultUrl: string; enabled: boolean; status: 'connected' | 'error' | 'checking' | 'unknown' }[] = [
  { id: 'su-10', name: 'Glassdoor UK', defaultUrl: 'https://www.glassdoor.co.uk/Job/jobs.htm', enabled: true, status: 'unknown' },
  { id: 'su-m0', name: 'Google Jobs', defaultUrl: 'https://www.google.com/search?udm=8&q=startup+chief+of+staff+OR+founder+associate+OR+growth+jobs', enabled: true, status: 'unknown' },
  { id: 'su-9', name: 'Indeed UK', defaultUrl: 'https://uk.indeed.com/jobs?q=%22startup%22+%22chief+of+staff%22+OR+%22founder+associate%22', enabled: true, status: 'unknown' },
  { id: 'su-2', name: 'LinkedIn Jobs', defaultUrl: 'https://www.linkedin.com/jobs/search/?keywords=%22startup%22+%22chief+of+staff%22', enabled: true, status: 'unknown' },
  { id: 'su-otta', name: 'Otta', defaultUrl: 'https://otta.com/jobs', enabled: true, status: 'unknown' },
  { id: 'su-wf', name: 'Wellfound', defaultUrl: 'https://wellfound.com/jobs', enabled: true, status: 'unknown' },
];

export function getStartupDefaultSources(city: string): (JobSource & { status?: 'connected' | 'error' | 'checking' | 'unknown' })[] {
  return STARTUP_SOURCE_TEMPLATES.map((t) => ({
    id: t.id,
    name: t.name,
    url: getStartupSourceUrl(t.name, city) || t.defaultUrl,
    enabled: t.enabled,
    status: t.status,
  }));
}

export const STARTUP_DEFAULT_KEYWORDS = [
  'Chief of staff startup',
  'Founder associate',
  'Startup operations',
  'Startup growth',
  'Startup strategy',
  'Startup product manager',
  'GTM startup',
];
