// Link employee to authenticated user after login
// Uses authenticated user token to securely set employees.user_id
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { z } from 'https://esm.sh/zod@3.22.4';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Content-Type': 'application/json'
};

const LinkSchema = z.object({
  employeeNumber: z.string().min(1),
  idNumber: z.string().min(5)
});

Deno.serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY');
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

    if (!supabaseUrl || !anonKey || !serviceRoleKey) {
      return new Response(JSON.stringify({ error: 'Server not configured' }), { status: 500, headers: corsHeaders });
    }

    // Authenticated client to read current user from the JWT in the request
    const authClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: req.headers.get('Authorization') || '' } },
    });
    const {
      data: { user },
      error: userError,
    } = await authClient.auth.getUser();

    if (userError || !user) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: corsHeaders });
    }

    const body = await req.json().catch(() => null);
    const parsed = LinkSchema.safeParse(body);
    if (!parsed.success) {
      return new Response(JSON.stringify({ error: 'Invalid input', details: parsed.error.flatten() }), {
        status: 400,
        headers: corsHeaders,
      });
    }

    const { employeeNumber, idNumber } = parsed.data;

    // Admin client to bypass RLS for secure linking
    const adminClient = createClient(supabaseUrl, serviceRoleKey);

    // Find employee by employeeNumber + idNumber, ensure active
    const { data: employee, error: empError } = await adminClient
      .from('employees')
      .select('id, user_id, employment_status')
      .eq('employee_number', employeeNumber)
      .eq('id_number', idNumber)
      .single();

    if (empError || !employee) {
      return new Response(JSON.stringify({ error: 'Employee not found' }), { status: 404, headers: corsHeaders });
    }

    if (employee.employment_status !== 'active') {
      return new Response(JSON.stringify({ error: 'Employee not active' }), { status: 403, headers: corsHeaders });
    }

    // If already linked to another user, block
    if (employee.user_id && employee.user_id !== user.id) {
      return new Response(JSON.stringify({ error: 'Employee already linked to another account' }), {
        status: 409,
        headers: corsHeaders,
      });
    }

    // If not linked, link now (avoid race with IS NULL condition)
    if (!employee.user_id) {
      const { error: updateError } = await adminClient
        .from('employees')
        .update({ user_id: user.id })
        .eq('id', employee.id)
        .is('user_id', null);

      if (updateError) {
        return new Response(JSON.stringify({ error: 'Failed to link employee' }), { status: 500, headers: corsHeaders });
      }
    }

    return new Response(JSON.stringify({ status: 'linked', employeeId: employee.id }), {
      status: 200,
      headers: corsHeaders,
    });
  } catch (e) {
    console.error('link-employee-user error', e);
    return new Response(JSON.stringify({ error: 'Server error' }), { status: 500, headers: corsHeaders });
  }
});
