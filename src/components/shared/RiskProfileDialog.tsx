import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle as AlertTitle,
} from "@/components/ui/alert-dialog";
import { Shield, FileText, User, AlertTriangle, Download, X, GraduationCap, HeartPulse, Users, UserCheck, ChevronDown, Lock } from "lucide-react";
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
  pdfFileName: string | null;
}

// PDF Preview Modal - with anti-screenshot protections
const PdfPreviewModal = ({ 
  open, 
  onClose, 
  pdfUrl,
  reportId,
  fileName 
}: { 
  open: boolean; 
  onClose: () => void; 
  pdfUrl: string;
  reportId?: string;
  fileName?: string;
}) => {
  useEffect(() => {
    if (open && reportId) {
      // Log view access
      supabase.auth.getUser().then(({ data }) => {
        if (data.user) {
          supabase.from('report_access_log').insert({
            report_id: reportId,
            user_id: data.user.id,
            access_type: 'view',
          });
        }
      });
    }
  }, [open, reportId]);

  useEffect(() => {
    if (!open) return;
    // Disable keyboard shortcuts for print/save
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && (e.key === 'p' || e.key === 's' || e.key === 'P' || e.key === 'S')) {
        e.preventDefault();
        e.stopPropagation();
      }
      // Disable PrintScreen
      if (e.key === 'PrintScreen') {
        e.preventDefault();
      }
    };
    window.addEventListener('keydown', handleKeyDown, true);
    return () => window.removeEventListener('keydown', handleKeyDown, true);
  }, [open]);

  if (!open) return null;

  return (
    <div 
      className="fixed inset-0 z-[100] bg-black/80 flex items-center justify-center p-4"
      onContextMenu={(e) => e.preventDefault()}
    >
      <style>{`
        @media print {
          .pdf-preview-protected, .pdf-preview-protected * { 
            display: none !important; 
            visibility: hidden !important; 
          }
          body::after {
            content: "Printing is disabled for this document.";
            display: block;
            font-size: 24px;
            text-align: center;
            padding: 50px;
          }
        }
      `}</style>
      <div 
        className="pdf-preview-protected relative w-full max-w-5xl h-[90vh] bg-background rounded-lg overflow-hidden flex flex-col"
        style={{ userSelect: 'none', WebkitTouchCallout: 'none' } as React.CSSProperties}
      >
        <div className="flex items-center justify-between p-4 border-b">
          <h3 className="font-semibold flex items-center gap-2">
            <Lock className="h-4 w-4 text-muted-foreground" />
            Protected Document Preview
          </h3>
          <Button variant="ghost" size="icon" onClick={onClose}>
            <X className="h-4 w-4" />
          </Button>
        </div>
        <div className="flex-1 w-full">
          <iframe
            src={fileName?.toLowerCase().endsWith('.docx') || fileName?.toLowerCase().endsWith('.doc')
              ? `https://docs.google.com/gview?url=${encodeURIComponent(pdfUrl)}&embedded=true`
              : `${pdfUrl}#toolbar=0&navpanes=0`
            }
            className="w-full h-full border-0"
            title="Document Preview"
          />
        </div>
      </div>
    </div>
  );
};

