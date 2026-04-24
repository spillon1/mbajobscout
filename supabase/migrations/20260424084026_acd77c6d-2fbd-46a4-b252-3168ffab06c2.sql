DELETE FROM public.scraped_jobs
WHERE source = 'Venture5'
  AND location IN ('London, UK', 'London, England', 'United Kingdom', 'UK')
  AND (
    url ~* '-in-remote'
    OR url ~* '-in-hybrid'
    OR url ~* '-in-(san-francisco|new-york|menlo-park|palo-alto|mountain-view|los-angeles|boston|chicago|seattle|austin|miami|toronto|vancouver|berlin|paris|amsterdam|dublin|zurich|munich|stockholm|sydney|singapore|tokyo|mumbai|bangalore|tel-aviv|dubai|copenhagen|frankfurt)'
    OR url ~* '-in-.*-(ca|ny|tx|ma|il|wa|fl|dc|pa|ga|co|nc|va|oh|mi|nj|md|or|ut|az|ct|mn|nv|tn|mo|in|wi|sc|la|ky|ok|ia|ks|ar|ms|ne|id|nm|hi|nh|me|ri|mt|de|sd|nd|ak|vt|wv|wy)(/|$|\\?)'
  );