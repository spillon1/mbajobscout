
-- Drop existing restrictive policies
DROP POLICY IF EXISTS "Users can delete own alerts" ON public.job_alerts;
DROP POLICY IF EXISTS "Users can insert own alerts" ON public.job_alerts;
DROP POLICY IF EXISTS "Users can read own alerts" ON public.job_alerts;
DROP POLICY IF EXISTS "Users can update own alerts" ON public.job_alerts;

-- Create open policies (no auth needed, single-user app)
CREATE POLICY "Anyone can read alerts" ON public.job_alerts FOR SELECT USING (true);
CREATE POLICY "Anyone can insert alerts" ON public.job_alerts FOR INSERT WITH CHECK (true);
CREATE POLICY "Anyone can update alerts" ON public.job_alerts FOR UPDATE USING (true) WITH CHECK (true);
CREATE POLICY "Anyone can delete alerts" ON public.job_alerts FOR DELETE USING (true);

-- Make user_id nullable with no default (not needed anymore)
ALTER TABLE public.job_alerts ALTER COLUMN user_id DROP NOT NULL;
