

## Why this Evvolve & Partners VC Analyst role didn't get scraped

**Diagnosis**

The job posting is real, contains "Venture Capital" in the title, and would easily pass our relevance gate. It never reached the relevance gate because **the LinkedIn scraper never fetched it**.

Reason: LinkedIn lists this role's location as **"United Kingdom"** (country-wide), not "London, England, United Kingdom". Our LinkedIn scraper queries the LinkedIn guest jobs API with `location=London` (derived from the alert's `London, United Kingdom` setting via `location.split(',')[0]` → `"London"`). LinkedIn's location filter is geographic and does **not** return roles whose posted location is the country itself — it only returns roles tagged to London or its surrounding cities. So jobs posted as "United Kingdom" are systematically invisible to our scrape.

This affects more than just this one role. Any London-eligible job that the employer tagged country-wide on LinkedIn (common for remote/hybrid roles, or smaller firms that don't bother specifying a city) will be missed by every mode.

**Fix — run a second LinkedIn pass with country-wide location**

For each LinkedIn-backed mode, perform two LinkedIn searches per scrape:
1. Existing: `location=London` (up to 40 pages, ~1000 results)
2. New: `location=United Kingdom` (cap at 15 pages, ~375 results) — already supported by `LINKEDIN_PAGES_COUNTRY` constant

Merge results, dedupe by `(title, company)`, then run the normal relevance + location filters. Because country-wide pulls will include a lot of non-London noise, apply a secondary location filter that keeps a job only if its `location` field contains one of: `London`, `United Kingdom`, `UK`, `Remote`, `Hybrid`, or is empty.

This is a small, contained change — `scrapeLinkedIn()` already branches on `isCountryWide`. We just call it twice per scrape with both location values and merge.

## Files to change

- `supabase/functions/scrape-jobs/index.ts`
  - In the LinkedIn branch (~line 119), call `scrapeLinkedIn` twice: once for the configured city, once for `"United Kingdom"`. Merge + dedupe before passing to `roleFilter`.
  - Optionally: dedupe on `jobUrl` rather than `(title, company)` to retain different roles at the same firm.

No DB changes. No alert function changes (the alert function reads from `scraped_jobs`, so once the scrape inserts these rows, alerts pick them up automatically).

## What you'll see

- The Evvolve & Partners VC Analyst role (and similar UK-wide-tagged roles) appearing in tomorrow morning's VC scrape and email
- A modest increase in total LinkedIn results per mode (~10–25%)
- Slightly longer scrape time (~15–30s extra) — well within the 5-min timeout
- No regression on existing London-tagged roles

