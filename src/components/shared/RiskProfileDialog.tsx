import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Shield, FileText, User, AlertTriangle, ExternalLink, Download, X, GraduationCap, HeartPulse, Users, UserCheck } from "lucide-react";
import RiskAnalysisDisplay from "@/components/reports/RiskAnalysisDisplay";
import { FamilyTreeDisplay, FamilyMemberNode } from "@/components/shared/FamilyTreeDisplay";
import type { FamilyMember } from "@/components/shared/FamilyTreeDisplay";
import { toast } from "sonner";

interface RiskProfileDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  employeeId?: string;
  reportId?: string;
  candidateName?: string;
}

interface ProfileData {
  employee: any;
  submission: any;
  popia: any;
  polygraphReport: any;
  examQuestions: any[];
  admissions: any[];
  suitability: any;
  pdfUrl: string | null;
}

// PDF Preview Modal
const PdfPreviewModal = ({ 
  open, 
  onClose, 
  pdfUrl 
}: { 
  open: boolean; 
  onClose: () => void; 
  pdfUrl: string; 
}) => {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[100] bg-black/80 flex items-center justify-center p-4">
      <div className="relative w-full max-w-5xl h-[90vh] bg-background rounded-lg overflow-hidden flex flex-col">
        <div className="flex items-center justify-between p-4 border-b">
          <h3 className="font-semibold">PDF Report Preview</h3>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" asChild>
              <a href={pdfUrl} target="_blank" rel="noopener noreferrer" className="flex items-center gap-2">
                <ExternalLink className="h-4 w-4" />
                Open in New Tab
              </a>
            </Button>
            <Button variant="outline" size="sm" asChild>
              <a href={pdfUrl} download className="flex items-center gap-2">
                <Download className="h-4 w-4" />
                Download
              </a>
            </Button>
            <Button variant="ghost" size="icon" onClick={onClose}>
              <X className="h-4 w-4" />
            </Button>
          </div>
        </div>
        <div className="flex-1 w-full">
          <iframe
            src={pdfUrl}
            className="w-full h-full border-0"
            title="PDF Preview"
          />
        </div>
      </div>
    </div>
  );
};

// Component to view the original PDF
const ViewOriginalPdfButton = ({ pdfUrl }: { pdfUrl: string | null }) => {
  const [previewOpen, setPreviewOpen] = useState(false);

  if (!pdfUrl) {
    return (
      <p className="text-muted-foreground text-sm">
        No PDF document was stored for this report. Reports uploaded before this feature was added will not have a PDF available.
      </p>
    );
  }

  return (
    <>
      <div className="flex items-center gap-4">
        <Button variant="outline" onClick={() => setPreviewOpen(true)} className="flex items-center gap-2">
          <FileText className="h-4 w-4" />
          Preview PDF Report
        </Button>
        <Button variant="ghost" size="sm" asChild>
          <a href={pdfUrl} target="_blank" rel="noopener noreferrer" className="flex items-center gap-2">
            <ExternalLink className="h-4 w-4" />
            Open in New Tab
          </a>
        </Button>
        <Button variant="ghost" size="sm" asChild>
          <a href={pdfUrl} download className="flex items-center gap-2">
            <Download className="h-4 w-4" />
            Download
          </a>
        </Button>
      </div>
      <PdfPreviewModal 
        open={previewOpen} 
        onClose={() => setPreviewOpen(false)} 
        pdfUrl={pdfUrl} 
      />
    </>
  );
};

// Format a date string safely without timezone shift
const formatDateSafe = (dateStr: string | null | undefined): string => {
  if (!dateStr) return '—';
  // If YYYY-MM-DD, parse components directly to avoid UTC shift
  const match = dateStr.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (match) {
    const months = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
    const month = months[parseInt(match[2]) - 1];
    const day = parseInt(match[3]);
    return `${month} ${day}, ${match[1]}`;
  }
  return dateStr;
};

// Info row helper
const InfoRow = ({ label, value, fullWidth }: { label: string; value: string | null | undefined; fullWidth?: boolean }) => {
  if (!value || value === '—') return null;
  return (
     <div className={`flex justify-between py-1 ${fullWidth ? 'col-span-1 sm:col-span-2' : ''}`}>
       <span className="text-muted-foreground text-sm whitespace-nowrap mr-3">{label}</span>
       <span className="font-medium text-sm text-right">{value}</span>
     </div>
  );
};

