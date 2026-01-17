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
    const { userId, email, fullName } = await req.json();

    if (!userId || !email) {
      throw new Error("User ID and email are required");
    }

    // Get the authorization header
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      throw new Error("No authorization header");
    }

    const token = authHeader.replace('Bearer ', '');

    // Create admin client
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

    // Verify the requesting user
    const { data: { user }, error: userError } = await supabaseAdmin.auth.getUser(token);
    
    if (userError || !user) {
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

    // Get the target user's role
    const { data: targetRole } = await supabaseAdmin
      .from('user_roles')
      .select('role')
      .eq('user_id', userId)
      .in('role', ['admin', 'master_admin'])
      .single();

    const roleDisplay = targetRole?.role === 'master_admin' ? 'Master Admin' : 'Admin';

    // Generate password reset link
    const siteUrl = Deno.env.get('SITE_URL') || 'https://tldv-data-verification-portal.lovable.app';
    
    const { data: resetData, error: resetError } = await supabaseAdmin.auth.admin.generateLink({
      type: 'recovery',
      email: email,
      options: {
        redirectTo: `${siteUrl}/admin/login`
      }
    });

    if (resetError) {
      console.error("Password reset link generation error:", resetError);
      throw resetError;
    }

    // Send email with password reset link using Resend
    const resendApiKey = Deno.env.get("RESEND_API_KEY");
    if (!resendApiKey) {
      throw new Error("Email service not configured");
    }

    const resetLink = resetData.properties?.action_link || `${siteUrl}/admin/login`;
    const firstName = fullName?.split(' ')[0] || 'Admin';

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
          .info-box { background-color: #fff; border: 2px solid #dc2626; padding: 20px; margin: 20px 0; border-radius: 5px; }
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
            <h2>Password Reset Request</h2>
            <p>Hello ${firstName},</p>
            <p>A master administrator has requested to resend your login credentials for the <strong>${roleDisplay}</strong> account.</p>
            
            <div class="info-box">
              <h3 style="margin-top: 0; color: #dc2626;">Your Account Details</h3>
              <div class="credential-item">
                <div class="credential-label">Email Address</div>
                <div class="credential-value">${email}</div>
              </div>
              <div class="credential-item">
                <div class="credential-label">Role</div>
                <div class="credential-value">${roleDisplay}</div>
              </div>
            </div>
            
            <p>Click the button below to set a new password for your account:</p>
            
            <center>
              <a href="${resetLink}" class="button">Set New Password</a>
            </center>
            
            <div class="warning">
              <strong>⚠️ Security Notice:</strong>
              <p style="margin-bottom: 0;">This link will expire in 24 hours. If you did not request this, please contact your master administrator immediately.</p>
            </div>
            
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
        from: "TLDV Portal <noreply@tldv.co.za>",
        to: [email],
        subject: `TLDV Portal - Password Reset for Your ${roleDisplay} Account`,
        html: emailHtml,
      }),
    });

    if (!emailResponse.ok) {
      const errorData = await emailResponse.text();
      console.error("Failed to send email:", errorData);
      throw new Error("Failed to send password reset email");
    }

    console.log(`Password reset email sent to ${email}`);

    return new Response(
      JSON.stringify({ 
        success: true, 
        message: "Password reset email sent successfully"
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      }
    );
  } catch (error: any) {
    console.error("Error resending credentials:", error);
    return new Response(
      JSON.stringify({ error: error.message }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 400,
      }
    );
  }
});