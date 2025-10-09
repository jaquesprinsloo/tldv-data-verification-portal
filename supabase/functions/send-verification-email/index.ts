import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { SMTPClient } from "https://deno.land/x/denomailer@1.6.0/mod.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface VerificationEmailRequest {
  email: string;
  name: string;
  employeeNumber: string;
  verificationToken: string;
  appUrl: string;
}

const handler = async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { email, name, employeeNumber, verificationToken, appUrl }: VerificationEmailRequest = await req.json();

    console.log("Sending verification email to:", email);
    
    const verificationLink = `${appUrl}/verify-email?token=${verificationToken}`;

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
            .footer { text-align: center; margin-top: 30px; color: #60615C; font-size: 12px; }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="header">
              <h1>TLDV - True Lie Detectors & Vetting</h1>
            </div>
            <div class="content">
              <h2>Verify Your Email Address</h2>
              <p>Dear ${name},</p>
              <p>Thank you for submitting your verification details. We have successfully received your information for employee number <strong>${employeeNumber}</strong>.</p>
              <p><strong>Important:</strong> Please verify your email address to complete your submission.</p>
              <div style="text-align: center; margin: 30px 0;">
                <a href="${verificationLink}" style="background-color: #BC000A; color: white; padding: 15px 30px; text-decoration: none; border-radius: 5px; display: inline-block; font-weight: bold;">Verify Email Address</a>
              </div>
              <p style="font-size: 12px; color: #666;">If the button doesn't work, copy and paste this link into your browser:<br>
              <a href="${verificationLink}" style="color: #BC000A;">${verificationLink}</a></p>
              <p>Your submission details:</p>
              <ul>
                <li>Employee Number: ${employeeNumber}</li>
                <li>Submission Date: ${new Date().toLocaleDateString()}</li>
                <li>Next Renewal Due: ${new Date(Date.now() + 180 * 24 * 60 * 60 * 1000).toLocaleDateString()}</li>
              </ul>
              <p><strong>Note:</strong> This verification link will expire in 7 days. You will need to resubmit your verification in 6 months.</p>
              <p>If you have any questions or concerns, please contact your administrator.</p>
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
      subject: "TLDV - Verification Submission Received",
      content: htmlContent,
      html: htmlContent,
    });

    await client.close();

    console.log("Email sent successfully to:", email);

    return new Response(JSON.stringify({ success: true }), {
      status: 200,
      headers: { "Content-Type": "application/json", ...corsHeaders },
    });
  } catch (error: any) {
    console.error("Error sending verification email:", error);
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
