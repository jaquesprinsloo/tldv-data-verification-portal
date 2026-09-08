import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { SMTPClient } from "https://deno.land/x/denomailer@1.6.0/mod.ts";
import { z } from "https://deno.land/x/zod@v3.22.4/mod.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const RequestSchema = z.object({
  email: z.string().email().max(255),
});

const jsonResponse = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...corsHeaders },
  });

const buildHtml = (name: string, code: string) => {
  const logoUrl =
    "https://irvpnyxtdzwpnhtdpweu.supabase.co/storage/v1/object/public/email-assets/preapplicheck-logo.png";
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Your Sign-In Code</title>
</head>
<body style="margin: 0; padding: 0; background-color: #f4f4f4; font-family: Arial, Helvetica, sans-serif;">
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background-color: #f4f4f4; padding: 40px 20px;">
<tr>
<td align="center">
<table role="presentation" width="600" cellspacing="0" cellpadding="0" border="0" style="background-color: #ffffff; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 20px rgba(0, 0, 0, 0.08);">

<tr>
<td style="padding: 40px 40px 20px 40px; text-align: center; background-color: #ffffff;">
<img src="${logoUrl}" alt="PreAppliCheck" width="280" style="display: block; margin: 0 auto; max-width: 280px; height: auto;" />
</td>
</tr>

<tr>
<td style="padding: 0 40px;">
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0">
<tr>
<td style="border-bottom: 2px solid #e5e7eb; height: 1px; font-size: 0; line-height: 0;">&nbsp;</td>
</tr>
</table>
</td>
</tr>

<tr>
<td style="padding: 30px 40px 40px 40px;">

<p style="margin: 0 0 8px 0; color: #1a1a1a; font-size: 18px; font-weight: 600; text-align: center;">
Dear ${name},
</p>

<p style="margin: 0 0 28px 0; color: #4a4a4a; font-size: 15px; line-height: 1.7; text-align: center;">
Use the one-time code below to sign in to your PreAppliCheck portal profile.
</p>

<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0">
<tr>
<td align="center" style="padding: 0 0 28px 0;">
<div style="display: inline-block; background-color: #1a1a1a; border: 2px solid #DC2626; border-radius: 10px; padding: 18px 36px;">
<span style="color: #ffffff; font-size: 34px; font-weight: 700; letter-spacing: 10px; font-family: 'Courier New', Courier, monospace;">${code}</span>
</div>
</td>
</tr>
</table>

<p style="margin: 0 0 25px 0; color: #4a4a4a; font-size: 14px; text-align: center; line-height: 1.6;">
Copy this code and enter it in the <strong>One-Time Code</strong> field on the sign-in screen.
</p>

<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background-color: #fef2f2; border-left: 4px solid #DC2626; border-radius: 0 8px 8px 0;">
<tr>
<td style="padding: 15px 20px;">
<p style="margin: 0; color: #991b1b; font-size: 13px; line-height: 1.6;">
This code expires shortly and may only be used once. Never share it with anyone. If you did not request this code, you may safely ignore this email.
</p>
</td>
</tr>
</table>

</td>
</tr>

<tr>
<td style="background-color: #1a1a1a; padding: 20px 40px; text-align: center;">
<p style="margin: 0 0 4px 0; color: #9ca3af; font-size: 11px;">
Powered by True Lie Detectors &amp; Vetting &nbsp;|&nbsp; <a href="https://preapplicheck.co.za" style="color: #9ca3af; text-decoration: underline;">preapplicheck.co.za</a>
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
};

const handler = async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const parsed = RequestSchema.safeParse(await req.json());
    if (!parsed.success) {
      return jsonResponse({ error: "Invalid request parameters" }, 400);
    }
    const email = parsed.data.email.trim().toLowerCase();

    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    // Generic response prevents account enumeration
    const generic = { success: true };

    // Resolve the profile for this email (must exist and be an active portal profile)
    const { data: profile } = await supabaseAdmin
      .from("admin_profiles")
      .select("user_id, full_name, email")
      .ilike("email", email)
      .maybeSingle();

    if (!profile?.user_id) {
      console.log("send-login-otp: no profile for requested address");
      return jsonResponse(generic);
    }

    const { data: roleRows } = await supabaseAdmin
      .from("user_roles")
      .select("role")
      .eq("user_id", profile.user_id);
    const roles = (roleRows || []).map((r: any) => r.role as string);
    const allowed = ["client_facing", "admin", "master_admin", "examiner"];
    if (!roles.some((r) => allowed.includes(r))) {
      console.log("send-login-otp: profile has no portal role");
      return jsonResponse(generic);
    }

    const { data: linkData, error: linkError } = await supabaseAdmin.auth.admin.generateLink({
      type: "magiclink",
      email,
    });
    if (linkError || !linkData?.properties?.email_otp) {
      console.error("send-login-otp: failed to generate code", linkError?.message);
      return jsonResponse({ error: "Could not generate sign-in code" }, 500);
    }

    const code = linkData.properties.email_otp;

    const GMAIL_EMAIL = Deno.env.get("GMAIL_EMAIL");
    const GMAIL_APP_PASSWORD = Deno.env.get("GMAIL_APP_PASSWORD");
    if (!GMAIL_EMAIL || !GMAIL_APP_PASSWORD) {
      console.error("send-login-otp: mail credentials not configured");
      return jsonResponse({ error: "Email sending is not configured" }, 500);
    }

    const client = new SMTPClient({
      connection: {
        hostname: "smtp.gmail.com",
        port: 465,
        tls: true,
        auth: { username: GMAIL_EMAIL, password: GMAIL_APP_PASSWORD },
      },
    });

    const name = (profile.full_name || "").trim() || "Portal User";

    await client.send({
      from: GMAIL_EMAIL,
      to: profile.email || email,
      subject: "Your PreAppliCheck sign-in code",
      html: buildHtml(name, code),
    });

    await client.close();
    console.log("send-login-otp: code emailed successfully");

    return jsonResponse(generic);
  } catch (error: any) {
    console.error("send-login-otp failed:", error?.message || error);
    return jsonResponse({ error: "Failed to send sign-in code" }, 500);
  }
};

serve(handler);
