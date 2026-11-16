import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors';
import { createClient } from 'npm:@supabase/supabase-js@2';

// Kept server-side only so the re-download password never ships to browsers.
const MASTER_PASSWORD = Deno.env.get('REPORT_MASTER_PASSWORD') || 'TLDV0011';

const json = (body: unknown) =>
  new Response(JSON.stringify(body), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  try {
    const jwt = (req.headers.get('Authorization') || '').replace(/^Bearer\s+/i, '');
    if (!jwt) return json({ ok: false, error: 'Unauthorized' });
    const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
    const { data, error } = await admin.auth.getUser(jwt);
    if (error || !data?.user) return json({ ok: false, error: 'Unauthorized' });
    const body = await req.json().catch(() => ({}));
    const password = typeof body?.password === 'string' ? body.password.slice(0, 100) : '';
    return json({ ok: password.length > 0 && password === MASTER_PASSWORD });
  } catch {
    return json({ ok: false, error: 'Unexpected error' });
  }
});
