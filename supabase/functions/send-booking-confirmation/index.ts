import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors';
import { createClient } from 'npm:@supabase/supabase-js@2';

const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY');

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });

const b64 = (text: string) => {
  const bytes = new TextEncoder().encode(text);
  let binary = '';
  bytes.forEach((b) => (binary += String.fromCharCode(b)));
  return btoa(binary);
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const authHeader = req.headers.get('Authorization') || '';
    const jwt = authHeader.replace('Bearer ', '');
    if (!jwt) return json({ error: 'Unauthorized' }, 401);

    const admin = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );
    const { data: userData, error: userErr } = await admin.auth.getUser(jwt);
    if (userErr || !userData?.user) return json({ error: 'Unauthorized' }, 401);

    const { data: roleRows } = await admin
      .from('user_roles')
      .select('role')
      .eq('user_id', userData.user.id);
    const roles = (roleRows || []).map((r: any) => r.role);
    if (!roles.includes('admin') && !roles.includes('master_admin')) {
      return json({ error: 'Forbidden' }, 403);
    }

    if (!RESEND_API_KEY) return json({ error: 'RESEND_API_KEY is not configured' }, 500);

    const body = await req.json().catch(() => null);
    if (!body) return json({ error: 'Invalid JSON body' }, 400);

    const { to, cc, subject, html, ics, pdfBase64, filename, bookingReference } = body as {
      to?: string[];
      cc?: string[];
      subject?: string;
      html?: string;
      ics?: string;
      pdfBase64?: string;
      filename?: string;
      bookingReference?: string;
    };

    const toClean = (to || []).map((e) => String(e).trim()).filter((e) => e.includes('@'));
    if (!toClean.length) return json({ error: 'No valid recipient email addresses' }, 400);
    const ccClean = (cc || []).map((e) => String(e).trim()).filter((e) => e.includes('@'));

    const attachments: any[] = [];
    if (pdfBase64) {
      attachments.push({
        filename: filename || `Booking Confirmation ${bookingReference || ''}.pdf`.trim(),
        content: pdfBase64,
      });
    }
    if (ics) {
      attachments.push({
        filename: 'appointment.ics',
        content: b64(ics),
        content_type: 'text/calendar; method=REQUEST; charset=UTF-8',
      });
    }

    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${RESEND_API_KEY}` },
      body: JSON.stringify({
        from: 'True Lie Detectors & Vetting <no-reply@tldv.co.za>',
        to: toClean,
        cc: ccClean.length ? ccClean : undefined,
        reply_to: 'admin@tldv.co.za',
        subject: subject || 'Booking Confirmation',
        html: html || '<p>Booking Confirmation</p>',
        attachments: attachments.length ? attachments : undefined,
      }),
    });

    const text = await res.text();
    if (!res.ok) {
      console.error(`Resend failed [${res.status}]: ${text}`);
      return json({ error: 'Email provider request failed', status: res.status, details: text }, 200);
    }

    return json({ success: true, provider: text, sent_to: toClean, cc: ccClean });
  } catch (e) {
    console.error('send-booking-confirmation error:', e);
    return json({ error: (e as Error).message || 'Unexpected error' }, 200);
  }
});
