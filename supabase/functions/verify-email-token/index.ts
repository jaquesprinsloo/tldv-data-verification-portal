import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface VerifyEmailRequest {
  token: string;
}

const handler = async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { token }: VerifyEmailRequest = await req.json();

    if (!token) {
      return new Response(
        JSON.stringify({ success: false, message: "No token provided" }),
        { status: 400, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    console.log("Verifying email token:", token);

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Find submission with this token
    const { data: submission, error: fetchError } = await supabase
      .from("submissions")
      .select("id, verification_token_expires_at, email_verified")
      .eq("verification_token", token)
      .single();

    if (fetchError || !submission) {
      console.log("Token not found or fetch error:", fetchError);
      return new Response(
        JSON.stringify({ success: false, message: "Invalid or expired verification link." }),
        { status: 400, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    // Check if already verified
    if (submission.email_verified) {
      return new Response(
        JSON.stringify({ 
          success: true, 
          message: "Your email has already been verified. Your submission is awaiting admin review.",
          alreadyVerified: true
        }),
        { status: 200, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    // Check if token is expired
    if (submission.verification_token_expires_at && new Date(submission.verification_token_expires_at) < new Date()) {
      return new Response(
        JSON.stringify({ 
          success: false, 
          message: "This verification link has expired (7 days). Please contact support for a new link." 
        }),
        { status: 400, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    // Update submission to mark email as verified
    const { error: updateError } = await supabase
      .from("submissions")
      .update({ 
        email_verified: true,
        verified_at: new Date().toISOString(),
        verification_token: null, // Deactivate link after use
      })
      .eq("id", submission.id);

    if (updateError) {
      console.error("Update error:", updateError);
      return new Response(
        JSON.stringify({ success: false, message: "Failed to verify email. Please try again." }),
        { status: 500, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    console.log("Email verified successfully for submission:", submission.id);

    return new Response(
      JSON.stringify({ 
        success: true, 
        message: "Email verified successfully! Your submission to the Employee Verification Portal is complete and awaiting admin review. Remember: verification renewals are required every 6 months." 
      }),
      { status: 200, headers: { "Content-Type": "application/json", ...corsHeaders } }
    );
  } catch (error: any) {
    console.error("Error verifying email:", error);
    return new Response(
      JSON.stringify({ success: false, message: "An error occurred during verification. Please try again." }),
      { status: 500, headers: { "Content-Type": "application/json", ...corsHeaders } }
    );
  }
};

serve(handler);
