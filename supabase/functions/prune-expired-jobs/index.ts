import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { checkListingsBatch } from '../_shared/job-expiry.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

/**
 * Re-verifies stored listings against their own job pages and deletes expired ones.
 * Listings die after we scrape them, so freshness has to be re-checked, not assumed.
 * Sources that block bots return "unknown" and are left untouched.
 */
Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  try {
    const body = await req.json().catch(() => ({}));
    const limit: number = Math.min(Number(body.limit) || 400, 1000);
    const recheckDays: number = Number(body.recheckDays) || 3;
    const dryRun: boolean = body.dryRun === true;
    const source: string | undefined = typeof body.source === 'string' && body.source.trim()
      ? body.source.trim().slice(0, 100)
      : undefined;

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );

    const cutoff = new Date(Date.now() - recheckDays * 86400000).toISOString();

    let query = supabase
      .from('scraped_jobs')
      .select('id, title, company, url, source, expiry_checked_at')
      .or(`expiry_checked_at.is.null,expiry_checked_at.lt.${cutoff}`)
      .order('expiry_checked_at', { ascending: true, nullsFirst: true });

    if (source) query = query.eq('source', source);

    const { data: rows, error } = await query.limit(limit);

    if (error) throw error;

    // Age-out: LinkedIn closes posts silently (the "no longer accepting applications"
    // banner only renders for logged-in users), so a listing that has not been re-seen
    // by any scrape for `staleDays` is treated as gone.
    const staleDays: number = Number(body.staleDays) || 21;
    let staleDeleted = 0;
    if (!dryRun) {
      const staleCutoff = new Date(Date.now() - staleDays * 86400000).toISOString();
      const { data: staleRows } = await supabase
        .from('scraped_jobs')
        .select('id')
        .ilike('source', '%linkedin%')
        .lt('last_seen_at', staleCutoff)
        .limit(500);
      const staleIds = (staleRows || []).map((r: any) => r.id);
      for (let i = 0; i < staleIds.length; i += 100) {
        await supabase.from('scraped_jobs').delete().in('id', staleIds.slice(i, i + 100));
      }
      staleDeleted = staleIds.length;
    }

    if (!rows || rows.length === 0) {
      return json({ success: true, checked: 0, expired: 0, staleDeleted, message: 'Nothing due for re-check' });
    }


    const results = await checkListingsBatch(rows, (r: any) => r.url, 8, 8000);

    const expiredIds = results.filter((r) => r.status === 'expired').map((r) => (r.item as any).id);
    const liveIds = results.filter((r) => r.status === 'live').map((r) => (r.item as any).id);
    const unknown = results.filter((r) => r.status === 'unknown').length;

    if (!dryRun) {
      if (expiredIds.length > 0) {
        for (let i = 0; i < expiredIds.length; i += 100) {
          await supabase.from('scraped_jobs').delete().in('id', expiredIds.slice(i, i + 100));
        }
      }
      const touch = [...liveIds, ...results.filter((r) => r.status === 'unknown').map((r) => (r.item as any).id)];
      for (let i = 0; i < touch.length; i += 100) {
        await supabase
          .from('scraped_jobs')
          .update({ expiry_checked_at: new Date().toISOString() })
          .in('id', touch.slice(i, i + 100));
      }
    }

    console.log(
      `[prune-expired-jobs] checked=${rows.length} expired=${expiredIds.length} live=${liveIds.length} unknown=${unknown} dryRun=${dryRun}`
    );

    return json({
      success: true,
      checked: rows.length,
      expired: expiredIds.length,
      live: liveIds.length,
      unknown,
      dryRun,
      samples: results
        .filter((r) => r.status === 'expired')
        .slice(0, 10)
        .map((r) => ({ title: (r.item as any).title, company: (r.item as any).company, source: (r.item as any).source })),
    });
  } catch (err) {
    console.error('[prune-expired-jobs] error', err);
    return json({ success: false, error: err instanceof Error ? err.message : 'Unknown error' }, 500);
  }
});

function json(payload: unknown, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}
