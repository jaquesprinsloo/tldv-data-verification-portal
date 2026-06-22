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
    // Preserve table structure: cell boundaries become " | ",
    // row boundaries become newlines, paragraph boundaries become newlines.
    // This gives the AI enough structure to read tabular polygraph reports
    // (Suitability, Employment, Financial, etc. are almost always tables).
    return xml
      .replace(/<w:tab\/>/g, "\t")
      .replace(/<w:br\/>/g, "\n")
      .replace(/<\/w:p>/g, "\n")
      .replace(/<\/w:tc>/g, " | ")
      .replace(/<\/w:tr>/g, "\n")
      .replace(/<w:tbl[^>]*>/g, "\n--- TABLE ---\n")
      .replace(/<\/w:tbl>/g, "\n--- END TABLE ---\n")
      .replace(/<[^>]+>/g, "")
      .replace(/[ \t]+/g, " ")
      .replace(/\n{3,}/g, "\n\n")
      .replace(/ \| \n/g, "\n")
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

// Best-effort regex extraction for a South African contact number from the
// raw report text. Used as a fallback when the AI does not return one.
function extractContactNumberFallback(text: string): string {
  if (!text) return "";
  // Look for an explicit "Contact"/"Cell"/"Mobile"/"Tel"/"Phone" label first
  const labeled = text.match(
    /(?:contact(?:\s*(?:number|no\.?|#))?|cell(?:phone)?|mobile|tel(?:ephone)?|phone)\s*[:\-]?\s*([+()\d][\d\s().\-]{8,20}\d)/i,
  );
  const candidate = labeled?.[1] ?? null;
  if (candidate) return candidate.replace(/\s+/g, " ").trim();
  // Fallback: any 10-digit ZA number (starts with 0) or +27 number
  const generic = text.match(/(?:\+27[\s\-]?\d{2}[\s\-]?\d{3}[\s\-]?\d{4})|(?:\b0\d{2}[\s\-]?\d{3}[\s\-]?\d{4}\b)/);
  return generic ? generic[0].replace(/\s+/g, " ").trim() : "";
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
  const json = await r.json();
  // Detect truncation — if the model ran out of tokens we'll get partial JSON
  // for the tool call which silently drops fields.
  const finish = json?.choices?.[0]?.finish_reason;
  if (finish === "length") {
    console.warn("AI response was truncated (finish_reason=length). Some fields may be missing.");
  }
  return json;
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
            dateOfBirth: { type: "string", description: "YYYY-MM-DD if stated" },
            gender: { type: "string" },
            nationality: { type: "string" },
            homeLanguage: { type: "string" },
          },
        },
        examination: {
          type: "object",
          properties: {
            date: { type: "string", description: "YYYY-MM-DD if possible" },
            examinerName: { type: "string" },
            overallResult: { type: "string", description: "NDI, INC, DI, passed, failed, inconclusive, or empty" },
            vettingType: {
              type: "string",
              description: "Pre-employment, Specific Issue, Periodic, Post-incident, etc.",
            },
            location: { type: "string" },
            referenceNumber: { type: "string" },
          },
        },
        suitability: {
          type: "object",
          description: "Pre-test suitability questionnaire answers if present in the report",
          properties: {
            healthStatus: { type: "string" },
            enoughSleep: { type: "string", description: "Yes/No/empty" },
            hospitalizedRecently: { type: "string" },
            hospitalizedDetails: { type: "string" },
            medicationTaken: { type: "string" },
            medicationDetails: { type: "string" },
            heartConditions: { type: "string" },
            breathingTrouble: { type: "string" },
            psychologicalDisorders: { type: "string" },
            diabetic: { type: "string" },
            recentDrugUse: { type: "string" },
            drugUseDetails: { type: "string" },
            recentAlcoholUse: { type: "string" },
            alcoholDetails: { type: "string" },
            smoker: { type: "string" },
            smokingDetails: { type: "string" },
            pregnant: { type: "string" },
            suitableForExam: { type: "string" },
            suitabilityComment: { type: "string" },
          },
        },
        examQuestions: {
          type: "array",
          description: "Each relevant test question with the polygraph finding (NSR, SR, or INC)",
          items: {
            type: "object",
            required: ["question", "finding"],
            properties: {
              question: { type: "string" },
              finding: { type: "string", enum: ["NSR", "SR", "INC", "NDI", "DI"] },
              notes: { type: "string" },
            },
          },
        },
        admissions: {
          type: "array",
          description: "Every disclosed wrongdoing, no matter how minor. Include theft, fraud, bribery, drug use, violence, dishonesty, etc.",
          items: {
            type: "object",
            required: ["type", "detail"],
            properties: {
              type: { type: "string", enum: ["theft", "fraud", "violence", "drug_use", "bribery", "dishonesty", "organized_crime", "other"] },
              detail: { type: "string" },
              when: { type: "string" },
              frequency: { type: "string" },
              amount: { type: "number", description: "ZAR value if stated" },
            },
          },
        },
        education: {
          type: "array",
          items: {
            type: "object",
            properties: {
              institution: { type: "string" },
              qualification: { type: "string" },
              year: { type: "string" },
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
              startDate: { type: "string" },
              endDate: { type: "string" },
              salary: { type: "string" },
              reasonForLeaving: { type: "string" },
              disciplinary: { type: "string", description: "Warning/dismissal/none" },
            },
          },
        },
        financial: {
          type: "array",
          description: "Every disclosed financial issue. Capture amounts as numbers without thousand separators.",
          items: {
            type: "object",
            properties: {
              issue: { type: "string", description: "e.g. debt, arrears, blacklisted, gambling" },
              detail: { type: "string" },
              status: { type: "string", description: "current | historical | resolved" },
              amount: { type: "number" },
              creditor: { type: "string" },
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
              date: { type: "string" },
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
              frequency: { type: "string" },
            },
          },
        },
        family: {
          type: "array",
          description: "Family members mentioned in the report. Include relationship and any criminal history.",
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
          description: "Friends/associates with disclosed criminal history",
          items: {
            type: "object",
            properties: {
              name: { type: "string" },
              criminalHistory: { type: "string" },
            },
          },
        },
        nextOfKin: {
          type: "array",
          items: {
            type: "object",
            properties: {
              name: { type: "string" },
              relationship: { type: "string" },
              contactNumber: { type: "string" },
              address: { type: "string" },
            },
          },
        },
        deception: {
          type: "array",
          description: "Polygraph SR/INC findings or post-exam admissions of deception",
          items: { type: "string" },
        },
        notes: { type: "string", description: "Examiner notes / post-exam admissions / overall summary" },
        postExamAdmissions: { type: "string", description: "Anything the candidate admitted AFTER the exam, verbatim if possible" },
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
  const s = normalized.suitability || {};
  // Map textual overallResult into a synthetic examQuestion finding so
  // downstream consumers (which derive pass/fail from examQuestions) work
  // even though the lean extractor doesn't return per-question rows.
  const rawResult = String(e.overallResult || "").toLowerCase().trim();
  let synthFinding: string | null = null;
  if (rawResult === "ndi" || rawResult === "passed" || rawResult === "no deception indicated") synthFinding = "NSR";
  else if (rawResult === "di" || rawResult === "failed" || rawResult === "deception indicated" || rawResult === "sr") synthFinding = "SR";
  else if (rawResult === "inc" || rawResult === "inconclusive") synthFinding = "INC";
  // Prefer per-question results from the AI; only fall back to the synthetic
  // overall finding if the AI didn't return any question-level data.
  const aiQuestions = Array.isArray(normalized.examQuestions) ? normalized.examQuestions : [];
  const examQuestions = aiQuestions.length > 0
    ? aiQuestions.map((q: any) => ({
        question: q.question || "",
        finding: String(q.finding || "").toUpperCase(),
        notes: q.notes || "",
      }))
    : (synthFinding ? [{ question: "Overall examination outcome", finding: synthFinding }] : []);
  // Bucket question results for the polygraphResults shape
  const SR: any[] = [], INC: any[] = [], NSR: any[] = [];
  for (const q of examQuestions) {
    const f = String(q.finding || "").toUpperCase();
    if (f === "SR" || f === "DI") SR.push(q);
    else if (f === "INC") INC.push(q);
    else if (f === "NSR" || f === "NDI") NSR.push(q);
  }
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
      dateOfBirth: c.dateOfBirth || "",
      gender: c.gender || "",
      nationality: c.nationality || "",
      homeLanguage: c.homeLanguage || "",
    },
    examination: {
      date: e.date || new Date().toISOString().split("T")[0],
      examinerName: e.examinerName || "",
      vettingType: e.vettingType || "",
      location: e.location || "",
      referenceNumber: e.referenceNumber || "",
      vettingTypes: e.vettingType ? { [e.vettingType]: true } : {},
    },
    suitability: {
      healthStatus: s.healthStatus || "",
      enoughSleep: s.enoughSleep || null,
      hospitalizedRecently: s.hospitalizedRecently || null,
      hospitalizedDetails: s.hospitalizedDetails || "",
      medicationTaken: s.medicationTaken || null,
      medicationDetails: s.medicationDetails || "",
      heartConditions: s.heartConditions || null,
      breathingTrouble: s.breathingTrouble || null,
      psychologicalDisorders: s.psychologicalDisorders || null,
      diabetic: s.diabetic || null,
      recentDrugUse: s.recentDrugUse || null,
      drugUseDetails: s.drugUseDetails || "",
      recentAlcoholUse: s.recentAlcoholUse || null,
      alcoholDetails: s.alcoholDetails || "",
      smoker: s.smoker || null,
      smokingDetails: s.smokingDetails || "",
      pregnant: s.pregnant || null,
      suitableForExam: s.suitableForExam || null,
      suitabilityComment: s.suitabilityComment || "",
    },
    admissions: (normalized.admissions || []).map((a: any) => ({
      category: a.type || "",
      confirmed: true,
      timeWindow: a.when || "",
      details: { frequency: a.frequency, raw: a.detail, amount: a.amount },
      notes: a.detail || "",
    })),
    examQuestions,
    result: {
      overallResult: String(e.overallResult || "").toLowerCase(),
      examinerNotes: normalized.notes || "",
      postExamAdmissions: normalized.postExamAdmissions || "",
    },
    disclosure: {},
    educationHistory: (normalized.education || []).map((ed: any) => ({
      Institution: ed.institution || "",
      Qualification: ed.qualification || "",
      Year: ed.year || "",
    })),
    employmentHistory: mapEmploymentToHistory(normalized.employment),
    familyCriminalHistory: mapFamily(normalized.family),
    friendCriminalHistory: mapFriends(normalized.friends),
    nextOfKin: (normalized.nextOfKin || []).map((n: any) => ({
      Name: n.name || "",
      Relationship: n.relationship || "",
      ContactNumber: n.contactNumber || "",
      Address: n.address || "",
    })),
    financialCircumstances: mapFinancial(normalized.financial),
    permitsLicensing: {},
    personalLawEncounters: mapLegal(normalized.legal),
    polygraphResults: {
      QuestionResults: examQuestions,
      SRQuestions: SR,
      INCQuestions: INC,
      NSRQuestions: NSR,
    },
    postExamAdmissions: normalized.postExamAdmissions || normalized.notes || "",
    riskAnalysis: {}, // intentionally empty — risk profile is generated by generate-polygraph-risk-profile
    detailedCriminalActivity: mapAdmissionsToCriminal(normalized.admissions, normalized.substances).DetailedCriminalActivity,
    candidatePhotoUrl,
  };
}

