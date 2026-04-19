import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Separator } from "@/components/ui/separator";
import { Check, X, Shield, FileText, User, Smartphone, ClipboardList, AlertTriangle, Loader2, Fingerprint, Briefcase, DollarSign, Scale, Activity } from "lucide-react";
import { format } from "date-fns";
import QuestionnaireScreen from "@/components/candex-application/QuestionnaireScreen";
import { CalculationInfoPopover } from "@/components/reports/CalculationInfoPopover";

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

  // QuestionnaireScreen invokes onComplete via Promise; we never call it in read-only mode.
  const noopComplete = async () => true;

  const InfoRow = ({ label, value }: { label: string; value: string | null | undefined }) => (
    <div className="flex justify-between py-1.5 border-b border-border/50 last:border-0">
      <span className="text-muted-foreground text-sm w-40 shrink-0">{label}</span>
      <span className="text-sm font-medium text-right">{value || "—"}</span>
    </div>
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
              <p className="text-sm mt-3 opacity-80">{preRiskProfile.summary}</p>
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
            <TabsList className="grid w-full grid-cols-5">
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
                  <div className={`flex items-center gap-1.5 px-4 py-3 rounded-lg text-sm font-medium ${popiaAccepted ? "bg-green-100 text-green-700" : "bg-red-100 text-red-700"}`}>
                    {popiaAccepted ? <Check className="h-4 w-4" /> : <X className="h-4 w-4" />}
                    POPIA Declaration {popiaAccepted ? "Accepted" : "Not Accepted"}
                  </div>
                  {deviceData?.timestamp && (
                    <p className="text-xs text-muted-foreground mt-3">
                      Accepted on: {format(new Date(deviceData.timestamp), "dd MMM yyyy 'at' HH:mm:ss")}
                    </p>
                  )}
                </CardContent>
              </Card>
            </TabsContent>

            {/* ── INDEMNITY TAB ── */}
            <TabsContent value="indemnity">
              <Card>
                <CardHeader>
                  <CardTitle className="text-sm flex items-center gap-2">
                    <FileText className="h-4 w-4 text-primary" /> Indemnity Acceptance
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className={`flex items-center gap-1.5 px-4 py-3 rounded-lg text-sm font-medium ${indemnityAccepted ? "bg-green-100 text-green-700" : "bg-red-100 text-red-700"}`}>
                    {indemnityAccepted ? <Check className="h-4 w-4" /> : <X className="h-4 w-4" />}
                    Indemnity {indemnityAccepted ? "Accepted" : "Not Accepted"}
                  </div>
                  {deviceData?.timestamp && (
                    <p className="text-xs text-muted-foreground mt-3">
                      Accepted on: {format(new Date(deviceData.timestamp), "dd MMM yyyy 'at' HH:mm:ss")}
                    </p>
                  )}
                </CardContent>
              </Card>
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
