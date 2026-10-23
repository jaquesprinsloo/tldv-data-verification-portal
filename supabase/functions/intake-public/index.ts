import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors';
import { createClient } from 'npm:@supabase/supabase-js@2';
import { z } from 'npm:zod@3';
import { LOGO_BASE64 } from './logo.ts';
import { isSubmissionAccount } from './accountRules.ts';

const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY');
const ADMIN_CC = 'admin@tldv.co.za';
// TEMPORARILY DISABLED for mock testing — set to true to re-enable.
const CASH_CRUSADERS_CC_ENABLED = false;
const CASH_CRUSADERS_CCS = ['jardelg@cashcrusaders.co.za', 'hradmin1@cashcrusaders.co.za'];

const ADMIN_EMAIL_DOMAIN = 'cashcrusaders.co.za';

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'];

/** "Cash Crusaders Watercrest" → "CC Watercrest 22 October 2026" (with (n) prefix on dupes). */
export function buildOrderNumber(clientName: string, now = new Date(), taken: Set<string> = new Set()): string {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Africa/Johannesburg', day: 'numeric', month: 'numeric', year: 'numeric',
  }).formatToParts(now);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? '';
  const base = `CC ${clientName.replace(/^cash\s+crusaders\s+/i, '').trim() || clientName.trim()} ${get('day')} ${MONTHS[Number(get('month')) - 1]} ${get('year')}`;
  if (!taken.has(base.toLowerCase())) return base;
  let n = 1;
  while (taken.has(`(${n}) ${base}`.toLowerCase())) n++;
  return `(${n}) ${base}`;
}

/** Derive gender (M/F) and YYYY-MM-DD DOB from a 13-digit SA ID number. */
export function parseSaId(idNumber: string): { gender: 'M' | 'F'; date_of_birth: string } | null {
  const id = idNumber.trim();
  if (!/^\d{13}$/.test(id)) return null;
  const yy = Number(id.slice(0, 2));
  const mm = Number(id.slice(2, 4));
  const dd = Number(id.slice(4, 6));
  if (mm < 1 || mm > 12 || dd < 1 || dd > 31) return null;
  const currentYY = new Date().getFullYear() % 100;
  const century = yy > currentYY ? 1900 : 2000;
  const gender = Number(id.slice(6, 10)) >= 5000 ? 'M' : 'F';
  return { gender, date_of_birth: `${century + yy}-${String(mm).padStart(2, '0')}-${String(dd).padStart(2, '0')}` };
}

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

function emailShell(title: string, bodyHtml: string): string {
  const dateStr = new Date().toLocaleDateString('en-ZA', { year: 'numeric', month: 'long', day: 'numeric' });
  return `<!DOCTYPE html><html><body style="margin:0;padding:0;background:#f4f4f5;font-family:Arial,Helvetica,sans-serif;color:#111">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f5;padding:24px 0">
      <tr><td align="center">
        <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background:#ffffff;border-radius:8px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,0.06)">
          <tr><td style="background:#ffffff;padding:28px 28px 12px;text-align:center">
            <img src="cid:preapplicheck-logo" alt="PreAppliCheck — Vetting driven by Intelligence" width="420" style="display:block;margin:0 auto;max-width:100%;height:auto;border:0;outline:none;text-decoration:none;-ms-interpolation-mode:bicubic;" />
          </td></tr>
          <tr><td style="padding:28px">${bodyHtml}</td></tr>
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
}

async function sendEmail(to: string[], cc: string[], subject: string, html: string) {
  if (!RESEND_API_KEY) throw new Error('RESEND_API_KEY is not configured');
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${RESEND_API_KEY}` },
    body: JSON.stringify({
      from: 'PreAppliCheck <no-reply@tldv.co.za>',
      reply_to: 'no-reply@tldv.co.za',
      to,
      ...(cc.length ? { cc } : {}),
      subject,
      html,
      attachments: [
        { filename: 'preapplicheck-logo.png', content: LOGO_BASE64, content_id: 'preapplicheck-logo' },
      ],
    }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`Resend send failed: ${JSON.stringify(data)}`);
  return data;
}

