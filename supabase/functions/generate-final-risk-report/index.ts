// Generate the combined "Final Risk Report" for a PreAppliCheck candidate.
// Combines:
//   1. PreAppliCheck pre-risk profile (application.answers.preRiskProfile)
//   2. Risk-assessment check results (candex_risk_request_candidates)
//   3. Polygraph risk profile (polygraph_reports.risk_analysis)
// Stores result at candex_applications.answers.finalRiskReport.
//
// Triggered automatically when a polygraph report is approved and matched
// to an application in PendingPolygraphReview.

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const AI_URL = "https://ai.gateway.lovable.dev/v1/chat/completions";

function tierFromScore(total: number): "LOW" | "MEDIUM" | "HIGH" | "VERY HIGH" {
  if (total >= 31) return "VERY HIGH";
  if (total >= 18) return "HIGH";
  if (total >= 8) return "MEDIUM";
  return "LOW";
}

function maxTier(
  ...tiers: (string | null | undefined)[]
): "LOW" | "MEDIUM" | "HIGH" | "VERY HIGH" {
  const order = ["LOW", "MEDIUM", "HIGH", "VERY HIGH"];
  let best = 0;
  for (const t of tiers) {
    if (!t) continue;
    const idx = order.indexOf(String(t).toUpperCase());
    if (idx > best) best = idx;
  }
  return order[best] as any;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { application_id, polygraph_report_id } = await req.json();
    if (!application_id) {
      return new Response(
        JSON.stringify({ error: "application_id required" }),
        {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) {
      return new Response(JSON.stringify({ error: "AI key not configured" }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // 1. Load the candex application
    const { data: app, error: appErr } = await supabase
      .from("candex_applications")
      .select(
        "id, candidate_name, candidate_id_number, answers, risk_level, risk_score",
      )
      .eq("id", application_id)
      .single();

    if (appErr || !app) {
      console.error("Application not found:", appErr);
      return new Response(
        JSON.stringify({ error: "Application not found" }),
        {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    const answers: any = (app as any).answers || {};
    const preRisk = answers.preRiskProfile || null;

    // 2. Risk-assessment check results for this application
    const { data: riskCandidates } = await supabase
      .from("candex_risk_request_candidates")
      .select("*")
      .eq("application_id", application_id);

    // 3. Polygraph report (passed in, otherwise look up by ID number)
    let polyReport: any = null;
    if (polygraph_report_id) {
      const { data } = await supabase
        .from("polygraph_reports")
        .select(
          "id, overall_result, risk_level, risk_score, risk_analysis, examination_date",
        )
        .eq("id", polygraph_report_id)
        .maybeSingle();
      polyReport = data;
    } else if (app.candidate_id_number) {
      const { data } = await supabase
        .from("polygraph_reports")
        .select(
          "id, overall_result, risk_level, risk_score, risk_analysis, examination_date",
        )
        .eq("id_number", app.candidate_id_number)
        .order("created_at", { ascending: false })
        .limit(1);
      polyReport = data?.[0] || null;
    }

    // Compose AI dossier
    const dossierParts: string[] = [];
    dossierParts.push(`CANDIDATE: ${app.candidate_name || "Unknown"}`);
    if (app.candidate_id_number)
      dossierParts.push(`ID NUMBER: ${app.candidate_id_number}`);

    if (preRisk) {
      dossierParts.push("\n=== PREAPPLICHECK PRE-RISK PROFILE ===");
      dossierParts.push(
        `Risk level: ${preRisk.riskLevel || "N/A"} (score ${preRisk.totalScore ?? "N/A"})`,
      );
      if (preRisk.summary) dossierParts.push(`Summary: ${preRisk.summary}`);
      if (Array.isArray(preRisk.keyFindings) && preRisk.keyFindings.length) {
        dossierParts.push(
          `Key findings: ${preRisk.keyFindings.join("; ")}`,
        );
      }
    } else {
      dossierParts.push("\n=== PREAPPLICHECK PRE-RISK PROFILE ===\n(none)");
    }

    if (riskCandidates && riskCandidates.length) {
      dossierParts.push("\n=== RISK ASSESSMENT CHECK RESULTS ===");
      for (const rc of riskCandidates as any[]) {
        const summary = [
          rc.id_verification_status &&
            `ID: ${rc.id_verification_status}`,
          rc.precrim_status && `PreCrim: ${rc.precrim_status}`,
          rc.credit_status && `Credit: ${rc.credit_status}`,
          rc.qualification_status &&
            `Qualifications: ${rc.qualification_status}`,
          rc.employment_status &&
            `Employment: ${rc.employment_status}`,
          rc.directorship_status &&
            `Directorship: ${rc.directorship_status}`,
        ]
          .filter(Boolean)
          .join(" | ");
        if (summary) dossierParts.push(`- ${summary}`);
        if (rc.notes) dossierParts.push(`  Notes: ${rc.notes}`);
      }
    } else {
      dossierParts.push(
        "\n=== RISK ASSESSMENT CHECK RESULTS ===\n(none requested or completed)",
      );
    }

    if (polyReport) {
      const ra = polyReport.risk_analysis || {};
      dossierParts.push("\n=== POLYGRAPH EXAMINATION ===");
      dossierParts.push(
        `Outcome: ${polyReport.overall_result || "N/A"} | Examiner risk: ${polyReport.risk_level || "N/A"} (score ${polyReport.risk_score ?? "N/A"})`,
      );
      if (ra.summary) dossierParts.push(`Summary: ${ra.summary}`);
      if (Array.isArray(ra.keyFindings) && ra.keyFindings.length) {
        dossierParts.push(`Key findings: ${ra.keyFindings.join("; ")}`);
      }
      const cats = ["criminal", "financial", "legal", "employment", "integrity"];
      for (const c of cats) {
        const cat = ra[c];
        if (cat?.label || cat?.reasoning) {
          dossierParts.push(
            `- ${c.toUpperCase()}: ${cat.label || ""}${cat.score != null ? ` (${cat.score})` : ""} — ${cat.reasoning || ""}`,
          );
        }
      }
    } else {
      dossierParts.push("\n=== POLYGRAPH EXAMINATION ===\n(no report)");
    }

    // Deterministic per-category deviation analysis between the
    // PreAppliCheck pre-risk profile and the polygraph risk profile.
    // The candidate answers the SAME questions in both — the polygraph
    // is conducted in person after the online application — so any
    // delta between the two profiles is a meaningful signal.
    const polyAnalysis = polyReport?.risk_analysis || null;
    const deviationCategories = [
      { key: "employment", label: "Employment History" },
      { key: "financial", label: "Financial Pressure" },
      { key: "legal", label: "Legal Encounters" },
      { key: "criminal", label: "Criminal Activity" },
      { key: "integrity", label: "Integrity" },
    ];
    const deterministicDeviations: Array<{
      category: string;
      label: string;
      preScore: number | null;
      polygraphScore: number | null;
      delta: number | null;
      direction: "higher_in_polygraph" | "lower_in_polygraph" | "same" | "unknown";
      preLabel: string | null;
      polygraphLabel: string | null;
    }> = [];
    if (preRisk && polyAnalysis) {
      for (const { key, label } of deviationCategories) {
        const pre = preRisk[key] || {};
        const pol = polyAnalysis[key] || {};
        const preScore = typeof pre.score === "number" ? pre.score : null;
        const polScore = typeof pol.score === "number" ? pol.score : null;
        let direction: any = "unknown";
        let delta: number | null = null;
        if (preScore != null && polScore != null) {
          delta = polScore - preScore;
          if (delta > 0) direction = "higher_in_polygraph";
          else if (delta < 0) direction = "lower_in_polygraph";
          else direction = "same";
        }
        deterministicDeviations.push({
          category: key,
          label,
          preScore,
          polygraphScore: polScore,
          delta,
          direction,
          preLabel: pre.label || null,
          polygraphLabel: pol.label || null,
        });
      }

      dossierParts.push("\n=== DETERMINISTIC PRE-RISK vs POLYGRAPH DEVIATIONS ===");
      for (const d of deterministicDeviations) {
        dossierParts.push(
          `- ${d.label}: pre-risk score ${d.preScore ?? "N/A"} (${d.preLabel || "N/A"}) vs polygraph score ${d.polygraphScore ?? "N/A"} (${d.polygraphLabel || "N/A"}) — Δ ${d.delta ?? "N/A"} (${d.direction})`,
        );
      }
    }

    const dossier = dossierParts.join("\n");

    // Compute baseline final risk tier deterministically (max of inputs).
    const baselineTier = maxTier(
      preRisk?.riskLevel,
      polyReport?.risk_level,
    );

    const systemPrompt =
      "You are a senior pre-employment risk analyst. Combine the PreAppliCheck pre-risk profile, the risk-assessment check results, and the polygraph examination findings into a single executive Final Risk Report. The PreAppliCheck questionnaire and the in-person polygraph cover the SAME questions — the only difference is medium (online vs in-person under polygraph). Treat any disclosure made in the polygraph but NOT in the pre-risk profile as a material deviation worth flagging. Be concise, factual, decision-oriented, and return JSON via the required tool ONLY.";

    const userPrompt = `Combine the following dossier into a single Final Risk Report.\n\nDOSSIER:\n${dossier}\n\nGuidance:\n- Final risk level must be at least: ${baselineTier} (you may escalate but not lower).\n- 'summary' = 3-6 sentence executive summary covering candidate background, check results, and polygraph outcome.\n- 'findings' = bullet list (5-10) of the most material findings across all sources.\n- 'deviations' = list every meaningful difference between the pre-risk (online application) profile and the polygraph (in-person) profile. For each, give: category, what changed, and why it matters (e.g. \"disclosed in polygraph but omitted in application\", \"score increased by N\", \"new admission of X\"). If no deviations, return [].\n- 'recommendation' = 1-3 sentences. Use one of: PROCEED, PROCEED WITH CAUTION, DECLINE. Justify briefly, calling out polygraph deviations if they affect the decision.`;

    const aiResp = await fetch(AI_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-pro",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
        tools: [
          {
            type: "function",
            function: {
              name: "submit_final_risk_report",
              description: "Submit the combined final risk report.",
              parameters: {
                type: "object",
                properties: {
                  riskLevel: {
                    type: "string",
                    enum: ["LOW", "MEDIUM", "HIGH", "VERY HIGH"],
                  },
                  summary: { type: "string" },
                  findings: {
                    type: "array",
                    items: { type: "string" },
                  },
                  deviations: {
                    type: "array",
                    items: {
                      type: "object",
                      properties: {
                        category: { type: "string" },
                        change: { type: "string" },
                        impact: { type: "string" },
                      },
                      required: ["category", "change", "impact"],
                      additionalProperties: false,
                    },
                  },
                  recommendation: { type: "string" },
                },
                required: ["riskLevel", "summary", "findings", "deviations", "recommendation"],
                additionalProperties: false,
              },
            },
          },
        ],
        tool_choice: {
          type: "function",
          function: { name: "submit_final_risk_report" },
        },
      }),
    });

    if (!aiResp.ok) {
      const txt = await aiResp.text();
      console.error("AI gateway error:", aiResp.status, txt);
      return new Response(
        JSON.stringify({ error: `AI gateway ${aiResp.status}` }),
        {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    const aiJson = await aiResp.json();
    const toolCall = aiJson?.choices?.[0]?.message?.tool_calls?.[0];
    if (!toolCall?.function?.arguments) {
      console.error("No tool call in AI response:", JSON.stringify(aiJson));
      return new Response(
        JSON.stringify({ error: "No structured response from AI" }),
        {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    let parsed: any;
    try {
      parsed = JSON.parse(toolCall.function.arguments);
    } catch (e) {
      console.error("Bad JSON from AI:", e);
      return new Response(JSON.stringify({ error: "Bad AI JSON" }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Enforce baseline tier (never lower than the worst input).
    const enforcedTier = maxTier(parsed.riskLevel, baselineTier);

    const finalRiskReport = {
      riskLevel: enforcedTier,
      summary: String(parsed.summary || "").trim(),
      findings: Array.isArray(parsed.findings) ? parsed.findings : [],
      deviations: Array.isArray(parsed.deviations) ? parsed.deviations : [],
      categoryDeviations: deterministicDeviations,
      recommendation: String(parsed.recommendation || "").trim(),
      generatedAt: new Date().toISOString(),
      sources: {
        preRiskProfile: !!preRisk,
        riskAssessmentChecks: (riskCandidates?.length || 0) > 0,
        polygraphReportId: polyReport?.id || null,
      },
    };

    const newAnswers = { ...answers, finalRiskReport };

    const { error: updErr } = await supabase
      .from("candex_applications")
      .update({
        answers: newAnswers,
        updated_at: new Date().toISOString(),
      })
      .eq("id", application_id);

    if (updErr) {
      console.error("Failed to save final risk report:", updErr);
      return new Response(
        JSON.stringify({ error: "Failed to save final risk report" }),
        {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    return new Response(
      JSON.stringify({ success: true, finalRiskReport }),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  } catch (e) {
    console.error("generate-final-risk-report error:", e);
    return new Response(
      JSON.stringify({
        error: e instanceof Error ? e.message : "Unknown error",
      }),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  }
});