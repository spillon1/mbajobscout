import { JobSource } from '@/types/jobs';
import { getSourceUrlForLocation } from './ukLocations';

/** IB-specific source URL builder — replaces "venture capital" with "investment banking" */
function getIBSourceUrl(sourceName: string, city: string): string | undefined {
  const vcUrl = getSourceUrlForLocation(sourceName, city);
  if (!vcUrl) return undefined;
  return vcUrl
    .replace(/venture\+capital/gi, 'investment+banking')
    .replace(/venture%20capital/gi, 'investment%20banking')
    .replace(/%22venture\+capital%22/gi, '%22investment+banking%22')
    .replace(/%22venture%20capital%22/gi, '%22investment%20banking%22')
    .replace(/venture-capital/gi, 'investment-banking');
}

const IB_SOURCE_TEMPLATES: { id: string; name: string; defaultUrl: string; enabled: boolean; status: 'connected' | 'error' | 'checking' | 'unknown' }[] = [
  { id: 'ib-6', name: 'eFinancialCareers', defaultUrl: 'https://www.efinancialcareers.co.uk/jobs/', enabled: true, status: 'unknown' },
  { id: 'ib-10', name: 'Glassdoor UK', defaultUrl: 'https://www.glassdoor.co.uk/Job/jobs.htm', enabled: true, status: 'unknown' },
  { id: 'ib-m0', name: 'Google Jobs', defaultUrl: 'https://www.google.com/search?udm=8&q=investment+banking+jobs', enabled: true, status: 'unknown' },
  { id: 'ib-9', name: 'Indeed UK', defaultUrl: 'https://uk.indeed.com/jobs?q=%22investment+banking%22', enabled: true, status: 'unknown' },
  { id: 'ib-2', name: 'LinkedIn Jobs', defaultUrl: 'https://www.linkedin.com/jobs/search/?keywords=%22investment+banking%22', enabled: true, status: 'unknown' },
];

export function getIBDefaultSources(city: string): (JobSource & { status?: 'connected' | 'error' | 'checking' | 'unknown' })[] {
  return IB_SOURCE_TEMPLATES.map((t) => ({
    id: t.id,
    name: t.name,
    url: getIBSourceUrl(t.name, city) || t.defaultUrl,
    enabled: t.enabled,
    status: t.status,
  }));
}

export const IB_DEFAULT_KEYWORDS = [
  'Investment banking',
  'Investment banking internship',
  'Investment banking intern',
  'Investment banking graduate',
  'Investment banking analyst',
];
