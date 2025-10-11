import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { SMTPClient } from "https://deno.land/x/denomailer@1.6.0/mod.ts";

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

    const GMAIL_EMAIL = Deno.env.get("GMAIL_EMAIL");
    const GMAIL_APP_PASSWORD = Deno.env.get("GMAIL_APP_PASSWORD");

    if (!GMAIL_EMAIL || !GMAIL_APP_PASSWORD) {
      throw new Error("Gmail credentials not configured");
    }

    const client = new SMTPClient({
      connection: {
        hostname: "smtp.gmail.com",
        port: 465,
        tls: true,
        auth: {
          username: GMAIL_EMAIL,
          password: GMAIL_APP_PASSWORD,
        },
      },
    });

    const htmlContent = `
      <!DOCTYPE html>
      <html>
        <head>
          <style>
            body { font-family: Arial, sans-serif; line-height: 1.6; color: #272727; }
            .container { max-width: 600px; margin: 0 auto; padding: 20px; }
            .header { background-color: #BC000A; padding: 20px; text-align: center; }
            .header h1 { color: white; margin: 0; font-family: 'Poppins', sans-serif; }
            .content { background-color: #f9f9f9; padding: 30px; border-radius: 5px; margin-top: 20px; }
            .otp-box { background-color: #F3F4F6; padding: 20px; border-radius: 8px; margin: 20px 0; text-align: center; }
            .otp { font-size: 32px; font-weight: bold; color: #BC000A; letter-spacing: 8px; margin: 10px 0; }
            .button { display: inline-block; padding: 15px 30px; background-color: #BC000A; color: white; text-decoration: none; border-radius: 5px; font-weight: bold; margin: 20px 0; }
            .footer { text-align: center; margin-top: 30px; color: #60615C; font-size: 12px; }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="header">
              <h1>TLDV - True Lie Detectors & Vetting</h1>
            </div>
            <div class="content">
              <h2>Welcome to TLDV Employee Portal</h2>
              <p>You've been invited to register for the TLDV Employee Portal.</p>
              <p><strong>Employee Number:</strong> ${employeeNumber}</p>
              
              <div class="otp-box">
                <p style="margin: 0 0 10px 0; color: #666;">Your 6-Digit OTP:</p>
                <p class="otp">${otp}</p>
              </div>
              
              <p style="text-align: center;">
                <a href="${invitationLink}" class="button">Complete Registration</a>
              </p>
              
              <p style="font-size: 12px; color: #666;">If the button doesn't work, copy and paste this link into your browser:<br>
              <a href="${invitationLink}" style="color: #BC000A;">${invitationLink}</a></p>
              
              <p><strong>Important:</strong> You will need to enter the 6-digit OTP shown above when you register.</p>
              <p><strong>Renewal Process:</strong> After completing your registration and verification, you will need to renew your information every 6 months.</p>
              <p style="color: #666; font-size: 14px;">This invitation and OTP will expire in 7 days.</p>
              <p style="color: #666; font-size: 14px;">If you didn't expect this invitation, you can safely ignore this email.</p>
            </div>
            <div class="footer">
              <p>&copy; ${new Date().getFullYear()} TLDV - True Lie Detectors & Vetting. All rights reserved.</p>
            </div>
          </div>
        </body>
      </html>
    `;

    await client.send({
      from: GMAIL_EMAIL,
      to: email,
      subject: "TLDV - Your Employee Portal Invitation",
      content: htmlContent,
      html: htmlContent,
    });

    await client.close();

    console.log("Email sent successfully to:", email);

    return new Response(JSON.stringify({ success: true }), {
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
