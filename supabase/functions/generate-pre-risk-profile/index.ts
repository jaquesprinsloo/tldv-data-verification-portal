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

4. CRIMINAL ACTIVITY (count confirmed YES answers):
   - Count every distinct "yes" to questions about theft, fraud, bribery, organized crime, undetected crimes, illegal drugs, etc.
   - Each confirmed "yes" = 1 point

5. INTEGRITY (0-1 points):
   - 0: No integrity concerns from questionnaire
   - 1: Contradictory answers, evasive responses, or disclosed integrity issues

Risk Tiers: LOW (0-7), MEDIUM (8-17), HIGH (18-30), VERY HIGH (31+)

Analyze the data carefully. Filter out negative responses ("no", "none", "nil", "never", "not disclosed") — only flag actual positive disclosures.`;

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

function collectConfirmedCriminalItems(questionAnswers: Record<string, any> = {}): string[] {
  const items: string[] = [];
  const prefixes = ["fraud_", "bribery_", "organized_crimes_", "undetected_crimes_", "illegal_drugs_", "theft_at_work_"];

  for (const [rootKey, rootValue] of Object.entries(questionAnswers)) {
    const prefix = prefixes.find((candidate) => rootKey.startsWith(candidate));
    if (!prefix || rootKey.endsWith("_dropdown")) continue;

    if (prefix === "theft_at_work_") {
      const theftData = rootValue as Record<string, any>;
      if (!theftData || typeof theftData !== "object" || Array.isArray(theftData)) continue;

      if (String(theftData.stolen || "").toLowerCase().includes("has stolen from work before")) items.push("Stolen from work before");
      if (String(theftData.benefited || "").toLowerCase().includes("has benefited from theft at work")) items.push("Benefited from theft at work");
      if (String(theftData.helped || "").toLowerCase().includes("has helped someone steal from work")) items.push("Helped someone steal from work");
      if (String(theftData.approached || "").toLowerCase().includes("accepted to get involved")) items.push("Accepted involvement in theft at work");
      if (String(theftData.witnessed || "").toLowerCase().includes("did not report")) items.push("Witnessed theft at work and did not report it");
      continue;
    }

    if (!rootValue || typeof rootValue !== "object" || Array.isArray(rootValue)) continue;

    for (const [fieldKey, fieldValue] of Object.entries(rootValue)) {
      if (fieldKey.endsWith("_details")) continue;
      if (String(fieldValue || "").trim().toLowerCase() !== "yes") continue;
      items.push(humanizeCriminalLabel(fieldKey));
    }
  }

  return Array.from(new Set(items));
}

function calculateDeterministicCriminalProfile(questionAnswers: Record<string, any> = {}) {
  const confirmedItems = collectConfirmedCriminalItems(questionAnswers);
  const actualCount = confirmedItems.length;
  const score = Math.min(actualCount, 30);

  return {
    score,
    label: score === 0 ? "No criminal activity disclosed" : `${actualCount} confirmed disclosure${actualCount === 1 ? "" : "s"}`,
    reasoning:
      score === 0
        ? "No confirmed criminal activity disclosures were detected in the saved questionnaire answers."
        : `The criminal activity score was calculated directly from ${actualCount} confirmed questionnaire disclosure${actualCount === 1 ? "" : "s"}.`,
    confirmedItems,
  };
}

function getRiskLevelFromTotal(total: number): "LOW" | "MEDIUM" | "HIGH" | "VERY HIGH" {
  if (total >= 31) return "VERY HIGH";
  if (total >= 18) return "HIGH";
  if (total >= 8) return "MEDIUM";
  return "LOW";
}
