import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface RegistrationRequest {
  token: string;
  employeeNumber: string;
  idNumber: string;
  otp: string;
  password: string;
}

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
      {
        auth: {
          autoRefreshToken: false,
          persistSession: false
        }
      }
    );

    const { token, employeeNumber, idNumber, otp, password }: RegistrationRequest = await req.json();

    console.log('Starting employee registration process', { token, employeeNumber });

    // Validate invitation token and credentials
    const { data: validationData, error: validationError } = await supabaseAdmin
      .rpc('validate_invitation_token_and_create_user', {
        _token: token,
        _employee_number: employeeNumber,
        _id_number: idNumber,
        _otp: otp,
        _email: '',
        _password: password
      })
      .single() as { 
        data: { 
          is_valid: boolean; 
          employee_id: string; 
          email: string; 
          user_created: boolean;
        } | null; 
        error: any;
      };

    if (validationError || !validationData || !validationData.is_valid) {
      console.error('Validation failed:', validationError);
      return new Response(
        JSON.stringify({ 
          error: 'Invalid credentials or invitation',
          details: validationError?.message 
        }),
        {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        }
      );
    }

    const { employee_id, email, user_created } = validationData;
    console.log('Validation successful', { employee_id, email, user_created });

    // Check if user already exists
    const { data: existingUser } = await supabaseAdmin
      .from('employees')
      .select('user_id')
      .eq('id', employee_id)
      .single();

    let userId = existingUser?.user_id;

    // Create auth user if needed
    if (!userId) {
      console.log('Creating new auth user', { email });
      
      try {
        const { data: authUser } = await supabaseAdmin.auth.admin.createUser({
          email: email,
          password: password,
          email_confirm: true, // Auto-confirm email
          user_metadata: {
            employee_id: employee_id
          }
        });
        userId = authUser.user.id;
        console.log('Auth user created successfully', { userId });
      } catch (err: any) {
        const msg = err?.message || '';
        const code = err?.code || err?.status;
        // If the user already exists, fetch their id and continue
        if (msg.includes('already registered') || msg.includes('already exists') || code === 'email_exists' || code === 422) {
          console.log('User already exists, fetching existing user');
          const { data: userData } = await supabaseAdmin.auth.admin.listUsers();
          const existingAuthUser = userData.users.find((u: any) => u.email === email);
          if (existingAuthUser) {
            userId = existingAuthUser.id;
            console.log('Found existing auth user', { userId });
          } else {
            console.error('User exists but could not be found by email');
            throw new Error('User exists but could not be found');
          }
        } else {
          console.error('Error creating user:', err);
          throw err;
        }
      }

      // Link employee to user
      const { error: linkError } = await supabaseAdmin
        .from('employees')
        .update({ user_id: userId })
        .eq('id', employee_id);

      if (linkError) {
        console.error('Error linking employee to user:', linkError);
        throw linkError;
      }

      console.log('Employee linked to user successfully');
    } else {
      console.log('Employee already linked to user', { userId });
    }

    // Create a session for the user
    const { data: sessionData, error: sessionError } = await supabaseAdmin.auth.admin.generateLink({
      type: 'magiclink',
      email: email,
    });

    if (sessionError) {
      console.error('Error generating session:', sessionError);
      throw sessionError;
    }

    console.log('Registration completed successfully');

    return new Response(
      JSON.stringify({
        success: true,
        email: email,
        employee_id: employee_id,
        message: 'Registration successful'
      }),
      {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      }
    );

  } catch (error: any) {
    console.error('Error in complete-employee-registration:', error);
    return new Response(
      JSON.stringify({ 
        error: error.message || 'Registration failed',
        details: error.toString()
      }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      }
    );
  }
});