// Background person card (family, friend, next of kin)
const PersonCard = ({ person, label, showContact }: { person: any; label: string; showContact?: boolean }) => {
  const name = person.Name || person.name || 'Unknown';
  const relationship = person.Relationship || person.relationship || label;
  const address = person.PhysicalAddress || person.physicalAddress || '';
  const contactNumber = person.ContactNumber || person.contactNumber || '';
  const arrestDisclosed = person.ArrestDisclosed || person.arrestDisclosed || '';
  const criminalHistory = person.CriminalHistory || person.criminalHistory || '';

  const getEmploymentDisplay = () => {
    const status = (person.EmploymentStatus || person.employmentStatus || '').toLowerCase();
    if (status.includes('unemploy')) return 'Unemployed';
    const employer = person.Employer || person.employer || '';
    const position = person.Position || person.position || '';
    const parts = [employer, position].filter(Boolean);
    return parts.length > 0 ? parts.join(' — ') : (status || '—');
  };

  const getArrestDisplay = () => {
    const arrest = arrestDisclosed.toLowerCase();
    const criminal = criminalHistory.toLowerCase();
    if (arrest === 'yes' || criminal.includes('arrest') || criminal.includes('convict')) return 'Yes';
    if (arrest === 'no' || criminal.includes('not aware') || criminal.includes('none') || criminal.includes('no criminal')) return 'No';
    return '—';
  };

  return (
    <div className="p-4 rounded-lg border bg-background">
      <div className="flex items-center gap-2 mb-3">
        <Badge variant="outline" className="text-xs">{relationship}</Badge>
        <span className="font-semibold text-sm">{name}</span>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-1 text-sm">
        {address && (
          <div className="flex justify-between py-1 border-b border-border/30">
            <span className="text-muted-foreground">Address</span>
            <span className="font-medium text-right max-w-[60%]">{address}</span>
          </div>
        )}
        {showContact && contactNumber && (
          <div className="flex justify-between py-1 border-b border-border/30">
            <span className="text-muted-foreground">Contact Number</span>
            <span className="font-medium">{contactNumber}</span>
          </div>
        )}
        <div className="flex justify-between py-1 border-b border-border/30">
          <span className="text-muted-foreground">Employment</span>
          <span className="font-medium">{getEmploymentDisplay()}</span>
        </div>
        {!showContact && (
          <div className="flex justify-between py-1 border-b border-border/30">
            <span className="text-muted-foreground">Arrest Disclosed</span>
            <span className="font-medium">{getArrestDisplay()}</span>
          </div>
        )}
      </div>
    </div>
  );
};

