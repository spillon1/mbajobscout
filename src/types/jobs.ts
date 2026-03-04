export type JobType = 'full-time' | 'internship' | 'graduate' | 'unknown';
export type Seniority = 'intern' | 'junior' | 'mid' | 'senior' | 'unknown';

export interface Job {
  id: string;
  title: string;
  company: string;
  location: string;
  type: JobType;
  seniority: Seniority;
  source: string;
  sourceUrl: string;
  jobUrl?: string;
  postedDate?: string;
  description?: string;
  salary?: string;
}

export interface JobSource {
  id: string;
  name: string;
  url: string;
  enabled: boolean;
  status?: 'connected' | 'error' | 'checking' | 'unknown';
  statusMessage?: string;
  lastJobCount?: number;
  manualOnly?: boolean;
}

export interface SearchConfig {
  keywords: string[];
  location: string;
  jobTypes: JobType[];
}
