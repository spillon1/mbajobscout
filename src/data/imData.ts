import { JobSource } from '@/types/jobs';
import { getSourceUrlForLocation } from './ukLocations';

function getIMSourceUrl(sourceName: string, city: string): string | undefined {
  const vcUrl = getSourceUrlForLocation(sourceName, city);
  if (!vcUrl) return undefined;
  return vcUrl
    .replace(/venture\+capital/gi, 'investment+management')
    .replace(/venture%20capital/gi, 'investment%20management')
    .replace(/%22venture\+capital%22/gi, '%22investment+management%22')
    .replace(/%22venture%20capital%22/gi, '%22investment%20management%22')
    .replace(/venture-capital/gi, 'investment-management');
}

const IM_SOURCE_TEMPLATES: { id: string; name: string; defaultUrl: string; enabled: boolean; status: 'connected' | 'error' | 'checking' | 'unknown' }[] = [
  { id: 'im-6', name: 'eFinancialCareers', defaultUrl: 'https://www.efinancialcareers.co.uk/jobs/', enabled: true, status: 'unknown' },
  { id: 'im-10', name: 'Glassdoor UK', defaultUrl: 'https://www.glassdoor.co.uk/Job/jobs.htm', enabled: true, status: 'unknown' },
  { id: 'im-m0', name: 'Google Jobs', defaultUrl: 'https://www.google.com/search?udm=8&q=investment+management+jobs', enabled: true, status: 'unknown' },
  { id: 'im-9', name: 'Indeed UK', defaultUrl: 'https://uk.indeed.com/jobs?q=%22investment+management%22', enabled: true, status: 'unknown' },
  { id: 'im-2', name: 'LinkedIn Jobs', defaultUrl: 'https://www.linkedin.com/jobs/search/?keywords=%22investment+management%22', enabled: true, status: 'unknown' },
];

export function getIMDefaultSources(city: string): (JobSource & { status?: 'connected' | 'error' | 'checking' | 'unknown' })[] {
  return IM_SOURCE_TEMPLATES.map((t) => ({
    id: t.id,
    name: t.name,
    url: getIMSourceUrl(t.name, city) || t.defaultUrl,
    enabled: t.enabled,
    status: t.status,
  }));
}

export const IM_DEFAULT_KEYWORDS = [
  'Investment management',
  'Asset management',
  'Hedge fund',
  'Family office',
  'Portfolio manager',
  'Fund manager',
  'Equity research',
  'Investment analyst',
  'Wealth management',
  'Private wealth',
];
