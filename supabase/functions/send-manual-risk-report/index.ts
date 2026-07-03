import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors';

const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY');

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    if (!RESEND_API_KEY) {
      return new Response(JSON.stringify({ error: 'RESEND_API_KEY is not configured' }), {
        status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const body = await req.json().catch(() => null);
    if (!body) {
      return new Response(JSON.stringify({ error: 'Invalid JSON body' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const { to, subject, message, pdfBase64, filename, orderNumber } = body as {
      to?: string | string[]; subject?: string; message?: string;
      pdfBase64?: string; filename?: string; orderNumber?: string;
    };

    const recipients = Array.isArray(to) ? to : typeof to === 'string' ? [to] : [];
    const emailRe = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    const clean = recipients.map((r) => r.trim()).filter((r) => emailRe.test(r));
    if (!clean.length) {
      return new Response(JSON.stringify({ error: 'At least one valid recipient email is required' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    if (!pdfBase64 || typeof pdfBase64 !== 'string') {
      return new Response(JSON.stringify({ error: 'pdfBase64 is required' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const finalSubject = (subject && subject.trim()) ||
      `PreAppliCheck Risk Assessment Report${orderNumber ? ` — Order ${orderNumber}` : ''}`;
    const finalFilename = (filename && filename.trim()) ||
      `PreAppliCheck-Report${orderNumber ? `-${orderNumber}` : ''}.pdf`;

    const html = `<div style="font-family:Arial,sans-serif;color:#111;max-width:600px">
      <div style="background:#000;padding:20px;color:#fff">
        <h2 style="margin:0;color:#fff">PreAppliCheck</h2>
        <p style="margin:4px 0 0;color:#ddd">Risk Assessment Report</p>
      </div>
      <div style="padding:20px">
        ${orderNumber ? `<p><strong>Order Number:</strong> ${orderNumber}</p>` : ''}
        <p>${(message || 'Please find the attached risk assessment report.').replace(/</g, '&lt;').replace(/\n/g, '<br/>')}</p>
        <p style="color:#666;font-size:12px;margin-top:24px">This email and its attachment are confidential and intended solely for the addressee.</p>
      </div>
    </div>`;

    const resendRes = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${RESEND_API_KEY}` },
      body: JSON.stringify({
        from: 'PreAppliCheck <reports@tldv.co.za>',
        to: clean,
        subject: finalSubject,
        html,
        attachments: [{ filename: finalFilename, content: pdfBase64 }],
      }),
    });

    const resendData = await resendRes.json().catch(() => ({}));
    if (!resendRes.ok) {
      return new Response(JSON.stringify({ error: 'Resend send failed', details: resendData }), {
        status: 502, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    return new Response(JSON.stringify({ ok: true, id: resendData?.id ?? null, recipients: clean }), {
      status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: (err as Error).message }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});