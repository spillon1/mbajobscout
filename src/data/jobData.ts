import { Job, JobSource } from '@/types/jobs';

export const DEFAULT_SOURCES: (JobSource & { status?: 'connected' | 'error' | 'checking' | 'unknown' })[] = [
  { id: '6', name: 'eFinancialCareers', url: 'https://www.efinancialcareers.co.uk/jobs/%22venture-capital%22/in-london%2C-uk?q=%22venture+capital%22&location=London%2C+UK&latitude=51.50721&longitude=-0.12758&countryCode=GB&locationPrecision=City&radius=40&radiusUnit=km&pageSize=15&currencyCode=GBP&language=en&includeUnspecifiedSalary=true&enableVectorSearch=true', enabled: true, status: 'unknown' },
  { id: '10', name: 'Glassdoor UK', url: 'https://www.glassdoor.co.uk/Job/jobs.htm?sc.occupationParam=%22venture+capital%22&sc.locationSeoString=London%2C+England+%28UK%29&locId=2671300&locT=C', enabled: true, status: 'unknown' },
  { id: 'm0', name: 'Google Jobs', url: 'https://www.google.com/search?udm=8&q=venture+capital+jobs+london', enabled: true, status: 'unknown' },
  { id: '9', name: 'Indeed UK', url: 'https://uk.indeed.com/jobs?q=%22venture+capital%22&l=London%2C+Greater+London', enabled: true, status: 'unknown' },
  { id: '11', name: 'InnovatorsRoom', url: 'https://innovatorsroom.beehiiv.com/archive?tags=%F0%9F%92%B6+Junior+Investor+JobDrop', enabled: true, status: 'unknown' },
  { id: '4', name: 'John Gannon Blog', url: 'https://johngannonblog.com/?feed=job_feed&job_types&search_location=London&job_categories&search_keywords', enabled: true, status: 'unknown' },
  { id: '2', name: 'LinkedIn Jobs', url: 'https://www.linkedin.com/jobs/search/?keywords=%22venture+capital%22&location=London', enabled: true, status: 'unknown' },
  { id: '5', name: 'Startup & VC', url: 'https://www.startupandvc.com/venture-capital-jobs', enabled: true, status: 'unknown' },
  { id: '12', name: 'VC Careers', url: 'https://venturecapitalcareers.com/jobs/locations/london-eng-united-kingdom', enabled: true, status: 'unknown' },
  { id: '7', name: 'Venture5', url: 'https://venture5.com/jobs/', enabled: true, status: 'unknown' },
];

export const MANUAL_SOURCES: JobSource[] = [
  { id: 'm1', name: 'MBA Exchange', url: 'https://www.mba-exchange.com/candidates/jobSearch_p.php', enabled: false, manualOnly: true },
  { id: 'm3', name: 'OCC (Cambridge)', url: 'https://cjbs-careers.12twenty.com/jobPostings#/jobPostings/index?tab=all&quickSearch=venture', enabled: false, manualOnly: true },
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
