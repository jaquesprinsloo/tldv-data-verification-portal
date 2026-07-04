import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors';
import { LOGO_BASE64 } from './logo.ts';

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

    const { subject, message, pdfBase64, filename, orderNumber, clientName, contactName, to, cc } = body as {
      subject?: string; message?: string; clientName?: string; contactName?: string;
      pdfBase64?: string; filename?: string; orderNumber?: string;
      to?: string; cc?: string | string[];
    };

    const toClean = to && to.trim() ? [to.trim()] : [];
    const ccClean: string[] = Array.isArray(cc) ? cc.filter((e) => e && e.trim()).map((e) => e.trim()) : cc && cc.trim() ? [cc.trim()] : [];

    if (!toClean.length) {
      return new Response(JSON.stringify({ error: 'Recipient email (to) is required' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    if (!pdfBase64 || typeof pdfBase64 !== 'string') {
      return new Response(JSON.stringify({ error: 'pdfBase64 is required' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const finalSubject = (subject && subject.trim()) ||
      `PreAppliCheck Background Screening Report${orderNumber ? ` — Order ${orderNumber}` : ''}`;
    const finalFilename = (filename && filename.trim()) ||
      `PreAppliCheck-Report${orderNumber ? `-${orderNumber}` : ''}.pdf`;

    const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    const extraMessageHtml = message && message.trim()
      ? `<p style="margin:0 0 16px;font-size:14px;line-height:1.6;color:#333">${esc(message).replace(/\n/g, '<br/>')}</p>`
      : '';
    const greetingName = (contactName && contactName.trim()) ? esc(contactName.trim()) : '';
    const greetingLine = greetingName ? `Good day ${greetingName},` : 'Good day,';
    const dateStr = new Date().toLocaleDateString('en-ZA', { year: 'numeric', month: 'long', day: 'numeric' });

    const html = `<!DOCTYPE html><html><body style="margin:0;padding:0;background:#f4f4f5;font-family:Arial,Helvetica,sans-serif;color:#111">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f5;padding:24px 0">
        <tr><td align="center">
          <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background:#ffffff;border-radius:8px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,0.06)">
            <tr><td style="background:#ffffff;padding:28px 28px 12px;text-align:center">
              <img src="cid:preapplicheck-logo" alt="PreAppliCheck — Vetting driven by Intelligence" width="420" style="display:block;margin:0 auto;max-width:100%;height:auto;border:0;outline:none;text-decoration:none;-ms-interpolation-mode:bicubic;" />
            </td></tr>
            <tr><td style="padding:28px">
              <p style="margin:0 0 16px;font-size:15px;line-height:1.5">${greetingLine}</p>
              <p style="margin:0 0 16px;font-size:14px;line-height:1.6;color:#333">Please find the attached Background Screening Report for your review.</p>
              ${extraMessageHtml}
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #e5e7eb;border-radius:6px;margin:0 0 20px">
                ${orderNumber ? `<tr><td style="padding:10px 14px;font-size:13px;color:#6b7280;border-bottom:1px solid #e5e7eb;width:140px">Order Number</td><td style="padding:10px 14px;font-size:13px;color:#111;border-bottom:1px solid #e5e7eb;font-weight:600">${esc(orderNumber)}</td></tr>` : ''}
                ${clientName ? `<tr><td style="padding:10px 14px;font-size:13px;color:#6b7280;border-bottom:1px solid #e5e7eb">Client</td><td style="padding:10px 14px;font-size:13px;color:#111;border-bottom:1px solid #e5e7eb;font-weight:600">${esc(clientName)}</td></tr>` : ''}
                <tr><td style="padding:10px 14px;font-size:13px;color:#6b7280">Report Date</td><td style="padding:10px 14px;font-size:13px;color:#111;font-weight:600">${dateStr}</td></tr>
              </table>
              <p style="margin:24px 0;font-size:14px;line-height:1.6;color:#333">Warm regards,<br/><br/><strong>Client Service</strong></p>
            </td></tr>
            <tr><td style="background:#f9fafb;padding:16px 28px;border-top:1px solid #e5e7eb">
              <p style="margin:0;font-size:11px;line-height:1.5;color:#6b7280;text-align:center">
                This email and its attachment are confidential and intended solely for the addressee.<br/>
                This is an automated message from a no-reply mailbox &mdash; please do not reply.
              </p>
              <p style="margin:8px 0 0;font-size:11px;color:#9ca3af;text-align:center">
                PreAppliCheck is a division of True Lie Detectors &amp; Vetting.
              </p>
              <p style="margin:8px 0 0;font-size:11px;color:#9ca3af;text-align:center">
                <a href="https://portal.tldv.co.za/privacy-policy" style="color:#6b7280;text-decoration:underline">Privacy Policy</a>
              </p>
            </td></tr>
          </table>
        </td></tr>
      </table>
    </body></html>`;

    const resendRes = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${RESEND_API_KEY}` },
      body: JSON.stringify({
        from: 'PreAppliCheck <no-reply@tldv.co.za>',
        reply_to: 'no-reply@tldv.co.za',
        to: toClean,
        ...(ccClean.length ? { cc: ccClean } : {}),
        subject: finalSubject,
        html,
        attachments: [
          { filename: finalFilename, content: pdfBase64 },
          { filename: 'preapplicheck-logo.png', content: LOGO_BASE64, content_id: 'preapplicheck-logo' },
        ],
      }),
    });

    const resendData = await resendRes.json().catch(() => ({}));
    if (!resendRes.ok) {
      return new Response(JSON.stringify({ error: 'Resend send failed', details: resendData }), {
        status: 502, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    return new Response(JSON.stringify({ ok: true, id: resendData?.id ?? null, recipients: toClean, cc: ccClean }), {
      status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: (err as Error).message }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});