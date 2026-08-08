DELETE FROM public.scraped_jobs
WHERE mode = 'vc'
  AND (
    title ~* 'strategic investment'
    OR title ~* 'corporate development'
    OR title ~* 'real estate'
    OR title ~* '\mproperty\M'
  )
  AND coalesce(company,'') !~* 'ventures?|venture capital'
  AND coalesce(description,'') !~* 'venture capital';