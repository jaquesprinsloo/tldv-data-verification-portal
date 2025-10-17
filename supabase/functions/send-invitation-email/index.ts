import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { SMTPClient } from "https://deno.land/x/denomailer@1.6.0/mod.ts";
import { z } from "https://deno.land/x/zod@v3.22.4/mod.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Server-side validation schema
const InvitationEmailSchema = z.object({
  email: z.string().email('Invalid email format').max(255, 'Email too long'),
  employeeNumber: z.string().trim().min(1).max(50, 'Employee number too long'),
  invitationLink: z.string().url('Invalid invitation link').max(500, 'Link too long'),
  otp: z.string().regex(/^\d{6}$/, 'OTP must be exactly 6 digits')
});

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
    const body: InvitationEmailRequest = await req.json();

    // Validate input with zod
    const validationResult = InvitationEmailSchema.safeParse(body);
    if (!validationResult.success) {
      console.error('Input validation failed');
      return new Response(
        JSON.stringify({ error: 'Invalid request parameters' }),
        {
          status: 400,
          headers: { "Content-Type": "application/json", ...corsHeaders },
        }
      );
    }

    const { email, employeeNumber, invitationLink, otp } = validationResult.data;

    console.log('Sending invitation email');

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
            .header h1 { color: white; margin: 0; font-family: Arial, sans-serif; }
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
              <h1>Employee Verification Portal</h1>
            </div>
            <div class="content">
              <h2>Welcome to the Employee Verification Portal</h2>
              <p>You have been invited to register for the Employee Verification Portal.</p>
              <p><strong>Employee Number:</strong> ${employeeNumber}</p>
              
              <div class="otp-box">
                <p style="margin: 0 0 10px 0; color: #666;">Your 6-Digit OTP:</p>
                <p class="otp">${otp}</p>
              </div>
              
              <p style="text-align: center;">
                <a href="${invitationLink}" class="button">Complete Registration</a>
              </p>
              
              <p style="font-size: 12px; color: #666;">If the button does not work, copy and paste this link into your browser:<br>
              <a href="${invitationLink}" style="color: #BC000A;">${invitationLink}</a></p>
              
              <p><strong>Important:</strong> You will need to enter the 6-digit OTP shown above when you register.</p>
              <p><strong>Renewal Process:</strong> After completing your registration and verification, you will need to renew your information every 6 months.</p>
              <p style="color: #666; font-size: 14px;">This invitation and OTP will expire in 7 days.</p>
              <p style="color: #666; font-size: 14px;">If you did not expect this invitation, you can safely ignore this email.</p>
            </div>
            <div class="footer">
              <p>&copy; ${new Date().getFullYear()} Employee Verification Portal. All rights reserved.</p>
            </div>
          </div>
        </body>
      </html>
    `;

    await client.send({
      from: GMAIL_EMAIL,
      to: email,
      subject: "Employee Verification Portal - Your Invitation",
      content: htmlContent,
      html: htmlContent,
    });

    await client.close();

    console.log("Email sent successfully");

    return new Response(JSON.stringify({ success: true }), {
      status: 200,
      headers: {
        "Content-Type": "application/json",
        ...corsHeaders,
      },
    });
  } catch (error: any) {
    console.error("Email sending failed");
    return new Response(
      JSON.stringify({ error: 'Failed to send invitation email' }),
      {
        status: 500,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      }
    );
  }
};

serve(handler);
