import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.7.1";
import JSZip from "https://esm.sh/jszip@3.10.1";
import { extractText, getDocumentProxy } from "https://esm.sh/unpdf@0.12.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const AI_URL = "https://ai.gateway.lovable.dev/v1/chat/completions";

// ─── Helpers ──────────────────────────────────────────────────────────

function base64ToBytes(b64: string): Uint8Array {
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

async function uploadPhotoToStorage(
  photoBase64: string,
  candidateIdNumber: string,
  mimeType = "image/png",
): Promise<string | null> {
  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );
    const bytes = base64ToBytes(photoBase64);
    const ext = mimeType.split("/")[1] || "png";
    const fileName = `candidate-photos/${candidateIdNumber}-${Date.now()}.${ext}`;
    const { error } = await supabase.storage
      .from("polygraph-reports")
      .upload(fileName, bytes, { contentType: mimeType, upsert: true });
    if (error) {
      console.error("Photo upload error:", error);
      return null;
    }
    return supabase.storage.from("polygraph-reports").getPublicUrl(fileName).data.publicUrl;
  } catch (e) {
    console.error("uploadPhotoToStorage:", e);
    return null;
  }
}

async function extractTextFromDocx(docxBase64: string): Promise<string> {
  try {
    const zip = await JSZip.loadAsync(base64ToBytes(docxBase64));
    const xml = await zip.file("word/document.xml")?.async("string");
    if (!xml) return "";
    return xml
      .replace(/<\/w:p>/g, "\n")
      .replace(/<\/w:tr>/g, "\n")
      .replace(/<[^>]+>/g, " ")
      .replace(/\s+/g, " ")
      .replace(/\n\s*\n/g, "\n\n")
      .trim();
  } catch (e) {
    console.error("docx extract error:", e);
    return "";
  }
}

async function extractTextFromPdf(pdfBase64: string): Promise<string> {
  try {
    const bytes = base64ToBytes(pdfBase64);
    const pdf = await getDocumentProxy(bytes);
    const { text } = await extractText(pdf, { mergePages: true });
    return (typeof text === "string" ? text : (text as any).join("\n")).trim();
  } catch (e) {
    console.error("pdf text extract error:", e);
    return "";
  }
}

// ─── AI calls ─────────────────────────────────────────────────────────

