import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Separator } from "@/components/ui/separator";
import { Check, X, Shield, FileText, User, MapPin, Smartphone, ClipboardList, AlertTriangle, Loader2 } from "lucide-react";
import { format } from "date-fns";

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
    // Filter out "Details" header if present (shown inline)
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
                
                // Check for dynamic employer reference data
                const dynamicData = questionnaireQuestions[`dynamic_${table.id}_${entryIdx}_${rowIdx}_0`];

                // For employer_reference type, show selected employers and their details
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

                // Multiple columns: show each with its header
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

                // Single column
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
          <Accordion type="multiple" defaultValue={[]} className="space-y-2">
            
            {/* ── PERSONAL DETAILS ── */}
            <AccordionItem value="personal" className="border rounded-lg px-1">
              <AccordionTrigger className="hover:no-underline px-3">
                <div className="flex items-center gap-2">
                  <User className="h-4 w-4 text-primary" />
                  <span className="font-semibold text-sm">Personal Details</span>
                </div>
              </AccordionTrigger>
              <AccordionContent className="px-3 pb-3">
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
              </AccordionContent>
            </AccordionItem>

            {/* ── POPIA & INDEMNITY ── */}
            <AccordionItem value="popia" className="border rounded-lg px-1">
              <AccordionTrigger className="hover:no-underline px-3">
                <div className="flex items-center gap-2">
                  <Shield className="h-4 w-4 text-primary" />
                  <span className="font-semibold text-sm">POPIA & Indemnity Acceptance</span>
                </div>
              </AccordionTrigger>
              <AccordionContent className="px-3 pb-3">
                <div className="space-y-3">
                  <div className="flex items-center gap-3">
                    <div className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium ${popiaAccepted ? "bg-green-100 text-green-700" : "bg-red-100 text-red-700"}`}>
                      {popiaAccepted ? <Check className="h-3 w-3" /> : <X className="h-3 w-3" />}
                      POPIA Declaration {popiaAccepted ? "Accepted" : "Not Accepted"}
                    </div>
                    <div className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium ${indemnityAccepted ? "bg-green-100 text-green-700" : "bg-red-100 text-red-700"}`}>
                      {indemnityAccepted ? <Check className="h-3 w-3" /> : <X className="h-3 w-3" />}
                      Indemnity {indemnityAccepted ? "Accepted" : "Not Accepted"}
                    </div>
                  </div>

                  {/* Device / Signature Data */}
                  {deviceData && (
                    <Card className="bg-muted/30">
                      <CardHeader className="pb-2 pt-3 px-4">
                        <CardTitle className="text-xs font-semibold flex items-center gap-1.5">
                          <Smartphone className="h-3.5 w-3.5" /> Electronic Signature Details
                        </CardTitle>
                      </CardHeader>
                      <CardContent className="px-4 pb-3 space-y-0">
                        <InfoRow label="IP Address" value={deviceData.ipAddress} />
                        <InfoRow label="GPS Latitude" value={deviceData.gpsLatitude?.toString()} />
                        <InfoRow label="GPS Longitude" value={deviceData.gpsLongitude?.toString()} />
                        <InfoRow label="Timestamp" value={deviceData.timestamp ? format(new Date(deviceData.timestamp), "dd MMM yyyy HH:mm:ss") : null} />
                        <InfoRow label="Platform" value={deviceData.platform} />
                        <InfoRow label="Language" value={deviceData.language} />
                        <InfoRow label="Screen Resolution" value={deviceData.screenResolution} />
                        <InfoRow label="User Agent" value={deviceData.userAgent} />
                      </CardContent>
                    </Card>
                  )}
                </div>
              </AccordionContent>
            </AccordionItem>

            {/* ── QUESTIONNAIRE ANSWERS ── */}
            <AccordionItem value="questionnaire" className="border rounded-lg px-1">
              <AccordionTrigger className="hover:no-underline px-3">
                <div className="flex items-center gap-2">
                  <ClipboardList className="h-4 w-4 text-primary" />
                  <span className="font-semibold text-sm">Questionnaire Responses</span>
                </div>
              </AccordionTrigger>
              <AccordionContent className="px-3 pb-3">
                {sections.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No template data available.</p>
                ) : (
                  <div className="space-y-4">
                    {sections.map((section) => {
                      const sectionTables = tables.filter(t => t.section_id === section.id);
                      return (
                        <div key={section.id}>
                          <h4 className="font-semibold text-sm mb-2 text-primary">{section.title}</h4>
                          {sectionTables.length > 0 ? (
                            <div className="space-y-3">
                              {sectionTables.map(table => (
                                <div key={table.id}>
                                  <p className="text-xs font-medium text-muted-foreground mb-1">{table.table_title}</p>
                                  {renderTableAnswers(table)}
                                </div>
                              ))}
                            </div>
                          ) : (
                            <p className="text-xs text-muted-foreground">No tables in this section.</p>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </AccordionContent>
            </AccordionItem>

            {/* ── RISK ALERT ── */}
            {application?.risk_level && (
              <Card className="border-l-4 border-l-destructive">
                <CardContent className="p-4">
                  <h4 className="font-semibold text-sm flex items-center gap-2">
                    <AlertTriangle className="h-4 w-4 text-destructive" /> Pre Risk Alert
                  </h4>
                  <p className="text-sm mt-1">
                    Risk Level: <Badge variant={application.risk_level === "LOW" ? "default" : "destructive"}>{application.risk_level}</Badge>
                    {application.risk_score != null && <span className="ml-2 text-muted-foreground">Score: {application.risk_score}</span>}
                  </p>
                </CardContent>
              </Card>
            )}
          </Accordion>
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
