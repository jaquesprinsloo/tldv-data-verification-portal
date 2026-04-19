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
    const { application_id } = await req.json();
    if (!application_id) {
      return new Response(JSON.stringify({ error: "application_id required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Get the application
    const { data: app, error: appErr } = await supabase
      .from("candex_applications")
      .select("*, candex_invitations(template_id)")
      .eq("id", application_id)
      .single();

    if (appErr || !app) {
      return new Response(JSON.stringify({ error: "Application not found" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const answers = app.answers as any;
    if (!answers?.questionnaire) {
      return new Response(JSON.stringify({ error: "No questionnaire data" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Get template sections and tables for context
    const templateId = app.template_id;
    let sectionsData: any[] = [];
    let tablesData: any[] = [];

    if (templateId) {
      const [secRes, tblRes] = await Promise.all([
        supabase
          .from("candex_template_sections")
          .select("*")
          .eq("template_id", templateId)
          .order("sort_order"),
        supabase.from("candex_section_tables").select("*").order("sort_order"),
      ]);
      sectionsData = secRes.data || [];
      const sectionIds = new Set(sectionsData.map((s: any) => s.id));
      tablesData = (tblRes.data || []).filter((t: any) => sectionIds.has(t.section_id));
    }

    // Build structured questionnaire text for AI analysis
    const questionnaireText = buildQuestionnaireText(
      answers.questionnaire,
      sectionsData,
      tablesData
    );

    const personalDetails = answers.personalDetails || {};

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) {
      return new Response(JSON.stringify({ error: "AI key not configured" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const systemPrompt = `You are a pre-employment risk analyst. Analyze a candidate's PreAppliCheck questionnaire and produce a structured risk profile.

You MUST return a JSON object using this exact tool call. Analyze the questionnaire responses across these 5 categories:

1. EMPLOYMENT (0-3 points):
   - 0: Stable (avg tenure 3+ years, no disciplinary issues)
   - 1: Fairly Stable (avg tenure 2-3 years)
   - 2: Caution (avg tenure 1-2 years or disciplinary mentions)
   - 3: Unstable (avg tenure <1 year, frequent job changes, dismissals)

2. FINANCIAL PRESSURE (0-3 points):
   - 0: No monthly accounts or debts mentioned
   - 1: Has active accounts but paid up to date
   - 2: Active accounts AND historical debt/arrears
   - 3: Active accounts, historical debt, AND blacklisted/judgments

3. LEGAL ENCOUNTERS (0-5 points, additive):
   - +1 for personal arrest history
   - +1 for bribe involvement
   - +1 for conviction history
   - +1 for pending cases
   - +1 for family/friend criminal associations

4. CRIMINAL ACTIVITY (subcategory-based, computed deterministically — DO NOT score this yourself):
   - The system scores +1 per subcategory branch with at least one "Yes" disclosure across:
     Personal (max 4), Fraud (max 6), Bribery (max 3), Organized Crimes (max 4), Undetected Crimes (max 6), Illegal Drug Involvement (max 5).
   - Your job: just acknowledge what the candidate disclosed in the keyFindings.

5. INTEGRITY (0-1 points, computed deterministically from polygraph):
   - Until a polygraph examination is linked, integrity is "Pending" (0).

Risk Tiers: LOW (0-7), MEDIUM (8-17), HIGH (18-30), VERY HIGH (31+)

SUMMARY GUIDELINES (critical):
- NEVER recommend "employ" or "do not employ". Instead, write an OBJECTIVE summary that proposes "considerations for employment" — practical risk-management measures (e.g. supervision, role restrictions, follow-up checks, support programs) tailored to the disclosures.
- Look at the candidate's TIMELINE: distinguish recent disclosures from distant past. If a theft, drug use, or other issue occurred only at their first/early job many years ago and not since, note this as a mitigating factor suggesting learned behaviour change.
- For drug use, distinguish "lifetime" from "past 2 years" — if no past-2-year use, note that recent abstinence is a mitigating factor.
- Highlight mitigating factors (single isolated incident, long time since, no recent recurrence, contained to one employer) wherever supported by the data.
- Filter out negative responses ("no", "none", "nil", "never", "not disclosed") — only flag actual positive disclosures.`;

    const userPrompt = `Candidate: ${app.candidate_name}
ID Number: ${app.candidate_id_number || "Not provided"}

QUESTIONNAIRE RESPONSES:
${questionnaireText}`;

    const aiResponse = await fetch(
      "https://ai.gateway.lovable.dev/v1/chat/completions",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${LOVABLE_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "google/gemini-2.5-flash",
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
                            required: ["company", "position", "durationMonths", "reason"],
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
        }),
      }
    );

    if (!aiResponse.ok) {
      const errText = await aiResponse.text();
      console.error("AI gateway error:", aiResponse.status, errText);
      if (aiResponse.status === 429) {
        return new Response(JSON.stringify({ error: "Rate limited, please try again later" }), {
          status: 429,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
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
      return new Response(JSON.stringify({ error: "AI did not return structured data" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const riskProfile = JSON.parse(toolCall.function.arguments);

    const deterministicCriminal = calculateDeterministicCriminalProfile(answers?.questionnaire?.questions || {});
    riskProfile.criminal = deterministicCriminal;

    const deterministicEmployment = calculateDeterministicEmploymentProfile(
      answers?.questionnaire?.tables || {},
      tablesData
    );
    if (deterministicEmployment) {
      riskProfile.employment = {
        ...(riskProfile.employment || {}),
        ...deterministicEmployment,
      };
    }

    // Integrity is determined ONLY by polygraph results (NDI/DI/INC).
    // Until a polygraph report is linked to this candidate, integrity is "Pending".
    let polygraphReport: any = null;
    if (app.candidate_id_number) {
      const { data: polyRows } = await supabase
        .from("polygraph_reports")
        .select("id, overall_result, status")
        .eq("id_number", app.candidate_id_number)
        .order("examination_date", { ascending: false })
        .limit(1);
      polygraphReport = polyRows?.[0] || null;
    }
    riskProfile.integrity = calculateIntegrityFromPolygraph(polygraphReport);

    riskProfile.totalScore =
      Number(riskProfile?.employment?.score || 0) +
      Number(riskProfile?.financial?.score || 0) +
      Number(riskProfile?.legal?.score || 0) +
      Number(deterministicCriminal?.score || 0) +
      Number(riskProfile?.integrity?.score || 0);
    riskProfile.riskLevel = getRiskLevelFromTotal(riskProfile.totalScore);

    const criminalFinding = deterministicCriminal.score > 0
      ? `${deterministicCriminal.score} confirmed criminal activity disclosure${deterministicCriminal.score === 1 ? "" : "s"}`
      : "No confirmed criminal activity disclosures";
    riskProfile.keyFindings = Array.from(new Set([
      ...((riskProfile.keyFindings || []) as string[]).filter((finding: string) => !/no criminal activity|criminal activity disclosure/i.test(finding)),
      criminalFinding,
    ]));

    if (deterministicCriminal.score > 0) {
      riskProfile.summary = `The questionnaire indicates ${deterministicCriminal.score} confirmed criminal activity disclosure${deterministicCriminal.score === 1 ? "" : "s"}, contributing directly to the overall pre-risk alert level.`;
    }

    // Update the application with risk data
    const updatedAnswers = {
      ...answers,
      preRiskProfile: riskProfile,
    };

    const { error: updateErr } = await supabase
      .from("candex_applications")
      .update({
        risk_score: riskProfile.totalScore,
        risk_level: riskProfile.riskLevel,
        answers: updatedAnswers,
        updated_at: new Date().toISOString(),
      })
      .eq("id", application_id);

    if (updateErr) {
      console.error("Update error:", updateErr);
      return new Response(JSON.stringify({ error: "Failed to save risk profile" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ success: true, riskProfile }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("Error:", err);
    return new Response(
      JSON.stringify({ error: err instanceof Error ? err.message : "Unknown error" }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});

function buildQuestionnaireText(
  questionnaire: any,
  sections: any[],
  tables: any[]
): string {
  const lines: string[] = [];
  const tableAnswers = questionnaire?.tables || {};
  const questionAnswers = questionnaire?.questions || {};

  for (const section of sections) {
    lines.push(`\n=== SECTION: ${section.title} ===`);
    const sectionTables = tables.filter(
      (t: any) => t.section_id === section.id
    );

    for (const table of sectionTables) {
      lines.push(`\n--- ${table.table_title} ---`);
      const entries = tableAnswers[table.id] || [[]];
      const rowLabels = table.row_labels || [];

      for (let entryIdx = 0; entryIdx < entries.length; entryIdx++) {
        if (entries.length > 1) lines.push(`  Entry ${entryIdx + 1}:`);
        const entry = entries[entryIdx] || [];

        for (let rowIdx = 0; rowIdx < rowLabels.length; rowIdx++) {
          const label = rowLabels[rowIdx];
          const values = entry[rowIdx] || [];
          const displayValue =
            Array.isArray(values) ? values.filter(Boolean).join(", ") : values;
          if (displayValue) {
            lines.push(`  ${label}: ${displayValue}`);
          }

          // Check for detail fields
          const detail =
            questionAnswers[`detail_${table.id}_${entryIdx}_${rowIdx}`];
          if (detail) {
            lines.push(`    Details: ${detail}`);
          }

          // Check for dynamic/employer reference data
          const dynamicData =
            questionAnswers[`dynamic_${table.id}_${entryIdx}_${rowIdx}_0`];
          if (dynamicData && Array.isArray(dynamicData)) {
            for (const item of dynamicData) {
              lines.push(
                `    - ${item.name || "Unknown"}${item.details ? `: ${item.details}` : ""}`
              );
            }
          }
        }
      }
    }
  }

  // Append specialized criminal-activity data structures the candidate UI stores
  // under composite keys inside questionnaire.questions (NOT as table rows).
  // Without this, fraud / bribery / organized / undetected / drugs / theft-at-work
  // confirmations are invisible to the AI and Criminal Activity scores 0/30.
  const specializedPrefixes: { prefix: string; label: string }[] = [
    { prefix: "fraud_", label: "FRAUD DISCLOSURES" },
    { prefix: "bribery_", label: "BRIBERY DISCLOSURES" },
    { prefix: "organized_crimes_", label: "ORGANIZED CRIME DISCLOSURES" },
    { prefix: "undetected_crimes_", label: "UNDETECTED CRIME DISCLOSURES" },
    { prefix: "illegal_drugs_", label: "ILLEGAL DRUG INVOLVEMENT" },
    { prefix: "theft_at_work_", label: "THEFT AT WORK DISCLOSURES" },
  ];

  const isNegativeAnswer = (val: any): boolean => {
    if (val === null || val === undefined || val === "" || val === false) return true;
    if (typeof val !== "string") return false;
    const v = val.trim().toLowerCase();
    if (!v) return true;
    return (
      v === "no" ||
      v === "none" ||
      v === "nil" ||
      v === "never" ||
      v === "n/a" ||
      v === "not applicable" ||
      v === "not disclosed" ||
      v.startsWith("has never") ||
      v.startsWith("never ") ||
      v.includes("no involvement") ||
      v.includes("not involved")
    );
  };

  const flattenObject = (obj: any, path: string[] = []): { key: string; value: string }[] => {
    const out: { key: string; value: string }[] = [];
    if (obj === null || obj === undefined) return out;
    if (typeof obj !== "object") {
      if (!isNegativeAnswer(obj)) {
        out.push({ key: path.join("."), value: String(obj) });
      }
      return out;
    }
    if (Array.isArray(obj)) {
      const filtered = obj.filter((v) => !isNegativeAnswer(v));
      if (filtered.length > 0) {
        out.push({ key: path.join("."), value: filtered.map((v) => (typeof v === "object" ? JSON.stringify(v) : String(v))).join(", ") });
      }
      return out;
    }
    for (const [k, v] of Object.entries(obj)) {
      out.push(...flattenObject(v, [...path, k]));
    }
    return out;
  };

  for (const { prefix, label } of specializedPrefixes) {
    const matchingKeys = Object.keys(questionAnswers).filter((k) => k.startsWith(prefix));
    if (matchingKeys.length === 0) continue;

    const sectionLines: string[] = [];
    for (const key of matchingKeys) {
      const data = questionAnswers[key];
      const flat = flattenObject(data);
      if (flat.length === 0) continue;
      for (const { key: fieldKey, value } of flat) {
        sectionLines.push(`  ${fieldKey}: ${value}`);
      }
    }
    if (sectionLines.length > 0) {
      lines.push(`\n=== ${label} (CONFIRMED ITEMS) ===`);
      lines.push(...sectionLines);
    }
  }

  return lines.join("\n") || "No questionnaire data available.";
}

function humanizeCriminalLabel(value: string): string {
  return value
    .replace(/_details$/i, "")
    .split("_")
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

// Subcategory definitions matching the candidate questionnaire structure.
// Score = +1 per subcategory that has at least one "Yes" answer.
const CRIMINAL_SUBCATEGORIES: Record<string, { prefix: string; label: string; subcats: { key: string; title: string }[]; max: number }> = {
  fraud: {
    prefix: "fraud_",
    label: "Fraud",
    max: 6,
    subcats: [
      { key: "refund_return", title: "Refund & Return" },
      { key: "cash_skimming", title: "Cash Skimming" },
      { key: "asset_misappropriation", title: "Asset Misappropriation" },
      { key: "supplier_delivery", title: "Supplier & Delivery Fraud" },
      { key: "information_misuse", title: "Information/Data Misuse" },
      { key: "personal_information", title: "Personal Information" },
    ],
  },
  bribery: {
    prefix: "bribery_",
    label: "Bribery",
    max: 3,
    subcats: [
      { key: "law_enforcement", title: "Law Enforcement" },
      { key: "work_colleagues", title: "Work Colleagues" },
      { key: "employment", title: "Employment" },
    ],
  },
  organized: {
    prefix: "organized_crimes_",
    label: "Organized Crimes",
    max: 4,
    subcats: [
      { key: "theft_hijacking_robbery", title: "Theft, Hijacking, and Robbery Syndicates" },
      { key: "financial_economic", title: "Financial and Economic" },
      { key: "extortion", title: "Extortion" },
      { key: "drug_trafficking", title: "Drug Trafficking" },
    ],
  },
  undetected: {
    prefix: "undetected_crimes_",
    label: "Undetected Crimes",
    max: 6,
    subcats: [
      { key: "financial_white_collar", title: "Financial & White-Collar Crimes" },
      { key: "corruption_abuse", title: "Corruption & Abuse of Power" },
      { key: "retail_commercial", title: "Retail & Commercial Crimes" },
      { key: "cyber_digital", title: "Cyber & Digital Crimes" },
      { key: "violent_serious", title: "Violent & Serious Crimes" },
      { key: "insurance_claims_fraud", title: "Insurance & Claims Fraud" },
    ],
  },
  drugs: {
    prefix: "illegal_drugs_",
    label: "Illegal Drug Involvement",
    max: 5,
    subcats: [
      { key: "sold_drugs", title: "Sold Drugs" },
      { key: "manufactured_drugs", title: "Manufactured Drugs" },
      { key: "transportation_drugs", title: "Transportation of Drugs" },
      { key: "drug_use_lifetime", title: "Drug use during lifetime" },
      { key: "drug_use_past_2_years", title: "Drug use during the past two (2) years" },
    ],
  },
};

function calculateDeterministicCriminalProfile(questionAnswers: Record<string, any> = {}) {
  const breakdown: Record<string, { score: number; max: number; subcategoriesHit: { title: string; items: string[] }[] }> = {};
  const confirmedItems: string[] = [];
  let totalScore = 0;

  // === PERSONAL (Theft at Work) — max 4 ===
  // +1 each: stolen+benefited (counted as one, "stolen & benefited"),
  // witnessed not reported, helped to steal, approached & accepted.
  const personal = { score: 0, max: 4, subcategoriesHit: [] as { title: string; items: string[] }[] };
  const theftRoot = Object.entries(questionAnswers).find(([k]) => k.startsWith("theft_at_work_"));
  if (theftRoot) {
    const theftData = (theftRoot[1] as Record<string, any>) || {};
    const stolen = String(theftData.stolen || "").toLowerCase().includes("has stolen from work before");
    const benefited = String(theftData.benefited || "").toLowerCase().includes("has benefited from theft at work");
    const helped = String(theftData.helped || "").toLowerCase().includes("has helped someone steal from work");
    const approachedAccepted = String(theftData.approached || "").toLowerCase().includes("accepted to get involved");
    const witnessedUnreported = String(theftData.witnessed || "").toLowerCase().includes("did not report");

    if (stolen && benefited) {
      personal.score += 1;
      personal.subcategoriesHit.push({ title: "Stolen from work & benefited", items: ["Stolen from work and benefited from it"] });
      confirmedItems.push("Personal: stolen from work and benefited");
    } else if (stolen) {
      personal.score += 1;
      personal.subcategoriesHit.push({ title: "Stolen from work", items: ["Stolen from work before"] });
      confirmedItems.push("Personal: stolen from work");
    }
    if (witnessedUnreported) {
      personal.score += 1;
      personal.subcategoriesHit.push({ title: "Witnessed & did not report", items: ["Witnessed theft at work and did not report it"] });
      confirmedItems.push("Personal: witnessed theft at work and did not report");
    }
    if (helped) {
      personal.score += 1;
      personal.subcategoriesHit.push({ title: "Helped to steal", items: ["Helped someone steal from work"] });
      confirmedItems.push("Personal: helped someone steal from work");
    }
    if (approachedAccepted) {
      personal.score += 1;
      personal.subcategoriesHit.push({ title: "Approached & accepted involvement", items: ["Was approached and accepted involvement in theft at work"] });
      confirmedItems.push("Personal: accepted involvement when approached");
    }
  }
  personal.score = Math.min(personal.score, personal.max);
  totalScore += personal.score;
  breakdown.personal = { ...personal };

  // === FRAUD / BRIBERY / ORGANIZED / UNDETECTED / DRUGS ===
  // +1 per subcategory that has ≥1 "Yes". Fields are formatted as `${subcatKey}_${itemKey}`.
  for (const [groupKey, group] of Object.entries(CRIMINAL_SUBCATEGORIES)) {
    const groupBreakdown = { score: 0, max: group.max, subcategoriesHit: [] as { title: string; items: string[] }[] };

    // Collect all root entries with this prefix and merge their data.
    const merged: Record<string, any> = {};
    for (const [rootKey, rootValue] of Object.entries(questionAnswers)) {
      if (!rootKey.startsWith(group.prefix)) continue;
      if (rootKey.endsWith("_dropdown")) continue;
      if (!rootValue || typeof rootValue !== "object" || Array.isArray(rootValue)) continue;
      Object.assign(merged, rootValue);
    }

    for (const subcat of group.subcats) {
      const itemsHit: string[] = [];
      for (const [fieldKey, fieldValue] of Object.entries(merged)) {
        if (fieldKey.endsWith("_details")) continue;
        if (!fieldKey.startsWith(`${subcat.key}_`)) continue;
        if (String(fieldValue || "").trim().toLowerCase() !== "yes") continue;
        const itemLabel = humanizeCriminalLabel(fieldKey.slice(subcat.key.length + 1));
        itemsHit.push(itemLabel);
      }
      if (itemsHit.length > 0) {
        groupBreakdown.score += 1;
        groupBreakdown.subcategoriesHit.push({ title: subcat.title, items: itemsHit });
        confirmedItems.push(`${group.label} – ${subcat.title}: ${itemsHit.join(", ")}`);
      }
    }

    groupBreakdown.score = Math.min(groupBreakdown.score, group.max);
    totalScore += groupBreakdown.score;
    breakdown[groupKey] = groupBreakdown;
  }

  totalScore = Math.min(totalScore, 30);

  const reasoningParts: string[] = [];
  reasoningParts.push(`Personal: ${breakdown.personal.score}/${breakdown.personal.max}`);
  for (const [groupKey, group] of Object.entries(CRIMINAL_SUBCATEGORIES)) {
    reasoningParts.push(`${group.label}: ${breakdown[groupKey].score}/${group.max}`);
  }

  return {
    score: totalScore,
    label: totalScore === 0 ? "No criminal activity disclosed" : `${totalScore} subcategor${totalScore === 1 ? "y" : "ies"} flagged (max 28)`,
    reasoning:
      totalScore === 0
        ? "No confirmed criminal activity disclosures were detected across Personal, Fraud, Bribery, Organized Crimes, Undetected Crimes, or Illegal Drug Involvement."
        : `Subcategory-based scoring (+1 per subcategory with any Yes answer). Breakdown — ${reasoningParts.join(" | ")}.`,
    confirmedItems,
    breakdown,
  };
}

function getRiskLevelFromTotal(total: number): "LOW" | "MEDIUM" | "HIGH" | "VERY HIGH" {
  if (total >= 31) return "VERY HIGH";
  if (total >= 18) return "HIGH";
  if (total >= 8) return "MEDIUM";
  return "LOW";
}

function parseDurationToMonths(text: string): number {
  if (!text) return 0;
  const s = String(text).toLowerCase().trim();
  let months = 0;
  const yrMatch = s.match(/(\d+(?:\.\d+)?)\s*(?:yr|yrs|year|years|y)\b/);
  const moMatch = s.match(/(\d+(?:\.\d+)?)\s*(?:mo|mos|month|months|m)\b/);
  if (yrMatch) months += parseFloat(yrMatch[1]) * 12;
  if (moMatch) months += parseFloat(moMatch[1]);
  if (!yrMatch && !moMatch) {
    const num = parseFloat(s);
    if (!isNaN(num)) months = num * 12;
  }
  return months;
}

function classifyExitReason(reason: string): "absconded" | "dismissed" | "contract_ended" | "other" {
  const r = String(reason || "").toLowerCase();
  if (r.includes("abscond")) return "absconded";
  if (r.includes("dismiss") || r.includes("fired") || r.includes("terminated for")) return "dismissed";
  if (r.includes("contract") && (r.includes("end") || r.includes("complet") || r.includes("expir"))) return "contract_ended";
  return "other";
}

function calculateDeterministicEmploymentProfile(
  tableAnswers: Record<string, any>,
  tables: any[]
) {
  const empTable = tables.find((t: any) => {
    const labels = (t.row_labels || []).map((l: string) => String(l).toLowerCase());
    return labels.some((l: string) => l.includes("employer")) && labels.some((l: string) => l.includes("duration"));
  });
  if (!empTable) return null;

  const labels: string[] = empTable.row_labels || [];
  const employerIdx = labels.findIndex((l) => l.toLowerCase().includes("employer"));
  const durationIdx = labels.findIndex((l) => l.toLowerCase().includes("duration"));
  const positionIdx = labels.findIndex((l) => l.toLowerCase().includes("position"));
  const reasonIdx = labels.findIndex((l) => l.toLowerCase().includes("reason"));

  const entries = tableAnswers[empTable.id] || [];
  const jobs: { company: string; position: string; durationMonths: number; reason: string; exitType: string }[] = [];

  for (const entry of entries) {
    const get = (i: number) => {
      if (i < 0) return "";
      const cell = entry?.[i];
      if (Array.isArray(cell)) return cell.filter(Boolean).join(" ");
      return String(cell || "");
    };
    const company = get(employerIdx).trim();
    if (!company) continue;
    jobs.push({
      company,
      position: get(positionIdx).trim(),
      durationMonths: parseDurationToMonths(get(durationIdx)),
      reason: get(reasonIdx).trim(),
      exitType: classifyExitReason(get(reasonIdx)),
    });
  }

  if (jobs.length === 0) return null;

  const totalMonths = jobs.reduce((sum, j) => sum + j.durationMonths, 0);
  const avgMonths = totalMonths / jobs.length;
  const halfAvg = avgMonths / 2;

  // Exclude contract completions AND absconded/dismissed jobs (the latter are
  // already penalized via the +1 reason flag — avoid double-counting).
  const shortJobs = jobs.filter(
    (j) =>
      j.exitType !== "contract_ended" &&
      j.exitType !== "absconded" &&
      j.exitType !== "dismissed" &&
      j.durationMonths < halfAvg
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
    disciplinaryDetails:
      penalty > 0
        ? `${abscondedCount} absconding, ${dismissedCount} dismissal${dismissedCount === 1 ? "" : "s"}`
        : "",
  };
}

function calculateIntegrityFromPolygraph(report: any) {
  if (!report) {
    return {
      score: 0,
      label: "Pending Polygraph",
      reasoning: "Integrity cannot be assessed until a polygraph examination has been conducted and linked to this candidate.",
      pending: true,
    };
  }
  const result = String(report.overall_result || "").toUpperCase();
  if (result === "NDI" || result === "NO DECEPTION INDICATED") {
    return {
      score: 0,
      label: "No Deception Indicated (NDI)",
      reasoning: "Polygraph examination indicated no deception.",
      pending: false,
    };
  }
  if (result === "DI" || result === "DECEPTION INDICATED") {
    return {
      score: 1,
      label: "Deception Indicated (DI)",
      reasoning: "Polygraph examination indicated deception on one or more relevant questions.",
      pending: false,
    };
  }
  if (result === "INC" || result === "INCONCLUSIVE") {
    return {
      score: 1,
      label: "Inconclusive (INC)",
      reasoning: "Polygraph examination produced an inconclusive result and warrants follow-up.",
      pending: false,
    };
  }
  return {
    score: 0,
    label: "Pending Polygraph",
    reasoning: "A polygraph report exists but has no recorded overall result yet.",
    pending: true,
  };
}
