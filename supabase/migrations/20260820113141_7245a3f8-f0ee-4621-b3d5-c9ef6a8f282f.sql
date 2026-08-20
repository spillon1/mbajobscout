-- job_alerts: owner-scoped only
DROP POLICY IF EXISTS "Anyone can read alerts" ON public.job_alerts;
DROP POLICY IF EXISTS "Anyone can insert alerts" ON public.job_alerts;
DROP POLICY IF EXISTS "Anyone can update alerts" ON public.job_alerts;
DROP POLICY IF EXISTS "Anyone can delete alerts" ON public.job_alerts;

REVOKE ALL ON public.job_alerts FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.job_alerts TO authenticated;
GRANT ALL ON public.job_alerts TO service_role;

CREATE POLICY "Users can read own alerts" ON public.job_alerts
  FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE POLICY "Users can insert own alerts" ON public.job_alerts
  FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());
CREATE POLICY "Users can update own alerts" ON public.job_alerts
  FOR UPDATE TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
CREATE POLICY "Users can delete own alerts" ON public.job_alerts
  FOR DELETE TO authenticated USING (user_id = auth.uid());

-- scraped_jobs: public read stays (public job board), writes locked to service role
DROP POLICY IF EXISTS "Anyone can insert scraped jobs" ON public.scraped_jobs;
DROP POLICY IF EXISTS "Anyone can update scraped jobs" ON public.scraped_jobs;
DROP POLICY IF EXISTS "Anyone can delete scraped jobs" ON public.scraped_jobs;
DROP POLICY IF EXISTS "Anyone can read scraped jobs" ON public.scraped_jobs;

REVOKE INSERT, UPDATE, DELETE ON public.scraped_jobs FROM anon, authenticated;
GRANT SELECT ON public.scraped_jobs TO anon, authenticated;
GRANT ALL ON public.scraped_jobs TO service_role;

CREATE POLICY "Public can read job listings" ON public.scraped_jobs
  FOR SELECT TO anon, authenticated USING (true);

-- alert_checkpoints: internal only, fail-closed
REVOKE ALL ON public.alert_checkpoints FROM anon, authenticated;
GRANT ALL ON public.alert_checkpoints TO service_role;

-- fix mutable search_path
CREATE OR REPLACE FUNCTION public.preserve_alerted_flag()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $function$
BEGIN
  IF OLD.alerted = true THEN
    NEW.alerted = true;
  END IF;
  RETURN NEW;
END;
$function$;