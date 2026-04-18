import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Separator } from "@/components/ui/separator";
import { Check, X, Shield, FileText, User, Smartphone, ClipboardList, AlertTriangle, Loader2, Fingerprint, Briefcase, DollarSign, Scale, Activity } from "lucide-react";
import { format } from "date-fns";
import QuestionnaireScreen from "@/components/candex-application/QuestionnaireScreen";

interface ApplicationReviewDialogProps {
  application: any;
  open: boolean;
  onClose: () => void;
  onApprove: (id: string) => void;
  onReject: (id: string) => void;
  readOnly?: boolean;
}

interface SectionTable {
  id: string;
  section_id: string;
  table_title: string;
  sort_order: number;
  column_headers: string[];
  row_labels: string[];
  row_input_types: any[];
  is_repeatable: boolean;
}

interface Section {
  id: string;
  title: string;
  sort_order: number;
}

export default function ApplicationReviewDialog({ application, open, onClose, onApprove, onReject, readOnly }: ApplicationReviewDialogProps) {
  const [sections, setSections] = useState<Section[]>([]);
  const [tables, setTables] = useState<SectionTable[]>([]);
  const [loading, setLoading] = useState(false);

  const appAnswers = application?.answers as any;
  const personalDetails = appAnswers?.personalDetails;
  const deviceData = appAnswers?.deviceData;
  const questionnaireTables = appAnswers?.questionnaire?.tables || {};
  const questionnaireQuestions = appAnswers?.questionnaire?.questions || {};
  const popiaAccepted = appAnswers?.popiaAccepted;
  const indemnityAccepted = appAnswers?.indemnityAccepted;
  const preRiskProfile = appAnswers?.preRiskProfile;

  useEffect(() => {
    if (!open || !application?.template_id) return;
    setLoading(true);
    Promise.all([
      supabase.from("candex_template_sections").select("*").eq("template_id", application.template_id).order("sort_order"),
      supabase.from("candex_section_tables").select("*").order("sort_order"),
    ]).then(([secRes, tblRes]) => {
      setSections((secRes.data || []) as Section[]);
      const allTables = (tblRes.data || []) as SectionTable[];
      const sectionIds = new Set((secRes.data || []).map((s: any) => s.id));
      setTables(allTables.filter(t => sectionIds.has(t.section_id)));
      setLoading(false);
    });
  }, [open, application?.template_id]);

  const InfoRow = ({ label, value }: { label: string; value: string | null | undefined }) => (
    <div className="flex justify-between py-1.5 border-b border-border/50 last:border-0">
      <span className="text-muted-foreground text-sm w-40 shrink-0">{label}</span>
      <span className="text-sm font-medium text-right">{value || "—"}</span>
    </div>
  );

  const renderTableAnswers = (table: SectionTable) => {
    const entries: string[][][] = questionnaireTables[table.id] || [[]];
    const headers = table.column_headers || [];
    const displayHeaders = headers.filter((h: string) => h.toLowerCase() !== "details");
    
    return (
      <div className="space-y-3">
        {entries.map((entry: string[][], entryIdx: number) => (
          <div key={entryIdx} className="border rounded-lg overflow-hidden">
            {entries.length > 1 && (
              <div className="bg-muted/50 px-3 py-1.5 text-xs font-medium text-muted-foreground">
                Entry {entryIdx + 1}
              </div>
            )}
            <div className="divide-y divide-border/50">
              {table.row_labels.map((label: string, rowIdx: number) => {
                const inputType = table.row_input_types?.[rowIdx];
                const hasDetails = inputType?.require_explanation;
                const rowData = entry?.[rowIdx] || [];
                const detail = questionnaireQuestions[`detail_${table.id}_${entryIdx}_${rowIdx}`] || "";
                const dynamicData = questionnaireQuestions[`dynamic_${table.id}_${entryIdx}_${rowIdx}_0`];

                if (inputType?.type === "employer_reference" || dynamicData) {
                  return (
                    <div key={rowIdx} className="px-3 py-2">
                      <span className="text-xs text-muted-foreground">{label}</span>
                      {dynamicData && Array.isArray(dynamicData) ? (
                        <div className="mt-1 space-y-1">
                          {dynamicData.map((item: any, i: number) => (
                            <div key={i} className="flex items-start gap-2 text-sm">
                              <Badge variant="outline" className="shrink-0 text-xs">{item.name || "—"}</Badge>
                              {item.details && <span className="text-muted-foreground">— {item.details}</span>}
                            </div>
                          ))}
                        </div>
                      ) : (
                        <p className="text-sm mt-0.5">{rowData[0] || "—"}</p>
                      )}
                    </div>
                  );
                }

                if (displayHeaders.length > 1) {
                  return (
                    <div key={rowIdx} className="px-3 py-2">
                      <span className="text-xs font-medium text-muted-foreground">{label}</span>
                      <div className="grid grid-cols-2 gap-2 mt-1">
                        {displayHeaders.map((header: string, colIdx: number) => (
                          <div key={colIdx}>
                            <span className="text-[10px] text-muted-foreground uppercase">{header}</span>
                            <p className="text-sm font-medium">
                              {inputType?.type === "currency" && rowData[colIdx] ? `R ${rowData[colIdx]}` : rowData[colIdx] || "—"}
                            </p>
                          </div>
                        ))}
                      </div>
                      {hasDetails && detail && (
                        <p className="text-xs text-muted-foreground mt-1 pl-2 border-l-2 border-primary/30">
                          Details: {detail}
                        </p>
                      )}
                    </div>
                  );
                }

                return (
                  <div key={rowIdx} className="px-3 py-2">
                    <span className="text-xs text-muted-foreground">{label}</span>
                    <p className="text-sm font-medium mt-0.5">
                      {inputType?.type === "currency" && rowData[0] ? `R ${rowData[0]}` : rowData[0] || "—"}
                    </p>
                    {hasDetails && detail && (
                      <p className="text-xs text-muted-foreground mt-1 pl-2 border-l-2 border-primary/30">
                        Details: {detail}
                      </p>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    );
  };

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
      { key: "criminal", label: "Criminal Activity", max: 30, data: preRiskProfile.criminal },
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

        {loading ? (
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

              {/* Questionnaire Sections */}
              {sections.length === 0 ? (
                <Card>
                  <CardContent className="py-8 text-center">
                    <p className="text-sm text-muted-foreground">No template data available.</p>
                  </CardContent>
                </Card>
              ) : (
                <Accordion type="multiple" defaultValue={[]} className="space-y-2">
                  {sections.map((section) => {
                    const sectionTables = tables.filter(t => t.section_id === section.id);
                    return (
                      <AccordionItem key={section.id} value={`section-${section.id}`} className="border rounded-lg px-1">
                        <AccordionTrigger className="hover:no-underline px-3">
                          <div className="flex items-center gap-2">
                            <ClipboardList className="h-4 w-4 text-primary" />
                            <span className="font-semibold text-sm">{section.title}</span>
                            {sectionTables.length > 0 && (
                              <Badge variant="secondary" className="text-[10px] px-1.5 py-0">{sectionTables.length} {sectionTables.length === 1 ? 'table' : 'tables'}</Badge>
                            )}
                          </div>
                        </AccordionTrigger>
                        <AccordionContent className="px-3 pb-3">
                          {sectionTables.length > 0 ? (
                            <Accordion type="multiple" className="space-y-2">
                              {sectionTables.map(table => (
                                <AccordionItem key={table.id} value={`table-${table.id}`} className="border rounded-md px-1">
                                  <AccordionTrigger className="hover:no-underline px-2 py-2 text-xs">
                                    <span className="font-medium text-muted-foreground">{table.table_title}</span>
                                  </AccordionTrigger>
                                  <AccordionContent className="px-2 pb-2">
                                    {renderTableAnswers(table)}
                                  </AccordionContent>
                                </AccordionItem>
                              ))}
                            </Accordion>
                          ) : (
                            <p className="text-xs text-muted-foreground">No tables in this section.</p>
                          )}
                        </AccordionContent>
                      </AccordionItem>
                    );
                  })}
                </Accordion>
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
