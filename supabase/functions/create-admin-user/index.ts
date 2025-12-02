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
    const { email, password, firstName, lastName } = await req.json();

    // Validate inputs
    if (!email || !password || !firstName || !lastName) {
      throw new Error("All fields are required");
    }

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

    // Create the new user
    const { data: newUser, error: createError } = await supabaseAdmin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: {
        full_name: `${firstName} ${lastName}`
      }
    });

    if (createError) throw createError;
    if (!newUser.user) throw new Error("Failed to create user");

    // Note: Profile is automatically created by the handle_new_user trigger

    // Assign admin role using the database function
    const { error: roleInsertError } = await supabaseAdmin
      .rpc('assign_user_role', {
        _user_id: newUser.user.id,
        _role: 'admin'
      });

    if (roleInsertError) {
      console.error("Role assignment error:", roleInsertError);
      throw roleInsertError;
    }

    // Get the site URL for the login link
    const siteUrl = Deno.env.get('SITE_URL') || 'https://tldv-data-verification-portal.lovable.app';
    const loginUrl = `${siteUrl}/admin/login`;

    // Send welcome email using Resend
    const resendApiKey = Deno.env.get("RESEND_API_KEY");
    if (resendApiKey) {
      try {
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
              .credentials { background-color: #fff; border: 1px solid #ddd; padding: 20px; margin: 20px 0; border-radius: 5px; }
              .button { display: inline-block; padding: 12px 30px; background-color: #dc2626; color: #fff; text-decoration: none; border-radius: 5px; margin-top: 20px; }
              .footer { text-align: center; padding: 20px; color: #666; font-size: 12px; }
            </style>
          </head>
          <body>
            <div class="container">
              <div class="header">
                <h1>TLDV Data Verification Portal</h1>
              </div>
              <div class="content">
                <h2>Welcome, ${firstName} ${lastName}!</h2>
                <p>Your admin account has been successfully created. You can now access the TLDV Admin Portal.</p>
                
                <div class="credentials">
                  <h3>Your Login Credentials</h3>
                  <p><strong>Email:</strong> ${email}</p>
                  <p><strong>Password:</strong> ${password}</p>
                </div>
                
                <p><strong>Important:</strong> Please change your password after your first login for security purposes.</p>
                
                <a href="${loginUrl}" class="button">Login to Admin Portal</a>
                
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
            subject: "Your TLDV Admin Account Has Been Created",
            html: emailHtml,
          }),
        });

        if (emailResponse.ok) {
          console.log("Welcome email sent successfully");
        } else {
          const errorData = await emailResponse.text();
          console.error("Failed to send welcome email:", errorData);
        }
      } catch (emailError) {
        console.error("Failed to send welcome email:", emailError);
        // Don't throw - user was created successfully, just email failed
      }
    } else {
      console.log("RESEND_API_KEY not configured, skipping welcome email");
    }

    console.log(`Successfully created admin user: ${email}`);

    return new Response(
      JSON.stringify({ 
        success: true, 
        userId: newUser.user.id 
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
