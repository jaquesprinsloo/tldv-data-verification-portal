import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Progress } from "@/components/ui/progress";
import { ChevronLeft, ChevronRight, Save, CheckCircle2 } from "lucide-react";
import AdmissionAssessment, { Admission } from "./AdmissionAssessment";
import SuitabilityQuestionnaire, { SuitabilityData } from "./SuitabilityQuestionnaire";
import ExamQuestionsForm, { ExamQuestion } from "./ExamQuestionsForm";

interface ExtractedPDFData {
  candidate?: {
    firstName?: string;
    lastName?: string;
    idNumber?: string;
    contactNumber?: string;
    email?: string;
    physicalAddress?: string;
    positionApplyingFor?: string;
    storeLocation?: string;
  };
  examination?: {
    date?: string;
    examinerName?: string;
    vettingTypes?: Record<string, boolean>;
  };
  vettingServices?: string[];
  suitability?: {
    healthStatus?: string;
    enoughSleep?: boolean;
    hospitalizedRecently?: boolean;
    hospitalizedDetails?: string;
    medicationTaken?: boolean;
    medicationDetails?: string;
    heartConditions?: boolean;
    breathingTrouble?: boolean;
    psychologicalDisorders?: boolean;
    diabetic?: boolean;
    recentDrugUse?: boolean;
    drugUseDetails?: string;
    recentAlcoholUse?: boolean;
    alcoholDetails?: string;
    smoker?: boolean;
    smokingDetails?: string;
    pregnant?: boolean;
    suitableForExam?: boolean;
    suitabilityComment?: string;
  };
  admissions?: Array<{
    category: string;
    confirmed: boolean;
    details?: Record<string, any>;
    timeWindow?: string;
    notes?: string;
  }>;
  examQuestions?: Array<{
    questionNumber: number;
    questionText: string;
    response?: boolean;
    finding?: string;
  }>;
  result?: {
    overallResult?: string;
    examinerNotes?: string;
  };
  // Extended risk analysis data
  disclosure?: Record<string, any>;
  educationHistory?: any[];
  employmentHistory?: any[];
  familyCriminalHistory?: any[];
  friendCriminalHistory?: any[];
  financialCircumstances?: Record<string, any>;
  permitsLicensing?: Record<string, any>;
  personalLawEncounters?: Record<string, any>;
  polygraphResults?: Record<string, any>;
  postExamAdmissions?: string;
  riskAnalysis?: {
    TotalRiskScore?: number;
    RiskLevel?: string;
    KeyRiskConcerns?: string[];
    RecommendedMitigations?: string[];
    NarrativeReport?: string;
    [key: string]: any;
  };
}

interface PolygraphReportFormProps {
  reportId?: string | null;
  initialData?: ExtractedPDFData | null;
  onSaved: () => void;
  onCancel: () => void;
}

interface Store {
  id: string;
  store_name: string;
  store_code: string;
}

interface Examiner {
  id: string;
  name: string;
}

const VETTING_SERVICES = [
  { id: "polygraph_pre_employment", label: "Pre-Employment Polygraph" },
  { id: "polygraph_periodic", label: "Periodic Polygraph" },
  { id: "polygraph_specific", label: "Specific Polygraph" },
  { id: "credit_check", label: "Credit Check" },
  { id: "id_verification", label: "ID Verification" },
  { id: "dha_check", label: "DHA Check" },
  { id: "drug_screening", label: "Drug Screening" },
  { id: "criminal_check", label: "Criminal Check" },
  { id: "qualification_verification", label: "Qualification Verification" },
  { id: "reference_check", label: "Reference Check" },
];

const STEPS = [
  { id: 1, title: "Candidate Info", description: "Basic candidate details" },
  { id: 2, title: "Vetting Services", description: "Select services" },
  { id: 3, title: "Suitability", description: "Pre-exam questionnaire" },
  { id: 4, title: "Admissions", description: "Interview admissions" },
  { id: 5, title: "Exam Questions", description: "Relevant questions" },
  { id: 6, title: "Results", description: "Final assessment" },
];

