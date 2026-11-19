import { renderSignInCodeEmail } from "../_shared/tldv-portal-email.ts";
import { SMTPClient } from "https://deno.land/x/denomailer@1.6.0/mod.ts";
import { z } from "npm:zod@3.22.4";
import { createClient } from "npm:@supabase/supabase-js@2.95.0";
import { corsHeaders } from "npm:@supabase/supabase-js@2.95.0/cors";
import { portalSignInStep } from "./sign-in-policy.ts";

const RequestSchema = z.object({
  email: z.string().email().max(255),
  password: z.string().min(1).max(1024),
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
    const { password } = parsed.data;
    const email = parsed.data.email.trim().toLowerCase();
    const url = Deno.env.get("SUPABASE_URL") ?? "";
    const options = { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } };
    const passwordClient = createClient(url, Deno.env.get("SUPABASE_ANON_KEY") ?? "", options);
    const { data: login, error: loginError } = await passwordClient.auth.signInWithPassword({ email, password });
    if (loginError || !login.session || !login.user) {
      return jsonResponse({ error: loginError?.status === 429 ? "Too many attempts. Wait a moment and try again." : "The email address or password is incorrect." });
    }

    const supabaseAdmin = createClient(
      url,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
      options,
    );
    const { data: roleRows, error: roleError } = await supabaseAdmin
      .from("user_roles")
      .select("role")
      .eq("user_id", login.user.id);
    const step = portalSignInStep((roleRows ?? []).map(row => row.role));
    if (!roleError && step === "session") {
      return jsonResponse({ step, access_token: login.session.access_token, refresh_token: login.session.refresh_token });
    }
    // Never give the browser the password-only session for a client-facing profile.
    const { error: revokeError } = await passwordClient.auth.signOut({ scope: "local" });
    if (roleError || revokeError) return jsonResponse({ error: "Could not complete sign-in. Please try again." });
    if (step === "denied") return jsonResponse({ error: "This account does not have access to the portal." });

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

    const { data: profile } = await supabaseAdmin.from("profiles").select("full_name").eq("id", login.user.id).maybeSingle();
    const name = profile?.full_name?.trim() || "Portal User";

    const message = renderSignInCodeEmail(name, code);
    await client.send({
      from: GMAIL_EMAIL,
      to: login.user.email || email,
      subject: "Your TLDV sign-in code",
      html: message.html,
      content: message.text,
    });

    await client.close();
    console.log("send-login-otp: code emailed successfully");

    return jsonResponse({ step: "code" });
  } catch (error: any) {
    console.error("send-login-otp failed:", error?.message || error);
    return jsonResponse({ error: "Failed to send sign-in code" }, 500);
  }
};

Deno.serve(handler);