async function callAI(body: any, apiKey: string) {
  const r = await fetch(AI_URL, {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!r.ok) {
    const txt = await r.text();
    const err = new Error(`AI gateway ${r.status}: ${txt}`) as any;
    err.status = r.status;
    throw err;
  }
  return r.json();
}

function getToolArgs(aiResp: any): any | null {
  const tc = aiResp?.choices?.[0]?.message?.tool_calls?.[0];
  if (!tc?.function?.arguments) return null;
  try { return JSON.parse(tc.function.arguments); } catch { return null; }
}

const EXTRACT_TOOL = {
  type: "function",
  function: {
    name: "extract_polygraph_facts",
    description: "Extract structured facts from a polygraph report without inference",
    parameters: {
      type: "object",
      required: ["candidate", "examination", "admissions", "employment", "financial", "legal", "substances", "deception", "notes"],
      properties: {
        candidate: {
          type: "object",
          properties: {
            firstName: { type: "string" },
            lastName: { type: "string" },
            idNumber: { type: "string" },
            email: { type: "string" },
            contactNumber: { type: "string" },
            physicalAddress: { type: "string" },
            positionAppliedFor: { type: "string" },
            storeLocation: { type: "string" },
          },
        },
        examination: {
          type: "object",
          properties: {
            date: { type: "string", description: "YYYY-MM-DD if possible" },
            examinerName: { type: "string" },
            overallResult: { type: "string", description: "NDI, INC, DI, passed, failed, inconclusive, or empty" },
          },
        },
        admissions: {
          type: "array",
          items: {
            type: "object",
            required: ["type", "detail"],
            properties: {
              type: { type: "string", enum: ["theft", "fraud", "violence", "drug_use", "bribery", "other"] },
              detail: { type: "string" },
              when: { type: "string" },
              frequency: { type: "string" },
            },
          },
        },
        employment: {
          type: "array",
          description: "Each prior job AND any disciplinary issue",
          items: {
            type: "object",
            properties: {
              company: { type: "string" },
              position: { type: "string" },
              duration: { type: "string", description: "e.g. '2 years 6 months'" },
              reasonForLeaving: { type: "string" },
              disciplinary: { type: "string", description: "Warning/dismissal/none" },
            },
          },
        },
        financial: {
          type: "array",
          items: {
            type: "object",
            properties: {
              issue: { type: "string", description: "e.g. debt, arrears, blacklisted, gambling" },
              detail: { type: "string" },
              status: { type: "string", description: "current | historical | resolved" },
              amount: { type: "number" },
            },
          },
        },
        legal: {
          type: "array",
          items: {
            type: "object",
            properties: {
              issue: { type: "string", description: "arrest | conviction | bribery | pending_case | fine | court" },
              detail: { type: "string" },
              status: { type: "string" },
            },
          },
        },
        substances: {
          type: "array",
          items: {
            type: "object",
            properties: {
              name: { type: "string" },
              lastUse: { type: "string" },
              pattern: { type: "string", description: "lifetime | past_2_years | recent | one-off" },
            },
          },
        },
        family: {
          type: "array",
          description: "Family members with disclosed criminal history only",
          items: {
            type: "object",
            properties: {
              name: { type: "string" },
              relationship: { type: "string" },
              criminalHistory: { type: "string" },
            },
          },
        },
        friends: {
          type: "array",
          description: "Friends with disclosed criminal history only",
          items: {
            type: "object",
            properties: {
              name: { type: "string" },
              criminalHistory: { type: "string" },
            },
          },
        },
        deception: {
          type: "array",
          description: "Polygraph SR/INC findings or post-exam admissions of deception",
          items: { type: "string" },
        },
        notes: { type: "string", description: "Examiner notes / post-exam admissions / overall summary" },
      },
    },
  },
};

const NORMALIZE_TOOL = {
  type: "function",
  function: {
    name: "normalize_polygraph_facts",
    description: "Clean, deduplicate, and standardize extracted polygraph facts",
    parameters: EXTRACT_TOOL.function.parameters, // identical shape, cleaned
  },
};

// ─── Mapping layer: lean facts → legacy transformedData shape ─────────

function mapEmploymentToHistory(employment: any[]): any[] {
  return (employment || []).map((j) => ({
    Company: j.company || "",
    Position: j.position || "",
    Duration: j.duration || "",
    ReasonForLeaving: j.reasonForLeaving || "",
    DisciplinaryConduct: j.disciplinary || "None",
  }));
}

function mapFinancial(financial: any[]) {
  const debts: any[] = [];
  const arrears: any[] = [];
  let blacklisted = "No";
  let gambling = "None";
  for (const f of financial || []) {
    const status = String(f.status || "").toLowerCase();
    const issue = String(f.issue || "").toLowerCase();
    if (issue.includes("blacklist")) blacklisted = "Yes";
    if (issue.includes("gamb")) gambling = f.detail || "Disclosed";
    if (status.includes("arrears") || issue.includes("arrears")) {
      arrears.push({ Name: f.detail || f.issue || "", Amount: f.amount ?? 0, Date: "" });
    } else if (issue.includes("debt") || issue.includes("loan") || status.includes("current") || status.includes("historical")) {
      debts.push({ Name: f.detail || f.issue || "", Amount: f.amount ?? 0, Status: status.includes("current") ? "current" : "arrears" });
    }
  }
  return { BankDetails: "", Debts: debts, Arrears: arrears, Blacklisted: blacklisted, GamblingIssues: gambling };
}

function mapLegal(legal: any[]) {
  const out: any = {
    Arrests: "Not Disclosed",
    Bribe: "No",
    Fines: "Not Disclosed",
    Convictions: "Not Disclosed",
    PendingCases: "No",
    CourtAppearances: "Not Disclosed",
  };
  for (const l of legal || []) {
    const issue = String(l.issue || "").toLowerCase();
    if (issue.includes("arrest")) out.Arrests = l.detail || "Disclosed";
    else if (issue.includes("conviction")) out.Convictions = l.detail || "Disclosed";
    else if (issue.includes("brib")) out.Bribe = l.detail || "Yes";
    else if (issue.includes("pending")) out.PendingCases = l.detail || "Yes";
    else if (issue.includes("fine")) out.Fines = l.detail || "Disclosed";
    else if (issue.includes("court")) out.CourtAppearances = l.detail || "Disclosed";
  }
  return out;
}

function mapAdmissionsToCriminal(admissions: any[], substances: any[]) {
  // Build extracted_disclosure.DetailedCriminalActivity in the shape the
  // deterministic scorer in generate-polygraph-risk-profile expects.
  const buckets: Record<string, any> = {
    TheftAtWork: {},
    Fraud: {},
    Bribery: {},
    OrganizedCrime: {},
    UndetectedCrimes: {},
    IllegalDrugInvolvement: {},
    GeneralOverview: {},
  };
  let i = 0;
  for (const a of admissions || []) {
    const t = String(a.type || "").toLowerCase();
    const detail = a.detail || "";
    if (t === "theft") buckets.TheftAtWork[`item_${i++}`] = detail || "Yes";
    else if (t === "fraud") buckets.Fraud[`item_${i++}`] = detail || "Yes";
    else if (t === "bribery") buckets.Bribery[`item_${i++}`] = detail || "Yes";
    else if (t === "drug_use") buckets.IllegalDrugInvolvement[`item_${i++}`] = detail || "Yes";
    else if (t === "violence") buckets.OrganizedCrime[`item_${i++}`] = detail || "Yes";
    else buckets.GeneralOverview[`item_${i++}`] = detail || "Yes";
  }
  for (const s of substances || []) {
    const pattern = String(s.pattern || "").toLowerCase();
    const key = pattern.includes("past_2") || pattern.includes("recent")
      ? `drug_use_past_2_years_${i++}`
      : `drug_use_lifetime_${i++}`;
    buckets.IllegalDrugInvolvement[key] = `${s.name || "drug"}${s.lastUse ? ` (last: ${s.lastUse})` : ""}`;
  }
  return { DetailedCriminalActivity: buckets };
}

function mapFamily(family: any[]) {
  return (family || []).map((f) => ({
    Name: f.name || "",
    Relationship: f.relationship || "",
    CriminalHistory: f.criminalHistory || "Not aware of any criminal history",
  }));
}
function mapFriends(friends: any[]) {
  return (friends || []).map((f) => ({
    Name: f.name || "",
    Relationship: "Close Friend",
    CriminalHistory: f.criminalHistory || "Not aware of any criminal history",
  }));
}

function buildTransformed(normalized: any, candidatePhotoUrl: string | null) {
  const c = normalized.candidate || {};
  const e = normalized.examination || {};
  // Map textual overallResult into a synthetic examQuestion finding so
  // downstream consumers (which derive pass/fail from examQuestions) work
  // even though the lean extractor doesn't return per-question rows.
  const rawResult = String(e.overallResult || "").toLowerCase().trim();
  let synthFinding: string | null = null;
  if (rawResult === "ndi" || rawResult === "passed" || rawResult === "no deception indicated") synthFinding = "NSR";
  else if (rawResult === "di" || rawResult === "failed" || rawResult === "deception indicated" || rawResult === "sr") synthFinding = "SR";
  else if (rawResult === "inc" || rawResult === "inconclusive") synthFinding = "INC";
  const examQuestions = synthFinding
    ? [{ question: "Overall examination outcome", finding: synthFinding }]
    : [];
  return {
    candidate: {
      firstName: c.firstName || "",
      lastName: c.lastName || "",
      idNumber: c.idNumber || "",
      email: c.email || "",
      contactNumber: c.contactNumber || "",
      physicalAddress: c.physicalAddress || "",
      positionApplyingFor: c.positionAppliedFor || "",
      storeLocation: c.storeLocation || "",
    },
    examination: {
      date: e.date || new Date().toISOString().split("T")[0],
      examinerName: e.examinerName || "",
      vettingTypes: {},
    },
    suitability: {
      healthStatus: "",
      enoughSleep: null, hospitalizedRecently: null, hospitalizedDetails: "",
      medicationTaken: null, medicationDetails: "",
      heartConditions: null, breathingTrouble: null, psychologicalDisorders: null,
      diabetic: null, recentDrugUse: null, drugUseDetails: "",
      recentAlcoholUse: null, alcoholDetails: "",
      smoker: null, smokingDetails: "", pregnant: null,
      suitableForExam: null, suitabilityComment: "",
    },
    admissions: (normalized.admissions || []).map((a: any) => ({
      category: a.type || "",
      confirmed: true,
      timeWindow: a.when || "",
      details: { frequency: a.frequency, raw: a.detail },
      notes: a.detail || "",
    })),
    examQuestions,
    result: {
      overallResult: String(e.overallResult || "").toLowerCase(),
      examinerNotes: normalized.notes || "",
    },
    disclosure: {},
    educationHistory: [],
    employmentHistory: mapEmploymentToHistory(normalized.employment),
    familyCriminalHistory: mapFamily(normalized.family),
    friendCriminalHistory: mapFriends(normalized.friends),
    nextOfKin: [],
    financialCircumstances: mapFinancial(normalized.financial),
    permitsLicensing: {},
    personalLawEncounters: mapLegal(normalized.legal),
    polygraphResults: { QuestionResults: [], SRQuestions: [], INCQuestions: [], NSRQuestions: [] },
    postExamAdmissions: normalized.notes || "",
    riskAnalysis: {}, // intentionally empty — risk profile is generated by generate-polygraph-risk-profile
    detailedCriminalActivity: mapAdmissionsToCriminal(normalized.admissions, normalized.substances).DetailedCriminalActivity,
    candidatePhotoUrl,
  };
}

// ─── Main handler ─────────────────────────────────────────────────────

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { docxBase64, pdfBase64, fileName, extractedImages } = await req.json();
    const isWordDoc = !!docxBase64;

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY not configured");

    console.log(`Processing ${isWordDoc ? "DOCX" : "PDF"}: ${fileName}`);

    // 1. Get text. Prefer server-side extraction; fall back to base64 image only if PDF text fails.
    let docText = "";
    let useImageFallback = false;

    if (isWordDoc) {
      docText = await extractTextFromDocx(docxBase64);
      if (!docText) throw new Error("Failed to extract text from Word document");
    } else {
      docText = await extractTextFromPdf(pdfBase64);
      if (docText.length < 500) {
        console.log(`PDF text too short (${docText.length} chars) — falling back to image`);
        useImageFallback = true;
      }
    }

    // 2. Call A1 — Extraction (Gemini 2.5 Pro + tool)
    const extractSystem = `Extract structured facts from a polygraph report. Return via tool only. No inference.

RULES:
- Extract only explicit admissions or findings stated in the document
- Keep wording concise and verbatim from the document where possible
- Normalize dates (YYYY-MM-DD) and durations ("X years Y months") if possible
- Ignore boilerplate / disclaimers
- Unknown -> empty string. Do NOT guess.
- For "deception" array: include any SR (Significant Reaction), INC (Inconclusive), or post-exam admission of deception
- For "family" / "friends": only include those with disclosed criminal history`;

    const userContent: any = useImageFallback
      ? [
          { type: "text", text: "Extract structured polygraph facts from this PDF using the tool." },
          { type: "image_url", image_url: { url: `data:application/pdf;base64,${pdfBase64}` } },
        ]
      : `Extract structured polygraph facts from this report text using the tool.\n\n--- DOCUMENT ---\n${docText}`;

    console.log("Call A1 (extract) starting…");
    const a1 = await callAI({
      model: "google/gemini-2.5-pro",
      messages: [
        { role: "system", content: extractSystem },
        { role: "user", content: userContent },
      ],
      tools: [EXTRACT_TOOL],
      tool_choice: { type: "function", function: { name: "extract_polygraph_facts" } },
    }, LOVABLE_API_KEY);

    const rawFacts = getToolArgs(a1);
    if (!rawFacts) throw new Error("Extraction did not return structured facts");
    console.log("Call A1 done. Admissions:", rawFacts.admissions?.length, "Employment:", rawFacts.employment?.length);

    // 3. Call A2 — Normalize (Gemini 2.5 Flash Lite + tool)
    const normalizeSystem = `Clean and normalize extracted polygraph data.

RULES:
- Remove duplicates and merge similar entries
- Standardize wording (e.g. "stole" / "took" / "removed cash" -> "theft")
- Keep meaning unchanged
- Keep output compact
- Drop entries that are negations ("no arrests", "never used drugs")

Return via tool only.`;

    console.log("Call A2 (normalize) starting…");
    const a2 = await callAI({
      model: "google/gemini-2.5-flash-lite",
      messages: [
        { role: "system", content: normalizeSystem },
        { role: "user", content: `Normalize these extracted facts:\n\n${JSON.stringify(rawFacts, null, 2)}` },
      ],
      tools: [NORMALIZE_TOOL],
      tool_choice: { type: "function", function: { name: "normalize_polygraph_facts" } },
    }, LOVABLE_API_KEY);

    const normalized = getToolArgs(a2) || rawFacts; // fall back to raw if normalize fails
    console.log("Call A2 done.");

    // 4. Photo from extracted DOCX images (if any)
    let candidatePhotoUrl: string | null = null;
    if (extractedImages && extractedImages.length > 0) {
      const first = extractedImages[0];
      const id = normalized.candidate?.idNumber || `unknown-${Date.now()}`;
      candidatePhotoUrl = await uploadPhotoToStorage(first.base64, id, first.mimeType);
    }

    // 5. Map to legacy transformedData shape so frontend doesn't change
    const transformedData = buildTransformed(normalized, candidatePhotoUrl);

    console.log("Extraction complete. Candidate:", transformedData.candidate.firstName, transformedData.candidate.lastName);

    return new Response(
      JSON.stringify({ success: true, data: transformedData }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (error: any) {
    console.error("extract-polygraph-report error:", error);
    if (error.status === 429) {
      return new Response(JSON.stringify({ error: "Rate limited, please try again later" }), {
        status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (error.status === 402) {
      return new Response(JSON.stringify({ error: "AI credits exhausted" }), {
        status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
