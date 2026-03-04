-- Create table for scraped jobs
CREATE TABLE public.scraped_jobs (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  title TEXT NOT NULL,
  company TEXT NOT NULL DEFAULT 'Unknown',
  location TEXT NOT NULL DEFAULT 'London, UK',
  type TEXT NOT NULL DEFAULT 'full-time',
  source TEXT NOT NULL,
  source_url TEXT NOT NULL,
  url TEXT NOT NULL,
  posted_date TEXT,
  description TEXT,
  salary TEXT,
  scraped_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.scraped_jobs ENABLE ROW LEVEL SECURITY;

-- Allow public read/write (single-user personal tool)
CREATE POLICY "Anyone can read scraped jobs"
  ON public.scraped_jobs FOR SELECT
  USING (true);

CREATE POLICY "Anyone can insert scraped jobs"
  ON public.scraped_jobs FOR INSERT
  WITH CHECK (true);

CREATE POLICY "Anyone can delete scraped jobs"
  ON public.scraped_jobs FOR DELETE
  USING (true);

-- Index for faster filtering
CREATE INDEX idx_scraped_jobs_source ON public.scraped_jobs (source);
CREATE INDEX idx_scraped_jobs_type ON public.scraped_jobs (type);
CREATE INDEX idx_scraped_jobs_scraped_at ON public.scraped_jobs (scraped_at DESC);