// Extracts South African 13-digit ID numbers from a supplier risk assessment PDF.
// Uses Lovable AI Gateway (Gemini) for OCR-capable extraction so scanned PDFs work.
// Word (.docx) reports are unzipped and read as text, because the vision endpoint
// does not accept the Office mime type.

import { createClient } from "npm:@supabase/supabase-js@2.49.4";
import { unzipSync, strFromU8 } from "npm:fflate@0.8.2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

/** Plain text out of a .docx (word/document.xml, paragraph breaks preserved). */
function docxToText(bytes: Uint8Array): string {
  const files = unzipSync(bytes);
  const parts = Object.keys(files)
    .filter((n) => /^word\/(document|header\d*|footer\d*)\.xml$/.test(n))
    .sort();
  let out = "";
  for (const name of parts) {
    const xml = strFromU8(files[name]);
    out += xml
      .replace(/<w:p[ >]/g, "\n<w:p ")
      .replace(/<w:tab[^>]*>/g, "\t")
      .replace(/<w:br[^>]*>/g, "\n")
      .replace(/<[^>]+>/g, "")
      .replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">")
      .replace(/&quot;/g, '"').replace(/&#x?[0-9a-fA-F]+;/g, " ");
    out += "\n";
  }
  return out.replace(/[ \t]+\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim();
}

const base64ToBytes = (b64: string): Uint8Array => {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
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

    const bytes = base64ToBytes(fileBase64);
    const isZip = bytes[0] === 0x50 && bytes[1] === 0x4b;
    const ct = String(contentType || "");
    const looksDocx =
      /wordprocessingml|officedocument|msword|\.docx$/i.test(ct) ||
      (isZip && !/^image\//i.test(ct) && ct !== "application/pdf");

    let userContent: unknown;
    if (looksDocx) {
      let text = "";
      try {
        text = docxToText(bytes);
      } catch (_e) {
        return new Response(JSON.stringify({
          success: false,
          error: "This Word document could not be read. Please save it as a PDF and upload again.",
        }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }
      if (!text || text.replace(/\s/g, "").length < 20) {
        return new Response(JSON.stringify({
          success: false,
          error: "No readable text was found in this Word document. Please save it as a PDF and upload again.",
        }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }
      userContent = [{
        type: "text",
        text: "Extract every ID Verification record from this supplier vetting report. The report text follows:\n\n" +
          text.slice(0, 200000),
      }];
    } else {
      const dataUrl = `data:${ct || "application/pdf"};base64,${fileBase64}`;
      userContent = [
        { type: "text", text: "Extract every ID Verification record from this supplier vetting report." },
        { type: "image_url", image_url: { url: dataUrl } },
      ];
    }


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
              "You extract per-candidate records from a supplier vetting report. Return EVERY person named anywhere in the report — one record per person. Most candidates have a 'VERIFICATION OF ID NUMBER' block plus a 'RISK ASSESSMENT' / 'RISK ASSESSMENT CHECK' block stating outcomes such as 'No further investigation is recommended', 'Further investigation is recommended', or 'No result found, possible invalid ID'. IMPORTANT: some people are foreign nationals or have no South African ID — they may appear with a PASSPORT number, asylum/permit number, work permit, or with no ID block at all, and may only appear under a Risk Assessment / criminal check / summary / candidate-list section. Include those people too: put whatever document number is printed in id_number (or null), leave id_prefix null when there are no 6 leading digits, and still capture their names and risk assessment wording. Never leave a named person out because their ID verification block is missing. The ID Number may be MASKED (e.g. '981201XXXXXXX') — return exactly what appears. Respond with ONLY a JSON object of shape:\n{\"records\":[{\"id_number\":\"981201XXXXXXX\",\"id_prefix\":\"981201\",\"status\":\"Confirmed\",\"first_names\":\"NIKESH\",\"initials\":\"N\",\"surname\":\"DHEEPLALL\",\"date_of_birth\":\"1998-12-01\",\"age\":\"27\",\"gender\":\"MALE\",\"citizenship\":\"SOUTH AFRICAN\",\"dead_alive\":\"Alive\",\"risk_assessment\":\"Further investigation is recommended\",\"risk_assessment_detail\":\"any extra commentary printed under that candidate's Risk Assessment heading, e.g. PLEASE NOTE paragraphs, diversion explanations, 'A detailed activity report to be forwarded after verification of fingerprints.'\",\"id_verification_detail\":\"any extra line printed under Verification of ID number, e.g. 'No results found for ID number (invalid ID number)'\"}]}\nRules: id_prefix = the first 6 digits of a South African ID (digits only), else null. status = the ID verification confirmation signal exactly as printed (e.g. 'Confirmed', 'Not Confirmed', 'No result found, possible invalid ID'); use null when no ID verification block exists for that person. risk_assessment = the exact outcome text from that candidate's Risk Assessment section; null if absent. risk_assessment_detail = the additional explanatory text under the Risk Assessment section for that candidate, joined into one string; null if there is none. Never mix one candidate's text with another's. Use null for any missing field. Also return legacy field 'ids' as an array of any FULL 13-digit numbers found. If nothing found, return {\"records\":[],\"ids\":[]}. No prose, no markdown.",
          },
          {
            role: "user",
            content: userContent,
          },
        ],

      }),
    });

    if (!aiRes.ok) {
      const errTxt = await aiRes.text();
      console.error(`extract-supplier-report-ids AI gateway ${aiRes.status}: ${errTxt.slice(0, 500)}`);
      let friendly: string;
      if (aiRes.status === 402) {
        friendly = "The AI reading service is out of credits. Please top up the workspace AI credits, then upload the report again.";
      } else if (aiRes.status === 403) {
        friendly = "The AI reading service is blocked by the workspace AI credit limit. Please raise or reset the AI limit, then upload the report again.";
      } else if (aiRes.status === 429) {
        friendly = "The AI reading service is busy right now. Please wait a minute and upload the report again.";
      } else if (aiRes.status >= 500) {
        friendly = "The AI reading service is temporarily unavailable. Please try again in a few minutes.";
      } else {
        friendly = "The report could not be read by the AI service. Please check the file and try again, or capture the results manually.";
      }
      return new Response(
        JSON.stringify({ success: false, error: friendly, status: aiRes.status, retryable: aiRes.status === 429 || aiRes.status >= 500 }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
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