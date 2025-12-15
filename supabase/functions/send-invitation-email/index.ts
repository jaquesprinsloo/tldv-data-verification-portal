import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { SMTPClient } from "https://deno.land/x/denomailer@1.6.0/mod.ts";
import { z } from "https://deno.land/x/zod@v3.22.4/mod.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Production URL for email links
const PRODUCTION_URL = "https://tldv-data-verification-portal.lovable.app";

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

    // Extract token from invitation link and create production URL
    const url = new URL(invitationLink);
    const token = url.searchParams.get('token');
    const productionLink = `${PRODUCTION_URL}/employee/register?token=${token}`;

    console.log('Processing invitation email request');

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

    const htmlContent = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>TLDV Employee Portal Invitation</title>
</head>
<body style="margin: 0; padding: 0; background-color: #f4f4f4; font-family: Arial, Helvetica, sans-serif;">
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background-color: #f4f4f4; padding: 40px 20px;">
<tr>
<td align="center">
<table role="presentation" width="600" cellspacing="0" cellpadding="0" border="0" style="background-color: #ffffff; border-radius: 8px; overflow: hidden; box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);">

<!-- Header with Logo -->
<tr>
<td style="background-color: #000000; padding: 30px 40px; text-align: center;">
<table role="presentation" cellspacing="0" cellpadding="0" border="0" style="margin: 0 auto;">
<tr>
<td style="background-color: #BC000A; width: 40px; height: 40px; border-radius: 8px; text-align: center; vertical-align: middle;">
<span style="color: #ffffff; font-size: 20px; font-weight: bold;">T</span>
</td>
<td style="padding-left: 12px;">
<span style="color: #ffffff; font-size: 20px; font-weight: 600;">Data Verification Portal</span>
</td>
</tr>
</table>
</td>
</tr>

<!-- Main Content -->
<tr>
<td style="padding: 40px;">

<!-- Welcome Message -->
<h1 style="margin: 0 0 20px 0; color: #1a1a1a; font-size: 24px; font-weight: 700; text-align: center;">
You're Invited to Register
</h1>

<p style="margin: 0 0 30px 0; color: #4a4a4a; font-size: 16px; line-height: 1.6; text-align: center;">
You have been invited to register for the TLDV Employee Data Verification Portal. Please complete your registration using the details below.
</p>

<!-- Employee Details Card -->
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background-color: #f8f9fa; border-radius: 8px; margin-bottom: 25px;">
<tr>
<td style="padding: 20px;">
<p style="margin: 0 0 5px 0; color: #6b7280; font-size: 12px; text-transform: uppercase; letter-spacing: 0.5px;">Your Employee Number</p>
<p style="margin: 0; color: #1a1a1a; font-size: 20px; font-weight: 600;">${employeeNumber}</p>
</td>
</tr>
</table>

<!-- OTP Card -->
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background-color: #fef2f2; border: 2px solid #BC000A; border-radius: 8px; margin-bottom: 25px;">
<tr>
<td style="padding: 25px; text-align: center;">
<p style="margin: 0 0 10px 0; color: #6b7280; font-size: 14px;">Your 6-Digit Verification Code</p>
<p style="margin: 0; color: #BC000A; font-size: 36px; font-weight: 700; letter-spacing: 8px; font-family: 'Courier New', monospace;">${otp}</p>
<p style="margin: 10px 0 0 0; color: #9ca3af; font-size: 12px;">Keep this code safe - you'll need it to complete registration</p>
</td>
</tr>
</table>

<!-- CTA Button -->
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0">
<tr>
<td align="center" style="padding: 10px 0 25px 0;">
<a href="${productionLink}" target="_blank" style="display: inline-block; background-color: #BC000A; color: #ffffff; text-decoration: none; padding: 16px 40px; font-size: 16px; font-weight: 600; border-radius: 8px;">Complete Registration</a>
</td>
</tr>
</table>

<!-- Link Fallback -->
<p style="margin: 0 0 25px 0; color: #9ca3af; font-size: 12px; text-align: center; word-break: break-all;">
If the button doesn't work, copy this link:<br>
<a href="${productionLink}" style="color: #BC000A;">${productionLink}</a>
</p>

<!-- Divider -->
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0">
<tr>
<td style="border-top: 1px solid #e5e7eb; padding-top: 25px;"></td>
</tr>
</table>

<!-- Instructions -->
<h3 style="margin: 0 0 15px 0; color: #1a1a1a; font-size: 16px; font-weight: 600;">What you'll need to register:</h3>
<ul style="margin: 0 0 25px 0; padding-left: 20px; color: #4a4a4a; font-size: 14px; line-height: 1.8;">
<li>Your Employee Number (shown above)</li>
<li>Your South African ID Number</li>
<li>The 6-digit verification code (shown above)</li>
<li>Create a secure password</li>
</ul>

<!-- Important Notes -->
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background-color: #fffbeb; border-left: 4px solid #f59e0b; border-radius: 0 8px 8px 0; margin-bottom: 20px;">
<tr>
<td style="padding: 15px 20px;">
<p style="margin: 0 0 8px 0; color: #92400e; font-size: 14px; font-weight: 600;">Important Notes:</p>
<ul style="margin: 0; padding-left: 20px; color: #92400e; font-size: 13px; line-height: 1.6;">
<li>This invitation expires in <strong>7 days</strong></li>
<li>After registration, you'll need to verify your information every 6 months</li>
</ul>
</td>
</tr>
</table>

<p style="margin: 0; color: #9ca3af; font-size: 12px; text-align: center;">
If you did not expect this invitation, you can safely ignore this email.
</p>

</td>
</tr>

<!-- Footer -->
<tr>
<td style="background-color: #1a1a1a; padding: 25px 40px; text-align: center;">
<p style="margin: 0 0 5px 0; color: #9ca3af; font-size: 12px;">
&copy; ${new Date().getFullYear()} TLDV Data Verification Portal
</p>
<p style="margin: 0; color: #6b7280; font-size: 11px;">
All rights reserved
</p>
</td>
</tr>

</table>
</td>
</tr>
</table>
</body>
</html>`;

    await client.send({
      from: GMAIL_EMAIL,
      to: email,
      subject: "TLDV Portal - You're Invited to Register",
      html: htmlContent,
    });

    await client.close();

    console.log("Invitation email delivered successfully");

    return new Response(JSON.stringify({ success: true }), {
      status: 200,
      headers: {
        "Content-Type": "application/json",
        ...corsHeaders,
      },
    });
  } catch (error: any) {
    console.error("Email sending failed:", error);
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
