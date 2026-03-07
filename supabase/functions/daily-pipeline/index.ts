const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!;

    const headers = {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${anonKey}`,
    };

    // Default sources with London URLs (matches frontend config)
    const sources = [
      { name: 'eFinancialCareers', url: 'https://www.efinancialcareers.co.uk/jobs/%22venture-capital%22/in-london%2C-uk?q=%22venture+capital%22&location=London%2C+UK&countryCode=GB&locationPrecision=City&radius=40&radiusUnit=km&pageSize=15&currencyCode=GBP&language=en&includeUnspecifiedSalary=true&enableVectorSearch=true' },
      { name: 'Glassdoor UK', url: 'https://www.glassdoor.co.uk/Job/jobs.htm?sc.occupationParam=%22venture+capital%22&sc.keyword=%22venture+capital%22+London' },
      { name: 'Google Jobs', url: 'https://www.google.com/search?udm=8&q=venture+capital+jobs+london' },
      { name: 'Indeed UK', url: 'https://uk.indeed.com/jobs?q=%22venture+capital%22&l=London' },
      { name: 'InnovatorsRoom', url: 'https://innovatorsroom.beehiiv.com/archive?tags=%F0%9F%92%B6+Junior+Investor+JobDrop' },
      { name: 'John Gannon Blog', url: 'https://johngannonblog.com/?feed=job_feed&job_types&search_location=London&job_categories&search_keywords' },
      { name: 'LinkedIn Jobs', url: 'https://www.linkedin.com/jobs/search/?keywords=%22venture+capital%22&location=London' },
      { name: 'Startup & VC', url: 'https://www.startupandvc.com/venture-capital-jobs' },
      { name: 'VC Careers', url: 'https://venturecapitalcareers.com/jobs/locations/london-eng-united-kingdom' },
      { name: 'Venture5', url: 'https://venture5.com/jobs/' },
    ];

    const keywords = ['Venture capital', 'Venture capital internship', 'Venture capital intern', 'Venture capital graduate'];
    const location = 'London, United Kingdom';

    // Step 1: Scrape jobs
    console.log('[Pipeline] Step 1: Scraping jobs...');
    const scrapeResponse = await fetch(`${supabaseUrl}/functions/v1/scrape-jobs`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ sources, keywords, location }),
    });

    const scrapeData = await scrapeResponse.json();
    const jobCount = scrapeData?.jobs?.length ?? 0;
    console.log(`[Pipeline] Scrape complete: ${jobCount} jobs found, success=${scrapeData?.success}`);

    // Step 2: Save scraped jobs to DB (the scrape function returns jobs but doesn't persist them server-side)
    // We need to persist them here since the edge function scrape-jobs just returns data
    if (scrapeData?.success && scrapeData?.jobs?.length > 0) {
      const { createClient } = await import('https://esm.sh/@supabase/supabase-js@2');
      const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
      const supabase = createClient(supabaseUrl, serviceKey);

      // Get successfully scraped source names
      const successfulSources = Object.entries(scrapeData.sourceStatuses || {})
        .filter(([, status]) => (status as { status?: string })?.status === 'connected')
        .map(([sourceName]) => sourceName);

      // Delete old jobs for successful sources
      if (successfulSources.length > 0) {
        await supabase.from('scraped_jobs').delete().in('source', successfulSources);
      }

      // Insert fresh jobs
      const rows = scrapeData.jobs.map((j: any) => ({
        title: j.title,
        company: j.company || 'Unknown',
        location: j.location || 'London, UK',
        type: j.type || 'full-time',
        source: j.source || 'Unknown',
        source_url: j.sourceUrl || j.source_url || j.jobUrl || j.url || '',
        url: j.jobUrl || j.url || j.sourceUrl || j.source_url || '',
        posted_date: j.postedDate || j.posted_date || null,
        description: j.description || null,
        salary: j.salary || null,
      }));

      const { error: insertError } = await supabase
        .from('scraped_jobs')
        .upsert(rows, { onConflict: 'url', ignoreDuplicates: false });

      if (insertError) {
        console.error('[Pipeline] Failed to save jobs:', insertError.message);
      } else {
        console.log(`[Pipeline] Saved ${rows.length} jobs to DB`);
      }
    }

    // Step 3: Send alerts
    console.log('[Pipeline] Step 2: Sending alerts...');
    const alertResponse = await fetch(`${supabaseUrl}/functions/v1/send-job-alerts`, {
      method: 'POST',
      headers,
      body: JSON.stringify({}),
    });

    const alertData = await alertResponse.json();
    console.log(`[Pipeline] Alerts complete: sent=${alertData?.sent}, success=${alertData?.success}`);

    return new Response(
      JSON.stringify({
        success: true,
        scrape: { success: scrapeData?.success, jobCount },
        alerts: alertData,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('[Pipeline] Error:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return new Response(
      JSON.stringify({ success: false, error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
