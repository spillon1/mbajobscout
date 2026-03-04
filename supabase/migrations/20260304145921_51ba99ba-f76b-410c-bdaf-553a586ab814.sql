-- Clean asterisks from existing Venture5 jobs
UPDATE public.scraped_jobs 
SET title = regexp_replace(title, '\*\*', '', 'g'),
    company = regexp_replace(company, '\*\*', '', 'g')
WHERE title LIKE '%**%' OR company LIKE '%**%';

-- Delete junk entries
DELETE FROM public.scraped_jobs 
WHERE lower(title) = 'the vc industry''s trusted resource'
   OR lower(title) LIKE '%trusted resource%';