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

  return lines.join("\n") || "No questionnaire data available.";
}
