-- Remove non-UK roles and roles with corrupted location/company fields
DELETE FROM scraped_jobs
WHERE
  -- John Gannon Blog: explicit non-UK locations
  location ~* ', (CA|NY|TX|MA|IL|WA|CO|GA|MN|VA|FL|OR|NC|AZ|NJ|PA|MI|OH)\b'
  OR location ~* '\b(Menlo Park|Palo Alto|Mountain View|San Francisco|New York|Boston|Chicago|Dallas|Los Angeles|Seattle|Austin|Albuquerque|Atlanta|Miami|Toronto|Berlin|Munich|Paris|Amsterdam|Madrid|Milan|Rome|Athens|Dublin|Zurich|Stockholm|Singapore|Hong Kong|Dubai|Tokyo|Sydney|Tel Aviv)\b'
  OR location ~* '\b(United States|USA|Germany|France|Spain|Italy|Greece|Netherlands|Switzerland|Sweden|Norway|Denmark|Finland|Belgium|Ireland|Portugal|Austria|Australia|Canada|India|China|Japan|Singapore|Israel|UAE|Mexico|Brazil)\b'
  OR location = 'Europe'
  -- eFinancialCareers parser corruption: location holds salary/marketing words
  OR (source = 'eFinancialCareers' AND (location ILIKE 'Competitive%' OR location ILIKE 'market rate%' OR location ILIKE 'Flexible%' OR company ILIKE '%United Kingdom%' OR company ILIKE '%Permanent' OR company ILIKE '%Contract'));