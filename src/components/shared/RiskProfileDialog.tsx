import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Shield, FileText, MapPin, CheckCircle, User, AlertTriangle, ExternalLink } from "lucide-react";
import { format } from "date-fns";
import RiskAnalysisDisplay from "@/components/reports/RiskAnalysisDisplay";

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
}

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
      });
    } catch (error) {
      console.error("Error fetching profile data:", error);
    } finally {
      setLoading(false);
    }
  };

  const getResultBadge = (result: string | null) => {
    if (!result) return null;
    const variants: Record<string, "default" | "destructive" | "secondary"> = {
      passed: "default",
      failed: "destructive",
      inconclusive: "secondary",
    };
    return <Badge variant={variants[result] || "secondary"}>{result}</Badge>;
  };

  const getFindingBadge = (finding: string | null) => {
    if (!finding) return null;
    const config: Record<string, { color: string; label: string }> = {
      SR: { color: "bg-red-500 text-white", label: "SR (Significant Response)" },
      NSR: { color: "bg-green-500 text-white", label: "NSR (No Significant Response)" },
      INC: { color: "bg-orange-500 text-white", label: "INC (Inconclusive)" },
      PNC: { color: "bg-gray-500 text-white", label: "PNC (Position Not Confirmed)" },
    };
    const c = config[finding.toUpperCase()] || { color: "bg-gray-400", label: finding };
    return <Badge className={c.color}>{c.label}</Badge>;
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
            <TabsList className="grid w-full grid-cols-5">
              <TabsTrigger value="risk">Risk Analysis</TabsTrigger>
              <TabsTrigger value="personal">Personal Info</TabsTrigger>
              <TabsTrigger value="exam">Exam Questions</TabsTrigger>
              <TabsTrigger value="popia">POPIA & Location</TabsTrigger>
              <TabsTrigger value="report">Full Report</TabsTrigger>
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

            {/* Exam Questions Tab */}
            <TabsContent value="exam" className="space-y-4 mt-4">
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <FileText className="h-5 w-5" />
                    Examination Questions & Findings
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  {data?.examQuestions && data.examQuestions.length > 0 ? (
                    <div className="space-y-4">
                      {data.examQuestions.map((q, idx) => (
                        <div key={q.id} className="flex items-start gap-4 p-4 border rounded-lg">
                          <div className="flex-shrink-0 w-8 h-8 bg-primary/10 rounded-full flex items-center justify-center">
                            <span className="text-sm font-medium">{q.question_number || idx + 1}</span>
                          </div>
                          <div className="flex-grow">
                            <p className="font-medium mb-2">{q.question_text}</p>
                            <div className="flex items-center gap-4">
                              <span className="text-sm text-muted-foreground">
                                Response: {q.response === true ? "Yes" : q.response === false ? "No" : "-"}
                              </span>
                              {getFindingBadge(q.finding)}
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-muted-foreground text-center py-8">No exam questions on record</p>
                  )}
                </CardContent>
              </Card>
            </TabsContent>

            {/* POPIA & Location Tab */}
            <TabsContent value="popia" className="space-y-4 mt-4">
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <CheckCircle className="h-5 w-5 text-green-500" />
                    POPIA Declaration
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  {data?.popia ? (
                    <div className="space-y-4">
                      <div className="grid grid-cols-2 gap-4">
                        <div>
                          <p className="text-sm text-muted-foreground">Accepted At</p>
                          <p className="font-medium">
                            {format(new Date(data.popia.accepted_at), "PPpp")}
                          </p>
                        </div>
                        <div>
                          <p className="text-sm text-muted-foreground">IP Address</p>
                          <p className="font-medium">{data.popia.ip_address}</p>
                        </div>
                      </div>
                      <div>
                        <p className="text-sm text-muted-foreground mb-2">Declaration Text</p>
                        <p className="text-sm bg-muted p-4 rounded-lg whitespace-pre-wrap">
                          {data.popia.declaration_text}
                        </p>
                      </div>
                    </div>
                  ) : (
                    <p className="text-muted-foreground text-center py-4">No POPIA declaration on record</p>
                  )}
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <MapPin className="h-5 w-5 text-blue-500" />
                    Geo Location Verification
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  {data?.submission?.geolocation_lat && data?.submission?.geolocation_lng ? (
                    <div className="space-y-4">
                      <div className="grid grid-cols-2 gap-4">
                        <div>
                          <p className="text-sm text-muted-foreground">Coordinates</p>
                          <p className="font-medium">
                            {data.submission.geolocation_lat}, {data.submission.geolocation_lng}
                          </p>
                        </div>
                        <div>
                          <p className="text-sm text-muted-foreground">Geofence Verified</p>
                          <Badge variant={data.submission.geofence_verified ? "default" : "destructive"}>
                            {data.submission.geofence_verified ? "Verified" : "Not Verified"}
                          </Badge>
                        </div>
                        {data.submission.geofence_distance_meters && (
                          <div>
                            <p className="text-sm text-muted-foreground">Distance from Store</p>
                            <p className="font-medium">{Math.round(data.submission.geofence_distance_meters)}m</p>
                          </div>
                        )}
                      </div>
                      <Button variant="outline" size="sm" asChild>
                        <a
                          href={`https://www.google.com/maps?q=${data.submission.geolocation_lat},${data.submission.geolocation_lng}`}
                          target="_blank"
                          rel="noopener noreferrer"
                        >
                          <ExternalLink className="h-4 w-4 mr-2" />
                          View on Google Maps
                        </a>
                      </Button>
                    </div>
                  ) : data?.popia?.gps_latitude && data?.popia?.gps_longitude ? (
                    <div className="space-y-4">
                      <div className="grid grid-cols-2 gap-4">
                        <div>
                          <p className="text-sm text-muted-foreground">Coordinates (from POPIA)</p>
                          <p className="font-medium">
                            {data.popia.gps_latitude}, {data.popia.gps_longitude}
                          </p>
                        </div>
                      </div>
                      <Button variant="outline" size="sm" asChild>
                        <a
                          href={`https://www.google.com/maps?q=${data.popia.gps_latitude},${data.popia.gps_longitude}`}
                          target="_blank"
                          rel="noopener noreferrer"
                        >
                          <ExternalLink className="h-4 w-4 mr-2" />
                          View on Google Maps
                        </a>
                      </Button>
                    </div>
                  ) : (
                    <p className="text-muted-foreground text-center py-4">No location data on record</p>
                  )}
                </CardContent>
              </Card>
            </TabsContent>

            {/* Full Report Tab */}
            <TabsContent value="report" className="space-y-4 mt-4">
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
