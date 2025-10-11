import { serve } from "https://deno.land/std@0.190.0/http/server.ts";

const resendApiKey = Deno.env.get("RESEND_API_KEY");

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface InvitationEmailRequest {
  email: string;
  employeeNumber: string;
  invitationLink: string;
  otp: string;
}

const handler = async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { email, employeeNumber, invitationLink, otp }: InvitationEmailRequest = await req.json();

    console.log(`Sending invitation email to ${email} for employee ${employeeNumber}`);

    const emailResponse = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${resendApiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: "TLDV Portal <onboarding@resend.dev>",
        to: [email],
        subject: "Your Employee Portal Invitation",
        html: `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
            <h1 style="color: #333;">Welcome to TLDV Employee Portal</h1>
            <p>You've been invited to register for the TLDV Employee Portal.</p>
            <p><strong>Employee Number:</strong> ${employeeNumber}</p>
            
            <div style="background-color: #F3F4F6; padding: 20px; border-radius: 8px; margin: 20px 0;">
              <p style="margin: 0 0 10px 0; color: #666;">Your 6-Digit OTP:</p>
              <p style="font-size: 32px; font-weight: bold; color: #4F46E5; letter-spacing: 8px; margin: 0; text-align: center;">${otp}</p>
            </div>
            
            <p>Click the button below to complete your registration:</p>
            <a href="${invitationLink}" 
               style="display: inline-block; padding: 12px 24px; background-color: #4F46E5; color: white; text-decoration: none; border-radius: 6px; margin: 16px 0;">
              Complete Registration
            </a>
            
            <p style="color: #666; font-size: 14px; margin-top: 20px;"><strong>Important:</strong> You will need to enter the 6-digit OTP shown above when you register.</p>
            <p style="color: #666; font-size: 14px;">This invitation and OTP will expire in 7 days.</p>
            <p style="color: #666; font-size: 14px;">If you didn't expect this invitation, you can safely ignore this email.</p>
          </div>
        `,
      }),
    });

    if (!emailResponse.ok) {
      const errorData = await emailResponse.json();
      console.error("Error sending email:", errorData);
      throw new Error(errorData.message || "Failed to send email");
    }

    const data = await emailResponse.json();
    console.log("Email sent successfully:", data);

    return new Response(JSON.stringify({ success: true, messageId: data.id }), {
      status: 200,
      headers: {
        "Content-Type": "application/json",
        ...corsHeaders,
      },
    });
  } catch (error: any) {
    console.error("Error in send-invitation-email function:", error);
    return new Response(
      JSON.stringify({ error: error.message }),
      {
        status: 500,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      }
    );
  }
};

serve(handler);
