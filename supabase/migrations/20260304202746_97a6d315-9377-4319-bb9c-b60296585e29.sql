-- Add user_id column to job_alerts
ALTER TABLE public.job_alerts ADD COLUMN user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE;

-- Drop old policies
DROP POLICY IF EXISTS "Anyone can delete job alerts" ON public.job_alerts;
DROP POLICY IF EXISTS "Anyone can insert job alerts" ON public.job_alerts;
DROP POLICY IF EXISTS "Anyone can read job alerts" ON public.job_alerts;
DROP POLICY IF EXISTS "Anyone can update job alerts" ON public.job_alerts;

-- Create user-scoped RLS policies
CREATE POLICY "Users can read own alerts" ON public.job_alerts FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own alerts" ON public.job_alerts FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own alerts" ON public.job_alerts FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can delete own alerts" ON public.job_alerts FOR DELETE TO authenticated USING (auth.uid() = user_id);