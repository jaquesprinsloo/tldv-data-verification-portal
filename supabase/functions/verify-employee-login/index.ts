import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.74.0';
import { z } from 'https://deno.land/x/zod@v3.22.4/mod.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const LoginSchema = z.object({
  employeeNumber: z.string().trim().min(1),
  idNumber: z.string().trim().min(1),
});

// Simple in-memory rate limiting
const rateLimitStore = new Map<string, { count: number; resetTime: number }>();

function checkRateLimit(ip: string): boolean {
  const now = Date.now();
  const limit = rateLimitStore.get(ip);

  if (!limit || now > limit.resetTime) {
    rateLimitStore.set(ip, { count: 1, resetTime: now + 3600000 }); // 1 hour
    return true;
  }

  if (limit.count >= 10) {
    return false;
  }

  limit.count++;
  return true;
}

Deno.serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const clientIp = req.headers.get('x-forwarded-for')?.split(',')[0] || 'unknown';
    
    if (!checkRateLimit(clientIp)) {
      console.log(`Rate limit exceeded for IP: ${clientIp}`);
      return new Response(
        JSON.stringify({ error: 'Too many attempts. Please try again later.' }),
        { status: 429, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false
      }
    });

    const body = await req.json();
    console.log('Received login verification request');

    // Validate input
    const validationResult = LoginSchema.safeParse(body);
    if (!validationResult.success) {
      console.error('Validation failed:', validationResult.error);
      return new Response(
        JSON.stringify({ error: 'Invalid input data' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const { employeeNumber, idNumber } = validationResult.data;

    // Look up employee with service role (bypasses RLS)
    const { data: employeeData, error: employeeError } = await supabaseAdmin
      .from('employees')
      .select('id, email, employment_status')
      .eq('employee_number', employeeNumber)
      .eq('id_number', idNumber)
      .eq('employment_status', 'active')
      .maybeSingle();

    if (employeeError) {
      console.error('Error fetching employee:', employeeError);
      return new Response(
        JSON.stringify({ error: 'Failed to verify credentials' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (!employeeData || !employeeData.email) {
      console.log('Invalid credentials or employee not registered');
      return new Response(
        JSON.stringify({ error: 'Invalid credentials' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log('Employee credentials verified successfully');
    return new Response(
      JSON.stringify({ email: employeeData.email }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Unexpected error:', error);
    return new Response(
      JSON.stringify({ error: 'An unexpected error occurred' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
