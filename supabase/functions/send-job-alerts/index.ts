const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

// Hardcoded alert config — independent of site activity and job_alerts table
const ALERT_EMAIL = 'spillon@gmail.com';
const ALERT_MODE = 'vc';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY');
    if (!RESEND_API_KEY) {
      return new Response(
        JSON.stringify({ success: false, error: 'RESEND_API_KEY not configured' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Fetch un-alerted VC-mode jobs only
    const { data: rawJobs, error: jobsError } = await supabase
      .from('scraped_jobs')
      .select('*')
      .eq('alerted', false)
      .eq('mode', ALERT_MODE)
      .order('scraped_at', { ascending: false });

    if (jobsError) {
      console.error('Failed to fetch un-alerted jobs:', jobsError.message);
      return new Response(
        JSON.stringify({ success: false, error: jobsError.message }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (!rawJobs || rawJobs.length === 0) {
      console.log('No new (un-alerted) VC jobs to send');
      return new Response(
        JSON.stringify({ success: true, message: 'No new jobs', count: 0 }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Filter: London-only + VC Investment role-only
    const londonPattern = /\blondon\b/i;
    const remoteUkPattern = /\b(remote|united\s+kingdom|uk)\b/i;
    const nonUkPattern = /\b(usa|canada|us\b|u\.s\.|india|germany|france|spain|italy|australia|singapore|hong\s+kong|dubai|netherlands|ireland|new\s+york|san\s+francisco|toronto|chicago|boston|seattle|los\s+angeles|berlin|paris|amsterdam|mumbai|bangalore|sydney|melbourne)\b/i;

    // Role type = Investment (mirrors VC role filter intent)
    const investmentPatterns = [
      /\binvestment\b(?!\s+(admin|operat|account|support|report|service|compli|process|back\s*office))/i,
      /\bdeal\b/i,
      /\borigination\b/i,
      /\binvestment\s+analyst\b/i,
      /\binvestment\s+associate\b/i,
      /\bvc\s+analyst\b/i,
      /\bvc\s+associate\b/i,
      /\bventure\s+(capital\s+)?(analyst|associate|principal|partner)\b/i,
    ];

    // Must look like a VC context, not generic finance roles
    const vcContextPatterns = [
      /\bventure\s+capital\b/i,
      /\bvc\b/i,
      /\bpre[\s\-]?seed\b/i,
      /\bseed\b/i,
      /\bseries\s+[a-z]\b/i,
      /\bearly[\s\-]?stage\b/i,
      /\bgrowth\s+equity\b/i,
      /\bportfolio\b/i,
      /\bstartup(s)?\b/i,
      /\bstart[\-\s]?up(s)?\b/i,
      /\bfounder\b/i,
      /\bventure(s)?\b/i,
      /\bfund\b/i,
    ];

    // Explicitly exclude common non-VC roles that were leaking into alerts
    const nonVcRolePatterns = [
      /\binvestment\s+bank(ing)?\b/i,
      /\bcorporate\s+bank(ing)?\b/i,
      /\basset\s+management\b/i,
      /\bwealth\s+management\b/i,
      /\bprivate\s+bank(ing)?\b/i,
      /\bequity\s+research\b/i,
      /\btrading\b/i,
      /\bfixed\s+income\b/i,
      /\bquant(itative)?\b/i,
      /\bproduct\s+manager\b/i,
      /\bsoftware\s+engineer\b/i,
      /\bdeveloper\b/i,
    ];

    const newJobs = rawJobs.filter(job => {
      const loc = (job.location || '').toLowerCase();
      const isLondon = londonPattern.test(loc) || (remoteUkPattern.test(loc) && !nonUkPattern.test(loc));
      if (!isLondon) return false;

      const text = `${job.title} ${job.description || ''} ${job.company || ''}`;
      const isInvestmentRole = investmentPatterns.some((p) => p.test(text));
      if (!isInvestmentRole) return false;

      const hasVcContext = vcContextPatterns.some((p) => p.test(text));
      if (!hasVcContext) return false;

      const isNonVcRole = nonVcRolePatterns.some((p) => p.test(text));
      return !isNonVcRole;
    });

    const allIds = rawJobs.map(j => j.id);
    const markAllAsAlerted = async () => {
      if (allIds.length === 0) return;
      const { error: markAllError } = await supabase
        .from('scraped_jobs')
        .update({ alerted: true })
        .in('id', allIds);

      if (markAllError) {
        console.error('Failed to mark jobs as alerted:', markAllError.message);
      }
    };

    if (newJobs.length === 0) {
      await markAllAsAlerted();
      console.log(`No VC London Investment jobs out of ${rawJobs.length} total un-alerted VC jobs`);
      return new Response(
        JSON.stringify({ success: true, message: 'No matching jobs after filtering', total: rawJobs.length, matched: 0 }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`Found ${newJobs.length} London Investment jobs (from ${rawJobs.length} total) to send to ${ALERT_EMAIL}`);

    // Build HTML email
    const jobRows = newJobs.map(job => `
      <tr>
        <td style="padding: 12px 16px; border-bottom: 1px solid #e5e7eb;">
          <a href="${escapeHtml(job.url)}" style="color: #3b82f6; text-decoration: none; font-weight: 600; font-size: 15px;">
            ${escapeHtml(job.title)}
          </a>
          <div style="color: #6b7280; font-size: 13px; margin-top: 4px;">
            ${escapeHtml(job.company)} · ${escapeHtml(job.location)}
            ${job.salary ? ` · <span style="color: #059669; font-weight: 500;">${escapeHtml(job.salary)}</span>` : ''}
            ${job.posted_date ? ` · ${escapeHtml(job.posted_date)}` : ''}
          </div>
          <div style="margin-top: 4px;">
            <span style="display: inline-block; padding: 2px 8px; border-radius: 4px; font-size: 11px; font-weight: 600; text-transform: uppercase; background: ${job.type === 'internship' ? '#fef3c7' : job.type === 'graduate' ? '#dbeafe' : '#dcfce7'}; color: ${job.type === 'internship' ? '#92400e' : job.type === 'graduate' ? '#1e40af' : '#166534'};">
              ${escapeHtml(job.type)}
            </span>
            <span style="color: #9ca3af; font-size: 11px; margin-left: 8px;">${escapeHtml(job.source)}</span>
          </div>
        </td>
      </tr>
    `).join('');

    const html = `
      <!DOCTYPE html>
      <html>
      <body style="margin: 0; padding: 0; background-color: #f9fafb; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;">
        <div style="max-width: 600px; margin: 0 auto; padding: 24px;">
          <div style="text-align: center; margin-bottom: 24px;">
            <h1 style="font-size: 20px; color: #111827; margin: 0;">
              ⚡ VC<span style="color: #3b82f6;">SCOUT</span> Daily Alert
            </h1>
            <p style="color: #6b7280; font-size: 14px; margin: 4px 0 0;">
              ${newJobs.length} new VC Investment job${newJobs.length === 1 ? '' : 's'} in London since your last alert
            </p>
          </div>
          <table style="width: 100%; border-collapse: collapse; background: #ffffff; border-radius: 8px; overflow: hidden; box-shadow: 0 1px 3px rgba(0,0,0,0.1);">
            ${jobRows}
          </table>
          <p style="text-align: center; color: #9ca3af; font-size: 12px; margin-top: 24px;">
            Sent by VCScout Job Aggregator
          </p>
        </div>
      </body>
      </html>
    `;

    const emailResponse = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${RESEND_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: 'VCScout <onboarding@resend.dev>',
        to: [ALERT_EMAIL],
        subject: `⚡ ${newJobs.length} new VC Investment job${newJobs.length === 1 ? '' : 's'} in London`,
        html,
      }),
    });

    const emailData = await emailResponse.json();

    if (!emailResponse.ok) {
      console.error(`Resend error:`, emailData);
      return new Response(
        JSON.stringify({ success: false, error: emailData }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`Email sent to ${ALERT_EMAIL}:`, emailData.id);

    // Jobs already marked as alerted above (all raw jobs, not just matched ones)

    return new Response(
      JSON.stringify({ success: true, sent: 1, jobCount: newJobs.length }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('Alert error:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return new Response(
      JSON.stringify({ success: false, error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
