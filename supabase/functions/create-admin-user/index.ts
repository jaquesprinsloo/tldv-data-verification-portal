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
    const { email, firstName, lastName } = await req.json();

    // Validate inputs - password no longer required, will be set via invite link
    if (!email || !firstName || !lastName) {
      throw new Error("Email, first name, and last name are required");
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

    // Get the site URL for the login link
    const siteUrl = Deno.env.get('SITE_URL') || 'https://tldv-data-verification-portal.lovable.app';

    // Generate an invite link instead of creating user with password
    const { data: inviteData, error: inviteError } = await supabaseAdmin.auth.admin.inviteUserByEmail(email, {
      data: {
        full_name: `${firstName} ${lastName}`
      },
      redirectTo: `${siteUrl}/admin/login`
    });

    if (inviteError) {
      console.error("Invite error:", inviteError);
      throw inviteError;
    }
    
    if (!inviteData.user) {
      throw new Error("Failed to invite user");
    }

    console.log(`Invite sent to ${email}, user ID: ${inviteData.user.id}`);

    // Assign admin role directly using service role (we've already verified caller is master admin)
    const { error: roleInsertError } = await supabaseAdmin
      .from('user_roles')
      .insert({
        user_id: inviteData.user.id,
        role: 'admin'
      });

    if (roleInsertError) {
      console.error("Role assignment error:", roleInsertError);
      throw roleInsertError;
    }

    // Create profile for the new admin
    const { error: profileError } = await supabaseAdmin
      .from('profiles')
      .insert({
        id: inviteData.user.id,
        email: email,
        full_name: `${firstName} ${lastName}`
      });

    if (profileError) {
      console.error("Profile creation error:", profileError);
      // Don't throw - role was assigned, profile creation is secondary
    }

    // Send welcome email using Resend (without password)
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
              .info-box { background-color: #fff; border: 1px solid #ddd; padding: 20px; margin: 20px 0; border-radius: 5px; }
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
                <p>Your admin account has been created. You should receive a separate email from the system with a secure link to set your password.</p>
                
                <div class="info-box">
                  <h3>Next Steps</h3>
                  <p>1. Check your inbox for the password setup email</p>
                  <p>2. Click the secure link to set your password</p>
                  <p>3. Once set, you can log in to the Admin Portal</p>
                </div>
                
                <p><strong>Note:</strong> The password setup link expires in 24 hours. If it expires, please contact the master administrator for a new invitation.</p>
                
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
        // Don't throw - user was invited successfully, just supplementary email failed
      }
    } else {
      console.log("RESEND_API_KEY not configured, skipping supplementary welcome email");
    }

    console.log(`Successfully invited admin user: ${email}`);

    return new Response(
      JSON.stringify({ 
        success: true, 
        userId: inviteData.user.id,
        message: "Invitation sent. User will receive an email to set their password."
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
