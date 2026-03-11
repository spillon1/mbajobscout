import { JobSource } from '@/types/jobs';
import { getSourceUrlForLocation } from './ukLocations';

/** MC-specific source URL builder — replaces "venture capital" with "management consulting" */
function getMCSourceUrl(sourceName: string, city: string): string | undefined {
  const vcUrl = getSourceUrlForLocation(sourceName, city);
  if (!vcUrl) return undefined;
  return vcUrl
    .replace(/venture\+capital/gi, 'management+consulting')
    .replace(/venture%20capital/gi, 'management%20consulting')
    .replace(/%22venture\+capital%22/gi, '%22management+consulting%22')
    .replace(/%22venture%20capital%22/gi, '%22management%20consulting%22')
    .replace(/venture-capital/gi, 'management-consulting');
}

const MC_SOURCE_TEMPLATES: { id: string; name: string; defaultUrl: string; enabled: boolean; status: 'connected' | 'error' | 'checking' | 'unknown' }[] = [
  { id: 'mc-10', name: 'Glassdoor UK', defaultUrl: 'https://www.glassdoor.co.uk/Job/jobs.htm', enabled: true, status: 'unknown' },
  { id: 'mc-m0', name: 'Google Jobs', defaultUrl: 'https://www.google.com/search?udm=8&q=management+consulting+jobs', enabled: true, status: 'unknown' },
  { id: 'mc-9', name: 'Indeed UK', defaultUrl: 'https://uk.indeed.com/jobs?q=%22management+consulting%22', enabled: true, status: 'unknown' },
  { id: 'mc-2', name: 'LinkedIn Jobs', defaultUrl: 'https://www.linkedin.com/jobs/search/?keywords=%22management+consulting%22', enabled: true, status: 'unknown' },
];

export function getMCDefaultSources(city: string): (JobSource & { status?: 'connected' | 'error' | 'checking' | 'unknown' })[] {
  return MC_SOURCE_TEMPLATES.map((t) => ({
    id: t.id,
    name: t.name,
    url: getMCSourceUrl(t.name, city) || t.defaultUrl,
    enabled: t.enabled,
    status: t.status,
  }));
}

export const MC_DEFAULT_KEYWORDS = [
  'Management consulting',
  'Management consultant',
  'Strategy consulting',
  'Strategy consultant',
  'Consulting analyst',
  'Consulting internship',
  'Consulting graduate',
];