const CandidateSchema = z.object({
  first_name: z.string().trim().min(1).max(100),
  surname: z.string().trim().min(1).max(100),
  id_number: z.string().trim().min(5).max(30).regex(/^[A-Za-z0-9]+$/, 'ID number may only contain letters and digits'),
  gender: z.enum(['M', 'F']).nullable().optional(),
  date_of_birth: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Date of birth must be YYYY-MM-DD').nullable().optional(),
});

const SubmitSchema = z.object({
  action: z.literal('submit'),
  client_id: z.string().uuid(),
  submission_type: z.enum(['single', 'batch']),
  submitter: z.object({
    first_name: z.string().trim().min(1).max(100),
    surname: z.string().trim().min(1).max(100),
    email: z.string().trim().email().max(255),
    phone: z.string().trim().max(30).optional().or(z.literal('')),
    save_to_address_book: z.boolean().optional().default(false),
  }),
  candidates: z.array(CandidateSchema).min(1).max(200),
  indemnity_paths: z.array(z.string().regex(/^intake\/[\w.\-\/]+$/, 'Invalid document path')).min(1).max(20),
  notes: z.string().trim().max(2000).optional().or(z.literal('')),
});

const LookupSchema = z.object({
  action: z.literal('contact_lookup'),
  email: z.string().trim().email().max(255),
});

const DirectorySchema = z.object({ action: z.literal('directory') });

const supabaseAdmin = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
);

