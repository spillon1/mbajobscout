ALTER TABLE public.scraped_jobs
  ADD COLUMN IF NOT EXISTS expiry_checked_at timestamptz;

CREATE INDEX IF NOT EXISTS scraped_jobs_expiry_checked_at_idx
  ON public.scraped_jobs (expiry_checked_at NULLS FIRST);