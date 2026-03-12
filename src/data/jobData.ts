import { Job, JobSource } from '@/types/jobs';
import { getSourceUrlForLocation } from './ukLocations';

const SOURCE_TEMPLATES: { id: string; name: string; defaultUrl: string; enabled: boolean; status: 'connected' | 'error' | 'checking' | 'unknown' }[] = [
  { id: '6', name: 'eFinancialCareers', defaultUrl: 'https://www.efinancialcareers.co.uk/jobs/', enabled: true, status: 'unknown' },
  { id: '10', name: 'Glassdoor UK', defaultUrl: 'https://www.glassdoor.co.uk/Job/jobs.htm', enabled: true, status: 'unknown' },
  { id: 'm0', name: 'Google Jobs', defaultUrl: 'https://www.google.com/search?udm=8&q=venture+capital+jobs', enabled: true, status: 'unknown' },
  { id: '9', name: 'Indeed UK', defaultUrl: 'https://uk.indeed.com/jobs?q=%22venture+capital%22', enabled: true, status: 'unknown' },
  { id: '11', name: 'InnovatorsRoom', defaultUrl: 'https://innovatorsroom.beehiiv.com/archive?tags=%F0%9F%92%B6+Junior+Investor+JobDrop', enabled: true, status: 'unknown' },
  { id: '4', name: 'John Gannon Blog', defaultUrl: 'https://johngannonblog.com/?feed=job_feed', enabled: true, status: 'unknown' },
  { id: '2', name: 'LinkedIn Jobs', defaultUrl: 'https://www.linkedin.com/jobs/search/?keywords=%22venture+capital%22', enabled: true, status: 'unknown' },
  { id: '5', name: 'Startup & VC', defaultUrl: 'https://www.startupandvc.com/venture-capital-jobs', enabled: true, status: 'unknown' },
  { id: '12', name: 'VC Careers', defaultUrl: 'https://venturecapitalcareers.com/jobs/', enabled: true, status: 'unknown' },
  { id: '7', name: 'Venture5', defaultUrl: 'https://venture5.com/jobs/', enabled: true, status: 'unknown' },
];

export function getDefaultSources(city: string): (JobSource & { status?: 'connected' | 'error' | 'checking' | 'unknown' })[] {
  return SOURCE_TEMPLATES.map((t) => ({
    id: t.id,
    name: t.name,
    url: getSourceUrlForLocation(t.name, city) || t.defaultUrl,
    enabled: t.enabled,
    status: t.status,
  }));
}

// Keep for backwards compat — defaults to London
export const DEFAULT_SOURCES = getDefaultSources('London');

export const MANUAL_SOURCES: JobSource[] = [
  { id: 'm1', name: 'MBA Exchange', url: 'https://www.mba-exchange.com/candidates/jobSearch_p.php', enabled: false, manualOnly: true },
  { id: 'm3', name: 'OCC (Cambridge)', url: 'https://cjbs-careers.12twenty.com/jobPostings#/jobPostings/index?tab=all&quickSearch=venture', enabled: false, manualOnly: true },
];

export const DEFAULT_KEYWORDS = [
  'Venture capital',
  'Venture capital internship',
  'Venture capital intern',
  'Venture capital graduate',
  'Venture capital investor relations',
  'Venture capital platform',
  'Venture capital fund operations',
  'VC fund operations',
  'VC investor relations',
];

// These are MOCK jobs for UI demonstration only — not real listings.
// Real data will come from Firecrawl scraping once connected.
export const MOCK_JOBS: Job[] = [
  {
    id: '1',
    title: 'Venture Capital Analyst (Demo)',
    company: 'Example Fund',
    location: 'London, UK',
    type: 'full-time',
    seniority: 'mid',
    source: 'LinkedIn Jobs',
    sourceUrl: 'https://www.linkedin.com/jobs/',
    jobUrl: 'https://www.linkedin.com/jobs/search/?keywords=venture%20capital&location=London',
    postedDate: 'Mock data',
    description: 'This is a placeholder job. Connect Firecrawl to scrape real listings from your configured sources.',
    salary: '£55,000 - £75,000',
  },
  {
    id: '2',
    title: 'VC Summer Intern (Demo)',
    company: 'Example Ventures',
    location: 'London, UK',
    type: 'internship',
    seniority: 'intern',
    source: 'Google Jobs',
    sourceUrl: 'https://www.google.com/search?udm=8',
    jobUrl: 'https://www.google.com/search?q=venture+capital+internship+london&udm=8',
    postedDate: 'Mock data',
    description: 'This is a placeholder internship. Real job data will appear once scraping is enabled.',
  },
  {
    id: '3',
    title: 'Graduate Investment Associate (Demo)',
    company: 'Example Capital',
    location: 'London, UK',
    type: 'graduate',
    seniority: 'junior',
    source: 'eFinancialCareers',
    sourceUrl: 'https://www.efinancialcareers.co.uk/jobs/',
    jobUrl: 'https://www.efinancialcareers.co.uk/jobs/venture-capital',
    postedDate: 'Mock data',
    description: 'This is a placeholder graduate role. Connect Firecrawl to populate with real job listings.',
    salary: '£45,000 - £55,000',
  },
  {
    id: '4',
    title: 'Principal - Growth Equity (Demo)',
    company: 'Example Partners',
    location: 'London, UK',
    type: 'full-time',
    seniority: 'senior',
    source: 'VC Careers',
    sourceUrl: 'https://venturecapitalcareers.com/jobs',
    jobUrl: 'https://venturecapitalcareers.com/jobs',
    postedDate: 'Mock data',
    description: 'This is a placeholder senior role. Real listings will be scraped from configured sources.',
    salary: '£120,000 - £180,000',
  },
];