// Secure PDF button with download tracking and password gate
const ViewOriginalPdfButton = ({ pdfUrl, reportId, fileName }: { pdfUrl: string | null; reportId?: string; fileName?: string }) => {
  const [previewOpen, setPreviewOpen] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [passwordDialogOpen, setPasswordDialogOpen] = useState(false);
  const [password, setPassword] = useState("");
  const [passwordError, setPasswordError] = useState(false);

  if (!pdfUrl) {
    return (
      <p className="text-muted-foreground text-sm">
        No PDF document was stored for this report. Reports uploaded before this feature was added will not have a PDF available.
      </p>
    );
  }

  const executeDownload = async () => {
    setDownloading(true);
    try {
      const { data: userData } = await supabase.auth.getUser();
      if (userData.user && reportId) {
        await supabase.from('report_access_log').insert({
          report_id: reportId,
          user_id: userData.user.id,
          access_type: 'download',
        });
      }
      
      const response = await fetch(pdfUrl);
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = fileName || 'polygraph-report.pdf';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      toast.success("Report downloaded successfully");
    } catch (error) {
      console.error("Download failed:", error);
      toast.error("Failed to download report");
    } finally {
      setDownloading(false);
    }
  };

  const handleDownload = async () => {
    if (!reportId) {
      await executeDownload();
      return;
    }
    
    const { data: userData } = await supabase.auth.getUser();
    if (!userData.user) return;
    
    const { count } = await supabase
      .from('report_access_log')
      .select('*', { count: 'exact', head: true })
      .eq('report_id', reportId)
      .eq('user_id', userData.user.id)
      .eq('access_type', 'download');
    
    if (count && count > 0) {
      setPasswordDialogOpen(true);
      return;
    }
    
    await executeDownload();
  };

  const handlePasswordSubmit = async () => {
    if (password === 'TLDV0011') {
      setPasswordDialogOpen(false);
      setPassword("");
      setPasswordError(false);
      await executeDownload();
    } else {
      setPasswordError(true);
    }
  };

  return (
    <>
      <div className="flex items-center gap-4">
        <Button variant="outline" onClick={() => setPreviewOpen(true)} className="flex items-center gap-2">
          <FileText className="h-4 w-4" />
          Preview PDF Report
        </Button>
        <Button 
          variant="ghost" 
          size="sm" 
          onClick={handleDownload}
          disabled={downloading}
          className="flex items-center gap-2"
        >
          <Download className="h-4 w-4" />
          {downloading ? "Downloading..." : "Download"}
        </Button>
      </div>
      <PdfPreviewModal 
        open={previewOpen} 
        onClose={() => setPreviewOpen(false)} 
        pdfUrl={pdfUrl}
        reportId={reportId}
        fileName={fileName}
      />

      {/* Password Dialog for re-downloads */}
      <AlertDialog open={passwordDialogOpen} onOpenChange={setPasswordDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertTitle className="flex items-center gap-2">
              <Shield className="h-5 w-5" />
              Master Password Required
            </AlertTitle>
            <AlertDialogDescription>
              You have already downloaded this report. Enter the master password to download again.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="py-4">
            <Input
              type="password"
              placeholder="Enter master password"
              value={password}
              onChange={(e) => { setPassword(e.target.value); setPasswordError(false); }}
              onKeyDown={(e) => e.key === 'Enter' && handlePasswordSubmit()}
              className={passwordError ? 'border-destructive' : ''}
            />
            {passwordError && (
              <p className="text-destructive text-sm mt-2">Incorrect password. Please try again.</p>
            )}
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => { setPassword(""); setPasswordError(false); }}>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handlePasswordSubmit}>
              Verify & Download
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
};
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

