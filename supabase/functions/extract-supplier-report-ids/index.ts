// Extracts South African 13-digit ID numbers from a supplier risk assessment PDF.
// Uses Lovable AI Gateway (Gemini) for OCR-capable extraction so scanned PDFs work.

import { createClient } from "npm:@supabase/supabase-js@2.49.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization") || "";
    const jwt = authHeader.replace("Bearer ", "");
    if (!jwt) {
      return new Response(JSON.stringify({ success: false, error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );
    const { data: userData, error: userErr } = await supabase.auth.getUser(jwt);
    if (userErr || !userData?.user) {
      return new Response(JSON.stringify({ success: false, error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const { data: roleRows } = await supabase
      .from("user_roles").select("role").eq("user_id", userData.user.id);
    const roles = (roleRows || []).map((r: any) => r.role);
    if (!roles.some((r: string) => ["admin", "master_admin"].includes(r))) {
      return new Response(JSON.stringify({ success: false, error: "Forbidden" }), {
        status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY not configured");

    const { fileBase64, contentType } = await req.json();
    if (!fileBase64) {
      return new Response(JSON.stringify({ success: false, error: "fileBase64 required" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const dataUrl = `data:${contentType || "application/pdf"};base64,${fileBase64}`;

    const aiRes = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          {
            role: "system",
            content:
              "You extract South African ID Verification records from a supplier vetting report. For each 'VERIFICATION OF ID NUMBER' block found, extract the fields. The ID Number may be MASKED (e.g. '981201XXXXXXX') — return exactly what appears. Respond with ONLY a JSON object of shape:\n{\"records\":[{\"id_number\":\"981201XXXXXXX\",\"id_prefix\":\"981201\",\"status\":\"Confirmed\",\"first_names\":\"NIKESH\",\"initials\":\"N\",\"surname\":\"DHEEPLALL\",\"date_of_birth\":\"1998-12-01\",\"age\":\"27\",\"gender\":\"MALE\",\"citizenship\":\"SOUTH AFRICAN\",\"dead_alive\":\"Alive\"}]}\nRules: id_prefix = the first 6 digits of the ID (digits only). status = the confirmation/verification signal (e.g. 'Confirmed', 'Not Confirmed', 'Completed'). Use null for any missing field. Also return legacy field 'ids' as an array of any FULL 13-digit numbers found. If nothing found, return {\"records\":[],\"ids\":[]}. No prose, no markdown.",
          },
          {
            role: "user",
            content: [
              { type: "text", text: "Extract every ID Verification record from this supplier vetting report." },
              { type: "image_url", image_url: { url: dataUrl } },
            ],
          },
        ],
      }),
    });

    if (!aiRes.ok) {
      const errTxt = await aiRes.text();
      throw new Error(`AI gateway ${aiRes.status}: ${errTxt.slice(0, 500)}`);
    }
    const aiJson = await aiRes.json();
    const raw: string = aiJson?.choices?.[0]?.message?.content ?? "";
    const cleaned = raw.trim().replace(/^```(?:json)?/i, "").replace(/```$/, "").trim();

    let ids: string[] = [];
    let records: Array<Record<string, unknown>> = [];
    try {
      const parsed = JSON.parse(cleaned);
      if (Array.isArray(parsed?.ids)) ids = parsed.ids.map((x: unknown) => String(x));
      if (Array.isArray(parsed?.records)) records = parsed.records as Array<Record<string, unknown>>;
    } catch {
      ids = (cleaned.match(/\d{13}/g) ?? []);
    }
    ids = Array.from(new Set(ids.filter((s) => /^\d{13}$/.test(s))));

    // Derive id_prefix defensively; also add full IDs as records if only ids came back.
    const normRecords = records.map((r) => {
      const raw = String(r.id_number ?? "");
      const digits = raw.replace(/\D/g, "");
      const prefix = String(r.id_prefix ?? digits.slice(0, 6));
      return { ...r, id_number: raw || null, id_prefix: /^\d{6}$/.test(prefix) ? prefix : null };
    });
    for (const full of ids) {
      if (!normRecords.some((r) => r.id_prefix === full.slice(0, 6))) {
        normRecords.push({ id_number: full, id_prefix: full.slice(0, 6), status: "Confirmed" });
      }
    }

    return new Response(JSON.stringify({ success: true, ids, records: normRecords }), {
      status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown error";
    console.error("extract-supplier-report-ids error:", message);
    return new Response(JSON.stringify({ success: false, error: message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});