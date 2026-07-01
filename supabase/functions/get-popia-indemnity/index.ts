import { createClient } from "npm:@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });

  try {
    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const { data: settings, error } = await admin
      .from("popia_indemnity_settings")
      .select("popia_text, indemnity_text, popia_audio_url, indemnity_audio_url")
      .limit(1)
      .maybeSingle();

    if (error) throw error;

    const sign = async (path: string | null) => {
      if (!path) return null;
      const clean = path.replace(/^\//, "");
      const { data } = await admin.storage
        .from("employee-documents")
        .createSignedUrl(clean, 3600);
      return data?.signedUrl ?? null;
    };

    const body = {
      popia_text: settings?.popia_text ?? "",
      indemnity_text: settings?.indemnity_text ?? "",
      popia_audio_url: await sign(settings?.popia_audio_url ?? null),
      indemnity_audio_url: await sign(settings?.indemnity_audio_url ?? null),
    };

    return new Response(JSON.stringify(body), {
      status: 200,
      headers: { ...cors, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("get-popia-indemnity error:", err);
    return new Response(
      JSON.stringify({ popia_text: "", indemnity_text: "", popia_audio_url: null, indemnity_audio_url: null }),
      { status: 200, headers: { ...cors, "Content-Type": "application/json" } },
    );
  }
});