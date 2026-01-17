import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { email, firstName, lastName, password, role = 'admin' } = await req.json();

    // Validate inputs
    if (!email || !firstName || !lastName || !password) {
      throw new Error("Email, first name, last name, and password are required");
    }

    // Validate role
    if (!['admin', 'master_admin'].includes(role)) {
      throw new Error("Invalid role. Must be 'admin' or 'master_admin'");
    }

    // Validate password length
    if (password.length < 8) {
      throw new Error("Password must be at least 8 characters");
    }

    // Get the authorization header
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      throw new Error("No authorization header");
    }

    // Extract the token from the header
    const token = authHeader.replace('Bearer ', '');

    // Create admin client for operations
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

    // Verify the user from the token
    const { data: { user }, error: userError } = await supabaseAdmin.auth.getUser(token);
    
    if (userError || !user) {
      console.error("User verification error:", userError);
      throw new Error("Not authenticated");
    }

    // Check if the user is a master admin
    const { data: roleData, error: roleError } = await supabaseAdmin
      .from('user_roles')
      .select('role')
      .eq('user_id', user.id)
      .eq('role', 'master_admin')
      .single();

    if (roleError || !roleData) {
      throw new Error("Not authorized - master admin only");
    }

    // Create the user with the provided password
    const { data: createData, error: createError } = await supabaseAdmin.auth.admin.createUser({
      email,
      password,
      email_confirm: true, // Auto-confirm email
      user_metadata: {
        full_name: `${firstName} ${lastName}`
      }
    });

    if (createError) {
      console.error("User creation error:", createError);
      throw createError;
    }
    
    if (!createData.user) {
      throw new Error("Failed to create user");
    }

    console.log(`User created: ${email}, user ID: ${createData.user.id}, role: ${role}`);

    // Assign role directly using service role (we've already verified caller is master admin)
    const { error: roleInsertError } = await supabaseAdmin
      .from('user_roles')
      .insert({
        user_id: createData.user.id,
        role: role
      });

    if (roleInsertError) {
      console.error("Role assignment error:", roleInsertError);
      throw roleInsertError;
    }

    // Create profile for the new admin
    const { error: profileError } = await supabaseAdmin
      .from('profiles')
      .insert({
        id: createData.user.id,
        email: email,
        full_name: `${firstName} ${lastName}`
      });

    if (profileError) {
      console.error("Profile creation error:", profileError);
      // Don't throw - role was assigned, profile creation is secondary
    }

    // Send credentials email using Resend API
    const resendApiKey = Deno.env.get("RESEND_API_KEY");
    if (resendApiKey) {
      try {
        const siteUrl = Deno.env.get('SITE_URL') || 'https://tldv-data-verification-portal.lovable.app';
        const roleDisplay = role === 'master_admin' ? 'Master Admin' : 'Admin';

        const emailHtml = `
          <!DOCTYPE html>
          <html>
          <head>
            <style>
              body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
              .container { max-width: 600px; margin: 0 auto; padding: 20px; }
              .header { background-color: #000; padding: 20px; text-align: center; }
              .header h1 { color: #dc2626; margin: 0; }
              .content { padding: 30px; background-color: #f9f9f9; }
              .credentials-box { background-color: #fff; border: 2px solid #dc2626; padding: 20px; margin: 20px 0; border-radius: 5px; }
              .credential-item { margin: 10px 0; padding: 10px; background-color: #f5f5f5; border-radius: 3px; }
              .credential-label { font-weight: bold; color: #666; font-size: 12px; text-transform: uppercase; }
              .credential-value { font-size: 16px; color: #000; margin-top: 5px; font-family: monospace; }
              .warning { background-color: #fef2f2; border: 1px solid #dc2626; padding: 15px; border-radius: 5px; margin: 20px 0; }
              .footer { text-align: center; padding: 20px; color: #666; font-size: 12px; }
              .button { display: inline-block; background-color: #dc2626; color: white; padding: 12px 24px; text-decoration: none; border-radius: 5px; margin-top: 20px; }
            </style>
          </head>
          <body>
            <div class="container">
              <div class="header">
                <h1>TLDV Data Verification Portal</h1>
              </div>
              <div class="content">
                <h2>Welcome, ${firstName} ${lastName}!</h2>
                <p>Your <strong>${roleDisplay}</strong> account has been created. Below are your login credentials:</p>
                
                <div class="credentials-box">
                  <h3 style="margin-top: 0; color: #dc2626;">Your Login Credentials</h3>
                  <div class="credential-item">
                    <div class="credential-label">Email Address</div>
                    <div class="credential-value">${email}</div>
                  </div>
                  <div class="credential-item">
                    <div class="credential-label">Password</div>
                    <div class="credential-value">${password}</div>
                  </div>
                  <div class="credential-item">
                    <div class="credential-label">Role</div>
                    <div class="credential-value">${roleDisplay}</div>
                  </div>
                </div>
                
                <div class="warning">
                  <strong>⚠️ Security Notice:</strong>
                  <p style="margin-bottom: 0;">For security purposes, we strongly recommend changing your password after your first login. Keep these credentials confidential and do not share them with anyone.</p>
                </div>
                
                <center>
                  <a href="${siteUrl}/admin/login" class="button">Login to Portal</a>
                </center>
                
                <p style="margin-top: 30px;">If you have any questions, please contact the master administrator.</p>
              </div>
              <div class="footer">
                <p>This is an automated message from TLDV Data Verification Portal.</p>
                <p>Please do not reply to this email.</p>
              </div>
            </div>
          </body>
          </html>
        `;

        const emailResponse = await fetch('https://api.resend.com/emails', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${resendApiKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            from: "TLDV Admin <onboarding@resend.dev>",
            to: [email],
            subject: `Your TLDV ${roleDisplay} Account Has Been Created`,
            html: emailHtml,
          }),
        });

        if (emailResponse.ok) {
          console.log("Credentials email sent successfully");
        } else {
          const errorData = await emailResponse.text();
          console.error("Failed to send credentials email:", errorData);
        }
      } catch (emailError) {
        console.error("Failed to send credentials email:", emailError);
        // Don't throw - user was created successfully, just email failed
      }
    } else {
      console.log("RESEND_API_KEY not configured, skipping credentials email");
    }

    console.log(`Successfully created ${role} user: ${email}`);

    return new Response(
      JSON.stringify({ 
        success: true, 
        userId: createData.user.id,
        message: "Profile created. Login credentials have been sent to their email."
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      }
    );
  } catch (error: any) {
    console.error("Error creating admin user:", error);
    return new Response(
      JSON.stringify({ error: error.message }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 400,
      }
    );
  }
});