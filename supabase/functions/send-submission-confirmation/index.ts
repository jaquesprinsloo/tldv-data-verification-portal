import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors';
import { createClient } from 'npm:@supabase/supabase-js@2';
import { LOGO_BASE64 } from './logo.ts';

const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY');

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    // Require authenticated admin/master_admin caller
    const authHeader = req.headers.get('Authorization') || '';
    const jwt = authHeader.replace('Bearer ', '');
    if (!jwt) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );
    const { data: userData, error: userErr } = await supabaseAdmin.auth.getUser(jwt);
    if (userErr || !userData?.user) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    const { data: roleRows } = await supabaseAdmin
      .from('user_roles').select('role').eq('user_id', userData.user.id);
    const roles = (roleRows || []).map((r: any) => r.role);
    if (!roles.includes('admin') && !roles.includes('master_admin')) {
      return new Response(JSON.stringify({ error: 'Forbidden' }), {
        status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

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

    const { to, cc, orderNumber, clientName, contactName, candidates } = body as {
      to?: string; cc?: string | string[];
      orderNumber?: string; clientName?: string; contactName?: string;
      candidates?: Array<{ first_name?: string; surname?: string; id_number?: string }>;
    };

    const toClean = to && to.trim() ? [to.trim()] : [];
    const ccClean: string[] = Array.isArray(cc)
      ? cc.filter((e) => e && e.trim()).map((e) => e.trim())
      : cc && cc.trim() ? [cc.trim()] : [];

    if (!toClean.length) {
      return new Response(JSON.stringify({ error: 'Recipient email (to) is required' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    const maskId = (id: string) => {
      const digits = (id || '').replace(/\D/g, '');
      if (!digits) return '';
      const visible = digits.slice(0, 6);
      const masked = '*'.repeat(Math.max(0, digits.length - 6));
      return visible + masked;
    };
    const candidateList = Array.isArray(candidates) ? candidates.filter(Boolean) : [];
    const candidatesHtml = candidateList.length
      ? `<h3 style="margin:0 0 10px;font-size:14px;color:#111">Candidates included in this submission</h3>
         <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #e5e7eb;border-radius:6px;margin:0 0 20px;border-collapse:separate">
           <tr>
             <th align="left" style="padding:10px 14px;font-size:12px;color:#6b7280;background:#f9fafb;border-bottom:1px solid #e5e7eb">Name</th>
             <th align="left" style="padding:10px 14px;font-size:12px;color:#6b7280;background:#f9fafb;border-bottom:1px solid #e5e7eb">ID Number</th>
           </tr>
           ${candidateList.map((c, i) => {
             const name = `${esc((c.first_name || '').trim())} ${esc((c.surname || '').trim())}`.trim() || '—';
             const idMasked = esc(maskId(c.id_number || ''));
             const border = i === candidateList.length - 1 ? '' : 'border-bottom:1px solid #e5e7eb;';
             return `<tr><td style="padding:10px 14px;font-size:13px;color:#111;${border}">${name}</td><td style="padding:10px 14px;font-size:13px;color:#111;font-family:'Courier New',monospace;${border}">${idMasked}</td></tr>`;
           }).join('')}
         </table>`
      : '';
    const greetingName = (contactName && contactName.trim()) ? esc(contactName.trim()) : '';
    const greetingLine = greetingName ? `Good day ${greetingName},` : 'Good day,';
    const dateStr = new Date().toLocaleDateString('en-ZA', { year: 'numeric', month: 'long', day: 'numeric' });
    const subject = `PreAppliCheck Submission Received${orderNumber ? ` — Order ${orderNumber}` : ''}`;

    const html = `<!DOCTYPE html><html><body style="margin:0;padding:0;background:#f4f4f5;font-family:Arial,Helvetica,sans-serif;color:#111">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f5;padding:24px 0">
        <tr><td align="center">
          <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background:#ffffff;border-radius:8px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,0.06)">
            <tr><td style="background:#ffffff;padding:28px 28px 12px;text-align:center">
              <img src="cid:preapplicheck-logo" alt="PreAppliCheck — Vetting driven by Intelligence" width="420" style="display:block;margin:0 auto;max-width:100%;height:auto;border:0;outline:none;text-decoration:none;-ms-interpolation-mode:bicubic;" />
            </td></tr>
            <tr><td style="padding:28px">
              <p style="margin:0 0 16px;font-size:15px;line-height:1.5">${greetingLine}</p>
              <p style="margin:0 0 16px;font-size:14px;line-height:1.6;color:#333">
                Your background screening submission has been received and submitted successfully.
              </p>
              <p style="margin:0 0 16px;font-size:14px;line-height:1.6;color:#333">
                We are now awaiting verification confirmation on the below listed candidate/s. Once received, the results will be sent to you. You should receive final feedback within <strong>24 to 48 working hours</strong>.
              </p>
              <p style="margin:0 0 16px;font-size:13px;line-height:1.5;color:#6b7280;background:#f9fafb;border:1px solid #e5e7eb;border-radius:6px;padding:14px">
                <strong style="color:#374151">Please note:</strong> Feedback timelines are based on the operational hours of verification agents and governmental departments. If a department is not operating during the submission window, the verification process will only commence when their next operating hours begin.
              </p>
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #e5e7eb;border-radius:6px;margin:0 0 20px">
                ${orderNumber ? `<tr><td style="padding:10px 14px;font-size:13px;color:#6b7280;border-bottom:1px solid #e5e7eb;width:140px">Order Number</td><td style="padding:10px 14px;font-size:13px;color:#111;border-bottom:1px solid #e5e7eb;font-weight:600">${esc(orderNumber)}</td></tr>` : ''}
                ${clientName ? `<tr><td style="padding:10px 14px;font-size:13px;color:#6b7280;border-bottom:1px solid #e5e7eb">Client</td><td style="padding:10px 14px;font-size:13px;color:#111;border-bottom:1px solid #e5e7eb;font-weight:600">${esc(clientName)}</td></tr>` : ''}
                <tr><td style="padding:10px 14px;font-size:13px;color:#6b7280">Submission Date</td><td style="padding:10px 14px;font-size:13px;color:#111;font-weight:600">${dateStr}</td></tr>
              </table>
              ${candidatesHtml}
              <p style="margin:0 0 16px;font-size:14px;line-height:1.6;color:#333">
                If you have any questions simply send an email to <a href="mailto:admin@tldv.co.za" style="color:#111;text-decoration:underline">admin@tldv.co.za</a> and we will assist you.
              </p>
              <p style="margin:24px 0 0;font-size:14px;line-height:1.6;color:#333">Warm regards,<br/><br/><strong>Client Service</strong></p>
            </td></tr>
            <tr><td style="background:#f9fafb;padding:16px 28px;border-top:1px solid #e5e7eb">
              <p style="margin:0 0 6px;font-size:12px;line-height:1.5;color:#374151;text-align:center"><strong>PreAppliCheck</strong></p>
              <p style="margin:0 0 12px;font-size:11px;line-height:1.5;color:#6b7280;text-align:center">A division of True Lie Detectors &amp; Vetting</p>
              <p style="margin:0 0 12px;font-size:11px;line-height:1.5;color:#6b7280;text-align:center">This email and any attachments are confidential and intended solely for the named recipient. If you have received this email in error, please notify the sender immediately and delete it from your system.</p>
              <p style="margin:0 0 12px;font-size:11px;line-height:1.5;color:#6b7280;text-align:center">We process personal information in accordance with the Protection of Personal Information Act (POPIA). For more information on how we handle personal information, please view our <a href="https://portal.tldv.co.za/privacy-policy" style="color:#6b7280;text-decoration:underline">Privacy Policy</a>.</p>
              <p style="margin:0;font-size:11px;line-height:1.5;color:#6b7280;text-align:center">If you are not the intended recipient, you may not copy, forward, or disclose the contents of this email or any attachments.</p>
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
        subject,
        html,
        attachments: [
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