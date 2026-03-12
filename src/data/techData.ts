import { JobSource } from '@/types/jobs';
import { getSourceUrlForLocation } from './ukLocations';

function getTechSourceUrl(sourceName: string, city: string): string | undefined {
  const vcUrl = getSourceUrlForLocation(sourceName, city);
  if (!vcUrl) return undefined;
  return vcUrl
    .replace(/venture\+capital/gi, 'technology')
    .replace(/venture%20capital/gi, 'technology')
    .replace(/%22venture\+capital%22/gi, '%22technology%22')
    .replace(/%22venture%20capital%22/gi, '%22technology%22')
    .replace(/venture-capital/gi, 'technology');
}

const TECH_SOURCE_TEMPLATES: { id: string; name: string; defaultUrl: string; enabled: boolean; status: 'connected' | 'error' | 'checking' | 'unknown' }[] = [
  { id: 'tech-10', name: 'Glassdoor UK', defaultUrl: 'https://www.glassdoor.co.uk/Job/jobs.htm', enabled: true, status: 'unknown' },
  { id: 'tech-m0', name: 'Google Jobs', defaultUrl: 'https://www.google.com/search?udm=8&q=technology+product+management+strategy+jobs', enabled: true, status: 'unknown' },
  { id: 'tech-9', name: 'Indeed UK', defaultUrl: 'https://uk.indeed.com/jobs?q=%22product+manager%22+OR+%22strategy+and+operations%22+OR+%22bizops%22', enabled: true, status: 'unknown' },
  { id: 'tech-2', name: 'LinkedIn Jobs', defaultUrl: 'https://www.linkedin.com/jobs/search/?keywords=%22product+manager%22+OR+%22strategy+operations%22', enabled: true, status: 'unknown' },
  { id: 'tech-otta', name: 'Otta', defaultUrl: 'https://otta.com/jobs', enabled: true, status: 'unknown' },
];

export function getTechDefaultSources(city: string): (JobSource & { status?: 'connected' | 'error' | 'checking' | 'unknown' })[] {
  return TECH_SOURCE_TEMPLATES.map((t) => ({
    id: t.id,
    name: t.name,
    url: getTechSourceUrl(t.name, city) || t.defaultUrl,
    enabled: t.enabled,
    status: t.status,
  }));
}

export const TECH_DEFAULT_KEYWORDS = [
  'Product manager',
  'Strategy and operations',
  'BizOps',
  'Corporate development',
  'Go to market',
  'Growth manager',
  'Product operations',
  'Tech strategy',
];
