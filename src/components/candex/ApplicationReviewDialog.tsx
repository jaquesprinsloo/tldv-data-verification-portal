import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Separator } from "@/components/ui/separator";
import { Check, X, Shield, FileText, User, Smartphone, ClipboardList, AlertTriangle, Loader2, Fingerprint, Briefcase, DollarSign, Scale, Activity, ShieldCheck, ExternalLink, Brain, Sparkles } from "lucide-react";
import { format } from "date-fns";
import QuestionnaireScreen from "@/components/candex-application/QuestionnaireScreen";
import { CalculationInfoPopover } from "@/components/reports/CalculationInfoPopover";
import { SpeakButton } from "@/components/shared/SpeakButton";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { RISK_CHECKS, RiskCheckKey, RiskCheckResult, RiskCheckStatusBadge } from "./riskCheckTypes";

interface ApplicationReviewDialogProps {
  application: any;
  open: boolean;
  onClose: () => void;
  onApprove: (id: string) => void;
  onReject: (id: string) => void;
  readOnly?: boolean;
}

const CRIMINAL_SPECIAL_PREFIXES = ["fraud_", "bribery_", "organized_crimes_", "undetected_crimes_", "illegal_drugs_", "theft_at_work_"];

const humanizeCriminalLabel = (value: string) =>
  value
    .replace(/_details$/i, "")
    .split("_")
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");

