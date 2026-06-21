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

    const logoUrl = "https://irvpnyxtdzwpnhtdpweu.supabase.co/storage/v1/object/public/email-assets/preapplicheck-logo.png";

    const htmlContent = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>PreAppliCheck Invitation</title>
</head>
<body style="margin: 0; padding: 0; background-color: #f4f4f4; font-family: Arial, Helvetica, sans-serif;">
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background-color: #f4f4f4; padding: 40px 20px;">
<tr>
<td align="center">
<table role="presentation" width="600" cellspacing="0" cellpadding="0" border="0" style="background-color: #ffffff; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 20px rgba(0, 0, 0, 0.08);">

<!-- Logo Section -->
<tr>
<td style="padding: 40px 40px 20px 40px; text-align: center; background-color: #ffffff;">
<img src="${logoUrl}" alt="PreAppliCheck" width="280" style="display: block; margin: 0 auto; max-width: 280px; height: auto;" />
</td>
</tr>

<!-- Divider -->
<tr>
<td style="padding: 0 40px;">
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0">
<tr>
<td style="border-bottom: 2px solid #e5e7eb; height: 1px; font-size: 0; line-height: 0;">&nbsp;</td>
</tr>
</table>
</td>
</tr>

<!-- Main Content -->
<tr>
<td style="padding: 30px 40px 40px 40px;">

<p style="margin: 0 0 8px 0; color: #1a1a1a; font-size: 18px; font-weight: 600; text-align: center;">
Dear ${candidateName},
</p>

<p style="margin: 0 0 30px 0; color: #4a4a4a; font-size: 15px; line-height: 1.7; text-align: center;">
You have been invited to complete a PreAppliCheck pre-screening application. Please click the button below to begin the process.
</p>

<!-- CTA Button - black/red matching logo -->
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0">
<tr>
<td align="center" style="padding: 10px 0 30px 0;">
<!--[if mso]>
<v:roundrect xmlns:v="urn:schemas-microsoft-com:vml" xmlns:w="urn:schemas-microsoft-com:office:word" href="${invitationLink}" style="height:54px;v-text-anchor:middle;width:280px;" arcsize="15%" strokecolor="#DC2626" strokeweight="1.5pt" fillcolor="#DC2626">
<w:anchorlock/>
<center style="color:#ffffff;font-family:Arial,sans-serif;font-size:16px;font-weight:bold;letter-spacing:0.5px;">Begin PreAppliCheck &rarr;</center>
</v:roundrect>
<![endif]-->
<!--[if !mso]><!-- -->
<a href="${invitationLink}" target="_blank" style="display: inline-block; background: linear-gradient(135deg, #DC2626 0%, #991B1B 100%); background-color: #DC2626; color: #ffffff !important; text-decoration: none; padding: 17px 44px; font-size: 16px; font-weight: 700; border-radius: 10px; letter-spacing: 0.6px; font-family: Arial, Helvetica, sans-serif; box-shadow: 0 6px 16px rgba(220, 38, 38, 0.35); mso-hide: all;">Begin PreAppliCheck &nbsp;&rarr;</a>
<!--<![endif]-->
</td>
</tr>
</table>

<p style="margin: 0 0 25px 0; color: #9ca3af; font-size: 12px; text-align: center; word-break: break-all;">
If the button doesn't work, copy and paste this link into your browser:<br>
<a href="${invitationLink}" style="color: #DC2626;">${invitationLink}</a>
</p>

<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background-color: #fef2f2; border-left: 4px solid #DC2626; border-radius: 0 8px 8px 0;">
<tr>
<td style="padding: 15px 20px;">
<p style="margin: 0; color: #991b1b; font-size: 13px; line-height: 1.6;">
This invitation expires in <strong>7 days</strong>. If you did not expect this invitation, you may safely ignore this email.
</p>
</td>
</tr>
</table>

</td>
</tr>

<!-- Footer -->
<tr>
<td style="background-color: #1a1a1a; padding: 20px 40px; text-align: center;">
<p style="margin: 0 0 4px 0; color: #9ca3af; font-size: 11px;">
Powered by True Lie Detectors &amp; Vetting
</p>
<p style="margin: 0; color: #6b7280; font-size: 10px;">&copy; ${new Date().getFullYear()} All rights reserved</p>
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
      subject: "PreAppliCheck Invitation",
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
