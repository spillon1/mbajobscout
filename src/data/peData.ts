import { JobSource } from '@/types/jobs';
import { getSourceUrlForLocation } from './ukLocations';

/** PE-specific source URL builder — replaces "venture capital" with "private equity" */
function getPESourceUrl(sourceName: string, city: string): string | undefined {
  const vcUrl = getSourceUrlForLocation(sourceName, city);
  if (!vcUrl) return undefined;
  return vcUrl
    .replace(/venture\+capital/gi, 'private+equity')
    .replace(/venture%20capital/gi, 'private%20equity')
    .replace(/%22venture\+capital%22/gi, '%22private+equity%22')
    .replace(/%22venture%20capital%22/gi, '%22private%20equity%22')
    .replace(/venture-capital/gi, 'private-equity');
}

const PE_SOURCE_TEMPLATES: { id: string; name: string; defaultUrl: string; enabled: boolean; status: 'connected' | 'error' | 'checking' | 'unknown' }[] = [
  { id: 'pe-6', name: 'eFinancialCareers', defaultUrl: 'https://www.efinancialcareers.co.uk/jobs/', enabled: true, status: 'unknown' },
  { id: 'pe-10', name: 'Glassdoor UK', defaultUrl: 'https://www.glassdoor.co.uk/Job/jobs.htm', enabled: true, status: 'unknown' },
  { id: 'pe-m0', name: 'Google Jobs', defaultUrl: 'https://www.google.com/search?udm=8&q=private+equity+jobs', enabled: true, status: 'unknown' },
  { id: 'pe-9', name: 'Indeed UK', defaultUrl: 'https://uk.indeed.com/jobs?q=%22private+equity%22', enabled: true, status: 'unknown' },
  
  { id: 'pe-2', name: 'LinkedIn Jobs', defaultUrl: 'https://www.linkedin.com/jobs/search/?keywords=%22private+equity%22', enabled: true, status: 'unknown' },
];

export function getPEDefaultSources(city: string): (JobSource & { status?: 'connected' | 'error' | 'checking' | 'unknown' })[] {
  return PE_SOURCE_TEMPLATES.map((t) => ({
    id: t.id,
    name: t.name,
    url: getPESourceUrl(t.name, city) || t.defaultUrl,
    enabled: t.enabled,
    status: t.status,
  }));
}

export const PE_DEFAULT_KEYWORDS = [
  'Private equity',
  'Private equity internship',
  'Private equity intern',
  'Private equity graduate',
  'Private equity analyst',
];
