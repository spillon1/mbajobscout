import { Job, JobSource } from '@/types/jobs';

export const DEFAULT_SOURCES: (JobSource & { status?: 'connected' | 'error' | 'checking' | 'unknown' })[] = [
  { id: '1', name: 'Google Jobs', url: 'https://www.google.com/search?udm=8', enabled: true, status: 'unknown' },
  { id: '2', name: 'LinkedIn Jobs', url: 'https://www.linkedin.com/jobs/', enabled: true, status: 'unknown' },
  { id: '3', name: 'MBA Exchange', url: 'https://www.mba-exchange.com/candidates/jobSearch_p.php', enabled: true, status: 'unknown' },
  { id: '4', name: 'John Gannon Blog', url: 'https://johngannonblog.com/venture-capital-jobs-in-london/', enabled: true, status: 'unknown' },
  { id: '5', name: 'Startup & VC', url: 'https://www.startupandvc.com/locations/london', enabled: true, status: 'unknown' },
  { id: '6', name: 'eFinancialCareers', url: 'https://www.efinancialcareers.co.uk/jobs/', enabled: true, status: 'unknown' },
  { id: '7', name: 'Venture5', url: 'https://venture5.com/jobs/', enabled: true, status: 'unknown' },
  { id: '8', name: 'VC Careers', url: 'https://venturecapitalcareers.com/jobs', enabled: true, status: 'unknown' },
  { id: '9', name: 'Indeed UK', url: 'https://uk.indeed.com/', enabled: true, status: 'unknown' },
  { id: '10', name: 'Glassdoor UK', url: 'https://www.glassdoor.co.uk/Job/index.htm', enabled: true, status: 'unknown' },
];

export const DEFAULT_KEYWORDS = [
  'Venture capital',
  'Venture capital internship',
  'Venture capital intern',
  'Venture capital graduate',
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
    source: 'LinkedIn Jobs',
    sourceUrl: 'https://www.linkedin.com/jobs/',
    url: 'https://www.linkedin.com/jobs/search/?keywords=venture%20capital&location=London',
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
    source: 'Google Jobs',
    sourceUrl: 'https://www.google.com/search?udm=8',
    url: 'https://www.google.com/search?q=venture+capital+internship+london&udm=8',
    postedDate: 'Mock data',
    description: 'This is a placeholder internship. Real job data will appear once scraping is enabled.',
  },
  {
    id: '3',
    title: 'Graduate Investment Associate (Demo)',
    company: 'Example Capital',
    location: 'London, UK',
    type: 'graduate',
    source: 'eFinancialCareers',
    sourceUrl: 'https://www.efinancialcareers.co.uk/jobs/',
    url: 'https://www.efinancialcareers.co.uk/jobs/venture-capital',
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
    source: 'VC Careers',
    sourceUrl: 'https://venturecapitalcareers.com/jobs',
    url: 'https://venturecapitalcareers.com/jobs',
    postedDate: 'Mock data',
    description: 'This is a placeholder senior role. Real listings will be scraped from configured sources.',
    salary: '£120,000 - £180,000',
  },
];