const collectConfirmedCriminalItems = (questionAnswers: Record<string, any> = {}) => {
  const items: string[] = [];

  for (const [rootKey, rootValue] of Object.entries(questionAnswers)) {
    const prefix = CRIMINAL_SPECIAL_PREFIXES.find((candidate) => rootKey.startsWith(candidate));
    if (!prefix || rootKey.endsWith("_dropdown")) continue;

    if (prefix === "theft_at_work_") {
      const theftData = rootValue as Record<string, any>;
      if (!theftData || typeof theftData !== "object" || Array.isArray(theftData)) continue;

      if (String(theftData.stolen || "").toLowerCase().includes("has stolen from work before")) {
        items.push("Stolen from work before");
      }
      if (String(theftData.benefited || "").toLowerCase().includes("has benefited from theft at work")) {
        items.push("Benefited from theft at work");
      }
      if (String(theftData.helped || "").toLowerCase().includes("has helped someone steal from work")) {
        items.push("Helped someone steal from work");
      }
      if (String(theftData.approached || "").toLowerCase().includes("accepted to get involved")) {
        items.push("Accepted involvement in theft at work");
      }
      if (String(theftData.witnessed || "").toLowerCase().includes("did not report")) {
        items.push("Witnessed theft at work and did not report it");
      }
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
};

const buildDeterministicCriminalProfile = (questionAnswers: Record<string, any> = {}) => {
  const confirmedItems = collectConfirmedCriminalItems(questionAnswers);
  const actualCount = confirmedItems.length;
  const score = Math.min(actualCount, 30);

  if (score === 0) {
    return {
      score: 0,
      label: "No criminal activity disclosed",
      reasoning: "No confirmed criminal activity disclosures were detected in the saved questionnaire answers.",
      confirmedItems: [],
    };
  }

  return {
    score,
    label: `${actualCount} confirmed disclosure${actualCount === 1 ? "" : "s"}`,
    reasoning: `The saved questionnaire answers contain ${actualCount} confirmed criminal activity disclosure${actualCount === 1 ? "" : "s"}. The criminal activity score is calculated directly from those confirmed responses.`,
    confirmedItems,
  };
};

const getRiskLevelFromTotal = (total: number) => {
  if (total >= 31) return "VERY HIGH";
  if (total >= 18) return "HIGH";
  if (total >= 8) return "MEDIUM";
  return "LOW";
};

const resolvePreRiskProfile = (profile: any, questionAnswers: Record<string, any> = {}) => {
  if (!profile) return null;

  const inferredCriminal = buildDeterministicCriminalProfile(questionAnswers);
  const storedCriminalScore = Number(profile?.criminal?.score || 0);

  if (storedCriminalScore > 0 || inferredCriminal.score === 0) {
    return profile;
  }

  const nonCriminalTotal =
    Number(profile?.employment?.score || 0) +
    Number(profile?.financial?.score || 0) +
    Number(profile?.legal?.score || 0) +
    Number(profile?.integrity?.score || 0);

  const totalScore = nonCriminalTotal + inferredCriminal.score;

  return {
    ...profile,
    criminal: inferredCriminal,
    totalScore,
    riskLevel: getRiskLevelFromTotal(totalScore),
    summary: `Updated from questionnaire answers: ${inferredCriminal.score} confirmed criminal activity disclosure${inferredCriminal.score === 1 ? " was" : "s were"} identified and included in the pre-risk result.`,
    keyFindings: Array.from(new Set([
      ...((profile?.keyFindings || []) as string[]).filter((finding) => !/no criminal activity/i.test(finding)),
      `${inferredCriminal.score} confirmed criminal activity disclosure${inferredCriminal.score === 1 ? "" : "s"}`,
    ])),
  };
};

export default function ApplicationReviewDialog({ application, open, onClose, onApprove, onReject, readOnly }: ApplicationReviewDialogProps) {
  const appAnswers = application?.answers as any;
  const personalDetails = appAnswers?.personalDetails;
  const deviceData = appAnswers?.deviceData;
  const questionnaireTables = appAnswers?.questionnaire?.tables || {};
  const questionnaireQuestions = appAnswers?.questionnaire?.questions || {};
  const popiaAccepted = appAnswers?.popiaAccepted;
  const indemnityAccepted = appAnswers?.indemnityAccepted;
  const preRiskProfile = resolvePreRiskProfile(appAnswers?.preRiskProfile, questionnaireQuestions);

  // Risk assessment data — loaded from candex_risk_request_candidates joined to its parent request.
  const [riskAssessment, setRiskAssessment] = useState<any | null>(null);
  const [riskLoading, setRiskLoading] = useState(false);

  // POPIA / Indemnity document text shown next to the candidate's acceptance.
  const [popiaDocs, setPopiaDocs] = useState<{ popia_text?: string; indemnity_text?: string } | null>(null);

  // Polygraph appointment + report data, loaded when application is opened.
  const [polyAppointment, setPolyAppointment] = useState<any | null>(null);
  const [polyReport, setPolyReport] = useState<any | null>(null);
  const [polyLoading, setPolyLoading] = useState(false);

  const finalRiskReport = appAnswers?.finalRiskReport || null;

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    (async () => {
      const { data, error } = await supabase
        .from("popia_indemnity_settings" as any)
        .select("popia_text, indemnity_text")
        .maybeSingle();
      if (cancelled) return;
      if (error) {
        console.error("[ApplicationReviewDialog] popia/indemnity fetch error", error);
        setPopiaDocs(null);
      } else {
        setPopiaDocs(data as any);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open]);

  useEffect(() => {
    if (!open || !application?.id) {
      setRiskAssessment(null);
      return;
    }
    let cancelled = false;
    (async () => {
      setRiskLoading(true);
      try {
        const { data, error } = await supabase
          .from("candex_risk_request_candidates")
          .select(
            "id, application_id, request_id, id_verified, risk_assessment_result, risk_assessment_url, check_results, created_at, candex_risk_requests(id, status, requested_checks, requested_date, notes, created_at, updated_at)"
          )
          .eq("application_id", application.id)
          .is("deleted_at", null)
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle();
        if (cancelled) return;
        if (error) {
          console.error("[ApplicationReviewDialog] risk assessment fetch error", error);
          setRiskAssessment(null);
        } else {
          setRiskAssessment(data);
        }
      } finally {
        if (!cancelled) setRiskLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open, application?.id]);

  // Load any polygraph appointment + uploaded report linked to this application.
  useEffect(() => {
    if (!open || !application?.id) {
      setPolyAppointment(null);
      setPolyReport(null);
      return;
    }
    let cancelled = false;
    (async () => {
      setPolyLoading(true);
      try {
        const { data: pacRows } = await supabase
          .from("polygraph_appointment_candidates")
          .select("id, appointment_id, candidate_name, candidate_id_number, polygraph_appointments(*)")
          .eq("application_id", application.id)
          .order("created_at", { ascending: false })
          .limit(1);
        if (cancelled) return;
        const pac = pacRows?.[0] as any;
        const apt = pac?.polygraph_appointments;
        setPolyAppointment(apt || null);

        // Try matching an uploaded polygraph report by ID number.
        const idNum = application?.candidate_id_number || pac?.candidate_id_number;
        if (idNum) {
          const { data: rep } = await supabase
            .from("pending_polygraph_uploads")
            .select("*")
            .eq("id_number", idNum)
            .order("created_at", { ascending: false })
            .limit(1)
            .maybeSingle();
          if (!cancelled) setPolyReport(rep || null);
        }
      } finally {
        if (!cancelled) setPolyLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [open, application?.id, application?.candidate_id_number]);

  // QuestionnaireScreen invokes onComplete via Promise; we never call it in read-only mode.
  const noopComplete = async () => true;

  const InfoRow = ({ label, value }: { label: string; value: string | null | undefined }) => (
    <div className="flex justify-between py-1.5 border-b border-border/50 last:border-0">
      <span className="text-muted-foreground text-sm w-40 shrink-0">{label}</span>
      <span className="text-sm font-medium text-right">{value || "—"}</span>
    </div>
  );

  // Reusable digital signature block — used inside the POPIA, Indemnity and Signature tabs.
  const renderSignatureBlock = (accepted: boolean | undefined, docLabel: string) => (
    <Card className="mt-4">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm flex items-center gap-2">
          <Smartphone className="h-4 w-4 text-primary" /> Digital Signature
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div
          className={`flex items-center gap-1.5 px-4 py-3 rounded-lg text-sm font-medium ${
            accepted ? "bg-green-100 text-green-700" : "bg-red-100 text-red-700"
          }`}
        >
          {accepted ? <Check className="h-4 w-4" /> : <X className="h-4 w-4" />}
          {docLabel} {accepted ? "Accepted" : "Not Accepted"}
        </div>

        {deviceData ? (
          <div className="mt-3 space-y-0">
            {deviceData.selfieUrl && (
              <div className="mb-3 flex flex-col items-center gap-2 p-3 rounded-lg border bg-muted/30">
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                  Identity Verification Selfie
                </p>
                <a href={deviceData.selfieUrl} target="_blank" rel="noopener noreferrer">
                  <img
                    src={deviceData.selfieUrl}
                    alt="Applicant verification selfie"
                    className="rounded-lg border max-w-[180px] w-full"
                  />
                </a>
              </div>
            )}
            <InfoRow label="IP Address" value={deviceData.ipAddress} />
            <InfoRow label="GPS Latitude" value={deviceData.gpsLatitude?.toString()} />
            <InfoRow label="GPS Longitude" value={deviceData.gpsLongitude?.toString()} />
            <InfoRow
              label="Timestamp"
              value={
                deviceData.timestamp
                  ? format(new Date(deviceData.timestamp), "dd MMM yyyy HH:mm:ss")
                  : null
              }
            />
            <InfoRow label="Platform" value={deviceData.platform} />
          </div>
        ) : (
          <p className="text-sm text-muted-foreground mt-3">No signature data captured.</p>
        )}
      </CardContent>
    </Card>
  );

  const getRiskTierColor = (level: string) => {
    switch (level) {
      case "LOW": return "bg-green-100 text-green-700 border-green-200";
      case "MEDIUM": return "bg-amber-100 text-amber-700 border-amber-200";
      case "HIGH": return "bg-red-100 text-red-700 border-red-200";
      case "VERY HIGH": return "bg-red-200 text-red-900 border-red-300";
      default: return "bg-muted text-muted-foreground";
    }
  };

  const getCategoryIcon = (category: string) => {
    switch (category) {
      case "employment": return <Briefcase className="h-4 w-4" />;
      case "financial": return <DollarSign className="h-4 w-4" />;
      case "legal": return <Scale className="h-4 w-4" />;
      case "criminal": return <AlertTriangle className="h-4 w-4" />;
      case "integrity": return <Fingerprint className="h-4 w-4" />;
      default: return <Activity className="h-4 w-4" />;
    }
  };

  const getScoreBarColor = (score: number, max: number) => {
    const ratio = max > 0 ? score / max : 0;
    if (ratio === 0) return "bg-green-500";
    if (ratio <= 0.33) return "bg-yellow-500";
    if (ratio <= 0.66) return "bg-orange-500";
    return "bg-red-500";
  };

  const renderPreRiskProfile = () => {
    if (!preRiskProfile) {
      return (
        <div className="text-center py-12">
          <AlertTriangle className="h-12 w-12 text-muted-foreground mx-auto mb-3" />
          <p className="text-muted-foreground">Pre-Risk Alert Profile is being generated...</p>
          <p className="text-xs text-muted-foreground mt-1">This may take a few moments after submission.</p>
        </div>
      );
    }

    const categories = [
      { key: "employment", label: "Employment History", max: 3, data: preRiskProfile.employment },
      { key: "financial", label: "Financial Pressure", max: 3, data: preRiskProfile.financial },
      { key: "legal", label: "Legal Encounters", max: 5, data: preRiskProfile.legal },
      { key: "criminal", label: "Criminal Activity", max: 28, data: preRiskProfile.criminal },
      { key: "integrity", label: "Integrity", max: 1, data: preRiskProfile.integrity },
    ];

    return (
      <div className="space-y-6">
        {/* Overall Risk Header */}
        <Card className={`border-2 ${getRiskTierColor(preRiskProfile.riskLevel)}`}>
          <CardContent className="py-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs font-medium uppercase tracking-wider opacity-70">Pre-Risk Alert Level</p>
                <p className="text-2xl font-bold">{preRiskProfile.riskLevel} RISK</p>
              </div>
              <div className="text-right">
                <p className="text-xs font-medium uppercase tracking-wider opacity-70">Total Score</p>
                <p className="text-3xl font-bold">{preRiskProfile.totalScore}</p>
              </div>
            </div>
            {preRiskProfile.summary && (
              <div className="mt-3 space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-xs font-medium uppercase tracking-wider opacity-70">Summary</p>
                  <SpeakButton text={preRiskProfile.summary} label="Read aloud" />
                </div>
                <p className="text-sm opacity-80">{preRiskProfile.summary}</p>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Key Findings */}
        {preRiskProfile.keyFindings?.length > 0 && (
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm flex items-center gap-2">
                <AlertTriangle className="h-4 w-4 text-amber-500" /> Key Findings
              </CardTitle>
            </CardHeader>
            <CardContent>
              <ul className="space-y-1.5">
                {preRiskProfile.keyFindings.map((finding: string, i: number) => (
                  <li key={i} className="text-sm flex items-start gap-2">
                    <span className="text-muted-foreground mt-0.5">•</span>
                    {finding}
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>
        )}

        {/* Category Breakdown */}
        <div className="space-y-3">
          {categories.map(({ key, label, max, data }) => {
            if (!data) return null;
            const score = data.score || 0;
            const percentage = max > 0 ? (score / max) * 100 : 0;

            return (
              <Card key={key}>
                <CardContent className="py-3">
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                      {getCategoryIcon(key)}
                      <span className="font-semibold text-sm">{label}</span>
                      <CalculationInfoPopover title={label}>
                        {key === "employment" && (
                          <>
                            <p><strong>Data used:</strong> The candidate's full disclosed employment history (company, duration, reason for leaving, disciplinary record).</p>
                            <p><strong>Step 1 — Average tenure:</strong> Sum of all parsed durations ÷ number of jobs with a duration.</p>
                            <p><strong>Step 2 — Short-tenure count:</strong> Count jobs lasting <strong>less than half the average</strong>. Contracts ended due to <em>term completion / fixed-term / seasonal</em> are excluded — they're normal endings, not instability.</p>
                            <p><strong>Step 3 — Score (0-3):</strong></p>
                            <ul>
                              <li>0 (Stable): no short-tenure jobs AND avg ≥ 36 months</li>
                              <li>1 (Fairly Stable): ≤25% short AND avg ≥ 24 months</li>
                              <li>2 (Caution): ≤50% short OR avg ≥ 12 months</li>
                              <li>3 (Unstable): &gt;50% short or avg &lt; 12 months</li>
                            </ul>
                            <p><strong>Penalty:</strong> +1 per absconding/dismissal/disciplinary exit (cap +2, max 3).</p>
                          </>
                        )}
                        {key === "financial" && (
                          <>
                            <p><strong>Data used:</strong> Disclosed current accounts (vehicle, bond, cards, store/cellphone), historical/arrears debt, and any blacklisting flag.</p>
                            <p><strong>Score (0-3):</strong></p>
                            <ul>
                              <li>0 (Stable): no arrears, accounts paid up, no blacklist</li>
                              <li>1 (Fairly Stable): minor arrears or moderate load</li>
                              <li>2 (Caution): notable historical debt or accounts in arrears</li>
                              <li>3 (Pressure): blacklisted or significant unresolved debt</li>
                            </ul>
                            <p>Confirmed blacklisting forces the score to at least 2.</p>
                          </>
                        )}
                        {key === "legal" && (
                          <>
                            <p><strong>Data used:</strong> Personal arrests/convictions disclosed, plus criminal histories of disclosed family and close friends.</p>
                            <p><strong>Branches:</strong> Personal · Family · Friends/Associates.</p>
                            <p><strong>Severity weighting:</strong> convicted/sentenced &gt; arrested/charged &gt; investigated only.</p>
                            <p><strong>Score (0-5):</strong> aggregated across the three branches. Personal encounters weigh more than association.</p>
                          </>
                        )}
                        {key === "criminal" && (
                          <>
                            <p><strong>Data used:</strong> Questionnaire disclosures across 6 branches, each split into subcategories.</p>
                            <p><strong>Scoring rule:</strong> <em>+1 per subcategory</em> that contains <strong>at least one "Yes"</strong> answer. The actual count of "Yes" answers within a subcategory does not increase the score further — one "Yes" flags the whole subcategory.</p>
                            <p><strong>Branch maxes (total max 28):</strong></p>
                            <ul>
                              <li><strong>Personal (max 4):</strong> Stolen &amp; benefited from theft at work · Witnessed theft &amp; did not report · Helped someone steal · Approached &amp; accepted involvement</li>
                              <li><strong>Fraud (max 6):</strong> Refund &amp; Return · Cash Skimming · Asset Misappropriation · Supplier &amp; Delivery · Information / Data Misuse · Personal Information</li>
                              <li><strong>Bribery (max 3):</strong> Law Enforcement · Work Colleagues · Employment</li>
                              <li><strong>Organized Crimes (max 4):</strong> Theft / Hijacking / Robbery Syndicates · Financial &amp; Economic · Extortion · Drug Trafficking</li>
                              <li><strong>Undetected Crimes (max 6):</strong> Financial &amp; White-Collar · Corruption &amp; Abuse of Power · Retail &amp; Commercial · Cyber &amp; Digital · Violent &amp; Serious · Insurance &amp; Claims Fraud</li>
                              <li><strong>Illegal Drug Involvement (max 5):</strong> Sold Drugs · Manufactured Drugs · Transported Drugs · Lifetime Drug Use · Past 2 Years Drug Use</li>
                            </ul>
                            <p><strong>Key Findings</strong> note <em>what</em> was disclosed (not just the score), so reviewers can see the specific subcategories flagged.</p>
                            <p><em>Deterministic — directly reflects what the candidate admitted, not AI inference.</em></p>
                          </>
                        )}
                        {key === "integrity" && (
                          <>
                            <p><strong>Data used:</strong> The polygraph examiner's findings on this candidate's exam questions.</p>
                            <p><strong>Per-question outcome:</strong> NDI (No Deception Indicated), DI (Deception Indicated), or INC (Inconclusive).</p>
                            <p><strong>Score (0 or 1):</strong></p>
                            <ul>
                              <li>0 (Pass): all relevant questions are NDI</li>
                              <li>1 (Concerns): one or more DI / Inconclusive findings</li>
                            </ul>
                            <p><em>Pass/fail indicator — only available once the polygraph exam is conducted.</em></p>
                          </>
                        )}
                      </CalculationInfoPopover>
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge variant="outline" className="text-xs">{data.label}</Badge>
                      <span className="text-sm font-bold">{score}/{max}</span>
                    </div>
                  </div>
                  <div className="w-full bg-muted rounded-full h-2 mb-2">
                    <div
                      className={`h-2 rounded-full transition-all ${getScoreBarColor(score, max)}`}
                      style={{ width: `${Math.min(percentage, 100)}%` }}
                    />
                  </div>
                  <p className="text-xs text-muted-foreground">{data.reasoning}</p>

                  {/* Employment jobs detail */}
                  {key === "employment" && data.jobs?.length > 0 && (
                    <div className="mt-2 space-y-1">
                      {data.jobs.map((job: any, i: number) => (
                        <div key={i} className="text-xs flex items-center gap-2 text-muted-foreground">
                          <span className="font-medium text-foreground">{job.company}</span>
                          <span>—</span>
                          <span>{job.position}</span>
                          <span className="ml-auto">{job.durationMonths > 0 ? `${Math.round(job.durationMonths / 12 * 10) / 10}yr` : "?"}</span>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Financial accounts detail */}
                  {key === "financial" && data.currentAccounts?.length > 0 && (
                    <div className="mt-2 space-y-1">
                      {data.currentAccounts.map((acc: any, i: number) => (
                        <div key={i} className="text-xs flex items-center justify-between text-muted-foreground">
                          <span>{acc.name}</span>
                          <span>R {acc.amount?.toLocaleString()}</span>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Criminal confirmed items */}
                  {key === "criminal" && data.confirmedItems?.length > 0 && (
                    <div className="mt-2 space-y-1">
                      {data.confirmedItems.map((item: string, i: number) => (
                        <div key={i} className="text-xs flex items-center gap-1.5 text-red-600">
                          <X className="h-3 w-3" /> {item}
                        </div>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      </div>
    );
  };

  const renderRiskAssessment = () => {
    if (riskLoading) {
      return (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-6 w-6 animate-spin text-primary" />
        </div>
      );
    }

    if (!riskAssessment) {
      return (
        <div className="text-center py-12">
          <ShieldCheck className="h-12 w-12 text-muted-foreground mx-auto mb-3" />
          <p className="text-muted-foreground">No risk assessment requested for this application yet.</p>
        </div>
      );
    }

    const parentRequest = (riskAssessment as any).candex_risk_requests || {};
    const requestedChecks: RiskCheckKey[] = (parentRequest.requested_checks as RiskCheckKey[]) || [];
    const checkResults: Record<string, RiskCheckResult> = riskAssessment.check_results || {};
    const sharedDocUrl = riskAssessment.risk_assessment_url as string | null;

    // Derive overall outcome from per-check results: any flagged => flagged,
    // all requested checks clear => clear, otherwise pending.
    const statuses = requestedChecks.map((k) => checkResults[k]?.status);
    const hasFlagged = statuses.includes("flagged");
    const allClear =
      requestedChecks.length > 0 && statuses.every((s) => s === "clear");
    const overallState: "flagged" | "clear" | "pending" = hasFlagged
      ? "flagged"
      : allClear
      ? "clear"
      : "pending";

    const requestStatus = String(parentRequest.status || "").toLowerCase();
    const isCompleted =
      requestStatus === "completed" ||
      requestStatus === "fulfilled" ||
      overallState !== "pending";
    const completedAt = isCompleted ? parentRequest.updated_at : null;

    const bannerClasses =
      overallState === "flagged"
        ? "bg-destructive text-destructive-foreground border-destructive"
        : overallState === "clear"
        ? "bg-green-600 text-white border-green-700"
        : "bg-amber-100 text-amber-900 border-amber-200";
    const bannerLabel =
      overallState === "flagged"
        ? "Flagged"
        : overallState === "clear"
        ? "Clear"
        : "Pending";
    const BannerIcon =
      overallState === "flagged" ? AlertTriangle : overallState === "clear" ? Check : Loader2;

    return (
      <div className="space-y-4">
        {/* Overall outcome banner */}
        <div
          className={`flex items-center gap-3 rounded-md border px-4 py-3 ${bannerClasses}`}
        >
          <BannerIcon className="h-5 w-5 shrink-0" />
          <div className="flex flex-col">
            <span className="text-xs uppercase tracking-wider opacity-80">Overall Outcome</span>
            <span className="text-base font-semibold">{bannerLabel}</span>
          </div>
        </div>

        {/* Summary */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <ShieldCheck className="h-4 w-4 text-primary" /> Risk Assessment Summary
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-0">
              <InfoRow
                label="Checks Requested On"
                value={parentRequest.requested_date ? format(new Date(parentRequest.requested_date), "dd MMM yyyy") : null}
              />
              <InfoRow
                label="Completed On"
                value={completedAt ? format(new Date(completedAt), "dd MMM yyyy") : "Not yet completed"}
              />
              <InfoRow
                label="Number of Checks Requested"
                value={requestedChecks.length ? String(requestedChecks.length) : "0"}
              />
              {parentRequest.notes && <InfoRow label="Notes" value={parentRequest.notes} />}
            </div>
          </CardContent>
        </Card>

        {/* Per-check breakdown */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Requested Checks & Results</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {requestedChecks.length === 0 ? (
              <p className="text-sm text-muted-foreground">No specific checks were requested.</p>
            ) : (
              requestedChecks.map((checkKey) => {
                const meta = RISK_CHECKS.find((c) => c.key === checkKey);
                const result = checkResults[checkKey];
                return (
                  <div
                    key={checkKey}
                    className="flex flex-col gap-2 rounded-md border p-3 sm:flex-row sm:items-center sm:justify-between"
                  >
                    <div className="flex flex-col">
                      <span className="text-sm font-medium">{meta?.label || checkKey}</span>
                      {result?.notes && (
                        <span className="text-xs text-muted-foreground mt-0.5">{result.notes}</span>
                      )}
                      {result?.processed_at && (
                        <span className="text-[11px] text-muted-foreground mt-0.5">
                          Processed {format(new Date(result.processed_at), "dd MMM yyyy HH:mm")}
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-2">
                      <RiskCheckStatusBadge status={result?.status} />
                    </div>
                  </div>
                );
              })
            )}
          </CardContent>
        </Card>

        {/* Shared assessment document — centered action button */}
      </div>
    );
  };

  const renderPolygraphResults = () => {
    if (polyLoading) {
      return (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-6 w-6 animate-spin text-primary" />
        </div>
      );
    }
    if (!polyAppointment) {
      return (
        <div className="text-center py-12">
          <Brain className="h-12 w-12 text-muted-foreground mx-auto mb-3" />
          <p className="text-muted-foreground">No polygraph examination scheduled for this candidate.</p>
        </div>
      );
    }
    return (
      <div className="space-y-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <Brain className="h-4 w-4 text-primary" /> Polygraph Appointment
            </CardTitle>
          </CardHeader>
          <CardContent>
            <InfoRow label="Status" value={polyAppointment.status} />
            <InfoRow label="Booking Reference" value={polyAppointment.booking_reference} />
            <InfoRow label="Scheduled Date" value={polyAppointment.scheduled_date ? format(new Date(polyAppointment.scheduled_date), "dd MMM yyyy") : null} />
            <InfoRow label="Scheduled Time" value={polyAppointment.scheduled_time} />
            <InfoRow label="Venue" value={polyAppointment.venue_type} />
            <InfoRow label="Venue Address" value={polyAppointment.venue_address} />
          </CardContent>
        </Card>

        {polyReport ? (
          <>
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm flex items-center gap-2">
                  <ShieldCheck className="h-4 w-4 text-primary" /> Polygraph Result Summary
                </CardTitle>
              </CardHeader>
              <CardContent>
                <InfoRow label="Examination Date" value={polyReport.examination_date ? format(new Date(polyReport.examination_date), "dd MMM yyyy") : null} />
                <InfoRow label="Overall Result" value={polyReport.overall_result} />
                <InfoRow label="Risk Level" value={polyReport.risk_level} />
                <InfoRow label="Risk Score" value={polyReport.risk_score?.toString()} />
                <InfoRow label="Status" value={polyReport.status} />
              </CardContent>
            </Card>
            {(polyReport.converted_pdf_url || polyReport.original_file_url) && (
              <div className="flex justify-center pt-2">
                <Button asChild>
                  <a href={polyReport.converted_pdf_url || polyReport.original_file_url} target="_blank" rel="noopener noreferrer">
                    View Polygraph Report
                    <ExternalLink className="h-4 w-4 ml-2" />
                  </a>
                </Button>
              </div>
            )}
          </>
        ) : (
          <div className="text-center py-6 border rounded-md bg-muted/30">
            <p className="text-sm text-muted-foreground">Polygraph report not yet uploaded.</p>
          </div>
        )}
      </div>
    );
  };

  const renderFinalReport = () => {
    if (!finalRiskReport) {
      return (
        <div className="text-center py-12">
          <Sparkles className="h-12 w-12 text-muted-foreground mx-auto mb-3" />
          <p className="text-muted-foreground">Final risk report will be generated automatically once the polygraph report is uploaded.</p>
        </div>
      );
    }
    return (
      <div className="space-y-4">
        <Card className={`border-2 ${getRiskTierColor(finalRiskReport.riskLevel)}`}>
          <CardContent className="py-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs font-medium uppercase tracking-wider opacity-70">Final Risk Level</p>
                <p className="text-2xl font-bold">{finalRiskReport.riskLevel}</p>
              </div>
              <div className="text-right">
                <p className="text-xs font-medium uppercase tracking-wider opacity-70">Generated</p>
                <p className="text-sm">{finalRiskReport.generatedAt ? format(new Date(finalRiskReport.generatedAt), "dd MMM yyyy") : "—"}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        {finalRiskReport.summary && (
          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-sm">Executive Summary</CardTitle></CardHeader>
            <CardContent><p className="text-sm whitespace-pre-wrap">{finalRiskReport.summary}</p></CardContent>
          </Card>
        )}
        {finalRiskReport.findings?.length > 0 && (
          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-sm">Key Findings</CardTitle></CardHeader>
            <CardContent>
              <ul className="space-y-1.5">
                {finalRiskReport.findings.map((f: string, i: number) => (
                  <li key={i} className="text-sm flex items-start gap-2">
                    <span className="text-muted-foreground mt-0.5">•</span>{f}
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>
        )}
        {finalRiskReport.recommendation && (
          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-sm">Recommendation</CardTitle></CardHeader>
            <CardContent><p className="text-sm whitespace-pre-wrap">{finalRiskReport.recommendation}</p></CardContent>
          </Card>
        )}
      </div>
    );
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-xl">Application Review: {application?.candidate_name}</DialogTitle>
          <DialogDescription>Review all submitted information before making a decision.</DialogDescription>
        </DialogHeader>

        {false ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
          </div>
        ) : (
          <Tabs defaultValue="questionnaire" className="space-y-4">
            <TabsList className="grid w-full grid-cols-8">
              <TabsTrigger value="questionnaire" className="text-xs">
                <ClipboardList className="h-3.5 w-3.5 mr-1" /> Questionnaire
              </TabsTrigger>
              <TabsTrigger value="popia" className="text-xs">
                <Shield className="h-3.5 w-3.5 mr-1" /> POPIA
              </TabsTrigger>
              <TabsTrigger value="indemnity" className="text-xs">
                <FileText className="h-3.5 w-3.5 mr-1" /> Indemnity
              </TabsTrigger>
              <TabsTrigger value="signature" className="text-xs">
                <Smartphone className="h-3.5 w-3.5 mr-1" /> Signature
              </TabsTrigger>
              <TabsTrigger value="risk" className="relative text-xs">
                <AlertTriangle className="h-3.5 w-3.5 mr-1" /> Pre-Risk
                {preRiskProfile?.riskLevel && preRiskProfile.riskLevel !== "LOW" && (
                  <Badge variant="destructive" className="absolute -top-2 -right-2 h-4 w-4 p-0 flex items-center justify-center text-[8px]">!</Badge>
                )}
              </TabsTrigger>
              <TabsTrigger value="risk-assessment" className="relative text-xs">
                <ShieldCheck className="h-3.5 w-3.5 mr-1" /> Risk Assessment
              </TabsTrigger>
              <TabsTrigger value="polygraph" className="relative text-xs">
                <Brain className="h-3.5 w-3.5 mr-1" /> Polygraph
              </TabsTrigger>
              <TabsTrigger value="final" className="relative text-xs">
                <Sparkles className="h-3.5 w-3.5 mr-1" /> Final
                {finalRiskReport && (
                  <Badge className="absolute -top-2 -right-2 h-4 w-4 p-0 flex items-center justify-center text-[8px] bg-primary">★</Badge>
                )}
              </TabsTrigger>
            </TabsList>

            {/* ── QUESTIONNAIRE TAB ── */}
            <TabsContent value="questionnaire" className="space-y-3">
              {/* Personal Details */}
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm flex items-center gap-2">
                    <User className="h-4 w-4 text-primary" /> Personal Details
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  {personalDetails ? (
                    <div className="space-y-0">
                      <InfoRow label="First Name" value={personalDetails.firstName} />
                      <InfoRow label="Second Name" value={personalDetails.secondName} />
                      <InfoRow label="Surname" value={personalDetails.surname} />
                      <InfoRow label="ID Number" value={personalDetails.idNumber} />
                      <InfoRow label="Cellphone" value={personalDetails.cellphone} />
                      <InfoRow label="Email" value={personalDetails.email} />
                      <Separator className="my-2" />
                      <p className="text-xs font-semibold text-muted-foreground mb-1">Physical Address</p>
                      <InfoRow label="House Number" value={personalDetails.houseNumber} />
                      <InfoRow label="Floor Number" value={personalDetails.floorNumber} />
                      <InfoRow label="Street Name" value={personalDetails.streetName} />
                      <InfoRow label="Complex Name" value={personalDetails.complexName} />
                      <InfoRow label="Suburb" value={personalDetails.suburb} />
                      <InfoRow label="City" value={personalDetails.city} />
                      <InfoRow label="Province" value={personalDetails.province} />
                      <InfoRow label="Postal Code" value={personalDetails.postalCode} />
                    </div>
                  ) : (
                    <p className="text-sm text-muted-foreground">No personal details recorded.</p>
                  )}
                </CardContent>
              </Card>

              {/* Questionnaire Sections — full parity with candidate UI, read-only */}
              {application?.template_id ? (
                <QuestionnaireScreen
                  templateId={application.template_id}
                  onComplete={noopComplete}
                  readOnly
                  initialAnswers={questionnaireQuestions}
                  initialTableData={questionnaireTables}
                />
              ) : (
                <Card>
                  <CardContent className="py-8 text-center">
                    <p className="text-sm text-muted-foreground">No template data available.</p>
                  </CardContent>
                </Card>
              )}
            </TabsContent>

            {/* ── POPIA TAB ── */}
            <TabsContent value="popia">
              <Card>
                <CardHeader>
                  <CardTitle className="text-sm flex items-center gap-2">
                    <Shield className="h-4 w-4 text-primary" /> POPIA Declaration
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="max-h-[40vh] overflow-y-auto rounded-md border bg-muted/30 p-4">
                    <div className="whitespace-pre-wrap text-sm leading-relaxed">
                      {popiaDocs?.popia_text || "POPIA document is not configured yet."}
                    </div>
                  </div>
                </CardContent>
              </Card>
              {renderSignatureBlock(popiaAccepted, "POPIA Declaration")}
            </TabsContent>

            {/* ── INDEMNITY TAB ── */}
            <TabsContent value="indemnity">
              <Card>
                <CardHeader>
                  <CardTitle className="text-sm flex items-center gap-2">
                    <FileText className="h-4 w-4 text-primary" /> Indemnity & Consent
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="max-h-[40vh] overflow-y-auto rounded-md border bg-muted/30 p-4">
                    <div className="whitespace-pre-wrap text-sm leading-relaxed">
                      {popiaDocs?.indemnity_text || "Indemnity document is not configured yet."}
                    </div>
                  </div>
                </CardContent>
              </Card>
              {renderSignatureBlock(indemnityAccepted, "Indemnity")}
            </TabsContent>

            {/* ── SIGNATURE TAB ── */}
            <TabsContent value="signature">
              <Card>
                <CardHeader>
                  <CardTitle className="text-sm flex items-center gap-2">
                    <Smartphone className="h-4 w-4 text-primary" /> Electronic Signature Details
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  {deviceData ? (
                    <div className="space-y-0">
                      {deviceData.selfieUrl && (
                        <div className="mb-4 flex flex-col items-center gap-2 p-3 rounded-lg border bg-muted/30">
                          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                            Identity Verification Selfie
                          </p>
                          <a href={deviceData.selfieUrl} target="_blank" rel="noopener noreferrer">
                            <img
                              src={deviceData.selfieUrl}
                              alt="Applicant verification selfie"
                              className="rounded-lg border max-w-[220px] w-full"
                            />
                          </a>
                          <p className="text-[11px] text-muted-foreground">Click to open full size</p>
                        </div>
                      )}
                      <InfoRow label="IP Address" value={deviceData.ipAddress} />
                      <InfoRow label="GPS Latitude" value={deviceData.gpsLatitude?.toString()} />
                      <InfoRow label="GPS Longitude" value={deviceData.gpsLongitude?.toString()} />
                      <InfoRow label="Timestamp" value={deviceData.timestamp ? format(new Date(deviceData.timestamp), "dd MMM yyyy HH:mm:ss") : null} />
                      <InfoRow label="Platform" value={deviceData.platform} />
                      <InfoRow label="Language" value={deviceData.language} />
                      <InfoRow label="Screen Resolution" value={deviceData.screenResolution} />
                      <InfoRow label="User Agent" value={deviceData.userAgent} />
                    </div>
                  ) : (
                    <p className="text-sm text-muted-foreground">No signature data captured.</p>
                  )}
                </CardContent>
              </Card>
            </TabsContent>

            {/* ── PRE-RISK ALERT PROFILE TAB ── */}
            <TabsContent value="risk">
              {renderPreRiskProfile()}
            </TabsContent>

            {/* ── RISK ASSESSMENT TAB ── */}
            <TabsContent value="risk-assessment">
              {renderRiskAssessment()}
            </TabsContent>

            {/* ── POLYGRAPH TAB ── */}
            <TabsContent value="polygraph">
              {renderPolygraphResults()}
            </TabsContent>

            {/* ── FINAL REPORT TAB ── */}
            <TabsContent value="final">
              {renderFinalReport()}
            </TabsContent>
          </Tabs>
        )}

        {!readOnly && (
          <DialogFooter className="gap-2 sm:gap-0">
            <Button variant="destructive" onClick={() => onReject(application.id)}>
              <X className="h-4 w-4 mr-1" /> Reject
            </Button>
            <Button onClick={() => onApprove(application.id)}>
              <Check className="h-4 w-4 mr-1" /> Approve
            </Button>
          </DialogFooter>
        )}
      </DialogContent>
    </Dialog>
  );
}
