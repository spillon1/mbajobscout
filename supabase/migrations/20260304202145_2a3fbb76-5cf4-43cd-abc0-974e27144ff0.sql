
-- Enable required extensions for cron scheduling
CREATE EXTENSION IF NOT EXISTS pg_cron WITH SCHEMA pg_catalog;
CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;

-- Table to store alert configuration (single-user, one row)
CREATE TABLE public.job_alerts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text NOT NULL,
  keywords text[] NOT NULL DEFAULT '{}',
  location text NOT NULL DEFAULT 'London, United Kingdom',
  enabled boolean NOT NULL DEFAULT true,
  source_names text[] NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.job_alerts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can read job alerts" ON public.job_alerts FOR SELECT USING (true);
CREATE POLICY "Anyone can insert job alerts" ON public.job_alerts FOR INSERT WITH CHECK (true);
CREATE POLICY "Anyone can update job alerts" ON public.job_alerts FOR UPDATE USING (true) WITH CHECK (true);
CREATE POLICY "Anyone can delete job alerts" ON public.job_alerts FOR DELETE USING (true);

-- Add a column to scraped_jobs to track which jobs have been alerted
ALTER TABLE public.scraped_jobs ADD COLUMN IF NOT EXISTS alerted boolean NOT NULL DEFAULT false;