const PolygraphReportForm = ({ reportId, initialData, onSaved, onCancel }: PolygraphReportFormProps) => {
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [currentStep, setCurrentStep] = useState(1);
  
  // Form data
  const [stores, setStores] = useState<Store[]>([]);
  const [examiners, setExaminers] = useState<Examiner[]>([]);
  
  const [formData, setFormData] = useState({
    store_id: "",
    examiner_id: "",
    examination_date: initialData?.examination?.date || new Date().toISOString().split("T")[0],
    first_name: initialData?.candidate?.firstName || "",
    last_name: initialData?.candidate?.lastName || "",
    id_number: initialData?.candidate?.idNumber || "",
    contact_number: initialData?.candidate?.contactNumber || "",
    email: initialData?.candidate?.email || "",
    physical_address: initialData?.candidate?.physicalAddress || "",
    position_applying_for: initialData?.candidate?.positionApplyingFor || "",
    vetting_types: initialData?.vettingServices || [] as string[],
    overall_result: (initialData?.result?.overallResult as "" | "passed" | "failed" | "inconclusive") || "",
    examiner_notes: initialData?.result?.examinerNotes || "",
  });

  const [suitability, setSuitability] = useState<SuitabilityData>({
    health_status: initialData?.suitability?.healthStatus || "",
    enough_sleep: initialData?.suitability?.enoughSleep ?? null,
    hospitalized_recently: initialData?.suitability?.hospitalizedRecently ?? null,
    hospitalized_details: initialData?.suitability?.hospitalizedDetails || "",
    medication_taken: initialData?.suitability?.medicationTaken ?? null,
    medication_details: initialData?.suitability?.medicationDetails || "",
    heart_conditions: initialData?.suitability?.heartConditions ?? null,
    breathing_trouble: initialData?.suitability?.breathingTrouble ?? null,
    psychological_disorders: initialData?.suitability?.psychologicalDisorders ?? null,
    diabetic: initialData?.suitability?.diabetic ?? null,
    recent_drug_use: initialData?.suitability?.recentDrugUse ?? null,
    drug_use_details: initialData?.suitability?.drugUseDetails || "",
    recent_alcohol_use: initialData?.suitability?.recentAlcoholUse ?? null,
    alcohol_details: initialData?.suitability?.alcoholDetails || "",
    smoker: initialData?.suitability?.smoker ?? null,
    smoking_details: initialData?.suitability?.smokingDetails || "",
    pregnant: initialData?.suitability?.pregnant ?? null,
    suitable_for_exam: initialData?.suitability?.suitableForExam ?? null,
    suitability_comment: initialData?.suitability?.suitabilityComment || "",
  });

  const [admissions, setAdmissions] = useState<Admission[]>(
    initialData?.admissions?.map(a => ({
      category: a.category,
      confirmed: a.confirmed,
      details: a.details || {},
      time_window: a.timeWindow as "within_2_years" | "2_5_years" | "5_plus_years" | "never" | null,
      notes: a.notes || "",
    })) || []
  );
  
  const [examQuestions, setExamQuestions] = useState<ExamQuestion[]>(
    initialData?.examQuestions?.map(q => ({
      question_number: q.questionNumber,
      question_text: q.questionText,
      response: q.response ?? null,
      finding: (q.finding as "SR" | "NSR" | "INC" | "PNC") || null,
    })) || []
  );

  useEffect(() => {
    fetchStores();
    fetchExaminers();
    if (reportId) {
      loadReport(reportId);
    }
  }, [reportId]);

  const fetchStores = async () => {
    const { data } = await supabase.from("stores").select("id, store_name, store_code").order("store_name");
    setStores(data || []);
  };

  const fetchExaminers = async () => {
    const { data } = await supabase.from("examiners").select("id, name").eq("is_active", true).order("name");
    setExaminers(data || []);
  };

  const loadReport = async (id: string) => {
    setLoading(true);
    try {
      // Load main report
      const { data: report, error } = await supabase
        .from("polygraph_reports")
        .select("*")
        .eq("id", id)
        .single();

      if (error) throw error;
      if (!report) throw new Error("Report not found");

      setFormData({
        store_id: report.store_id || "",
        examiner_id: report.examiner_id || "",
        examination_date: report.examination_date,
        first_name: report.first_name,
        last_name: report.last_name,
        id_number: report.id_number,
        contact_number: report.contact_number || "",
        email: report.email || "",
        physical_address: report.physical_address || "",
        position_applying_for: report.position_applying_for || "",
        vetting_types: (report.vetting_types as string[]) || [],
        overall_result: report.overall_result || "",
        examiner_notes: report.examiner_notes || "",
      });

      // Load suitability
      const { data: suitabilityData } = await supabase
        .from("polygraph_suitability")
        .select("*")
        .eq("report_id", id)
        .single();

      if (suitabilityData) {
        setSuitability(suitabilityData);
      }

      // Load admissions
      const { data: admissionsData } = await supabase
        .from("polygraph_admissions")
        .select("*")
        .eq("report_id", id);

      if (admissionsData) {
        setAdmissions(admissionsData.map(a => ({
          category: a.category,
          confirmed: a.confirmed,
          details: (a.details as Record<string, any>) || {},
          time_window: a.time_window,
          notes: a.notes || "",
        })));
      }

      // Load exam questions
      const { data: questionsData } = await supabase
        .from("polygraph_exam_questions")
        .select("*")
        .eq("report_id", id)
        .order("question_number");

      if (questionsData) {
        setExamQuestions(questionsData.map(q => ({
          question_number: q.question_number,
          question_text: q.question_text,
          response: q.response,
          finding: q.finding,
        })));
      }

    } catch (error: any) {
      console.error("Error loading report:", error);
      toast({
        title: "Error",
        description: "Failed to load report",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const saveReport = async (status: "draft" | "completed") => {
    if (!formData.first_name || !formData.last_name || !formData.id_number) {
      toast({
        title: "Missing Information",
        description: "Please fill in the candidate's name and ID number",
        variant: "destructive",
      });
      return;
    }

    setSaving(true);
    try {
      let newReportId = reportId;

      // Create or update main report with risk analysis data
      const reportPayload: Record<string, any> = {
        store_id: formData.store_id || null,
        examiner_id: formData.examiner_id || null,
        examination_date: formData.examination_date,
        first_name: formData.first_name,
        last_name: formData.last_name,
        id_number: formData.id_number,
        contact_number: formData.contact_number || null,
        email: formData.email || null,
        physical_address: formData.physical_address || null,
        position_applying_for: formData.position_applying_for || null,
        vetting_types: formData.vetting_types,
        overall_result: (formData.overall_result || null) as "passed" | "failed" | "inconclusive" | null,
        examiner_notes: formData.examiner_notes || null,
        status,
      };

      // Add risk analysis data if available from initialData
      if (initialData?.riskAnalysis) {
        reportPayload.risk_score = initialData.riskAnalysis.TotalRiskScore || null;
        reportPayload.risk_level = initialData.riskAnalysis.RiskLevel || null;
        reportPayload.risk_analysis = initialData.riskAnalysis;
      }
      if (initialData?.disclosure) {
        reportPayload.extracted_disclosure = initialData.disclosure;
      }
      if (initialData?.educationHistory) {
        reportPayload.education_history = initialData.educationHistory;
      }
      if (initialData?.employmentHistory) {
        reportPayload.employment_history = initialData.employmentHistory;
      }
      if (initialData?.familyCriminalHistory) {
        reportPayload.family_criminal_history = initialData.familyCriminalHistory;
      }
      if (initialData?.friendCriminalHistory) {
        reportPayload.friend_criminal_history = initialData.friendCriminalHistory;
      }
      if (initialData?.financialCircumstances) {
        reportPayload.financial_circumstances = initialData.financialCircumstances;
      }
      if (initialData?.permitsLicensing) {
        reportPayload.permits_licensing = initialData.permitsLicensing;
      }
      if (initialData?.personalLawEncounters) {
        reportPayload.personal_law_encounters = initialData.personalLawEncounters;
      }
      if (initialData?.postExamAdmissions) {
        reportPayload.post_exam_admissions = initialData.postExamAdmissions;
      }

      if (reportId) {
        const { error } = await supabase
          .from("polygraph_reports")
          .update(reportPayload as any)
          .eq("id", reportId);
        if (error) throw error;
      } else {
        const { data, error } = await supabase
          .from("polygraph_reports")
          .insert(reportPayload as any)
          .select("id")
          .single();
        if (error) throw error;
        newReportId = data.id;
      }

      // Save suitability
      if (newReportId) {
        const suitabilityPayload = { ...suitability, report_id: newReportId };
        
        // Delete existing and insert new
        await supabase.from("polygraph_suitability").delete().eq("report_id", newReportId);
        const { error: suitError } = await supabase
          .from("polygraph_suitability")
          .insert(suitabilityPayload);
        if (suitError) console.error("Suitability save error:", suitError);

        // Save admissions
        await supabase.from("polygraph_admissions").delete().eq("report_id", newReportId);
        if (admissions.length > 0) {
          const admissionsPayload = admissions.map(a => ({
            report_id: newReportId,
            category: a.category,
            confirmed: a.confirmed,
            details: a.details,
            time_window: a.time_window as "within_2_years" | "2_5_years" | "5_plus_years" | "never" | null,
            notes: a.notes,
          }));
          const { error: admError } = await supabase
            .from("polygraph_admissions")
            .insert(admissionsPayload);
          if (admError) console.error("Admissions save error:", admError);
        }

        // Save exam questions
        await supabase.from("polygraph_exam_questions").delete().eq("report_id", newReportId);
        if (examQuestions.length > 0) {
          const questionsPayload = examQuestions.map(q => ({
            report_id: newReportId,
            question_number: q.question_number,
            question_text: q.question_text,
            response: q.response,
            finding: q.finding as "SR" | "NSR" | "INC" | "PNC" | null,
          }));
          const { error: qError } = await supabase
            .from("polygraph_exam_questions")
            .insert(questionsPayload);
          if (qError) console.error("Questions save error:", qError);
        }

        // If completed, create employee record automatically
        if (status === "completed") {
          // Check if employee already exists with this ID number
          const { data: existingEmployee } = await supabase
            .from("employees")
            .select("id")
            .eq("id_number", formData.id_number)
            .single();

          let employeeId = existingEmployee?.id;

          if (!existingEmployee) {
            // Generate employee number from polygraph report
            const employeeNumber = `PG${Date.now().toString().slice(-6)}`;

            // Create employee record automatically
            const { data: newEmployee, error: empError } = await supabase
              .from("employees")
              .insert({
                employee_number: employeeNumber,
                id_number: formData.id_number,
                email: formData.email || null,
                store_id: formData.store_id || null,
                employment_status: "active",
              })
              .select("id")
              .single();

            if (empError) {
              console.error("Error creating employee:", empError);
            } else {
              employeeId = newEmployee.id;
            }
          }

          // Create or update candidate profile
          const candidatePayload = {
            report_id: newReportId,
            first_name: formData.first_name,
            last_name: formData.last_name,
            id_number: formData.id_number,
            email: formData.email || null,
            contact_number: formData.contact_number || null,
            physical_address: formData.physical_address || null,
            position: formData.position_applying_for || null,
            store_id: formData.store_id || null,
            status: "pending_review" as const,
            employee_id: employeeId || null,
          };

          // Check if candidate already exists for this report
          const { data: existingCandidate } = await supabase
            .from("polygraph_candidates")
            .select("id")
            .eq("report_id", newReportId)
            .single();

          if (existingCandidate) {
            await supabase
              .from("polygraph_candidates")
              .update(candidatePayload)
              .eq("id", existingCandidate.id);
          } else {
            await supabase.from("polygraph_candidates").insert([candidatePayload]);
          }
        }
      }

      // Regenerate the PreAppliCheck-style 5-category AI risk profile when the
      // report is marked completed (drafts skip — data may still change).
      if (status === "completed" && newReportId) {
        try {
          const { error: aiErr } = await supabase.functions.invoke(
            "generate-polygraph-risk-profile",
            { body: { report_id: newReportId } },
          );
          if (aiErr) console.error("Risk profile generation error (non-fatal):", aiErr);
        } catch (aiCatch) {
          console.error("Risk profile generation failed (non-fatal):", aiCatch);
        }
      }

      toast({
        title: status === "draft" ? "Draft Saved" : "Report Completed",
        description: status === "draft" 
          ? "Your report has been saved as a draft"
          : "Report completed and candidate profile created",
      });

      onSaved();
    } catch (error: any) {
      console.error("Error saving report:", error);
      toast({
        title: "Error",
        description: error.message || "Failed to save report",
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  };

  const toggleVettingService = (serviceId: string) => {
    setFormData(prev => ({
      ...prev,
      vetting_types: prev.vetting_types.includes(serviceId)
        ? prev.vetting_types.filter(id => id !== serviceId)
        : [...prev.vetting_types, serviceId],
    }));
  };

  const progress = (currentStep / STEPS.length) * 100;

  if (loading) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center py-12">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      {/* Progress Bar */}
      <Card>
        <CardContent className="pt-6">
          <div className="space-y-4">
            <div className="flex justify-between text-sm text-muted-foreground">
              {STEPS.map((step) => (
                <div
                  key={step.id}
                  className={`text-center ${currentStep >= step.id ? "text-primary font-medium" : ""}`}
                >
                  <div
                    className={`w-8 h-8 rounded-full flex items-center justify-center mx-auto mb-1 ${
                      currentStep > step.id
                        ? "bg-primary text-primary-foreground"
                        : currentStep === step.id
                        ? "bg-primary text-primary-foreground"
                        : "bg-muted"
                    }`}
                  >
                    {currentStep > step.id ? <CheckCircle2 className="h-4 w-4" /> : step.id}
                  </div>
                  <span className="hidden md:block">{step.title}</span>
                </div>
              ))}
            </div>
            <Progress value={progress} className="h-2" />
          </div>
        </CardContent>
      </Card>

      {/* Step Content */}
      <Card>
        <CardHeader>
          <CardTitle>{STEPS[currentStep - 1].title}</CardTitle>
          <CardDescription>{STEPS[currentStep - 1].description}</CardDescription>
        </CardHeader>
        <CardContent>
          {/* Step 1: Candidate Info */}
          {currentStep === 1 && (
            <div className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Store *</Label>
                  <Select value={formData.store_id} onValueChange={(v) => setFormData(prev => ({ ...prev, store_id: v }))}>
                    <SelectTrigger><SelectValue placeholder="Select store" /></SelectTrigger>
                    <SelectContent>
                      {stores.map(store => (
                        <SelectItem key={store.id} value={store.id}>
                          {store.store_name} ({store.store_code})
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Examiner</Label>
                  <Select value={formData.examiner_id} onValueChange={(v) => setFormData(prev => ({ ...prev, examiner_id: v }))}>
                    <SelectTrigger><SelectValue placeholder="Select examiner" /></SelectTrigger>
                    <SelectContent>
                      {examiners.map(examiner => (
                        <SelectItem key={examiner.id} value={examiner.id}>{examiner.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="space-y-2">
                <Label>Examination Date *</Label>
                <Input
                  type="date"
                  value={formData.examination_date}
                  onChange={(e) => setFormData(prev => ({ ...prev, examination_date: e.target.value }))}
                />
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>First Name *</Label>
                  <Input
                    value={formData.first_name}
                    onChange={(e) => setFormData(prev => ({ ...prev, first_name: e.target.value }))}
                    placeholder="Enter first name"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Last Name *</Label>
                  <Input
                    value={formData.last_name}
                    onChange={(e) => setFormData(prev => ({ ...prev, last_name: e.target.value }))}
                    placeholder="Enter last name"
                  />
                </div>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>ID Number *</Label>
                  <Input
                    value={formData.id_number}
                    onChange={(e) => setFormData(prev => ({ ...prev, id_number: e.target.value }))}
                    placeholder="13-digit SA ID number"
                    maxLength={13}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Contact Number</Label>
                  <Input
                    value={formData.contact_number}
                    onChange={(e) => setFormData(prev => ({ ...prev, contact_number: e.target.value }))}
                    placeholder="e.g., 0821234567"
                  />
                </div>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Email</Label>
                  <Input
                    type="email"
                    value={formData.email}
                    onChange={(e) => setFormData(prev => ({ ...prev, email: e.target.value }))}
                    placeholder="email@example.com"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Position Applying For</Label>
                  <Input
                    value={formData.position_applying_for}
                    onChange={(e) => setFormData(prev => ({ ...prev, position_applying_for: e.target.value }))}
                    placeholder="e.g., Sales Assistant"
                  />
                </div>
              </div>
              <div className="space-y-2">
                <Label>Physical Address</Label>
                <Textarea
                  value={formData.physical_address}
                  onChange={(e) => setFormData(prev => ({ ...prev, physical_address: e.target.value }))}
                  placeholder="Enter full address"
                  rows={2}
                />
              </div>
            </div>
          )}

          {/* Step 2: Vetting Services */}
          {currentStep === 2 && (
            <div className="space-y-4">
              <p className="text-sm text-muted-foreground">
                Select all vetting services performed for this examination
              </p>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {VETTING_SERVICES.map(service => (
                  <div key={service.id} className="flex items-center space-x-2">
                    <Checkbox
                      id={service.id}
                      checked={formData.vetting_types.includes(service.id)}
                      onCheckedChange={() => toggleVettingService(service.id)}
                    />
                    <Label htmlFor={service.id} className="cursor-pointer">{service.label}</Label>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Step 3: Suitability */}
          {currentStep === 3 && (
            <SuitabilityQuestionnaire suitability={suitability} onChange={setSuitability} />
          )}

          {/* Step 4: Admissions */}
          {currentStep === 4 && (
            <AdmissionAssessment admissions={admissions} onChange={setAdmissions} />
          )}

          {/* Step 5: Exam Questions */}
          {currentStep === 5 && (
            <ExamQuestionsForm questions={examQuestions} onChange={setExamQuestions} />
          )}

          {/* Step 6: Results */}
          {currentStep === 6 && (
            <div className="space-y-6">
              <div className="space-y-4">
                <Label className="text-lg font-medium">Overall Examination Result</Label>
                <RadioGroup
                  value={formData.overall_result}
                  onValueChange={(v) => setFormData(prev => ({ ...prev, overall_result: v as any }))}
                  className="grid grid-cols-3 gap-4"
                >
                  <div className={`flex items-center space-x-2 p-4 rounded-lg border-2 ${formData.overall_result === "passed" ? "border-green-500 bg-green-50" : "border-muted"}`}>
                    <RadioGroupItem value="passed" id="passed" />
                    <Label htmlFor="passed" className="cursor-pointer font-medium text-green-700">PASSED</Label>
                  </div>
                  <div className={`flex items-center space-x-2 p-4 rounded-lg border-2 ${formData.overall_result === "failed" ? "border-red-500 bg-red-50" : "border-muted"}`}>
                    <RadioGroupItem value="failed" id="failed" />
                    <Label htmlFor="failed" className="cursor-pointer font-medium text-red-700">FAILED</Label>
                  </div>
                  <div className={`flex items-center space-x-2 p-4 rounded-lg border-2 ${formData.overall_result === "inconclusive" ? "border-yellow-500 bg-yellow-50" : "border-muted"}`}>
                    <RadioGroupItem value="inconclusive" id="inconclusive" />
                    <Label htmlFor="inconclusive" className="cursor-pointer font-medium text-yellow-700">INCONCLUSIVE</Label>
                  </div>
                </RadioGroup>
              </div>

              <div className="space-y-2">
                <Label>Examiner Notes / Observations</Label>
                <Textarea
                  value={formData.examiner_notes}
                  onChange={(e) => setFormData(prev => ({ ...prev, examiner_notes: e.target.value }))}
                  placeholder="Enter any additional observations, recommendations, or notes..."
                  rows={6}
                />
              </div>

              {/* Summary */}
              <Card className="bg-muted/50">
                <CardHeader>
                  <CardTitle className="text-base">Report Summary</CardTitle>
                </CardHeader>
                <CardContent className="text-sm space-y-2">
                  <p><strong>Candidate:</strong> {formData.first_name} {formData.last_name}</p>
                  <p><strong>ID Number:</strong> {formData.id_number}</p>
                  <p><strong>Services:</strong> {formData.vetting_types.length > 0 
                    ? formData.vetting_types.map(id => VETTING_SERVICES.find(s => s.id === id)?.label).join(", ")
                    : "None selected"
                  }</p>
                  <p><strong>Admissions:</strong> {admissions.filter(a => a.confirmed).length} confirmed</p>
                </CardContent>
              </Card>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Navigation */}
      <div className="flex justify-between">
        <div className="flex gap-2">
          <Button variant="outline" onClick={onCancel}>Cancel</Button>
          <Button variant="outline" onClick={() => saveReport("draft")} disabled={saving}>
            <Save className="h-4 w-4 mr-2" />
            Save Draft
          </Button>
        </div>
        <div className="flex gap-2">
          {currentStep > 1 && (
            <Button variant="outline" onClick={() => setCurrentStep(prev => prev - 1)}>
              <ChevronLeft className="h-4 w-4 mr-2" />
              Previous
            </Button>
          )}
          {currentStep < STEPS.length ? (
            <Button onClick={() => setCurrentStep(prev => prev + 1)}>
              Next
              <ChevronRight className="h-4 w-4 ml-2" />
            </Button>
          ) : (
            <Button onClick={() => saveReport("completed")} disabled={saving}>
              <CheckCircle2 className="h-4 w-4 mr-2" />
              Complete Report
            </Button>
          )}
        </div>
      </div>
    </div>
  );
};

export default PolygraphReportForm;
