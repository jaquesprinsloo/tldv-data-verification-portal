import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { SMTPClient } from "https://deno.land/x/denomailer@1.6.0/mod.ts";
import { z } from "https://deno.land/x/zod@v3.22.4/mod.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const PRODUCTION_URL = "https://tldv-data-verification-portal.lovable.app";

const RequestSchema = z.object({
  email: z.string().email().max(255),
  candidateName: z.string().min(1).max(255),
  invitationLink: z.string().url().max(500),
});

const handler = async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const body = await req.json();
    const parsed = RequestSchema.safeParse(body);
    if (!parsed.success) {
      return new Response(
        JSON.stringify({ error: "Invalid request parameters" }),
        { status: 400, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    const { email, candidateName, invitationLink } = parsed.data;

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
<title>CanDex Pre-Screening Invitation</title>
</head>
<body style="margin: 0; padding: 0; background-color: #f4f4f4; font-family: Arial, Helvetica, sans-serif;">
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background-color: #f4f4f4; padding: 40px 20px;">
<tr>
<td align="center">
<table role="presentation" width="600" cellspacing="0" cellpadding="0" border="0" style="background-color: #ffffff; border-radius: 8px; overflow: hidden; box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);">

<!-- Header -->
<tr>
<td style="background-color: #000000; padding: 30px 40px; text-align: center;">
<table role="presentation" cellspacing="0" cellpadding="0" border="0" style="margin: 0 auto;">
<tr>
<td style="background-color: #BC000A; width: 40px; height: 40px; border-radius: 8px; text-align: center; vertical-align: middle;">
<span style="color: #ffffff; font-size: 20px; font-weight: bold;">T</span>
</td>
<td style="padding-left: 12px;">
<span style="color: #ffffff; font-size: 20px; font-weight: 600;">CanDex Pre-Screening</span>
</td>
</tr>
</table>
</td>
</tr>

<!-- Main Content -->
<tr>
<td style="padding: 40px;">

<h1 style="margin: 0 0 20px 0; color: #1a1a1a; font-size: 24px; font-weight: 700; text-align: center;">
You're Invited to Complete a Pre-Screening
</h1>

<p style="margin: 0 0 30px 0; color: #4a4a4a; font-size: 16px; line-height: 1.6; text-align: center;">
Dear ${candidateName}, you have been invited to complete a CanDex pre-screening questionnaire. Please click the button below to begin.
</p>

<!-- CTA Button -->
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0">
<tr>
<td align="center" style="padding: 10px 0 25px 0;">
<a href="${invitationLink}" target="_blank" style="display: inline-block; background-color: #BC000A; color: #ffffff; text-decoration: none; padding: 16px 40px; font-size: 16px; font-weight: 600; border-radius: 8px;">Start Pre-Screening</a>
</td>
</tr>
</table>

<p style="margin: 0 0 25px 0; color: #9ca3af; font-size: 12px; text-align: center; word-break: break-all;">
If the button doesn't work, copy this link:<br>
<a href="${invitationLink}" style="color: #BC000A;">${invitationLink}</a>
</p>

<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background-color: #fffbeb; border-left: 4px solid #f59e0b; border-radius: 0 8px 8px 0; margin-bottom: 20px;">
<tr>
<td style="padding: 15px 20px;">
<p style="margin: 0; color: #92400e; font-size: 13px; line-height: 1.6;">
This invitation expires in <strong>7 days</strong>. If you did not expect this invitation, you can safely ignore this email.
</p>
</td>
</tr>
</table>

</td>
</tr>

<!-- Footer -->
<tr>
<td style="background-color: #1a1a1a; padding: 25px 40px; text-align: center;">
<p style="margin: 0 0 5px 0; color: #9ca3af; font-size: 12px;">
&copy; ${new Date().getFullYear()} TLDV Data Verification Portal
</p>
<p style="margin: 0; color: #6b7280; font-size: 11px;">All rights reserved</p>
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
      subject: "CanDex Pre-Screening Invitation",
      html: htmlContent,
    });

    await client.close();
    console.log("CanDex invitation email sent to", email);

    return new Response(JSON.stringify({ success: true }), {
      status: 200,
      headers: { "Content-Type": "application/json", ...corsHeaders },
    });
  } catch (error: any) {
    console.error("CanDex email sending failed:", error);
    return new Response(
      JSON.stringify({ error: "Failed to send invitation email" }),
      { status: 500, headers: { "Content-Type": "application/json", ...corsHeaders } }
    );
  }
};

serve(handler);
