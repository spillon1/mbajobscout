import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { fetchJobDescription, mapPool } from '../_shared/job-description.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

/**
 * Backfills job descriptions for stored listings.
 *
 * Stage/secondaries filters (Growth / Late Stage, Secondaries) need the body text:
 * plenty of relevant roles are simply titled "Investor" or "Investment Associate"
 * and only reveal their stage inside the description.
 */
Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  try {
    const body = await req.json().catch(() => ({}));
    const limit: number = Math.min(Number(body.limit) || 120, 400);
    const mode: string = typeof body.mode === 'string' ? body.mode : 'vc';
    const source: string | undefined = typeof body.source === 'string' && body.source.trim()
      ? body.source.trim().slice(0, 100)
      : undefined;
    const dryRun: boolean = body.dryRun === true;

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );
    const firecrawlKey = Deno.env.get('FIRECRAWL_API_KEY') ?? undefined;

    let query = supabase
      .from('scraped_jobs')
      .select('id, title, url, source')
      .eq('mode', mode)
      .or('description.is.null,description.eq.')
      .order('scraped_at', { ascending: false });

    if (source) query = query.eq('source', source);

    const { data: rows, error } = await query.limit(limit);
    if (error) throw error;
    if (!rows || rows.length === 0) {
      return json({ success: true, processed: 0, enriched: 0, message: 'Nothing to enrich' });
    }

    const deadline = Date.now() + 100_000;
    let enriched = 0;

    const updates = await mapPool(rows, 8, async (row: any) => {
      if (Date.now() > deadline) return null;
      const text = await fetchJobDescription(row.url, { firecrawlKey });
      if (!text || text.length < 120) return null;
      return { id: row.id, description: text.slice(0, 12000) };
    });

    const valid = updates.filter(Boolean) as { id: string; description: string }[];

    if (!dryRun) {
      for (const u of valid) {
        const { error: upErr } = await supabase
          .from('scraped_jobs')
          .update({ description: u.description })
          .eq('id', u.id);
        if (!upErr) enriched++;
      }
    } else {
      enriched = valid.length;
    }

    return json({ success: true, processed: rows.length, enriched, dryRun });
  } catch (e) {
    console.error('enrich-descriptions error:', e);
    return json({ success: false, error: e instanceof Error ? e.message : 'Failed' }, 500);
  }
});

function json(payload: unknown, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}