// Info row helper - inline label: value
const InfoRow = ({ label, value }: { label: string; value: string | null | undefined; fullWidth?: boolean }) => {
  if (!value || value === '—') return null;
  return (
    <div className="flex items-baseline py-1.5 border-b border-border/20">
      <span className="text-muted-foreground text-sm w-40 flex-shrink-0">{label}:</span>
      <span className="font-medium text-sm">{value}</span>
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
  const [openSection, setOpenSection] = useState<string | null>("personal");

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

        // Fallback: if no suitability record exists, try to pull from pending_polygraph_uploads extracted_data
        if (!suitability && polygraphReport) {
          const { data: pendingUpload } = await supabase
            .from("pending_polygraph_uploads")
            .select("extracted_data")
            .eq("id_number", polygraphReport.id_number)
            .eq("status", "approved")
            .order("updated_at", { ascending: false })
            .limit(1)
            .maybeSingle();

          if (pendingUpload?.extracted_data) {
            const ext = pendingUpload.extracted_data as any;
            const s = ext?.suitability;
            if (s) {
              suitability = {
                health_status: s.healthStatus || null,
                enough_sleep: s.enoughSleep ?? null,
                hospitalized_recently: s.hospitalizedRecently ?? null,
                hospitalized_details: s.hospitalizedDetails || null,
                medication_taken: s.medicationTaken ?? null,
                medication_details: s.medicationDetails || null,
                heart_conditions: s.heartConditions ?? null,
                breathing_trouble: s.breathingTrouble ?? null,
                psychological_disorders: s.psychologicalDisorders ?? null,
                diabetic: s.diabetic ?? null,
                recent_drug_use: s.recentDrugUse ?? null,
                drug_use_details: s.drugUseDetails || null,
                recent_alcohol_use: s.recentAlcoholUse ?? null,
                alcohol_details: s.alcoholDetails || null,
                smoker: s.smoker ?? null,
                smoking_details: s.smokingDetails || null,
                pregnant: s.pregnant ?? null,
                suitable_for_exam: s.suitableForExam ?? null,
                suitability_comment: s.suitabilityComment || null,
              };
            }
          }
        }
      }

      // Fetch Next of Kin fallback from pending_polygraph_uploads
      let nextOfKinFallback: any[] = [];
      if (polygraphReport) {
        const familyData = (polygraphReport.family_criminal_history || []) as any[];
        const hasNokInFamily = familyData.some((m: any) => {
          const rel = (m.Relationship || m.relationship || '').toLowerCase();
          return rel.includes('spouse') || rel.includes('partner') || rel.includes('next of kin') || rel.includes('kin');
        });
        if (!hasNokInFamily) {
          const { data: pendingNok } = await supabase
            .from("pending_polygraph_uploads")
            .select("extracted_data")
            .eq("id_number", polygraphReport.id_number)
            .eq("status", "approved")
            .order("updated_at", { ascending: false })
            .limit(1)
            .maybeSingle();
          if (pendingNok?.extracted_data) {
            const ext = pendingNok.extracted_data as any;
            nextOfKinFallback = Array.isArray(ext?.nextOfKin) ? ext.nextOfKin : [];
          }
        }
      }

      // Generate signed URL for the PDF if available
      let pdfUrl: string | null = null;
      let pdfFileName: string | null = null;
      if (polygraphReport?.report_pdf_url) {
        const rawUrl = polygraphReport.report_pdf_url;
        const urlPath = rawUrl.split('?')[0];
        pdfFileName = decodeURIComponent(urlPath.split('/').pop() || 'polygraph-report');

        const storagePath = rawUrl.includes('/polygraph-reports/')
          ? rawUrl.split('/polygraph-reports/').pop()
          : rawUrl;
        
        if (storagePath) {
          const { data: signedData } = await supabase.storage
            .from("polygraph-reports")
            .createSignedUrl(decodeURIComponent(storagePath), 3600);
          pdfUrl = signedData?.signedUrl || null;
        }
      }

      setData({
        employee,
        submission,
        popia,
        polygraphReport,
        examQuestions,
        admissions,
        suitability,
        pdfUrl,
        pdfFileName,
        _nextOfKin: nextOfKinFallback,
      } as any);
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
  
  const extractedData = data?.polygraphReport?.extracted_disclosure || {};
  
  // Filter family to father/mother/brother/sister only
  const filteredFamily = familyMembers.filter((m: any) => {
    const rel = (m.Relationship || m.relationship || '').toLowerCase();
    return rel.includes('father') || rel.includes('mother') || rel.includes('brother') || rel.includes('sister');
  });

  // Next of Kin: first check family_criminal_history for spouse/partner/kin entries
  const nokFromFamilyData = familyMembers.filter((m: any) => {
    const rel = (m.Relationship || m.relationship || '').toLowerCase();
    return rel.includes('spouse') || rel.includes('partner') || rel.includes('next of kin') || rel.includes('kin');
  });

  // Fallback: pull from pending_polygraph_uploads extracted_data.nextOfKin (stored during fetch)
  const nokFallback = (data as any)?._nextOfKin || [];
  const nextOfKinMembers = nokFromFamilyData.length > 0 ? nokFromFamilyData : nokFallback;

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
              {data?.polygraphReport ? (
                <RiskAnalysisDisplay 
                  polygraphReport={data.polygraphReport}
                  examQuestions={data.examQuestions || []}
                  riskAnalysis={data.polygraphReport.risk_analysis}
                />
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
                 <CardContent className="pt-4 space-y-0">
                   {/* Personal Information Accordion */}
                   <div className="border-b border-border/30">
                     <button
                       onClick={() => setOpenSection(openSection === 'personal' ? null : 'personal')}
                       className="w-full flex items-center justify-between py-3 cursor-pointer hover:bg-muted/30 rounded-md px-2 transition-colors"
                     >
                       <div className="flex items-center gap-2">
                         <User className="h-4 w-4 text-primary" />
                         <span className="font-semibold text-sm uppercase tracking-wider text-primary">Personal Information</span>
                       </div>
                       <ChevronDown className={`h-4 w-4 text-primary transition-transform duration-300 ${openSection === 'personal' ? 'rotate-180' : ''}`} />
                     </button>
                     <div className={`overflow-hidden transition-all duration-300 ease-in-out ${openSection === 'personal' ? 'max-h-[500px] opacity-100 pb-4' : 'max-h-0 opacity-0'}`}>
                       <div className="px-2 space-y-0">
                         <InfoRow label="Full Name" value={displayName} />
                         <InfoRow label="ID Number" value={data?.employee?.id_number || data?.polygraphReport?.id_number} />
                         <InfoRow label="Contact Number" value={data?.submission?.contact_number || data?.polygraphReport?.contact_number} />
                         <InfoRow label="Email Address" value={data?.submission?.email || data?.polygraphReport?.email} />
                         {cleanedPersonalAddress && (
                           <InfoRow label="Physical Address" value={cleanedPersonalAddress} />
                         )}
                       </div>
                     </div>
                   </div>

                   {/* Education Accordion */}
                   {hasEducation && (
                     <div className="border-b border-border/30">
                       <button
                         onClick={() => setOpenSection(openSection === 'education' ? null : 'education')}
                         className="w-full flex items-center justify-between py-3 cursor-pointer hover:bg-muted/30 rounded-md px-2 transition-colors"
                       >
                         <div className="flex items-center gap-2">
                           <GraduationCap className="h-4 w-4 text-primary" />
                           <span className="font-semibold text-sm uppercase tracking-wider text-primary">Education</span>
                         </div>
                         <ChevronDown className={`h-4 w-4 text-primary transition-transform duration-300 ${openSection === 'education' ? 'rotate-180' : ''}`} />
                       </button>
                       <div className={`overflow-hidden transition-all duration-300 ease-in-out ${openSection === 'education' ? 'max-h-[600px] opacity-100 pb-4' : 'max-h-0 opacity-0'}`}>
                         <div className="px-2 space-y-4">
                           {finalSchool.length > 0 && (
                             <div>
                               <p className="text-xs font-medium text-muted-foreground uppercase mb-1">School</p>
                               {finalSchool.map((edu: any, idx: number) => (
                                 <div key={idx} className="space-y-0 mb-3">
                                   <InfoRow label="School Name" value={edu.Institution || edu.institution || edu.School || edu.school} />
                                   <InfoRow label="Last Grade" value={edu.Qualification || edu.qualification || edu.Degree || edu.degree || edu.LastGrade || edu.lastGrade} />
                                   <InfoRow label="Year Completed" value={edu.Year || edu.year || edu.YearOfCompletion || edu.yearOfCompletion || edu.YearCompleted || edu.yearCompleted || edu.Period || edu.period} />
                                 </div>
                               ))}
                             </div>
                           )}
                           {finalTertiary.length > 0 && (
                             <div>
                               <p className="text-xs font-medium text-muted-foreground uppercase mb-1">Tertiary Education</p>
                               {finalTertiary.map((edu: any, idx: number) => (
                                 <div key={idx} className="space-y-0 mb-3">
                                   <InfoRow label="Institution" value={edu.Institution || edu.institution || edu.School || edu.school} />
                                   <InfoRow label="Qualification" value={edu.Qualification || edu.qualification || edu.Degree || edu.degree} />
                                   <InfoRow label="Year Completed" value={edu.Year || edu.year || edu.YearOfCompletion || edu.yearOfCompletion || edu.YearCompleted || edu.yearCompleted || edu.Period || edu.period} />
                                 </div>
                               ))}
                             </div>
                           )}
                         </div>
                       </div>
                     </div>
                   )}

                   {/* Medical Suitability Accordion */}
                   {(suitInfo || data?.polygraphReport) && (
                     <div className="border-b border-border/30">
                       <button
                         onClick={() => setOpenSection(openSection === 'medical' ? null : 'medical')}
                         className="w-full flex items-center justify-between py-3 cursor-pointer hover:bg-muted/30 rounded-md px-2 transition-colors"
                       >
                         <div className="flex items-center gap-2">
                           <HeartPulse className="h-4 w-4 text-primary" />
                           <span className="font-semibold text-sm uppercase tracking-wider text-primary">Medical Suitability</span>
                         </div>
                         <ChevronDown className={`h-4 w-4 text-primary transition-transform duration-300 ${openSection === 'medical' ? 'rotate-180' : ''}`} />
                       </button>
                       <div className={`overflow-hidden transition-all duration-300 ease-in-out ${openSection === 'medical' ? 'max-h-[800px] opacity-100 pb-4' : 'max-h-0 opacity-0'}`}>
                        <div className="px-2 space-y-0">
                            <InfoRow label="Health Status" value={suitInfo?.health_status} />
                            <InfoRow 
                              label="Enough Sleep (6hrs+)" 
                              value={suitInfo?.enough_sleep === true ? 'Yes' 
                                : suitInfo?.enough_sleep === false ? 'No' : undefined} 
                            />
                            <InfoRow 
                              label="Hospitalized (6 months)" 
                              value={suitInfo?.hospitalized_recently === true 
                                ? `Yes${suitInfo?.hospitalized_details ? ` — ${suitInfo.hospitalized_details}` : ''}` 
                                : suitInfo?.hospitalized_recently === false ? 'No' : undefined} 
                            />
                            <InfoRow 
                              label="Medication" 
                              value={suitInfo?.medication_taken === true 
                                ? `Yes${suitInfo?.medication_details ? ` — ${suitInfo.medication_details}` : ''}` 
                                : suitInfo?.medication_taken === false ? 'No' : undefined} 
                            />
                            <InfoRow 
                              label="Heart Conditions" 
                              value={suitInfo?.heart_conditions === true ? 'Yes' 
                                : suitInfo?.heart_conditions === false ? 'No' : undefined} 
                            />
                            <InfoRow 
                              label="Breathing Trouble" 
                              value={suitInfo?.breathing_trouble === true ? 'Yes' 
                                : suitInfo?.breathing_trouble === false ? 'No' : undefined} 
                            />
                            <InfoRow 
                              label="Psychological Diagnosis" 
                              value={suitInfo?.psychological_disorders === true 
                                ? `Yes${suitInfo?.suitability_comment ? ` — ${suitInfo.suitability_comment}` : ''}` 
                                : suitInfo?.psychological_disorders === false ? 'No' : undefined} 
                            />
                            <InfoRow 
                              label="Diabetic" 
                              value={suitInfo?.diabetic === true ? 'Yes' 
                                : suitInfo?.diabetic === false ? 'No' : undefined} 
                            />
                            <InfoRow 
                              label="Recent Drug Use (72hrs)" 
                              value={suitInfo?.recent_drug_use === true 
                                ? `Yes${suitInfo?.drug_use_details ? ` — ${suitInfo.drug_use_details}` : ''}` 
                                : suitInfo?.recent_drug_use === false ? 'No' : undefined} 
                            />
                            <InfoRow 
                              label="Alcohol Use (24hrs)" 
                              value={suitInfo?.recent_alcohol_use === true 
                                ? `Yes${suitInfo?.alcohol_details ? ` — ${suitInfo.alcohol_details}` : ''}` 
                                : suitInfo?.recent_alcohol_use === false ? 'No' : undefined} 
                            />
                            <InfoRow 
                              label="Smoker" 
                              value={suitInfo?.smoker === true 
                                ? `Yes${suitInfo?.smoking_details ? ` — ${suitInfo.smoking_details}` : ''}` 
                                : suitInfo?.smoker === false ? 'No' : undefined} 
                            />
                            {suitInfo?.pregnant === true && (
                              <InfoRow label="Pregnant" value="Yes" />
                            )}
                            <InfoRow 
                              label="Suitable for Exam" 
                              value={suitInfo?.suitable_for_exam === true ? 'Yes' 
                                : suitInfo?.suitable_for_exam === false ? 'No' : undefined} 
                            />
                          </div>
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
                   {nextOfKinMembers.length > 0 && (
                     <Card className="overflow-hidden">
                       <CardHeader className="bg-gradient-to-r from-primary/10 to-primary/5 border-b py-3">
                         <CardTitle className="flex items-center gap-2 text-lg">
                           <User className="h-5 w-5 text-primary" />
                           Next of Kin
                         </CardTitle>
                       </CardHeader>
                       <CardContent className="p-6">
                         <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                           {nextOfKinMembers.map((kin: any, idx: number) => (
                             <FamilyMemberNode key={idx} member={kin} hideArrest />
                           ))}
                         </div>
                       </CardContent>
                     </Card>
                   )}
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
                    <ViewOriginalPdfButton pdfUrl={data.pdfUrl} reportId={data.polygraphReport?.id} fileName={data.pdfFileName || undefined} />
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