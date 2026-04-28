// Generate a PreAppliCheck-style 5-category risk profile for a polygraph report.
// Mirrors generate-pre-risk-profile exactly: same JSON shape, same scoring tiers
// (LOW 0-7, MEDIUM 8-17, HIGH 18-30, VERY HIGH 31+), same Gemini prompt logic.
// Input source differs: instead of questionnaire answers, it consumes the polygraph
// extracted_data (employment history, financial circumstances, law encounters,
// family/friend criminal history, post-exam admissions) plus exam questions for Integrity.

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS")
    return new Response(null, { headers: corsHeaders });

  try {
    const { report_id } = await req.json();
    if (!report_id) {
      return new Response(JSON.stringify({ error: "report_id required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const { data: report, error: repErr } = await supabase
      .from("polygraph_reports")
      .select("*")
      .eq("id", report_id)
      .single();

    if (repErr || !report) {
      return new Response(JSON.stringify({ error: "Report not found" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: examQuestions } = await supabase
      .from("polygraph_exam_questions")
      .select("question_number, question_text, response, finding")
      .eq("report_id", report_id)
      .order("question_number");

    // Build a structured plain-text dossier the AI can reason over.
    const dossier = buildPolygraphDossier(report);

    // Optional: pull a linked PreAppliCheck summary for the same ID number.
    let precheckContext = "";
    if (report.id_number) {
      const { data: precheckRows } = await supabase
        .from("candex_applications")
        .select("answers, risk_level, risk_score")
        .eq("candidate_id_number", report.id_number)
        .order("submitted_at", { ascending: false })
        .limit(1);
      const precheck = precheckRows?.[0] as any;
      const pre = precheck?.answers?.preRiskProfile;
      if (pre?.summary || pre?.keyFindings?.length) {
        precheckContext = `\n\nLINKED PREAPPLICHECK CONTEXT (for continuity, do not re-score):\nRisk: ${precheck.risk_level || "N/A"} (${precheck.risk_score ?? "N/A"})\nSummary: ${pre.summary || ""}\nKey findings: ${(pre.keyFindings || []).join("; ")}`;
      }
    }

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) {
      return new Response(JSON.stringify({ error: "AI key not configured" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // IMPORTANT: This system prompt is intentionally identical to
    // generate-pre-risk-profile so the pre-risk and polygraph summaries
    // are produced under the exact same criteria, tone, and shape. The
    // PreAppliCheck questionnaire and the in-person polygraph cover the
    // same questions; the only thing that changes is the data source.
    const systemPrompt = `You are a pre-employment risk analyst. Return JSON via the required tool only.

SCORING:
- EMPLOYMENT (0-3): 0=stable >=3y, 1=2-3y, 2=1-2y, 3=<1y or dismissals
- FINANCIAL (0-3): 0=none, 1=current ok, 2=historical debt, 3=blacklisted
- LEGAL (0-5 additive): +1 each for arrest, conviction, bribery, pending cases, criminal associates
- CRIMINAL: ignore (server-computed)
- INTEGRITY: always 0 ("Pending")

RULES:
- Ignore empty/negative responses ("no","none","never")
- Weight recent/repeated higher; old isolated incidents reduce risk
- Distinguish lifetime vs last 2 years (especially for drugs)

OUTPUT:
- Fill all fields
- "summary" = objective employment considerations (NEVER hire/no-hire)
- "keyFindings" = short evidence-based bullets only`;

    const userPrompt = `Candidate: ${report.first_name} ${report.last_name}
ID Number: ${report.id_number || "Not provided"}

QUESTIONNAIRE RESPONSES (collected in-person during polygraph examination):
${dossier}${precheckContext}`;

    const aiResponse = await fetch(
      "https://ai.gateway.lovable.dev/v1/chat/completions",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${LOVABLE_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "google/gemini-2.5-flash-lite",
          messages: [
            { role: "system", content: systemPrompt },
            { role: "user", content: userPrompt },
          ],
          tools: [
            {
              type: "function",
              function: {
                name: "submit_risk_profile",
                description:
                  "Submit the analyzed pre-risk alert profile for a candidate",
                parameters: {
                  type: "object",
                  properties: {
                    employment: {
                      type: "object",
                      properties: {
                        score: { type: "number" },
                        label: { type: "string" },
                        reasoning: { type: "string" },
                        jobs: {
                          type: "array",
                          items: {
                            type: "object",
                            properties: {
                              company: { type: "string" },
                              position: { type: "string" },
                              durationMonths: { type: "number" },
                              reason: { type: "string" },
                            },
                            required: [
                              "company",
                              "position",
                              "durationMonths",
                              "reason",
                            ],
                          },
                        },
                        avgMonths: { type: "number" },
                        hasDisciplinary: { type: "boolean" },
                        disciplinaryDetails: { type: "string" },
                      },
                      required: ["score", "label", "reasoning"],
                    },
                    financial: {
                      type: "object",
                      properties: {
                        score: { type: "number" },
                        label: { type: "string" },
                        reasoning: { type: "string" },
                        currentAccounts: {
                          type: "array",
                          items: {
                            type: "object",
                            properties: {
                              name: { type: "string" },
                              amount: { type: "number" },
                              status: { type: "string" },
                            },
                            required: ["name", "amount", "status"],
                          },
                        },
                        historicalDebt: {
                          type: "array",
                          items: {
                            type: "object",
                            properties: {
                              name: { type: "string" },
                              amount: { type: "number" },
                            },
                            required: ["name", "amount"],
                          },
                        },
                        blacklisted: { type: "boolean" },
                      },
                      required: ["score", "label", "reasoning"],
                    },
                    legal: {
                      type: "object",
                      properties: {
                        score: { type: "number" },
                        label: { type: "string" },
                        reasoning: { type: "string" },
                        personalArrested: { type: "boolean" },
                        personalConvicted: { type: "boolean" },
                        paidBribe: { type: "boolean" },
                        hasPendingCases: { type: "boolean" },
                        hasFamilyFriendIssues: { type: "boolean" },
                        details: { type: "string" },
                      },
                      required: ["score", "label", "reasoning"],
                    },
                    criminal: {
                      type: "object",
                      properties: {
                        score: { type: "number" },
                        label: { type: "string" },
                        reasoning: { type: "string" },
                        confirmedItems: {
                          type: "array",
                          items: { type: "string" },
                        },
                      },
                      required: ["score", "label", "reasoning"],
                    },
                    integrity: {
                      type: "object",
                      properties: {
                        score: { type: "number" },
                        label: { type: "string" },
                        reasoning: { type: "string" },
                      },
                      required: ["score", "label", "reasoning"],
                    },
                    totalScore: { type: "number" },
                    riskLevel: {
                      type: "string",
                      enum: ["LOW", "MEDIUM", "HIGH", "VERY HIGH"],
                    },
                    summary: { type: "string" },
                    keyFindings: {
                      type: "array",
                      items: { type: "string" },
                    },
                  },
                  required: [
                    "employment",
                    "financial",
                    "legal",
                    "criminal",
                    "integrity",
                    "totalScore",
                    "riskLevel",
                    "summary",
                    "keyFindings",
                  ],
                  additionalProperties: false,
                },
              },
            },
          ],
          tool_choice: {
            type: "function",
            function: { name: "submit_risk_profile" },
          },
          max_tokens: 4096,
        }),
      },
    );

    if (!aiResponse.ok) {
      const errText = await aiResponse.text();
      console.error("AI gateway error:", aiResponse.status, errText);
      if (aiResponse.status === 429) {
        return new Response(
          JSON.stringify({ error: "Rate limited, please try again later" }),
          {
            status: 429,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          },
        );
      }
      if (aiResponse.status === 402) {
        return new Response(JSON.stringify({ error: "AI credits exhausted" }), {
          status: 402,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      return new Response(JSON.stringify({ error: "AI analysis failed" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const aiData = await aiResponse.json();
    const toolCall = aiData.choices?.[0]?.message?.tool_calls?.[0];
    if (!toolCall) {
      return new Response(
        JSON.stringify({ error: "AI did not return structured data" }),
        {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    const riskProfile = JSON.parse(toolCall.function.arguments);

    // === Deterministic overrides (mirroring PreAppliCheck) ===
    const deterministicCriminal = calculateDeterministicCriminalProfile(report);
    riskProfile.criminal = deterministicCriminal;

    const deterministicEmployment = calculateDeterministicEmploymentProfile(
      report.employment_history,
    );
    if (deterministicEmployment) {
      riskProfile.employment = {
        ...(riskProfile.employment || {}),
        ...deterministicEmployment,
      };
    }

    riskProfile.integrity = calculateIntegrityFromExam(
      report.overall_result,
      examQuestions || [],
    );

    riskProfile.totalScore =
      Number(riskProfile?.employment?.score || 0) +
      Number(riskProfile?.financial?.score || 0) +
      Number(riskProfile?.legal?.score || 0) +
      Number(deterministicCriminal?.score || 0) +
      Number(riskProfile?.integrity?.score || 0);
    riskProfile.riskLevel = getRiskLevelFromTotal(riskProfile.totalScore);

    const criminalFinding = deterministicCriminal.score > 0
      ? `Criminal Activity score ${deterministicCriminal.score}/28 across ${deterministicCriminal.confirmedItems.length} subcategory disclosure${deterministicCriminal.confirmedItems.length === 1 ? "" : "s"}`
      : "No confirmed criminal activity disclosures";
    riskProfile.keyFindings = Array.from(
      new Set([
        ...((riskProfile.keyFindings || []) as string[]).filter(
          (finding: string) =>
            !/no criminal activity|criminal activity (disclosure|score)/i.test(
              finding,
            ),
        ),
        criminalFinding,
      ]),
    );

    // Save profile back to the report
    const { error: updateErr } = await supabase
      .from("polygraph_reports")
      .update({
        risk_score: riskProfile.totalScore,
        risk_level: riskProfile.riskLevel,
        risk_analysis: riskProfile,
        updated_at: new Date().toISOString(),
      })
      .eq("id", report_id);

    if (updateErr) {
      console.error("Update error:", updateErr);
      return new Response(
        JSON.stringify({ error: "Failed to save risk profile" }),
        {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    return new Response(JSON.stringify({ success: true, riskProfile }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("Error:", err);
    return new Response(
      JSON.stringify({
        error: err instanceof Error ? err.message : "Unknown error",
      }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  }
});

// ─── Helpers ────────────────────────────────────────────────────────────

function isNegative(v: any): boolean {
  if (v === null || v === undefined || v === "" || v === false) return true;
  if (typeof v !== "string") return false;
  const s = v.trim().toLowerCase();
  if (!s) return true;
  return (
    s === "no" || s === "none" || s === "nil" || s === "never" ||
    s === "n/a" || s === "not applicable" || s === "not disclosed" ||
    s.startsWith("has never") || s.startsWith("never ") ||
    s.includes("no involvement") || s.includes("not involved") ||
    s === "not aware" || s === "no convictions" || s === "no arrests"
  );
}

function buildPolygraphDossier(report: any): string {
  const lines: string[] = [];

  // Employment
  const emp = Array.isArray(report.employment_history)
    ? report.employment_history
    : [];
  if (emp.length) {
    lines.push("\n=== EMPLOYMENT HISTORY ===");
    for (const j of emp) {
      const company = j.Company || j.company || j.Employer || j.employer ||
        "Unknown";
      const position = j.Position || j.position || j.Role || j.role || "";
      const duration = j.Duration || j.duration || j.Period || j.period || "";
      const reason = j.ReasonForLeaving || j.reasonForLeaving || j.Reason ||
        j.reason || "";
      const disc = j.DisciplinaryConduct || j.disciplinaryConduct ||
        j.Disciplinary || j.disciplinary || "";
      lines.push(
        `  - ${company} | ${position} | ${duration} | Reason: ${reason}${disc && !isNegative(disc) ? ` | Disciplinary: ${disc}` : ""}`,
      );
    }
  }

  // Financial
  const fin = report.financial_circumstances || {};
  if (fin && Object.keys(fin).length) {
    lines.push("\n=== FINANCIAL CIRCUMSTANCES ===");
    const flat = flattenObject(fin);
    for (const { key, value } of flat) lines.push(`  ${key}: ${value}`);
  }

  // Personal Law Encounters
  const law = report.personal_law_encounters || {};
  if (law && Object.keys(law).length) {
    lines.push("\n=== PERSONAL LAW ENCOUNTERS ===");
    const flat = flattenObject(law);
    for (const { key, value } of flat) lines.push(`  ${key}: ${value}`);
  }

  // Family criminal
  const fam = Array.isArray(report.family_criminal_history)
    ? report.family_criminal_history
    : [];
  if (fam.length) {
    lines.push("\n=== FAMILY CRIMINAL HISTORY ===");
    for (const f of fam) {
      const name = f.Name || f.name || "Unknown";
      const rel = f.Relationship || f.relationship || "";
      const crim = f.CriminalHistory || f.criminalHistory ||
        f.ArrestDisclosed || f.arrestDisclosed || "";
      if (!isNegative(crim)) {
        lines.push(`  - ${name} (${rel}): ${crim}`);
      }
    }
  }

  // Friend criminal
  const fr = Array.isArray(report.friend_criminal_history)
    ? report.friend_criminal_history
    : [];
  if (fr.length) {
    lines.push("\n=== FRIEND CRIMINAL HISTORY ===");
    for (const f of fr) {
      const name = f.Name || f.name || "Unknown";
      const crim = f.CriminalHistory || f.criminalHistory ||
        f.ArrestDisclosed || f.arrestDisclosed || "";
      if (!isNegative(crim)) {
        lines.push(`  - ${name}: ${crim}`);
      }
    }
  }

  // Criminal disclosures (extracted_disclosure)
  const disc = report.extracted_disclosure || {};
  if (disc && Object.keys(disc).length) {
    lines.push("\n=== CRIMINAL ACTIVITY DISCLOSURES ===");
    const flat = flattenObject(disc);
    for (const { key, value } of flat) lines.push(`  ${key}: ${value}`);
  }

  // Post-exam admissions
  if (report.post_exam_admissions && !isNegative(report.post_exam_admissions)) {
    lines.push("\n=== POST-EXAM ADMISSIONS ===");
    lines.push(`  ${report.post_exam_admissions}`);
  }

  // Polygraph result
  lines.push("\n=== POLYGRAPH OUTCOME ===");
  lines.push(`  Overall result: ${report.overall_result || "Pending"}`);

  return lines.join("\n") || "No disclosure data available.";
}

function flattenObject(
  obj: any,
  path: string[] = [],
): { key: string; value: string }[] {
  const out: { key: string; value: string }[] = [];
  if (obj === null || obj === undefined) return out;
  if (typeof obj !== "object") {
    if (!isNegative(obj)) out.push({ key: path.join("."), value: String(obj) });
    return out;
  }
  if (Array.isArray(obj)) {
    const filtered = obj.filter((v) => !isNegative(v));
    if (filtered.length > 0) {
      out.push({
        key: path.join("."),
        value: filtered.map((v) =>
          typeof v === "object" ? JSON.stringify(v) : String(v)
        ).join(", "),
      });
    }
    return out;
  }
  for (const [k, v] of Object.entries(obj)) {
    out.push(...flattenObject(v, [...path, k]));
  }
  return out;
}

// ─── Deterministic Criminal scoring (polygraph version) ─────────────────
// Mirrors PreAppliCheck's 6-branch additive logic (Personal max 4, Fraud max 6,
// Bribery max 3, Organized max 4, Undetected max 6, Drugs max 5 → cap 28).
// Polygraph reports store equivalents in extracted_disclosure.DetailedCriminalActivity
// or in disclosure.* — we walk both shapes and look for any non-negative value.
function calculateDeterministicCriminalProfile(report: any) {
  const disc = report.extracted_disclosure || {};
  const detailed = disc.DetailedCriminalActivity || disc.detailedCriminalActivity ||
    {};

  const branches: Record<string, { max: number; aliases: string[] }> = {
    personal: {
      max: 4,
      aliases: ["personal", "TheftAtWork", "theftAtWork", "theft_at_work"],
    },
    fraud: { max: 6, aliases: ["fraud", "Fraud"] },
    bribery: { max: 3, aliases: ["bribery", "Bribery"] },
    organized: {
      max: 4,
      aliases: ["organized", "OrganizedCrimes", "organized_crimes"],
    },
    undetected: {
      max: 6,
      aliases: ["undetected", "UndetectedCrimes", "undetected_crimes"],
    },
    drugs: {
      max: 5,
      aliases: ["drugs", "IllegalDrugs", "illegal_drugs", "DrugInvolvement"],
    },
  };

  let totalScore = 0;
  const confirmedItems: string[] = [];
  const breakdown: Record<string, { score: number; max: number; subcategoriesHit: any[] }> = {};

  for (const [branchKey, def] of Object.entries(branches)) {
    let branchData: any = null;
    for (const alias of def.aliases) {
      if (detailed[alias]) {
        branchData = detailed[alias];
        break;
      }
      if (disc[alias]) {
        branchData = disc[alias];
        break;
      }
    }

    let branchScore = 0;
    const hits: { title: string; items: string[] }[] = [];

    if (branchData && typeof branchData === "object") {
      for (const [subKey, subVal] of Object.entries(branchData)) {
        if (subKey.toLowerCase().endsWith("details")) continue;
        const items: string[] = [];
        if (subVal && typeof subVal === "object" && !Array.isArray(subVal)) {
          // nested {item: yes/no} shape
          for (const [iKey, iVal] of Object.entries(subVal as any)) {
            if (iKey.toLowerCase().endsWith("details")) continue;
            if (!isNegative(iVal)) {
              items.push(humanize(iKey));
            }
          }
        } else if (!isNegative(subVal)) {
          items.push(typeof subVal === "string" ? subVal : humanize(subKey));
        }
        if (items.length > 0) {
          hits.push({ title: humanize(subKey), items });
        }
      }
    }

    branchScore = Math.min(hits.length, def.max);
    totalScore += branchScore;
    breakdown[branchKey] = {
      score: branchScore,
      max: def.max,
      subcategoriesHit: hits,
    };
    for (const h of hits) {
      confirmedItems.push(`${capitalize(branchKey)} – ${h.title}: ${h.items.join(", ")}`);
    }
  }

  totalScore = Math.min(totalScore, 28);

  let label: string;
  if (totalScore === 0) label = "No Disclosures";
  else if (totalScore <= 4) label = "Minor Disclosures";
  else if (totalScore <= 10) label = "Caution";
  else if (totalScore <= 18) label = "Concern";
  else label = "High Concern";

  const flagged: string[] = [];
  if (breakdown.personal.score > 0) flagged.push("workplace theft");
  if (breakdown.fraud.score > 0) flagged.push("fraud-related conduct");
  if (breakdown.bribery.score > 0) flagged.push("bribery");
  if (breakdown.organized.score > 0) flagged.push("organized-crime exposure");
  if (breakdown.undetected.score > 0) flagged.push("undetected criminal conduct");
  if (breakdown.drugs.score > 0) flagged.push("illegal drug involvement");

  let reasoning: string;
  if (totalScore === 0) {
    reasoning = "No criminal activity was disclosed by the candidate.";
  } else if (flagged.length === 1) {
    reasoning = `Candidate disclosed past involvement in ${flagged[0]}.`;
  } else {
    const last = flagged.pop();
    reasoning = `Candidate disclosed past involvement in ${flagged.join(", ")}, and ${last}.`;
  }

  return {
    score: totalScore,
    label,
    reasoning,
    confirmedItems,
    breakdown,
  };
}

function humanize(s: string): string {
  return s
    .replace(/([A-Z])/g, " $1")
    .replace(/_/g, " ")
    .trim()
    .split(/\s+/)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
    .join(" ");
}
function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

// ─── Deterministic Employment scoring ───────────────────────────────────
function parseDurationToMonths(text: string): number {
  if (!text) return 0;
  const s = String(text).toLowerCase().trim();
  let months = 0;
  const yr = s.match(/(\d+(?:\.\d+)?)\s*(?:yr|yrs|year|years|y)\b/);
  const mo = s.match(/(\d+(?:\.\d+)?)\s*(?:mo|mos|month|months|m)\b/);
  if (yr) months += parseFloat(yr[1]) * 12;
  if (mo) months += parseFloat(mo[1]);
  if (!yr && !mo) {
    const range = s.match(/(\d{4})\s*[-–to]+\s*(\d{4})/);
    if (range) {
      const diff = (parseInt(range[2]) - parseInt(range[1])) * 12;
      return diff > 0 ? diff : 12;
    }
    const num = parseFloat(s);
    if (!isNaN(num)) months = num * 12;
  }
  return months;
}
function classifyExitReason(reason: string) {
  const r = String(reason || "").toLowerCase();
  if (r.includes("abscond")) return "absconded";
  if (r.includes("dismiss") || r.includes("fired") || r.includes("terminated for")) return "dismissed";
  if (r.includes("contract") && (r.includes("end") || r.includes("complet") || r.includes("expir"))) return "contract_ended";
  return "other";
}
function calculateDeterministicEmploymentProfile(history: any) {
  const histArr = Array.isArray(history) ? history : (history ? [history] : []);
  if (histArr.length === 0) return null;

  const jobs = histArr.map((j: any) => {
    const reason = j.ReasonForLeaving || j.reasonForLeaving || j.Reason || j.reason || "";
    return {
      company: j.Company || j.company || j.Employer || j.employer || "Unknown",
      position: j.Position || j.position || j.Role || j.role || "",
      durationMonths: parseDurationToMonths(j.Duration || j.duration || j.Period || j.period),
      reason,
      exitType: classifyExitReason(reason),
    };
  });

  const totalMonths = jobs.reduce((sum, j) => sum + j.durationMonths, 0);
  const avgMonths = jobs.length ? totalMonths / jobs.length : 0;
  const halfAvg = avgMonths / 2;

  const shortJobs = jobs.filter(
    (j) =>
      j.exitType !== "contract_ended" &&
      j.exitType !== "absconded" &&
      j.exitType !== "dismissed" &&
      j.durationMonths < halfAvg,
  );
  const abscondedCount = jobs.filter((j) => j.exitType === "absconded").length;
  const dismissedCount = jobs.filter((j) => j.exitType === "dismissed").length;

  const shortRatio = shortJobs.length / jobs.length;
  let baseScore = 0;
  if (shortRatio > 0.5) baseScore = 3;
  else if (shortRatio > 0.25) baseScore = 2;
  else if (shortRatio > 0) baseScore = 1;

  const penalty = abscondedCount + dismissedCount;
  const score = Math.min(3, baseScore + penalty);

  const labelMap: Record<number, string> = {
    0: "Stable",
    1: "Fairly Stable",
    2: "Caution",
    3: "Unstable",
  };
  const avgYears = (avgMonths / 12).toFixed(1);
  const halfYears = (halfAvg / 12).toFixed(2);
  const reasoningParts = [
    `Average tenure across ${jobs.length} job${jobs.length === 1 ? "" : "s"}: ${avgYears} years (half-average threshold: ${halfYears} years).`,
    shortJobs.length > 0
      ? `${shortJobs.length} job${shortJobs.length === 1 ? "" : "s"} below half-average (excluding contract completions): ${shortJobs.map((j) => j.company).join(", ")}.`
      : `No jobs below the half-average threshold (excluding contract completions).`,
  ];
  if (abscondedCount > 0) reasoningParts.push(`+${abscondedCount} for absconding.`);
  if (dismissedCount > 0) reasoningParts.push(`+${dismissedCount} for dismissal.`);

  return {
    score,
    label: labelMap[score],
    reasoning: reasoningParts.join(" "),
    jobs: jobs.map(({ exitType, ...rest }) => rest),
    avgMonths,
    hasDisciplinary: penalty > 0,
    disciplinaryDetails: penalty > 0
      ? `${abscondedCount} absconding, ${dismissedCount} dismissal${dismissedCount === 1 ? "" : "s"}`
      : "",
  };
}

// ─── Integrity (from polygraph) ────────────────────────────────────────
function calculateIntegrityFromExam(overallResult: any, examQuestions: any[]) {
  const result = String(overallResult || "").toLowerCase();
  // Per project memory: ANY SR fails; ANY INC is inconclusive
  const findings = (examQuestions || []).map((q) => String(q.finding || "").toUpperCase());
  if (findings.includes("SR") || result === "failed" || result === "di") {
    return {
      score: 1,
      label: "Deception Indicated (DI)",
      reasoning: "Polygraph examination indicated deception (significant response).",
    };
  }
  if (findings.includes("INC") || result === "inconclusive" || result === "inc") {
    return {
      score: 1,
      label: "Inconclusive (INC)",
      reasoning: "Polygraph examination produced inconclusive results.",
    };
  }
  if (result === "passed" || result === "ndi") {
    return {
      score: 0,
      label: "No Deception Indicated (NDI)",
      reasoning: "Polygraph examination indicated no deception.",
    };
  }
  return {
    score: 0,
    label: "Pending",
    reasoning: "Polygraph examination outcome not yet recorded.",
  };
}

function getRiskLevelFromTotal(total: number): "LOW" | "MEDIUM" | "HIGH" | "VERY HIGH" {
  if (total >= 31) return "VERY HIGH";
  if (total >= 18) return "HIGH";
  if (total >= 8) return "MEDIUM";
  return "LOW";
}