export const RiskProfileDialog = ({ 
  open, 
  onOpenChange, 
  employeeId, 
  reportId,
  candidateName 
}: RiskProfileDialogProps) => {
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<ProfileData | null>(null);

  useEffect(() => {
    if (open && (employeeId || reportId)) {
      fetchProfileData();
    }
  }, [open, employeeId, reportId]);

  const fetchProfileData = async () => {
    setLoading(true);
    try {
      let polygraphReportId = reportId;
      let employee = null;
      let submission = null;
      let popia = null;

      if (employeeId) {
        const [empResult, subResult, popiaResult] = await Promise.all([
          supabase.from("employees").select("*").eq("id", employeeId).single(),
          supabase.from("submissions").select("*").eq("employee_id", employeeId).maybeSingle(),
          supabase.from("popia_acceptances").select("*").eq("employee_id", employeeId).order("accepted_at", { ascending: false }).limit(1).maybeSingle(),
        ]);

        employee = empResult.data;
        submission = subResult.data;
        popia = popiaResult.data;

        if (!polygraphReportId) {
          const { data: candidate } = await supabase
            .from("polygraph_candidates")
            .select("report_id")
            .eq("employee_id", employeeId)
            .maybeSingle();
          
          if (candidate) {
            polygraphReportId = candidate.report_id;
          }
        }
      }

      let polygraphReport = null;
      let examQuestions: any[] = [];
      let admissions: any[] = [];
      let suitability = null;

      if (polygraphReportId) {
        const [reportResult, questionsResult, admissionsResult, suitabilityResult] = await Promise.all([
          supabase
            .from("polygraph_reports")
            .select(`
              *,
              examiners (name, email),
              stores (store_name, store_code)
            `)
            .eq("id", polygraphReportId)
            .single(),
          supabase.from("polygraph_exam_questions").select("*").eq("report_id", polygraphReportId).order("question_number"),
          supabase.from("polygraph_admissions").select("*").eq("report_id", polygraphReportId),
          supabase.from("polygraph_suitability").select("*").eq("report_id", polygraphReportId).maybeSingle(),
        ]);

        polygraphReport = reportResult.data;
        examQuestions = questionsResult.data || [];
        admissions = admissionsResult.data || [];
        suitability = suitabilityResult.data;
      }

      setData({
        employee,
        submission,
        popia,
        polygraphReport,
        examQuestions,
        admissions,
        suitability,
        pdfUrl: null,
      });
    } catch (error) {
      console.error("Error fetching profile data:", error);
    } finally {
      setLoading(false);
    }
  };

  const getResultBadge = (result: string | null) => {
    if (!result) return null;
    if (result === "passed") return <Badge className="bg-green-600 hover:bg-green-700 text-white">{result}</Badge>;
    if (result === "failed") return <Badge className="bg-red-600 hover:bg-red-700 text-white">{result}</Badge>;
    return <Badge variant="secondary">{result}</Badge>;
  };

  const displayName = candidateName || 
    (data?.submission ? `${data.submission.first_name} ${data.submission.last_name}` : 
    (data?.polygraphReport ? `${data.polygraphReport.first_name} ${data.polygraphReport.last_name}` : "Profile"));

  const cleanAddress = (value?: string | null) => {
    if (!value) return "";
    return value
      .split(",")
      .map((p) => p.trim())
      .filter((p) => p.length > 0)
      .filter((p) => !/^n\/?a$/i.test(p) && p.toLowerCase() !== "na")
      .join(", ");
  };

  const cleanedPersonalAddress = cleanAddress(
    data?.submission?.physical_address || data?.polygraphReport?.physical_address
  );

  // Get education data from polygraph report
  const educationHistory = data?.polygraphReport?.education_history || [];
  const eduArr = Array.isArray(educationHistory) ? educationHistory : [educationHistory];
  
  const schoolEntries = eduArr.filter((e: any) => {
    const inst = (e.Institution || e.institution || e.School || e.school || '').toLowerCase();
    const qual = (e.Qualification || e.qualification || e.Degree || e.degree || '').toLowerCase();
    return inst.includes('school') || inst.includes('high') || inst.includes('primary') || qual.includes('grade') || qual.includes('matric');
  });
  const tertiaryEntries = eduArr.filter((e: any) => {
    const inst = (e.Institution || e.institution || e.School || e.school || '').toLowerCase();
    const qual = (e.Qualification || e.qualification || e.Degree || e.degree || '').toLowerCase();
    return !inst.includes('school') && !inst.includes('high') && !inst.includes('primary') && !qual.includes('grade') && !qual.includes('matric');
  });
  const finalSchool = schoolEntries.length > 0 ? schoolEntries : (tertiaryEntries.length === 0 ? eduArr : []);
  const finalTertiary = tertiaryEntries.length > 0 ? tertiaryEntries : [];
  const hasEducation = eduArr.length > 0 && (eduArr[0]?.Institution || eduArr[0]?.institution || eduArr[0]?.School || eduArr[0]?.school);

  // Get suitability from extracted data or suitability table
  const suitabilityData = data?.polygraphReport?.extracted_disclosure ? 
    // Try to get from the extracted_data stored alongside
    null : null;
  // We'll use the polygraph_suitability table data
  const suitInfo = data?.suitability;

  // Family, friends, next of kin from polygraph report
  const familyMembers = (data?.polygraphReport?.family_criminal_history || []) as any[];
  const friendMembers = (data?.polygraphReport?.friend_criminal_history || []) as any[];
  
  // Next of kin - check extracted_data stored in the report or from family data
  // The nextOfKin data is stored in extracted_data column of pending_polygraph_uploads
  // but not carried to polygraph_reports as a separate column. Let's check extracted_disclosure for it.
  const extractedData = data?.polygraphReport?.extracted_disclosure || {};
  
  // Filter family to father/mother/brother/sister only
  const filteredFamily = familyMembers.filter((m: any) => {
    const rel = (m.Relationship || m.relationship || '').toLowerCase();
    return rel.includes('father') || rel.includes('mother') || rel.includes('brother') || rel.includes('sister');
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[95vw] max-w-5xl max-h-[90vh] overflow-y-auto p-3 md:p-6">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-sm md:text-base">
            <Shield className="h-4 w-4 md:h-5 md:w-5 text-primary" />
            <span className="truncate">Risk Profile - {displayName}</span>
          </DialogTitle>
        </DialogHeader>

        {loading ? (
          <div className="flex items-center justify-center py-8 md:py-12">
            <div className="animate-spin rounded-full h-6 w-6 md:h-8 md:w-8 border-b-2 border-primary" />
          </div>
        ) : (
          <Tabs defaultValue="personal" className="w-full">
            <TabsList className="grid w-full grid-cols-3 h-auto">
              <TabsTrigger value="personal" className="text-xs md:text-sm py-2 px-1 md:px-3">Personal Info</TabsTrigger>
              <TabsTrigger value="report" className="text-xs md:text-sm py-2 px-1 md:px-3">Full Report</TabsTrigger>
              <TabsTrigger value="risk" className="text-xs md:text-sm py-2 px-1 md:px-3">Risk Profile</TabsTrigger>
            </TabsList>

            {/* Risk Analysis Tab */}
            <TabsContent value="risk" className="space-y-4 mt-4">
              {data?.polygraphReport?.risk_analysis ? (
                <RiskAnalysisDisplay riskAnalysis={data.polygraphReport.risk_analysis} />
              ) : (
                <Card>
                  <CardContent className="py-8 text-center text-muted-foreground">
                    <Shield className="h-12 w-12 mx-auto mb-4 opacity-50" />
                    <p>No risk analysis available</p>
                  </CardContent>
                </Card>
              )}
            </TabsContent>

            {/* Personal Info Tab */}
             <TabsContent value="personal" className="space-y-4 mt-4">
               <Card className="bg-card">
                 <CardContent className="pt-6 space-y-5">
                   {/* Personal Information */}
                   <div>
                     <h4 className="font-semibold text-sm uppercase tracking-wider text-primary mb-2 border-b pb-1.5 flex items-center gap-2">
                       <User className="h-4 w-4" />
                       Personal Information
                     </h4>
                     <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-0.5 text-sm">
                       <InfoRow label="Full Name" value={displayName} />
                       <InfoRow label="ID Number" value={data?.employee?.id_number || data?.polygraphReport?.id_number} />
                       <InfoRow label="Contact Number" value={data?.submission?.contact_number || data?.polygraphReport?.contact_number} />
                       <InfoRow label="Email Address" value={data?.submission?.email || data?.polygraphReport?.email} />
                       {cleanedPersonalAddress && (
                         <InfoRow label="Physical Address" value={cleanedPersonalAddress} fullWidth />
                       )}
                     </div>
                   </div>

                   {/* Education */}
                   {hasEducation && (
                     <div>
                       <h4 className="font-semibold text-sm uppercase tracking-wider text-primary mb-2 border-b pb-1.5 flex items-center gap-2">
                         <GraduationCap className="h-4 w-4" />
                         Education
                       </h4>
                      <div className="space-y-4">
                        {finalSchool.length > 0 && (
                          <div>
                            <p className="text-xs font-medium text-muted-foreground uppercase mb-2">School</p>
                            {finalSchool.map((edu: any, idx: number) => (
                              <div key={idx} className="grid grid-cols-1 sm:grid-cols-3 gap-x-6 gap-y-1 text-sm mb-2">
                                <div className="flex justify-between py-1 border-b border-border/30">
                                  <span className="text-muted-foreground">School Name</span>
                                  <span className="font-medium">{edu.Institution || edu.institution || edu.School || edu.school || '—'}</span>
                                </div>
                                <div className="flex justify-between py-1 border-b border-border/30">
                                  <span className="text-muted-foreground">Last Grade</span>
                                  <span className="font-medium">{edu.Qualification || edu.qualification || edu.Degree || edu.degree || edu.LastGrade || edu.lastGrade || '—'}</span>
                                </div>
                                <div className="flex justify-between py-1 border-b border-border/30">
                                  <span className="text-muted-foreground">Year Completed</span>
                                  <span className="font-medium">{edu.Year || edu.year || edu.YearOfCompletion || edu.yearOfCompletion || edu.YearCompleted || edu.yearCompleted || edu.Period || edu.period || '—'}</span>
                                </div>
                              </div>
                            ))}
                          </div>
                        )}
                        {finalTertiary.length > 0 && (
                          <div>
                            <p className="text-xs font-medium text-muted-foreground uppercase mb-2">Tertiary Education</p>
                            {finalTertiary.map((edu: any, idx: number) => (
                              <div key={idx} className="grid grid-cols-1 sm:grid-cols-3 gap-x-6 gap-y-1 text-sm mb-2">
                                <div className="flex justify-between py-1 border-b border-border/30">
                                  <span className="text-muted-foreground">Institution</span>
                                  <span className="font-medium">{edu.Institution || edu.institution || edu.School || edu.school || '—'}</span>
                                </div>
                                <div className="flex justify-between py-1 border-b border-border/30">
                                  <span className="text-muted-foreground">Qualification</span>
                                  <span className="font-medium">{edu.Qualification || edu.qualification || edu.Degree || edu.degree || '—'}</span>
                                </div>
                                <div className="flex justify-between py-1 border-b border-border/30">
                                  <span className="text-muted-foreground">Year Completed</span>
                                  <span className="font-medium">{edu.Year || edu.year || edu.YearOfCompletion || edu.yearOfCompletion || edu.YearCompleted || edu.yearCompleted || edu.Period || edu.period || '—'}</span>
                                </div>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                  )}

                   {/* Medical Suitability */}
                   {(suitInfo || data?.polygraphReport) && (
                     <div>
                       <h4 className="font-semibold text-sm uppercase tracking-wider text-primary mb-2 border-b pb-1.5 flex items-center gap-2">
                         <HeartPulse className="h-4 w-4" />
                         Medical Suitability
                       </h4>
                       <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-0.5 text-sm">
                        <div className="flex justify-between py-1 border-b border-border/30">
                          <span className="text-muted-foreground">Current Health Status</span>
                          <span className="font-medium">{suitInfo?.health_status || '—'}</span>
                        </div>
                        <div className="flex justify-between py-1 border-b border-border/30">
                          <span className="text-muted-foreground">Medication (past 24hrs)</span>
                          <span className="font-medium">
                            {suitInfo?.medication_taken === true 
                              ? `Yes${suitInfo?.medication_details ? ` — ${suitInfo.medication_details}` : ''}` 
                              : suitInfo?.medication_taken === false ? 'No' : '—'}
                          </span>
                        </div>
                        <div className="flex justify-between py-1 border-b border-border/30">
                          <span className="text-muted-foreground">Psychological Diagnosis</span>
                          <span className="font-medium">
                            {suitInfo?.psychological_disorders === true ? 'Yes' 
                              : suitInfo?.psychological_disorders === false ? 'No' : '—'}
                          </span>
                        </div>
                        {suitInfo?.pregnant === true && (
                          <div className="flex justify-between py-1 border-b border-border/30">
                            <span className="text-muted-foreground">Pregnant</span>
                            <span className="font-medium text-orange-600">Yes</span>
                          </div>
                        )}
                      </div>
                    </div>
                  )}

                   {/* Family Background - Tree Display */}
                   {filteredFamily.length > 0 && (
                     <FamilyTreeDisplay 
                       familyMembers={filteredFamily} 
                       candidateName={displayName} 
                     />
                   )}

                   {/* Close Friends */}
                   {friendMembers.length > 0 && (
                     <Card className="overflow-hidden">
                       <CardHeader className="bg-gradient-to-r from-primary/10 to-primary/5 border-b py-3">
                         <CardTitle className="flex items-center gap-2 text-lg">
                           <UserCheck className="h-5 w-5 text-primary" />
                           Close Friends
                         </CardTitle>
                       </CardHeader>
                       <CardContent className="p-6">
                         <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                           {friendMembers.map((friend: any, idx: number) => (
                             <FamilyMemberNode key={idx} member={friend} />
                           ))}
                         </div>
                       </CardContent>
                     </Card>
                   )}

                   {/* Next of Kin */}
                   {(() => {
                     const nokFromFamily = familyMembers.filter((m: any) => {
                       const rel = (m.Relationship || m.relationship || '').toLowerCase();
                       return rel.includes('spouse') || rel.includes('partner') || rel.includes('next of kin') || rel.includes('kin');
                     });
                     
                     if (nokFromFamily.length === 0) return null;
                     
                     return (
                       <Card className="overflow-hidden">
                         <CardHeader className="bg-gradient-to-r from-primary/10 to-primary/5 border-b py-3">
                           <CardTitle className="flex items-center gap-2 text-lg">
                             <User className="h-5 w-5 text-primary" />
                             Next of Kin
                           </CardTitle>
                         </CardHeader>
                         <CardContent className="p-6">
                           <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                             {nokFromFamily.map((kin: any, idx: number) => (
                               <FamilyMemberNode key={idx} member={kin} />
                             ))}
                           </div>
                         </CardContent>
                       </Card>
                     );
                   })()}
                </CardContent>
              </Card>
            </TabsContent>

            {/* Full Report Tab */}
            <TabsContent value="report" className="space-y-4 mt-4">
              {/* Report metadata that was removed from personal info */}
              {data?.polygraphReport && (
                <Card>
                  <CardHeader>
                    <CardTitle className="text-base">Report Details</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
                      {data.polygraphReport.stores?.store_name && (
                        <div>
                          <p className="text-muted-foreground">Store</p>
                          <p className="font-medium">{data.polygraphReport.stores.store_name}</p>
                        </div>
                      )}
                      {data.polygraphReport.position_applying_for && (
                        <div>
                          <p className="text-muted-foreground">Position Applied For</p>
                          <p className="font-medium">{data.polygraphReport.position_applying_for}</p>
                        </div>
                      )}
                      {data.polygraphReport.examination_date && (
                        <div>
                          <p className="text-muted-foreground">Examination Date</p>
                          <p className="font-medium">{formatDateSafe(data.polygraphReport.examination_date)}</p>
                        </div>
                      )}
                      {data.polygraphReport.examiners?.name && (
                        <div>
                          <p className="text-muted-foreground">Examiner</p>
                          <p className="font-medium">{data.polygraphReport.examiners.name}</p>
                        </div>
                      )}
                      {data.polygraphReport.overall_result && (
                        <div>
                          <p className="text-muted-foreground">Overall Result</p>
                          {getResultBadge(data.polygraphReport.overall_result)}
                        </div>
                      )}
                    </div>
                  </CardContent>
                </Card>
              )}

              {/* View Original PDF Button */}
              {data?.polygraphReport?.id && (
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <FileText className="h-5 w-5 text-primary" />
                      Original Report Document
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <ViewOriginalPdfButton pdfUrl={data.polygraphReport.report_pdf_url} />
                  </CardContent>
                </Card>
              )}

              {data?.polygraphReport?.extracted_disclosure && (
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <AlertTriangle className="h-5 w-5 text-orange-500" />
                      Disclosure Summary
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
                      {Object.entries(data.polygraphReport.extracted_disclosure).map(([key, value]) => (
                        <div key={key} className="border-b pb-2">
                          <p className="text-muted-foreground capitalize">{key.replace(/_/g, ' ')}</p>
                          <p className="font-medium">
                            {typeof value === 'object' ? JSON.stringify(value, null, 2) : String(value)}
                          </p>
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              )}

              {data?.polygraphReport?.examiner_notes && (
                <Card>
                  <CardHeader>
                    <CardTitle>Examiner Notes</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <p className="whitespace-pre-wrap">{data.polygraphReport.examiner_notes}</p>
                  </CardContent>
                </Card>
              )}

              {data?.polygraphReport?.post_exam_admissions && (
                <Card>
                  <CardHeader>
                    <CardTitle>Post-Exam Admissions</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <p className="whitespace-pre-wrap">{data.polygraphReport.post_exam_admissions}</p>
                  </CardContent>
                </Card>
              )}
            </TabsContent>
          </Tabs>
        )}
      </DialogContent>
    </Dialog>
  );
};

export default RiskProfileDialog;