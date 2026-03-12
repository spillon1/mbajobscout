import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { jobTitle, jobCompany, jobSource, jobUrl, reason } = await req.json();

    const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY');
    if (!RESEND_API_KEY) {
      throw new Error('RESEND_API_KEY is not configured');
    }

    const notificationEmail = Deno.env.get('REPORT_NOTIFICATION_EMAIL');
    if (!notificationEmail) {
      throw new Error('REPORT_NOTIFICATION_EMAIL is not configured');
    }

    const emailBody = `
      <h2>Job Report - MBASCOUT</h2>
      <p><strong>Job Title:</strong> ${jobTitle}</p>
      <p><strong>Company:</strong> ${jobCompany}</p>
      <p><strong>Source:</strong> ${jobSource}</p>
      <p><strong>URL:</strong> ${jobUrl || 'N/A'}</p>
      <hr />
      <p><strong>Reason:</strong></p>
      <p>${reason}</p>
    `;

    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${RESEND_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: 'MBASCOUT Reports <onboarding@resend.dev>',
        to: [notificationEmail],
        subject: `Job Report: ${jobTitle} at ${jobCompany}`,
        html: emailBody,
      }),
    });

    const data = await res.json();
    if (!res.ok) {
      throw new Error(`Resend API error [${res.status}]: ${JSON.stringify(data)}`);
    }

    return new Response(JSON.stringify({ success: true }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('Error sending report:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return new Response(JSON.stringify({ success: false, error: errorMessage }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
