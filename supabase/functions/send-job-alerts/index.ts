const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

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

    // Get active alert config
    const { data: alerts, error: alertsError } = await supabase
      .from('job_alerts')
      .select('*')
      .eq('enabled', true)
      .limit(1)
      .single();

    if (alertsError || !alerts) {
      console.log('No active alerts configured');
      return new Response(
        JSON.stringify({ success: true, message: 'No active alerts' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Get jobs that haven't been alerted yet
    const { data: newJobs, error: jobsError } = await supabase
      .from('scraped_jobs')
      .select('*')
      .eq('alerted', false)
      .order('scraped_at', { ascending: false });

    if (jobsError) {
      throw new Error(`Failed to fetch jobs: ${jobsError.message}`);
    }

    if (!newJobs || newJobs.length === 0) {
      console.log('No new jobs to alert about');
      return new Response(
        JSON.stringify({ success: true, message: 'No new jobs', count: 0 }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`Found ${newJobs.length} new jobs to alert about`);

    // Build HTML email
    const jobRows = newJobs.map(job => `
      <tr>
        <td style="padding: 12px 16px; border-bottom: 1px solid #e5e7eb;">
          <a href="${escapeHtml(job.url)}" style="color: #6366f1; text-decoration: none; font-weight: 600; font-size: 15px;">
            ${escapeHtml(job.title)}
          </a>
          <div style="color: #6b7280; font-size: 13px; margin-top: 4px;">
            ${escapeHtml(job.company)} · ${escapeHtml(job.location)}
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
              ⚡ VC<span style="color: #6366f1;">SCOUT</span> Alert
            </h1>
            <p style="color: #6b7280; font-size: 14px; margin: 4px 0 0;">
              ${newJobs.length} new job${newJobs.length === 1 ? '' : 's'} found
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

    // Send email via Resend
    const emailResponse = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${RESEND_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: 'VCScout <onboarding@resend.dev>',
        to: [alerts.email],
        subject: `⚡ ${newJobs.length} new VC job${newJobs.length === 1 ? '' : 's'} found`,
        html,
      }),
    });

    const emailData = await emailResponse.json();

    if (!emailResponse.ok) {
      console.error('Resend error:', emailData);
      throw new Error(`Resend API error: ${JSON.stringify(emailData)}`);
    }

    console.log('Email sent successfully:', emailData.id);

    // Mark jobs as alerted
    const jobIds = newJobs.map(j => j.id);
    const { error: updateError } = await supabase
      .from('scraped_jobs')
      .update({ alerted: true })
      .in('id', jobIds);

    if (updateError) {
      console.error('Failed to mark jobs as alerted:', updateError);
    }

    return new Response(
      JSON.stringify({ success: true, count: newJobs.length, emailId: emailData.id }),
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
