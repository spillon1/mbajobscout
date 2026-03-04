
-- First remove duplicates keeping the latest scraped_at
DELETE FROM public.scraped_jobs a
USING public.scraped_jobs b
WHERE a.id < b.id
  AND a.url = b.url;

-- Add unique constraint on url to prevent future duplicates
ALTER TABLE public.scraped_jobs ADD CONSTRAINT scraped_jobs_url_unique UNIQUE (url);
