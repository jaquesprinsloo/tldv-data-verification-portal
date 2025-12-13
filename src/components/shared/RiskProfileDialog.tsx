import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Shield, FileText, User, AlertTriangle, ExternalLink, Download } from "lucide-react";
import { format } from "date-fns";
import RiskAnalysisDisplay from "@/components/reports/RiskAnalysisDisplay";
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

// Component to view the original PDF
const ViewOriginalPdfButton = ({ pdfUrl }: { pdfUrl: string | null }) => {
  if (!pdfUrl) {
    return (
      <p className="text-muted-foreground text-sm">
        No PDF document was stored for this report. Reports uploaded before this feature was added will not have a PDF available.
      </p>
    );
  }

  return (
    <div className="flex items-center gap-4">
      <Button
        variant="outline"
        onClick={() => window.open(pdfUrl, "_blank")}
        className="flex items-center gap-2"
      >
        <ExternalLink className="h-4 w-4" />
        View Original PDF Report
      </Button>
      <Button variant="ghost" size="sm" asChild>
        <a href={pdfUrl} download className="flex items-center gap-2">
          <Download className="h-4 w-4" />
          Download
        </a>
      </Button>
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

      // If we have an employee ID, fetch their data
      if (employeeId) {
        const [empResult, subResult, popiaResult] = await Promise.all([
          supabase.from("employees").select("*").eq("id", employeeId).single(),
          supabase.from("submissions").select("*").eq("employee_id", employeeId).maybeSingle(),
          supabase.from("popia_acceptances").select("*").eq("employee_id", employeeId).order("accepted_at", { ascending: false }).limit(1).maybeSingle(),
        ]);

        employee = empResult.data;
        submission = subResult.data;
        popia = popiaResult.data;

        // Find polygraph report linked to this employee via candidate
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

      // Fetch polygraph report data if we have a report ID
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
    if (result === "passed") {
      return <Badge className="bg-green-600 hover:bg-green-700 text-white">{result}</Badge>;
    }
    if (result === "failed") {
      return <Badge className="bg-red-600 hover:bg-red-700 text-white">{result}</Badge>;
    }
    return <Badge variant="secondary">{result}</Badge>;
  };

  const displayName = candidateName || 
    (data?.submission ? `${data.submission.first_name} ${data.submission.last_name}` : 
    (data?.polygraphReport ? `${data.polygraphReport.first_name} ${data.polygraphReport.last_name}` : "Profile"));

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-5xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Shield className="h-5 w-5 text-primary" />
            Risk Profile - {displayName}
          </DialogTitle>
        </DialogHeader>

        {loading ? (
          <div className="flex items-center justify-center py-12">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
          </div>
        ) : (
          <Tabs defaultValue="risk" className="w-full">
            <TabsList className="grid w-full grid-cols-3">
              <TabsTrigger value="risk">Risk Analysis</TabsTrigger>
              <TabsTrigger value="personal">Personal Info</TabsTrigger>
              <TabsTrigger value="report">Full Report Summary</TabsTrigger>
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
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <User className="h-5 w-5" />
                    Personal Information
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <p className="text-sm text-muted-foreground">Full Name</p>
                      <p className="font-medium">{displayName}</p>
                    </div>
                    <div>
                      <p className="text-sm text-muted-foreground">ID Number</p>
                      <p className="font-medium">
                        {data?.employee?.id_number || data?.polygraphReport?.id_number || "-"}
                      </p>
                    </div>
                    <div>
                      <p className="text-sm text-muted-foreground">Employee Number</p>
                      <p className="font-medium">{data?.employee?.employee_number || "-"}</p>
                    </div>
                    <div>
                      <p className="text-sm text-muted-foreground">Contact Number</p>
                      <p className="font-medium">
                        {data?.submission?.contact_number || data?.polygraphReport?.contact_number || "-"}
                      </p>
                    </div>
                    <div>
                      <p className="text-sm text-muted-foreground">Email</p>
                      <p className="font-medium">
                        {data?.submission?.email || data?.polygraphReport?.email || "-"}
                      </p>
                    </div>
                    <div>
                      <p className="text-sm text-muted-foreground">Position</p>
                      <p className="font-medium">{data?.polygraphReport?.position_applying_for || "-"}</p>
                    </div>
                    <div className="col-span-2">
                      <p className="text-sm text-muted-foreground">Physical Address</p>
                      <p className="font-medium">
                        {data?.submission?.physical_address || data?.polygraphReport?.physical_address || "-"}
                      </p>
                    </div>
                    <div>
                      <p className="text-sm text-muted-foreground">Store</p>
                      <p className="font-medium">{data?.polygraphReport?.stores?.store_name || "-"}</p>
                    </div>
                    <div>
                      <p className="text-sm text-muted-foreground">Examination Date</p>
                      <p className="font-medium">
                        {data?.polygraphReport?.examination_date 
                          ? format(new Date(data.polygraphReport.examination_date), "PP")
                          : "-"}
                      </p>
                    </div>
                    <div>
                      <p className="text-sm text-muted-foreground">Examiner</p>
                      <p className="font-medium">{data?.polygraphReport?.examiners?.name || "-"}</p>
                    </div>
                    <div>
                      <p className="text-sm text-muted-foreground">Overall Result</p>
                      {getResultBadge(data?.polygraphReport?.overall_result)}
                    </div>
                  </div>
                </CardContent>
              </Card>
            </TabsContent>

            {/* Full Report Summary Tab */}
            <TabsContent value="report" className="space-y-4 mt-4">
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
