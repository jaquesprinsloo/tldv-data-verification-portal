import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ScrollArea } from "@/components/ui/scroll-area";
import { ArrowLeft, Check, X, Eye, FileText, Loader2, Clock, AlertTriangle, Download, Save, Sparkles } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { markBadgeLastSeenForUser } from "@/hooks/useBadgeLastSeen";
import AdminHeader from "@/components/admin/AdminHeader";
import PolygraphSummaryView from "@/components/reports/PolygraphSummaryView";
import { format } from "date-fns";

interface PendingUpload {
  id: string;
  original_file_name: string;
  original_file_url: string;
  converted_pdf_url: string | null;
  extracted_data: any;
  first_name: string | null;
  last_name: string | null;
  id_number: string | null;
  email: string | null;
  contact_number: string | null;
  physical_address: string | null;
  position_applying_for: string | null;
  risk_score: number | null;
  risk_level: string | null;
  risk_analysis: any;
  examination_date: string | null;
  overall_result: string | null;
  status: string;
  created_at: string;
  uploaded_by: string;
  account_id: string | null;
  store_id: string | null;
  examiner_id: string | null;
  accounts?: { name: string } | null;
  stores?: { store_name: string; store_code: string } | null;
  examiners?: { name: string } | null;
  profiles?: { full_name: string; email: string } | null;
}

interface Store {
  id: string;
  store_name: string;
  store_code: string;
  account_id: string | null;
}

interface Examiner {
  id: string;
  name: string;
}

interface Account {
  id: string;
  name: string;
}

