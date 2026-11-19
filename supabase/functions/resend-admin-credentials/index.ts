import { createClient } from "npm:@supabase/supabase-js@2.95.0";
import { corsHeaders } from "npm:@supabase/supabase-js@2.95.0/cors";
import { renderPasswordResetEmail } from "../_shared/tldv-portal-email.ts";

Deno.serve(async (req) => {
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
        redirectTo: `${siteUrl}/admin/reset-password`
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

    const resetLink = resetData.properties?.action_link;
    if (!resetLink) throw new Error("Could not generate a password reset link");
    const firstName = fullName?.split(' ')[0] || 'Admin';

    const message = renderPasswordResetEmail(firstName, resetLink);

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
        ...message,
      }),
    });

    if (!emailResponse.ok) {
      const errorData = await emailResponse.text();
      console.error("Failed to send email:", errorData);
      throw new Error("Failed to send password reset email");
    }

    console.log("Password reset email sent");

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