async function listTakenOrderNumbers(baseDate: Date): Promise<Set<string>> {
  const month = MONTHS[baseDate.getMonth()];
  const pattern = `%${month} ${baseDate.getFullYear()}`;
  const taken = new Set<string>();
  const [subs, intakes] = await Promise.all([
    supabaseAdmin.from('manual_risk_submissions').select('order_number').ilike('order_number', pattern),
    supabaseAdmin.from('manual_risk_intakes').select('order_number').ilike('order_number', pattern),
  ]);
  for (const row of subs.data ?? []) taken.add(String(row.order_number).toLowerCase());
  for (const row of intakes.data ?? []) taken.add(String(row.order_number).toLowerCase());
  return taken;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  try {
    const raw = await req.json().catch(() => null);
    if (!raw || typeof raw.action !== 'string') {
      return new Response(JSON.stringify({ error: 'Invalid request body' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // ── Directory of loaded clients (stores) ─────────────────────────────
    if (raw.action === 'directory') {
      const parsed = DirectorySchema.safeParse(raw);
      if (!parsed.success) {
        return new Response(JSON.stringify({ error: 'Invalid request' }), {
          status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      const { data, error } = await supabaseAdmin
        .from('manual_risk_clients')
        .select('id, client_name')
        .order('client_name', { ascending: true });
      if (error) throw new Error(error.message);
      return new Response(JSON.stringify({ clients: (data ?? []).filter((c) => isSubmissionAccount(c.client_name)) }), {
        status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // ── Address book lookup (exact email match, returns name only) ───────
    if (raw.action === 'contact_lookup') {
      const parsed = LookupSchema.safeParse(raw);
      if (!parsed.success) {
        return new Response(JSON.stringify({ error: 'Invalid request' }), {
          status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      const email = parsed.data.email.toLowerCase();
      const { data } = await supabaseAdmin
        .from('manual_risk_contacts')
        .select('name')
        .ilike('email', email)
        .limit(1);
      const row = (data ?? [])[0];
      return new Response(JSON.stringify({ known: !!row, name: row?.name ?? null }), {
        status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // ── Submit an intake request ─────────────────────────────────────────
    const parsed = SubmitSchema.safeParse(raw);
    if (!parsed.success) {
      return new Response(JSON.stringify({ error: 'Validation failed', details: parsed.error.flatten() }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    const input = parsed.data;

    const { data: client } = await supabaseAdmin
      .from('manual_risk_clients')
      .select('id, client_name')
      .eq('id', input.client_id)
      .single();
    if (!client || !isSubmissionAccount(client.client_name)) {
      return new Response(JSON.stringify({ error: 'Unknown store selected' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Every indemnity path must point at a real intake upload.
    for (const p of input.indemnity_paths) {
      const folder = p.split('/').slice(0, 2).join('/'); // intake/<upload-uuid>
      const fileName = p.split('/').pop() ?? '';
      const { data: files } = await supabaseAdmin.storage
        .from('manual-risk-indemnities').list(folder);
      if (!files?.some((f) => f.name === fileName)) {
        return new Response(JSON.stringify({ error: `Uploaded document not found: ${fileName}` }), {
          status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
    }

    // Fill gender/DOB from the SA ID when the submitter left them out.
    const candidates = input.candidates.map((c) => {
      const parsedId = parseSaId(c.id_number);
      return {
        ...c,
        gender: c.gender ?? parsedId?.gender ?? null,
        date_of_birth: c.date_of_birth ?? parsedId?.date_of_birth ?? null,
      };
    });

    const now = new Date();
    const taken = await listTakenOrderNumbers(now);
    const orderNumber = buildOrderNumber(client.client_name, now, taken);
    const submitterName = `${input.submitter.first_name} ${input.submitter.surname}`.trim();

    const indemnityFiles = input.indemnity_paths.map((p) => ({
      name: p.split('/').pop() ?? p,
      path: p,
      uploaded_at: now.toISOString(),
      uploaded_by_name: submitterName,
      source: 'intake',
    }));

    const { data: intake, error: intakeErr } = await supabaseAdmin
      .from('manual_risk_intakes')
      .insert({
        order_number: orderNumber,
        client_id: client.id,
        submission_type: input.submission_type,
        submitter_name: submitterName,
        submitter_email: input.submitter.email.toLowerCase(),
        submitter_phone: input.submitter.phone || null,
        consent_confirmed_at: now.toISOString(),
        indemnity_files: indemnityFiles,
        notes: input.notes || null,
        status: 'pending',
        source: 'public_form',
      })
      .select('id').single();
    if (intakeErr || !intake) throw new Error(intakeErr?.message ?? 'Intake insert failed');

    const { error: candErr } = await supabaseAdmin
      .from('manual_risk_intake_candidates')
      .insert(candidates.map((c, idx) => ({
        intake_id: intake.id,
        first_name: c.first_name,
        surname: c.surname,
        id_number: c.id_number,
        gender: c.gender ?? null,
        date_of_birth: c.date_of_birth ?? null,
        sort_order: idx,
      })));
    if (candErr) throw new Error(candErr.message);

    // Remember the submitter in the address book when asked.
    if (input.submitter.save_to_address_book) {
      const email = input.submitter.email.toLowerCase();
      const { data: existing } = await supabaseAdmin
        .from('manual_risk_contacts').select('id').ilike('email', email).limit(1);
      if (!existing?.length) {
        await supabaseAdmin.from('manual_risk_contacts').insert({
          client_id: client.id,
          name: submitterName,
          email,
          is_default: false,
        });
      }
    }

    // Stage 1 email: request received. CC admin always; Cash Crusaders rule
    // stays behind a flag until live testing is signed off.
    let emailSent = false;
    let emailFailure: string | null = null;
    try {
      const cc: string[] = [ADMIN_CC];
      if (CASH_CRUSADERS_CC_ENABLED && client.client_name.toLowerCase().includes('cash crusaders')) {
        for (const addr of CASH_CRUSADERS_CCS) {
          if (addr.toLowerCase() !== input.submitter.email.toLowerCase() && !cc.includes(addr)) cc.push(addr);
        }
      }
      const candidateRows = candidates.map((c, i) => {
        const name = esc(`${c.first_name} ${c.surname}`);
        const id = esc(c.id_number);
        const gender = c.gender === 'M' ? 'Male' : c.gender === 'F' ? 'Female' : '—';
        const dob = c.date_of_birth ?? '—';
        const border = i === candidates.length - 1 ? '' : 'border-bottom:1px solid #e5e7eb;';
        return `<tr>
          <td style="padding:10px 14px;font-size:13px;color:#111;${border}">${name}</td>
          <td style="padding:10px 14px;font-size:13px;color:#111;font-family:'Courier New',monospace;${border}">${id}</td>
          <td style="padding:10px 14px;font-size:13px;color:#111;${border}">${gender}</td>
          <td style="padding:10px 14px;font-size:13px;color:#111;${border}">${esc(dob)}</td>
        </tr>`;
      }).join('');
      const bodyHtml = `
        <p style="margin:0 0 16px;font-size:15px;line-height:1.5">Good day ${esc(input.submitter.first_name)},</p>
        <p style="margin:0 0 16px;font-size:14px;line-height:1.6;color:#333">
          Thank you — your background screening request has been received successfully and logged for processing.
        </p>
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #e5e7eb;border-radius:6px;margin:0 0 20px">
          <tr><td style="padding:10px 14px;font-size:13px;color:#6b7280;border-bottom:1px solid #e5e7eb;width:140px">Order Number</td><td style="padding:10px 14px;font-size:13px;color:#111;border-bottom:1px solid #e5e7eb;font-weight:600">${esc(orderNumber)}</td></tr>
          <tr><td style="padding:10px 14px;font-size:13px;color:#6b7280;border-bottom:1px solid #e5e7eb">Store</td><td style="padding:10px 14px;font-size:13px;color:#111;border-bottom:1px solid #e5e7eb;font-weight:600">${esc(client.client_name)}</td></tr>
          <tr><td style="padding:10px 14px;font-size:13px;color:#6b7280">Submitted</td><td style="padding:10px 14px;font-size:13px;color:#111;font-weight:600">${esc(new Date().toLocaleDateString('en-ZA', { year: 'numeric', month: 'long', day: 'numeric' }))}</td></tr>
        </table>
        <h3 style="margin:0 0 10px;font-size:14px;color:#111">Candidates on this request</h3>
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #e5e7eb;border-radius:6px;margin:0 0 20px;border-collapse:separate">
          <tr>
            <th align="left" style="padding:10px 14px;font-size:12px;color:#6b7280;background:#f9fafb;border-bottom:1px solid #e5e7eb">Name</th>
            <th align="left" style="padding:10px 14px;font-size:12px;color:#6b7280;background:#f9fafb;border-bottom:1px solid #e5e7eb">ID Number</th>
            <th align="left" style="padding:10px 14px;font-size:12px;color:#6b7280;background:#f9fafb;border-bottom:1px solid #e5e7eb">Gender</th>
            <th align="left" style="padding:10px 14px;font-size:12px;color:#6b7280;background:#f9fafb;border-bottom:1px solid #e5e7eb">Date of Birth</th>
          </tr>
          ${candidateRows}
        </table>
        <p style="margin:0 0 16px;font-size:14px;line-height:1.6;color:#333">
          We will confirm as soon as this order is processed, and the final report will follow once the checks are complete. For reference, feedback is normally provided within <strong>24 to 48 working hours</strong>.
        </p>
        <p style="margin:0 0 16px;font-size:14px;line-height:1.6;color:#333">
          If you have any questions simply send an email to <a href="mailto:admin@tldv.co.za" style="color:#111;text-decoration:underline">admin@tldv.co.za</a> and we will assist you.
        </p>
        <p style="margin:24px 0 0;font-size:14px;line-height:1.6;color:#333">Warm regards,<br/><br/><strong>Client Service</strong></p>`;
      await sendEmail([input.submitter.email], cc, `PreAppliCheck Request Received — ${orderNumber}`, emailShell(orderNumber, bodyHtml));
      emailSent = true;
    } catch (e) {
      emailFailure = (e as Error).message;
    }

    return new Response(JSON.stringify({
      ok: true,
      intake_id: intake.id,
      order_number: orderNumber,
      email_sent: emailSent,
      ...(emailFailure ? { email_error: emailFailure } : {}),
    }), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  } catch (err) {
    return new Response(JSON.stringify({ error: (err as Error).message }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
