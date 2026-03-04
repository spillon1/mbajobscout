export type JobType = 'full-time' | 'internship' | 'graduate' | 'unknown';

export interface Job {
  id: string;
  title: string;
  company: string;
  location: string;
  type: JobType;
  source: string;
  sourceUrl: string;
  url: string;
  postedDate?: string;
  description?: string;
  salary?: string;
}

export interface JobSource {
  id: string;
  name: string;
  url: string;
  enabled: boolean;
}

export interface SearchConfig {
  keywords: string[];
  location: string;
  jobTypes: JobType[];
}
