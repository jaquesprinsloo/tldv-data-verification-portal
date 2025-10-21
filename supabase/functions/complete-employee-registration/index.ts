import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";
import { z } from "https://deno.land/x/zod@v3.22.4/mod.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Server-side validation schema
const RegistrationSchema = z.object({
  token: z.string().uuid('Invalid token format'),
  employeeNumber: z.string().trim().min(1).max(50, 'Employee number too long'),
  idNumber: z.string().regex(/^\d{13}$/, 'ID number must be exactly 13 digits'),
  otp: z.string().regex(/^\d{6}$/, 'OTP must be exactly 6 digits'),
  password: z.string()
    .min(12, 'Password must be at least 12 characters')
    .max(128, 'Password too long')
    .regex(/[A-Z]/, 'Password must include uppercase letter')
    .regex(/[a-z]/, 'Password must include lowercase letter')
    .regex(/[0-9]/, 'Password must include number')
    .regex(/[^A-Za-z0-9]/, 'Password must include special character')
});

interface RegistrationRequest {
  token: string;
  employeeNumber: string;
  idNumber: string;
  otp: string;
  password: string;
}

// Simple in-memory rate limiting (per IP)
const rateLimitStore = new Map<string, { attempts: number; resetTime: number }>();

function checkRateLimit(ip: string): boolean {
  const now = Date.now();
  const record = rateLimitStore.get(ip);
  
  if (!record || now > record.resetTime) {
    rateLimitStore.set(ip, { attempts: 1, resetTime: now + 3600000 }); // 1 hour
    return true;
  }
  
  if (record.attempts >= 10) {
    return false;
  }
  
  record.attempts++;
  return true;
}

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Rate limiting based on IP
    const ip = req.headers.get('x-forwarded-for')?.split(',')[0] || 'unknown';
    if (!checkRateLimit(ip)) {
      return new Response(
        JSON.stringify({ error: 'Too many attempts. Please try again later.' }),
        {
          status: 429,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        }
      );
    }

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

    const body: RegistrationRequest = await req.json();

    // Validate input with zod
    const validationResult = RegistrationSchema.safeParse(body);
    if (!validationResult.success) {
      console.error('Input validation failed');
      return new Response(
        JSON.stringify({ error: 'Invalid request. Please check your information and try again.' }),
        {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        }
      );
    }

    const { token, employeeNumber, idNumber, otp, password } = validationResult.data;

    console.log('Registration attempt started');

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
      console.error('Authentication failed');
      return new Response(
        JSON.stringify({ 
          error: 'Unable to complete registration. Please verify your information and try again.'
        }),
        {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        }
      );
    }

    const { employee_id, email, user_created } = validationData;
    console.log('Authentication successful');

    // Check if user already exists
    const { data: existingUser } = await supabaseAdmin
      .from('employees')
      .select('user_id')
      .eq('id', employee_id)
      .single();

    let userId = existingUser?.user_id;

    // Create auth user if needed
    if (!userId) {
      console.log('Creating new auth user');
      
      const { data: authUser, error: createUserError } = await supabaseAdmin.auth.admin.createUser({
        email: email,
        password: password,
        email_confirm: true, // Auto-confirm email
        user_metadata: {
          employee_id: employee_id
        }
      });

      if (createUserError) {
        const msg = createUserError?.message || '';
        const code = (createUserError as any)?.code || (createUserError as any)?.status;
        if (msg.includes('already registered') || msg.includes('already exists') || code === 'email_exists' || code === 422) {
          console.log('User already exists, fetching existing user');
          const { data: userData, error: listErr } = await supabaseAdmin.auth.admin.listUsers();
          if (listErr) {
            console.error('Error listing users:', listErr);
            throw listErr;
          }
          const existingAuthUser = userData?.users?.find((u: any) => u.email === email);
          if (existingAuthUser) {
            userId = existingAuthUser.id;
            console.log('Found existing auth user');
            // Ensure the password is updated to the one chosen during registration
            const { error: updatePasswordError } = await supabaseAdmin.auth.admin.updateUserById(userId, { password });
            if (updatePasswordError) {
              console.error('Failed to update password for existing user', updatePasswordError);
              throw updatePasswordError;
            }
          } else {
            console.error('User authentication conflict');
            throw new Error('Unable to complete registration. Please contact support.');
          }
        } else {
          console.error('User creation failed');
          throw createUserError;
        }
      } else {
        userId = authUser!.user!.id;
        console.log('Auth user created successfully');
      }

      // Link employee to user and store email
      const { error: linkError } = await supabaseAdmin
        .from('employees')
        .update({ user_id: userId, email: email })
        .eq('id', employee_id);

      if (linkError) {
        console.error('Failed to link employee account');
        throw linkError;
      }

      console.log('Employee linked successfully');
    } else {
      console.log('Employee already linked');
      // Update the password to the one chosen during registration
      if (userId) {
        const { error: updatePwdLinkedErr } = await supabaseAdmin.auth.admin.updateUserById(userId, { password });
        if (updatePwdLinkedErr) {
          console.error('Failed to update password for linked user', updatePwdLinkedErr);
          throw updatePwdLinkedErr;
        }
      }
      
      // Ensure email is stored even if already linked
      await supabaseAdmin
        .from('employees')
        .update({ email: email })
        .eq('id', employee_id)
        .is('email', null);
    }

    // Create a session for the user
    const { data: sessionData, error: sessionError } = await supabaseAdmin.auth.admin.generateLink({
      type: 'magiclink',
      email: email,
    });

    if (sessionError) {
      console.error('Session generation failed');
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
    console.error('Registration error occurred');
    return new Response(
      JSON.stringify({ 
        error: 'Unable to complete registration. Please try again or contact support.'
      }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      }
    );
  }
});
