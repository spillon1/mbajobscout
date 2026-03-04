
-- Drop the restrictive policies and recreate as permissive
DROP POLICY IF EXISTS "Anyone can delete scraped jobs" ON public.scraped_jobs;
DROP POLICY IF EXISTS "Anyone can insert scraped jobs" ON public.scraped_jobs;
DROP POLICY IF EXISTS "Anyone can read scraped jobs" ON public.scraped_jobs;

-- Recreate as permissive policies
CREATE POLICY "Anyone can read scraped jobs" ON public.scraped_jobs FOR SELECT USING (true);
CREATE POLICY "Anyone can insert scraped jobs" ON public.scraped_jobs FOR INSERT WITH CHECK (true);
CREATE POLICY "Anyone can delete scraped jobs" ON public.scraped_jobs FOR DELETE USING (true);
CREATE POLICY "Anyone can update scraped jobs" ON public.scraped_jobs FOR UPDATE USING (true) WITH CHECK (true);
