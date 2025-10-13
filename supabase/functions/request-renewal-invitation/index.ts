import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.7.1";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface RequestRenewalRequest {
  employeeId: string;
}

const handler = async (req: Request): Promise<Response> => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const { employeeId }: RequestRenewalRequest = await req.json();

    if (!employeeId) {
      return new Response(
        JSON.stringify({ error: 'Employee ID is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log('Processing renewal request for employee:', employeeId);

    // SECURITY: Rate limiting - check if employee has requested recently
    const { data: recentRequests, error: recentError } = await supabase
      .from('renewal_requests')
      .select('created_at')
      .eq('employee_id', employeeId)
      .gte('created_at', new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()) // Last 24 hours
      .order('created_at', { ascending: false });

    if (recentError) {
      console.error('Error checking recent requests:', recentError);
      return new Response(
        JSON.stringify({ error: 'Database error' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Allow max 3 requests per day per employee
    if (recentRequests && recentRequests.length >= 3) {
      console.log(`Rate limit exceeded for employee ${employeeId}`);
      return new Response(
        JSON.stringify({ error: 'Rate limit exceeded. Please try again tomorrow.' }),
        { status: 429, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Check if employee exists and is active
    const { data: employee, error: employeeError } = await supabase
      .from('employees')
      .select('id, employment_status')
      .eq('id', employeeId)
      .single();

    if (employeeError || !employee) {
      console.error('Employee not found:', employeeError);
      return new Response(
        JSON.stringify({ error: 'Employee not found' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (employee.employment_status !== 'active') {
      return new Response(
        JSON.stringify({ error: 'Employee is not active' }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Check if there's already a pending request
    const { data: existingRequest } = await supabase
      .from('renewal_requests')
      .select('id')
      .eq('employee_id', employeeId)
      .eq('status', 'pending')
      .single();

    if (existingRequest) {
      return new Response(
        JSON.stringify({ 
          success: true, 
          message: 'Renewal request already exists',
          requestId: existingRequest.id 
        }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Create new renewal request
    const { data: newRequest, error: insertError } = await supabase
      .from('renewal_requests')
      .insert({
        employee_id: employeeId,
        requested_via: 'email_link',
        status: 'pending',
      })
      .select()
      .single();

    if (insertError) {
      console.error('Error creating renewal request:', insertError);
      throw insertError;
    }

    console.log('Renewal request created successfully:', newRequest.id);

    return new Response(
      JSON.stringify({ 
        success: true, 
        message: 'Renewal request submitted successfully',
        requestId: newRequest.id 
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error: any) {
    console.error('Error in request-renewal-invitation function:', error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
};

serve(handler);
