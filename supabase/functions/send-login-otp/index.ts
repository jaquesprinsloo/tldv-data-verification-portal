import { renderSignInCodeEmail } from "../_shared/tldv-portal-email.ts";
import { SMTPClient } from "https://deno.land/x/denomailer@1.6.0/mod.ts";
import { z } from "npm:zod@3.22.4";
import { createClient } from "npm:@supabase/supabase-js@2.95.0";
import { corsHeaders } from "npm:@supabase/supabase-js@2.95.0/cors";

const RequestSchema = z.object({
  email: z.string().email().max(255),
});

const jsonResponse = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...corsHeaders },
  });

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
      .from("profiles")
      .select("id, full_name, email")
      .ilike("email", email)
      .maybeSingle();

    if (!profile?.id) {
      console.log("send-login-otp: no profile for requested address");
      return jsonResponse(generic);
    }

    const { data: roleRows } = await supabaseAdmin
      .from("user_roles")
      .select("role")
      .eq("user_id", profile.id);
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

    const message = renderSignInCodeEmail(name, code);
    await client.send({
      from: GMAIL_EMAIL,
      to: profile.email || email,
      subject: "Your TLDV sign-in code",
      html: message.html,
      content: message.text,
    });

    await client.close();
    console.log("send-login-otp: code emailed successfully");

    return jsonResponse(generic);
  } catch (error: any) {
    console.error("send-login-otp failed:", error?.message || error);
    return jsonResponse({ error: "Failed to send sign-in code" }, 500);
  }
};

Deno.serve(handler);
