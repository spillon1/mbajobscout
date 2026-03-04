DELETE FROM public.scraped_jobs WHERE posted_date IS NOT NULL AND posted_date != 'Scraped just now' AND (
  -- Delete jobs with parseable dates older than 6 months
  (posted_date ~ '^\w+ \d{1,2},? \d{4}$' AND to_date(posted_date, 'Month DD, YYYY') < now() - interval '6 months')
  OR (posted_date ~ '^\d{4}-\d{2}-\d{2}' AND posted_date::date < now() - interval '6 months')
);