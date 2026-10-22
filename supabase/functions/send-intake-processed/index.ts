import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors';
import { createClient } from 'npm:@supabase/supabase-js@2';
import { LOGO_BASE64 } from './logo.ts';

const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY');
const ADMIN_CC = 'admin@tldv.co.za';
// TEMPORARILY DISABLED for mock testing — set to true to re-enable.
const CASH_CRUSADERS_CC_ENABLED = false;
const CASH_CRUSADERS_CCS = ['jardelg@cashcrusaders.co.za', 'hradmin1@cashcrusaders.co.za'];

const supabaseAdmin = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
);

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
    const { to, cc, orderNumber, clientName, contactName } = (body ?? {}) as {
      to?: string; cc?: string | string[]; orderNumber?: string; clientName?: string; contactName?: string;
    };
    if (!to || !to.trim()) {
      return new Response(JSON.stringify({ error: 'Recipient email (to) is required' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const ccClean: string[] = Array.isArray(cc)
      ? cc.filter((e) => e && e.trim()).map((e) => e.trim())
      : cc && cc.trim() ? [cc.trim()] : [];
    if (!ccClean.some((e) => e.toLowerCase() === ADMIN_CC)) ccClean.push(ADMIN_CC);
    if (CASH_CRUSADERS_CC_ENABLED && clientName && /cash\s*crusaders/i.test(clientName)) {
      for (const addr of CASH_CRUSADERS_CCS) {
        if (addr.toLowerCase() !== to.trim().toLowerCase() && !ccClean.some((e) => e.toLowerCase() === addr)) {
          ccClean.push(addr);
        }
      }
    }

    const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    const greetingName = (contactName && contactName.trim()) ? esc(contactName.trim()) : '';
    const greetingLine = greetingName ? `Good day ${greetingName},` : 'Good day,';
    const subject = `PreAppliCheck Order Processed${orderNumber ? ` — ${orderNumber}` : ''}`;
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
                Your background check order <strong>${esc(orderNumber || '')}</strong> is now being processed.
              </p>
              <p style="margin:0 0 16px;font-size:14px;line-height:1.6;color:#333">
                You will receive an update as soon as the checks are complete and the report is released. If you have any questions in the meantime, simply send an email to <a href="mailto:admin@tldv.co.za" style="color:#111;text-decoration:underline">admin@tldv.co.za</a>.
              </p>
              <p style="margin:24px 0 0;font-size:14px;line-height:1.6;color:#333">Warm regards,<br/><br/><strong>Client Service</strong></p>
            </td></tr>
            <tr><td style="background:#f9fafb;padding:16px 28px;border-top:1px solid #e5e7eb">
              <p style="margin:0 0 6px;font-size:12px;line-height:1.5;color:#374151;text-align:center"><strong>PreAppliCheck</strong></p>
              <p style="margin:0 0 12px;font-size:11px;line-height:1.5;color:#6b7280;text-align:center">A division of True Lie Detectors &amp; Vetting</p>
              <p style="margin:0 0 12px;font-size:11px;line-height:1.5;color:#6b7280;text-align:center"><a href="https://preapplicheck.co.za" style="color:#6b7280;text-decoration:underline">preapplicheck.co.za</a></p>
              <p style="margin:0 0 12px;font-size:11px;line-height:1.5;color:#6b7280;text-align:center">This email and any attachments are confidential and intended solely for the named recipient. If you have received this email in error, please notify the sender immediately and delete it from your system.</p>
              <p style="margin:0;font-size:11px;line-height:1.5;color:#6b7280;text-align:center">We process personal information in accordance with the Protection of Personal Information Act (POPIA). For more information on how we handle personal information, please view our <a href="https://portal.tldv.co.za/privacy-policy" style="color:#6b7280;text-decoration:underline">Privacy Policy</a>.</p>
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
        to: [to.trim()],
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

    return new Response(JSON.stringify({ ok: true, id: resendData?.id ?? null, recipients: [to.trim()], cc: ccClean }), {
      status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: (err as Error).message }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
