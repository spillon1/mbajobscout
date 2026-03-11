import { JobSource } from '@/types/jobs';
import { getSourceUrlForLocation } from './ukLocations';

/** S&T-specific source URL builder — replaces "venture capital" with "sales trading" */
function getSTSourceUrl(sourceName: string, city: string): string | undefined {
  const vcUrl = getSourceUrlForLocation(sourceName, city);
  if (!vcUrl) return undefined;
  return vcUrl
    .replace(/venture\+capital/gi, 'sales+trading')
    .replace(/venture%20capital/gi, 'sales%20trading')
    .replace(/%22venture\+capital%22/gi, '%22sales+trading%22')
    .replace(/%22venture%20capital%22/gi, '%22sales%20trading%22')
    .replace(/venture-capital/gi, 'sales-trading');
}

const ST_SOURCE_TEMPLATES: { id: string; name: string; defaultUrl: string; enabled: boolean; status: 'connected' | 'error' | 'checking' | 'unknown' }[] = [
  { id: 'st-6', name: 'eFinancialCareers', defaultUrl: 'https://www.efinancialcareers.co.uk/jobs/', enabled: true, status: 'unknown' },
  { id: 'st-10', name: 'Glassdoor UK', defaultUrl: 'https://www.glassdoor.co.uk/Job/jobs.htm', enabled: true, status: 'unknown' },
  { id: 'st-m0', name: 'Google Jobs', defaultUrl: 'https://www.google.com/search?udm=8&q=sales+trading+jobs', enabled: true, status: 'unknown' },
  { id: 'st-9', name: 'Indeed UK', defaultUrl: 'https://uk.indeed.com/jobs?q=%22sales+and+trading%22', enabled: true, status: 'unknown' },
  { id: 'st-2', name: 'LinkedIn Jobs', defaultUrl: 'https://www.linkedin.com/jobs/search/?keywords=%22sales+and+trading%22', enabled: true, status: 'unknown' },
];

export function getSTDefaultSources(city: string): (JobSource & { status?: 'connected' | 'error' | 'checking' | 'unknown' })[] {
  return ST_SOURCE_TEMPLATES.map((t) => ({
    id: t.id,
    name: t.name,
    url: getSTSourceUrl(t.name, city) || t.defaultUrl,
    enabled: t.enabled,
    status: t.status,
  }));
}

export const ST_DEFAULT_KEYWORDS = [
  'Sales and trading',
  'Sales trading',
  'Sales and trading internship',
  'Sales and trading graduate',
  'Sales and trading analyst',
  'Equity sales',
  'Fixed income sales',
  'Rates trading',
  'FX trading',
];