const PendingPolygraphReview = () => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [user, setUser] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [pendingUploads, setPendingUploads] = useState<PendingUpload[]>([]);
  const [selectedUpload, setSelectedUpload] = useState<PendingUpload | null>(null);
  const [reviewDialogOpen, setReviewDialogOpen] = useState(false);
  const [rejectDialogOpen, setRejectDialogOpen] = useState(false);
  const [rejectionReason, setRejectionReason] = useState("");
  const [processing, setProcessing] = useState(false);
  const [converting, setConverting] = useState(false);
  const [extracting, setExtracting] = useState(false);
  
  // Editable fields
  const [editedData, setEditedData] = useState<any>({});
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [stores, setStores] = useState<Store[]>([]);
  const [examiners, setExaminers] = useState<Examiner[]>([]);
  const [selectedAccountId, setSelectedAccountId] = useState("");
  const [selectedStoreId, setSelectedStoreId] = useState("");
  const [selectedExaminerId, setSelectedExaminerId] = useState("");

  useEffect(() => {
    checkAuth();
    fetchPendingUploads();
    fetchDropdownData();
  }, []);

  useEffect(() => {
    if (selectedAccountId) {
      fetchStoresByAccount(selectedAccountId);
    } else {
      setStores([]);
    }
  }, [selectedAccountId]);

  const checkAuth = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        navigate("/admin/login");
        return;
      }
      markBadgeLastSeenForUser(user.id, "pending-polygraph-review");
      
      const { data: isMasterAdmin } = await supabase.rpc("is_master_admin", { _user_id: user.id });
      if (!isMasterAdmin) {
        toast({
          title: "Access Denied",
          description: "Only master admins can access the pending review page.",
          variant: "destructive",
        });
        navigate("/admin/portal");
        return;
      }
      
      setUser(user);
    } catch (error) {
      console.error("Auth error:", error);
      navigate("/admin/login");
    } finally {
      setLoading(false);
    }
  };

  const fetchPendingUploads = async () => {
    try {
      const { data, error } = await supabase
        .from("pending_polygraph_uploads")
        .select(`
          *,
          accounts:account_id(name),
          stores:store_id(store_name, store_code),
          examiners:examiner_id(name)
        `)
        .eq("status", "pending")
        .order("created_at", { ascending: false });

      if (error) throw error;
      
      // Fetch uploader profiles separately
      const uploaderIds = [...new Set((data || []).map(d => d.uploaded_by).filter(Boolean))];
      let profilesMap: Record<string, { full_name: string; email: string }> = {};
      
      if (uploaderIds.length > 0) {
        const { data: profiles } = await supabase
          .from("profiles")
          .select("id, full_name, email")
          .in("id", uploaderIds);
        
        if (profiles) {
          profilesMap = profiles.reduce((acc, p) => {
            acc[p.id] = { full_name: p.full_name || "", email: p.email };
            return acc;
          }, {} as Record<string, { full_name: string; email: string }>);
        }
      }
      
      const enrichedData = (data || []).map(upload => ({
        ...upload,
        profiles: profilesMap[upload.uploaded_by] || null,
      }));
      
      setPendingUploads(enrichedData as PendingUpload[]);
    } catch (error: any) {
      console.error("Error fetching pending uploads:", error);
      toast({
        title: "Error",
        description: "Failed to load pending uploads",
        variant: "destructive",
      });
    }
  };

  const fetchDropdownData = async () => {
    const [accountsRes, examinersRes] = await Promise.all([
      supabase.from("accounts").select("id, name").order("name"),
      supabase.from("examiners").select("id, name").eq("is_active", true).order("name"),
    ]);

    if (accountsRes.data) setAccounts(accountsRes.data);
    if (examinersRes.data) setExaminers(examinersRes.data);
  };

  const fetchStoresByAccount = async (accountId: string) => {
    const { data } = await supabase
      .from("stores")
      .select("id, store_name, store_code, account_id")
      .eq("account_id", accountId)
      .order("store_name");
    setStores(data || []);
  };

  const openReviewDialog = (upload: PendingUpload) => {
    setSelectedUpload(upload);
    const ext = upload.extracted_data || {};
    setEditedData({
      first_name: upload.first_name || "",
      last_name: upload.last_name || "",
      id_number: upload.id_number || "",
      email: upload.email || "",
      contact_number: upload.contact_number || "",
      physical_address: upload.physical_address || "",
      position_applying_for: upload.position_applying_for || "",
      examination_date: upload.examination_date || new Date().toISOString().split("T")[0],
      overall_result: upload.overall_result || "",
      risk_score: upload.risk_score,
      risk_level: upload.risk_level || "",
      risk_analysis: upload.risk_analysis || {},
      extracted_data: ext,
      // Populate breakdown fields from extracted_data for RiskAnalysisDisplay
      employment_history: ext.employmentHistory || [],
      financial_circumstances: ext.financialCircumstances || {},
      family_criminal_history: [
        ...(ext.familyCriminalHistory || []),
        ...(ext.nextOfKin || []),
      ],
      friend_criminal_history: ext.friendCriminalHistory || [],
      personal_law_encounters: ext.personalLawEncounters || {},
      extracted_disclosure: ext.disclosure || {},
    });
    setSelectedAccountId(upload.account_id || "");
    setSelectedStoreId(upload.store_id || "");
    setSelectedExaminerId(upload.examiner_id || "");
    setReviewDialogOpen(true);
  };

  const handleConvertToPdf = async () => {
    if (!selectedUpload) return;

    setConverting(true);
    try {
      const { data, error } = await supabase.functions.invoke("convert-docx-to-pdf", {
        body: {
          uploadId: selectedUpload.id,
          fileUrl: selectedUpload.original_file_url,
          fileName: selectedUpload.original_file_name,
        },
      });

      if (error) throw error;

      if (data?.pdfUrl) {
        setSelectedUpload({ ...selectedUpload, converted_pdf_url: data.pdfUrl });
        toast({
          title: "Conversion Complete",
          description: "The Word document has been converted to PDF.",
        });
        fetchPendingUploads();
      }
    } catch (error: any) {
      console.error("Conversion error:", error);
      toast({
        title: "Conversion Failed",
        description: error.message || "Failed to convert document to PDF.",
        variant: "destructive",
      });
    } finally {
      setConverting(false);
    }
  };

  const handleSaveChanges = async () => {
    if (!selectedUpload) return;

    setProcessing(true);
    try {
      const { error } = await supabase
        .from("pending_polygraph_uploads")
        .update({
          first_name: editedData.first_name,
          last_name: editedData.last_name,
          id_number: editedData.id_number,
          email: editedData.email,
          contact_number: editedData.contact_number,
          physical_address: editedData.physical_address,
          position_applying_for: editedData.position_applying_for,
          examination_date: editedData.examination_date,
          overall_result: editedData.overall_result,
          risk_score: editedData.risk_score,
          risk_level: editedData.risk_level,
          risk_analysis: editedData.risk_analysis,
          extracted_data: editedData.extracted_data,
          account_id: selectedAccountId || null,
          store_id: selectedStoreId || null,
          examiner_id: selectedExaminerId || null,
        })
        .eq("id", selectedUpload.id);

      if (error) throw error;

      toast({
        title: "Changes Saved",
        description: "The report data has been updated.",
      });
      fetchPendingUploads();
    } catch (error: any) {
      console.error("Save error:", error);
      toast({
        title: "Save Failed",
        description: error.message || "Failed to save changes.",
        variant: "destructive",
      });
    } finally {
      setProcessing(false);
    }
  };

  const handleApprove = async () => {
    if (!selectedUpload) return;
    return _handleApproveImpl();
  };

  const handleExtractData = async () => {
    if (!selectedUpload) return;

    setExtracting(true);
    try {
      const fileUrl = selectedUpload.converted_pdf_url || selectedUpload.original_file_url;
      const fileName = selectedUpload.original_file_name;
      const lower = fileName.toLowerCase();
      const isWordDoc = lower.endsWith(".docx") || lower.endsWith(".doc");

      // Fetch the file and convert to base64
      const fileResp = await fetch(fileUrl);
      if (!fileResp.ok) throw new Error("Failed to download report file for extraction");
      const buf = await fileResp.arrayBuffer();
      const bytes = new Uint8Array(buf);
      let binary = "";
      const chunk = 0x8000;
      for (let i = 0; i < bytes.length; i += chunk) {
        binary += String.fromCharCode.apply(null, Array.from(bytes.subarray(i, i + chunk)));
      }
      const base64 = btoa(binary);

      const body = isWordDoc
        ? { docxBase64: base64, fileName }
        : { pdfBase64: base64, fileName };

      const { data, error } = await supabase.functions.invoke("extract-polygraph-report", { body });
      if (error) throw new Error(error.message || "Extraction failed");
      if (data?.error) throw new Error(data.error);
      if (!data?.success || !data?.data) throw new Error("No data extracted");

      const ext = data.data;

      // Map risk level
      let riskScore: number | null = null;
      let riskLevel: string | null = null;
      if (ext.riskAnalysis) {
        riskScore = ext.riskAnalysis.TotalRiskScore || null;
        const rawLevel = (ext.riskAnalysis.RiskLevel || "").toUpperCase().replace(" RISK", "");
        const mapped = rawLevel === "UNACCEPTABLE" ? "VERY HIGH" : rawLevel;
        riskLevel = ["LOW", "MEDIUM", "HIGH", "VERY HIGH"].includes(mapped) ? mapped : null;
      }

      // Map overall result from exam questions
      const findings = (ext.examQuestions || []).map((q: any) =>
        (q.finding || q.result || "").toUpperCase()
      );
      let overallResult: string | null = null;
      if (findings.length > 0) {
        if (findings.some((f: string) => f === "SR")) overallResult = "failed";
        else if (findings.some((f: string) => f === "INC")) overallResult = "inconclusive";
        else if (findings.every((f: string) => f === "NSR")) overallResult = "passed";
        else overallResult = "inconclusive";
      }

      const examDate = ext.examination?.date
        ? new Date(ext.examination.date).toISOString().split("T")[0]
        : selectedUpload.examination_date;

      // Persist extraction back to the pending row
      const { error: updateError } = await supabase
        .from("pending_polygraph_uploads")
        .update({
          extracted_data: ext,
          first_name: ext.candidate?.firstName || null,
          last_name: ext.candidate?.lastName || null,
          id_number: ext.candidate?.idNumber || null,
          email: ext.candidate?.email || null,
          contact_number: ext.candidate?.contactNumber || null,
          physical_address: ext.candidate?.physicalAddress || null,
          position_applying_for: ext.candidate?.positionApplyingFor || null,
          risk_score: riskScore,
          risk_level: riskLevel,
          risk_analysis: ext.riskAnalysis || null,
          examination_date: examDate,
          overall_result: overallResult,
        })
        .eq("id", selectedUpload.id);

      if (updateError) throw updateError;

      // Refresh local edited fields so the reviewer sees the new data immediately
      setSelectedUpload({
        ...selectedUpload,
        extracted_data: ext,
        first_name: ext.candidate?.firstName || null,
        last_name: ext.candidate?.lastName || null,
        id_number: ext.candidate?.idNumber || null,
        email: ext.candidate?.email || null,
        contact_number: ext.candidate?.contactNumber || null,
        physical_address: ext.candidate?.physicalAddress || null,
        position_applying_for: ext.candidate?.positionApplyingFor || null,
        risk_score: riskScore,
        risk_level: riskLevel,
        risk_analysis: ext.riskAnalysis || null,
        examination_date: examDate,
        overall_result: overallResult,
      } as any);

      setEditedData({
        first_name: ext.candidate?.firstName || "",
        last_name: ext.candidate?.lastName || "",
        id_number: ext.candidate?.idNumber || "",
        email: ext.candidate?.email || "",
        contact_number: ext.candidate?.contactNumber || "",
        physical_address: ext.candidate?.physicalAddress || "",
        position_applying_for: ext.candidate?.positionApplyingFor || "",
        examination_date: examDate || new Date().toISOString().split("T")[0],
        overall_result: overallResult || "",
        risk_score: riskScore,
        risk_level: riskLevel || "",
        risk_analysis: ext.riskAnalysis || {},
        extracted_data: ext,
        employment_history: ext.employmentHistory || [],
        financial_circumstances: ext.financialCircumstances || {},
        family_criminal_history: [
          ...(ext.familyCriminalHistory || []),
          ...(ext.nextOfKin || []),
        ],
        friend_criminal_history: ext.friendCriminalHistory || [],
        personal_law_encounters: ext.personalLawEncounters || {},
        extracted_disclosure: ext.disclosure || {},
      });

      fetchPendingUploads();

      toast({
        title: "Data Extracted",
        description: "Review the extracted data, edit if needed, then approve.",
      });
    } catch (err: any) {
      console.error("Extraction error:", err);
      toast({
        title: "Extraction Failed",
        description: err.message || "Failed to extract data from the report.",
        variant: "destructive",
      });
    } finally {
      setExtracting(false);
    }
  };

  const _handleApproveImpl = async () => {
    if (!selectedUpload) return;

    // Validate required fields
    if (!selectedStoreId) {
      toast({
        title: "Missing Information",
        description: "Please select a store before approving.",
        variant: "destructive",
      });
      return;
    }

    if (!selectedUpload.converted_pdf_url && selectedUpload.original_file_name.toLowerCase().endsWith(".docx")) {
      toast({
        title: "PDF Required",
        description: "Please convert the Word document to PDF before approving.",
        variant: "destructive",
      });
      return;
    }

    setProcessing(true);
    try {
      const ext = editedData.extracted_data || {};

      // Normalize risk_level to match DB check constraint: LOW | MEDIUM | HIGH | VERY HIGH
      const normalizeRiskLevel = (val: any): string | null => {
        if (!val) return null;
        const v = String(val).trim().toUpperCase().replace(/[_-]+/g, " ").replace(/\s+/g, " ");
        if (["LOW", "MEDIUM", "HIGH", "VERY HIGH"].includes(v)) return v;
        if (v === "UNACCEPTABLE" || v === "VERYHIGH" || v === "CRITICAL") return "VERY HIGH";
        if (v === "MED" || v === "MODERATE") return "MEDIUM";
        return null;
      };
      const normalizedRiskLevel = normalizeRiskLevel(editedData.risk_level);

      // Determine vetting types from extraction
      const vettingTypes: string[] = [];
      const vt = ext.examination?.vettingTypes || {};
      if (vt.PreEmployment) vettingTypes.push("polygraph_pre_employment");
      if (vt.PeriodicScreening) vettingTypes.push("polygraph_periodic");
      if (vt.Specific) vettingTypes.push("polygraph_specific");

      // Create the polygraph report with ALL extracted data
      const reportPayload = {
        store_id: selectedStoreId,
        examiner_id: selectedExaminerId || null,
        examination_date: editedData.examination_date,
        first_name: editedData.first_name,
        last_name: editedData.last_name,
        id_number: editedData.id_number,
        contact_number: editedData.contact_number || null,
        email: editedData.email || null,
        physical_address: editedData.physical_address || null,
        position_applying_for: editedData.position_applying_for || null,
        overall_result: editedData.overall_result?.toLowerCase() || null,
        status: "completed" as const,
        report_pdf_url: selectedUpload.converted_pdf_url || selectedUpload.original_file_url,
        uploaded_by: selectedUpload.uploaded_by,
        risk_score: editedData.risk_score,
        risk_level: normalizedRiskLevel,
        risk_analysis: editedData.risk_analysis,
        vetting_types: vettingTypes.length > 0 ? vettingTypes : null,
        examiner_notes: ext.result?.examinerNotes || null,
        candidate_photo_url: ext.candidatePhotoUrl || null,
        extracted_disclosure: {
          ...(ext.disclosure || {}),
          DetailedCriminalActivity: ext.detailedCriminalActivity || null,
        },
        education_history: ext.educationHistory || [],
        employment_history: ext.employmentHistory || [],
        family_criminal_history: [
          ...(ext.familyCriminalHistory || []),
          ...(ext.nextOfKin || []),
        ],
        friend_criminal_history: ext.friendCriminalHistory || [],
        financial_circumstances: ext.financialCircumstances || {},
        permits_licensing: ext.permitsLicensing || {},
        personal_law_encounters: ext.personalLawEncounters || {},
        post_exam_admissions: ext.postExamAdmissions || null,
      };

      const { data: reportData, error: reportError } = await supabase
        .from("polygraph_reports")
        .insert([reportPayload])
        .select("id")
        .single();

      if (reportError) throw reportError;

      const newReportId = reportData.id;

      // Save suitability data if available from extraction
      const suitabilityExtracted = ext.suitability;
      if (suitabilityExtracted) {
        const suitabilityPayload = {
          report_id: newReportId,
          health_status: suitabilityExtracted.healthStatus || null,
          enough_sleep: suitabilityExtracted.enoughSleep ?? null,
          hospitalized_recently: suitabilityExtracted.hospitalizedRecently ?? null,
          hospitalized_details: suitabilityExtracted.hospitalizedDetails || null,
          medication_taken: suitabilityExtracted.medicationTaken ?? null,
          medication_details: suitabilityExtracted.medicationDetails || null,
          heart_conditions: suitabilityExtracted.heartConditions ?? null,
          breathing_trouble: suitabilityExtracted.breathingTrouble ?? null,
          psychological_disorders: suitabilityExtracted.psychologicalDisorders ?? null,
          diabetic: suitabilityExtracted.diabetic ?? null,
          recent_drug_use: suitabilityExtracted.recentDrugUse ?? null,
          drug_use_details: suitabilityExtracted.drugUseDetails || null,
          recent_alcohol_use: suitabilityExtracted.recentAlcoholUse ?? null,
          alcohol_details: suitabilityExtracted.alcoholDetails || null,
          smoker: suitabilityExtracted.smoker ?? null,
          smoking_details: suitabilityExtracted.smokingDetails || null,
          pregnant: suitabilityExtracted.pregnant ?? null,
          suitable_for_exam: suitabilityExtracted.suitableForExam ?? null,
          suitability_comment: suitabilityExtracted.suitabilityComment || null,
        };
        await supabase.from("polygraph_suitability").insert([suitabilityPayload]);
      }

      // Save admissions data if available
      const admissionsExtracted = ext.admissions;
      if (admissionsExtracted && Array.isArray(admissionsExtracted) && admissionsExtracted.length > 0) {
        const admissionsPayload = admissionsExtracted
          .filter((a: any) => a.category)
          .map((a: any) => ({
            report_id: newReportId,
            category: a.category,
            confirmed: a.confirmed || false,
            details: a.details || {},
            time_window: ["within_2_years", "2_5_years", "5_plus_years", "never"].includes(a.timeWindow)
              ? a.timeWindow
              : null,
            notes: a.notes || "",
          }));
        if (admissionsPayload.length > 0) {
          const { error: admError } = await supabase
            .from("polygraph_admissions")
            .insert(admissionsPayload);
          if (admError) console.error("Admissions save error:", admError);
        }
      }

      // Save exam questions if available
      const examQuestionsExtracted = ext.examQuestions;
      if (examQuestionsExtracted && Array.isArray(examQuestionsExtracted) && examQuestionsExtracted.length > 0) {
        const questionsPayload = examQuestionsExtracted
          .filter((q: any) => q.questionText)
          .map((q: any) => ({
            report_id: newReportId,
            question_number: q.questionNumber || 0,
            question_text: q.questionText,
            response: q.response ?? null,
            finding: ["SR", "NSR", "INC", "PNC"].includes(q.finding?.toUpperCase())
              ? q.finding.toUpperCase()
              : null,
          }));
        if (questionsPayload.length > 0) {
          const { error: qError } = await supabase
            .from("polygraph_exam_questions")
            .insert(questionsPayload);
          if (qError) console.error("Exam questions save error:", qError);
        }
      }

      // Try to auto-link report to an appointment candidate by ID number or name
      let linkedCandidateName: string | null = null;
      try {
        const candidateIdNumber = editedData.id_number?.trim();
        const candidateFirstName = (editedData.first_name || "").trim().toLowerCase();
        const candidateLastName = (editedData.last_name || "").trim().toLowerCase();

        // Search appointment candidates
        const { data: aptCandidates } = await supabase
          .from("polygraph_appointment_candidates")
          .select("id, candidate_name, candidate_id_number, appointment_id, application_id");

        if (aptCandidates && aptCandidates.length > 0) {
          let matched = null;

          // Match by ID number first
          if (candidateIdNumber) {
            matched = aptCandidates.find(
              (c) => c.candidate_id_number && c.candidate_id_number.trim() === candidateIdNumber
            );
          }

          // Fallback: match by name
          if (!matched && candidateFirstName && candidateLastName) {
            matched = aptCandidates.find((c) => {
              const name = (c.candidate_name || "").toLowerCase();
              return name.includes(candidateFirstName) && name.includes(candidateLastName);
            });
          }

          if (matched) {
            linkedCandidateName = matched.candidate_name;

            // Store the report link in a risk request candidate record or update existing
            if (matched.application_id) {
              const reportUrl = selectedUpload.converted_pdf_url || selectedUpload.original_file_url;
              // Check if there's an existing risk request candidate for this application
              const { data: existingRiskCandidate } = await supabase
                .from("candex_risk_request_candidates")
                .select("id")
                .eq("application_id", matched.application_id)
                .limit(1);

              if (existingRiskCandidate && existingRiskCandidate.length > 0) {
                // Could store polygraph report url in a note or separate field if needed
                console.log("Linked polygraph report to candidate:", matched.candidate_name);
              }
            }
          }
        }
      } catch (linkError) {
        console.error("Auto-link error (non-fatal):", linkError);
      }

      // Update pending upload status
      await supabase
        .from("pending_polygraph_uploads")
        .update({
          status: "approved",
          reviewed_by: user?.id,
          reviewed_at: new Date().toISOString(),
        })
        .eq("id", selectedUpload.id);

      toast({
        title: "Report Approved",
        description: linkedCandidateName
          ? `Report approved and linked to candidate: ${linkedCandidateName}`
          : "The report has been approved and is now visible to authorized users.",
      });

      setReviewDialogOpen(false);
      fetchPendingUploads();
    } catch (error: any) {
      console.error("Approval error:", error);
      toast({
        title: "Approval Failed",
        description: error.message || "Failed to approve the report.",
        variant: "destructive",
      });
    } finally {
      setProcessing(false);
    }
  };

  const handleReject = async () => {
    if (!selectedUpload || !rejectionReason.trim()) {
      toast({
        title: "Reason Required",
        description: "Please provide a reason for rejection.",
        variant: "destructive",
      });
      return;
    }

    setProcessing(true);
    try {
      await supabase
        .from("pending_polygraph_uploads")
        .update({
          status: "rejected",
          reviewed_by: user?.id,
          reviewed_at: new Date().toISOString(),
          rejection_reason: rejectionReason,
        })
        .eq("id", selectedUpload.id);

      toast({
        title: "Report Rejected",
        description: "The upload has been rejected.",
      });

      setRejectDialogOpen(false);
      setReviewDialogOpen(false);
      setRejectionReason("");
      fetchPendingUploads();
    } catch (error: any) {
      console.error("Rejection error:", error);
      toast({
        title: "Rejection Failed",
        description: error.message || "Failed to reject the report.",
        variant: "destructive",
      });
    } finally {
      setProcessing(false);
    }
  };

  const getRiskLevelColor = (level: string | null) => {
    switch (level?.toUpperCase()) {
      case "LOW":
      case "LOW RISK":
        return "bg-green-500";
      case "MEDIUM":
      case "MEDIUM RISK":
        return "bg-yellow-500";
      case "HIGH":
      case "HIGH RISK":
        return "bg-orange-500";
      case "VERY HIGH":
      case "UNACCEPTABLE":
      case "UNACCEPTABLE RISK":
        return "bg-red-500";
      default:
        return "bg-muted";
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <AdminHeader user={user} title="Pending Polygraph Review" />

      <main className="container mx-auto px-4 py-8">
        <Button variant="ghost" onClick={() => navigate("/admin/portal")} className="mb-6">
          <ArrowLeft className="h-4 w-4 mr-2" />
          Back to Dashboard
        </Button>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Clock className="h-5 w-5" />
              Pending Uploads for Review
            </CardTitle>
            <CardDescription>
              Review and approve polygraph reports uploaded by admins before they become visible to all authorized users.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {pendingUploads.length === 0 ? (
              <div className="text-center py-12 text-muted-foreground">
                <FileText className="h-12 w-12 mx-auto mb-4 opacity-50" />
                <p>No pending uploads to review</p>
              </div>
            ) : (
              <div className="space-y-4">
                {pendingUploads.map((upload) => (
                  <Card key={upload.id} className="hover:border-primary/50 transition-colors">
                    <CardContent className="p-4">
                      <div className="flex items-start justify-between gap-4">
                        <div className="flex-1 space-y-2">
                          <div className="flex items-center gap-2">
                            <FileText className="h-4 w-4 text-muted-foreground" />
                            <span className="font-medium">{upload.original_file_name}</span>
                            {upload.risk_level && (
                              <Badge className={getRiskLevelColor(upload.risk_level)}>
                                {upload.risk_level}
                              </Badge>
                            )}
                          </div>
                          <div className="text-sm text-muted-foreground space-y-1">
                            <p>
                              <span className="font-medium">Candidate:</span>{" "}
                              {upload.first_name && upload.last_name
                                ? `${upload.first_name} ${upload.last_name}`
                                : "Not extracted"}
                              {upload.id_number && ` (ID: ${upload.id_number})`}
                            </p>
                            <p>
                              <span className="font-medium">Uploaded by:</span>{" "}
                              {upload.profiles?.full_name || upload.profiles?.email || "Unknown"}
                            </p>
                            <p>
                              <span className="font-medium">Uploaded:</span>{" "}
                              {format(new Date(upload.created_at), "PPpp")}
                            </p>
                            {upload.stores && (
                              <p>
                                <span className="font-medium">Store:</span>{" "}
                                {upload.stores.store_name} ({upload.stores.store_code})
                              </p>
                            )}
                          </div>
                        </div>
                        <Button onClick={() => openReviewDialog(upload)}>
                          <Eye className="h-4 w-4 mr-2" />
                          Review
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </main>

      {/* Review Dialog */}
      <Dialog open={reviewDialogOpen} onOpenChange={setReviewDialogOpen}>
        <DialogContent className="max-w-4xl max-h-[90vh]">
          <DialogHeader>
            <DialogTitle>Review Polygraph Report</DialogTitle>
            <DialogDescription>
              Review and edit the extracted data before approving. The report will become visible to all authorized users after approval.
            </DialogDescription>
          </DialogHeader>

          <ScrollArea className="max-h-[60vh]">
            <Tabs defaultValue="candidate" className="w-full">
              <TabsList className="grid w-full grid-cols-4">
                <TabsTrigger value="candidate">Candidate Info</TabsTrigger>
                <TabsTrigger value="examination">Examination</TabsTrigger>
                <TabsTrigger value="risk">Risk Analysis</TabsTrigger>
                <TabsTrigger value="document">Document</TabsTrigger>
              </TabsList>

              <TabsContent value="candidate" className="space-y-4 p-4">
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>First Name</Label>
                    <Input
                      value={editedData.first_name || ""}
                      onChange={(e) => setEditedData({ ...editedData, first_name: e.target.value })}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Last Name</Label>
                    <Input
                      value={editedData.last_name || ""}
                      onChange={(e) => setEditedData({ ...editedData, last_name: e.target.value })}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>ID Number</Label>
                    <Input
                      value={editedData.id_number || ""}
                      onChange={(e) => setEditedData({ ...editedData, id_number: e.target.value })}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Email</Label>
                    <Input
                      type="email"
                      value={editedData.email || ""}
                      onChange={(e) => setEditedData({ ...editedData, email: e.target.value })}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Contact Number</Label>
                    <Input
                      value={editedData.contact_number || ""}
                      onChange={(e) => setEditedData({ ...editedData, contact_number: e.target.value })}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Position</Label>
                    <Input
                      value={editedData.position_applying_for || ""}
                      onChange={(e) => setEditedData({ ...editedData, position_applying_for: e.target.value })}
                    />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label>Physical Address</Label>
                  <Textarea
                    value={editedData.physical_address || ""}
                    onChange={(e) => setEditedData({ ...editedData, physical_address: e.target.value })}
                  />
                </div>
              </TabsContent>

              <TabsContent value="examination" className="space-y-4 p-4">
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Account</Label>
                    <Select value={selectedAccountId} onValueChange={setSelectedAccountId}>
                      <SelectTrigger>
                        <SelectValue placeholder="Select account" />
                      </SelectTrigger>
                      <SelectContent>
                        {accounts.map((acc) => (
                          <SelectItem key={acc.id} value={acc.id}>
                            {acc.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>Store *</Label>
                    <Select value={selectedStoreId} onValueChange={setSelectedStoreId} disabled={!selectedAccountId}>
                      <SelectTrigger>
                        <SelectValue placeholder={selectedAccountId ? "Select store" : "Select account first"} />
                      </SelectTrigger>
                      <SelectContent>
                        {stores.map((store) => (
                          <SelectItem key={store.id} value={store.id}>
                            {store.store_name} ({store.store_code})
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>Examiner</Label>
                    <Select value={selectedExaminerId} onValueChange={setSelectedExaminerId}>
                      <SelectTrigger>
                        <SelectValue placeholder="Select examiner" />
                      </SelectTrigger>
                      <SelectContent>
                        {examiners.map((ex) => (
                          <SelectItem key={ex.id} value={ex.id}>
                            {ex.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>Examination Date</Label>
                    <Input
                      type="date"
                      value={editedData.examination_date || ""}
                      onChange={(e) => setEditedData({ ...editedData, examination_date: e.target.value })}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Overall Result</Label>
                    <Select
                      value={editedData.overall_result || ""}
                      onValueChange={(value) => setEditedData({ ...editedData, overall_result: value })}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Select result" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="passed">Passed</SelectItem>
                        <SelectItem value="failed">Failed</SelectItem>
                        <SelectItem value="inconclusive">Inconclusive</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              </TabsContent>

              <TabsContent value="risk" className="space-y-4 p-4">
                <div className="grid grid-cols-2 gap-4 mb-4">
                  <div className="space-y-2">
                    <Label>Risk Score</Label>
                    <Input
                      type="number"
                      value={editedData.risk_score || ""}
                      onChange={(e) => setEditedData({ ...editedData, risk_score: Number(e.target.value) })}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Risk Level</Label>
                    <Select
                      value={editedData.risk_level || ""}
                      onValueChange={(value) => setEditedData({ ...editedData, risk_level: value })}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Select risk level" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="LOW">Low Risk</SelectItem>
                        <SelectItem value="MEDIUM">Medium Risk</SelectItem>
                        <SelectItem value="HIGH">High Risk</SelectItem>
                        <SelectItem value="VERY HIGH">Very High Risk</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                {editedData && (
                  <PolygraphSummaryView
                    report={{
                      overall_result: editedData.overall_result,
                      employment_history: editedData.employment_history || [],
                      financial_circumstances: editedData.financial_circumstances || {},
                      family_criminal_history: editedData.family_criminal_history || [],
                      friend_criminal_history: editedData.friend_criminal_history || [],
                      personal_law_encounters: editedData.personal_law_encounters || {},
                      extracted_disclosure: {
                        ...(editedData.extracted_disclosure || {}),
                        DetailedCriminalActivity: editedData.extracted_data?.detailedCriminalActivity || editedData.extracted_data?.DetailedCriminalActivity,
                      },
                      extracted_data: editedData.extracted_data || {},
                    }}
                  />
                )}
              </TabsContent>

              <TabsContent value="document" className="space-y-4 p-4">
                <div className="space-y-4">
                  <div className="flex items-center justify-between p-4 border rounded-lg">
                    <div>
                      <p className="font-medium">Original Document</p>
                      <p className="text-sm text-muted-foreground">{selectedUpload?.original_file_name}</p>
                    </div>
                    <Button variant="outline" asChild>
                      <a href={selectedUpload?.original_file_url} target="_blank" rel="noopener noreferrer">
                        <Download className="h-4 w-4 mr-2" />
                        Download
                      </a>
                    </Button>
                  </div>

                  {selectedUpload?.original_file_name.toLowerCase().endsWith(".docx") && (
                    <div className="flex items-center justify-between p-4 border rounded-lg bg-muted/50">
                      <div>
                        <p className="font-medium">PDF Conversion</p>
                        <p className="text-sm text-muted-foreground">
                          {selectedUpload.converted_pdf_url
                            ? "PDF has been generated"
                            : "Convert Word document to PDF for distribution"}
                        </p>
                      </div>
                      {selectedUpload.converted_pdf_url ? (
                        <Button variant="outline" asChild>
                          <a href={selectedUpload.converted_pdf_url} target="_blank" rel="noopener noreferrer">
                            <Download className="h-4 w-4 mr-2" />
                            Download PDF
                          </a>
                        </Button>
                      ) : (
                        <Button onClick={handleConvertToPdf} disabled={converting}>
                          {converting && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                          Convert to PDF
                        </Button>
                      )}
                    </div>
                  )}
                </div>
              </TabsContent>
            </Tabs>
          </ScrollArea>

          <DialogFooter className="flex-col sm:flex-row gap-2">
            <Button
              variant="default"
              onClick={handleExtractData}
              disabled={extracting || processing}
              className="bg-primary"
            >
              {extracting ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <Sparkles className="h-4 w-4 mr-2" />
              )}
              {selectedUpload?.extracted_data
                ? "Re-extract Data with AI"
                : "Extract Data with AI"}
            </Button>
            <Button variant="outline" onClick={handleSaveChanges} disabled={processing || extracting}>
              {processing && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              <Save className="h-4 w-4 mr-2" />
              Save Changes
            </Button>
            <div className="flex gap-2">
              <Button
                variant="destructive"
                onClick={() => setRejectDialogOpen(true)}
                disabled={processing || extracting}
              >
                <X className="h-4 w-4 mr-2" />
                Reject
              </Button>
              <Button
                onClick={handleApprove}
                disabled={processing || extracting || !selectedUpload?.extracted_data}
                title={
                  !selectedUpload?.extracted_data
                    ? "Extract the report data before approving"
                    : undefined
                }
              >
                {processing && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                <Check className="h-4 w-4 mr-2" />
                Approve
              </Button>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Reject Dialog */}
      <Dialog open={rejectDialogOpen} onOpenChange={setRejectDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-destructive" />
              Reject Upload
            </DialogTitle>
            <DialogDescription>
              Please provide a reason for rejecting this upload. The uploader will be notified.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Rejection Reason *</Label>
              <Textarea
                value={rejectionReason}
                onChange={(e) => setRejectionReason(e.target.value)}
                placeholder="Enter the reason for rejection..."
                rows={4}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRejectDialogOpen(false)}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={handleReject} disabled={processing || !rejectionReason.trim()}>
              {processing && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Confirm Rejection
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default PendingPolygraphReview;