// ─── Main handler ─────────────────────────────────────────────────────

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    // Require authenticated admin/master_admin caller (this triggers paid AI calls)
    const authHeader = req.headers.get("Authorization") || "";
    const jwt = authHeader.replace("Bearer ", "");
    if (!jwt) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const adminClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );
    const { data: userData, error: userErr } = await adminClient.auth.getUser(jwt);
    if (userErr || !userData?.user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const { data: roleRows } = await adminClient
      .from("user_roles").select("role").eq("user_id", userData.user.id);
    const roles = (roleRows || []).map((r: any) => r.role);
    if (!roles.includes("admin") && !roles.includes("master_admin")) {
      return new Response(JSON.stringify({ error: "Forbidden" }), {
        status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

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
    const extractSystem = `You are extracting structured facts from a South African polygraph report. Return via the tool only. Be EXHAUSTIVE — do not skip sections.

CRITICAL RULES:
- Read the ENTIRE document. Tables (separated by "--- TABLE ---") contain most of the data — process every row.
- Extract every prior employer in the employment history table — do not stop after the first 2-3.
- Extract every disclosed admission, no matter how small (theft of stationery counts).
- Extract every test question with its result (NSR / SR / INC) into examQuestions[].
- Capture the pre-exam suitability questionnaire (sleep, meds, drugs, alcohol, smoking, health) into suitability{}.
- Capture vetting type (Pre-employment / Specific Issue / Periodic / Post-incident) and exam location.
- Capture financial amounts as raw numbers WITHOUT thousand separators (e.g. 15000 not "R15,000" not "15.000").
- Normalize dates to YYYY-MM-DD where possible; durations as "X years Y months".
- Verbatim wording where reasonable; ignore boilerplate / disclaimers / page footers.
- Unknown -> empty string. Do NOT guess or infer beyond what the document states.
- For deception[]: include any SR, INC, or post-exam admission of deception, plus the question text.
- family[] / friends[]: only entries where criminal history or relevance is disclosed.
- nextOfKin[]: only if explicitly listed in the report.
- postExamAdmissions: capture verbatim what the candidate admitted AFTER the exam (often labelled "Post-test admissions" or "Subject admitted").`;

    const userContent: any = useImageFallback
      ? [
          { type: "text", text: "Extract structured polygraph facts from this PDF using the tool." },
          { type: "image_url", image_url: { url: `data:application/pdf;base64,${pdfBase64}` } },
        ]
      : `Extract structured polygraph facts from this report text using the tool.\n\n--- DOCUMENT ---\n${docText}`;

    console.log(`Call A1 (extract) starting… docText=${docText.length} chars`);
    const a1 = await callAI({
      model: "google/gemini-2.5-pro",
      max_tokens: 16000,
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
      model: "google/gemini-2.5-flash",
      max_tokens: 16000,
      messages: [
        { role: "system", content: normalizeSystem },
        { role: "user", content: `Normalize these extracted facts:\n\n${JSON.stringify(rawFacts, null, 2)}` },
      ],
      tools: [NORMALIZE_TOOL],
      tool_choice: { type: "function", function: { name: "normalize_polygraph_facts" } },
    }, LOVABLE_API_KEY);

    const normalized = getToolArgs(a2) || rawFacts; // fall back to raw if normalize fails
    console.log("Call A2 done.");

    // Regex fallback for contact number if AI missed it
    if (!normalized.candidate) normalized.candidate = {};
    if (!normalized.candidate.contactNumber || !String(normalized.candidate.contactNumber).trim()) {
      const fallback = extractContactNumberFallback(docText);
      if (fallback) {
        console.log(`Contact number recovered via regex fallback: ${fallback}`);
        normalized.candidate.contactNumber = fallback;
      }
    }

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
