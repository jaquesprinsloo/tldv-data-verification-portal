import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogClose } from "@/components/ui/dialog";
import { Separator } from "@/components/ui/separator";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { CalendarIcon, MapPin, Users, Eye, LogOut, FileText, Upload, Loader2, ArrowLeft, ShieldCheck, CheckCircle, XCircle, AlertTriangle, Bug } from "lucide-react";
import { format } from "date-fns";
import { toast } from "sonner";
import { useToast } from "@/hooks/use-toast";
import ApplicationReviewDialog from "@/components/candex/ApplicationReviewDialog";
import BookingConfirmationView from "@/components/shared/BookingConfirmationView";
import { User } from "@supabase/supabase-js";
import tldvLogo from "@/assets/tldv-logo-primary.png";
import DebugDiagnosticsDialog from "@/components/admin/DebugDiagnosticsDialog";

type ActiveView = "dashboard" | "appointments" | "upload";

const ExaminerPortal = () => {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { toast: toastHook } = useToast();
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [userName, setUserName] = useState("");
  const [activeView, setActiveView] = useState<ActiveView>("dashboard");
  const [viewCandidatesApt, setViewCandidatesApt] = useState<any>(null);
  const [viewAppDetails, setViewAppDetails] = useState<any>(null);
  const [viewRiskUrl, setViewRiskUrl] = useState<string | null>(null);
  const [viewBookingApt, setViewBookingApt] = useState<any>(null);
  const [selectedCandidate, setSelectedCandidate] = useState<any>(null);

  // Upload state
  const [file, setFile] = useState<File | null>(null);
  const [saving, setSaving] = useState(false);
  const [selectedCandidateId, setSelectedCandidateId] = useState<string>("");

  // Recordings (OneDrive) state
  const [recordings, setRecordings] = useState<File[]>([]);
  const [uploadedRecordings, setUploadedRecordings] = useState<
    { fileName: string; webUrl: string | null; itemId: string | null; size: number; folderPath: string }[]
  >([]);
  const [recordingsProgress, setRecordingsProgress] = useState<{ current: number; total: number; name: string } | null>(null);

  // Animation state
  const hasSeenAnimation = sessionStorage.getItem('examiner_animation_played') === 'true';
  const [isAnimating, setIsAnimating] = useState(!hasSeenAnimation);
  const [isExiting, setIsExiting] = useState(false);
  const [debugOpen, setDebugOpen] = useState(false);

  useEffect(() => {
    const checkAuth = async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (!session) { navigate("/admin/login"); return; }
        const currentUser = session.user;

        const { data: roleData, error: roleError } = await supabase
          .from("user_roles")
          .select("role")
          .eq("user_id", currentUser.id)
          .eq("role", "examiner")
          .maybeSingle();

        if (roleError) {
          console.error("Error checking examiner role:", roleError);
        }

        if (!roleData) {
          toast.error("Access denied. Examiner role required.");
          await supabase.auth.signOut();
          navigate("/admin/login");
          return;
        }

        setUser(currentUser);

        const { data: profileData } = await supabase
          .from("profiles")
          .select("full_name")
          .eq("id", currentUser.id)
          .single();

        if (profileData?.full_name) setUserName(profileData.full_name);
      } catch (error) {
        navigate("/admin/login");
      } finally {
        setLoading(false);
      }
    };
    checkAuth();

    if (!hasSeenAnimation) {
      const timer = setTimeout(() => {
        setIsAnimating(false);
        sessionStorage.setItem('examiner_animation_played', 'true');
      }, 5000);
      return () => clearTimeout(timer);
    }
  }, [navigate, hasSeenAnimation]);

  // Fetch appointments assigned to this examiner
  const { data: appointments = [] } = useQuery({
    queryKey: ["examiner-appointments", user?.id],
    queryFn: async () => {
      if (!user?.id) return [];
      const { data, error } = await supabase
        .from("polygraph_appointments" as any)
        .select("*")
        .eq("assigned_examiner_user_id", user.id)
        .order("scheduled_date", { ascending: true });
      if (error) throw error;
      return data || [];
    },
    enabled: !!user?.id,
  });

  // Fetch candidates for current viewed appointment
  const { data: candidates = [] } = useQuery({
    queryKey: ["examiner-apt-candidates", viewCandidatesApt?.id],
    queryFn: async () => {
      if (!viewCandidatesApt?.id) return [];
      const { data } = await supabase
        .from("polygraph_appointment_candidates" as any)
        .select("*")
        .eq("appointment_id", viewCandidatesApt.id);
      return data || [];
    },
    enabled: !!viewCandidatesApt?.id,
  });

  const { data: candidateApplications = [] } = useQuery({
    queryKey: ["examiner-candidate-apps", viewCandidatesApt?.id],
    queryFn: async () => {
      if (!candidates.length) return [];
      const appIds = (candidates as any[]).map((c: any) => c.application_id);
      const { data: apps } = await supabase.from("candex_applications").select("*").in("id", appIds);
      return apps || [];
    },
    enabled: !!candidates.length,
  });

  const { data: riskData = [] } = useQuery({
    queryKey: ["examiner-risk-data", viewCandidatesApt?.id],
    queryFn: async () => {
      if (!candidates.length) return [];
      const appIds = (candidates as any[]).map((c: any) => c.application_id);
      const { data } = await supabase
        .from("candex_risk_request_candidates")
        .select("application_id, id_verified, risk_assessment_result, risk_assessment_url");
      return (data || []).filter((d) => appIds.includes(d.application_id));
    },
    enabled: !!candidates.length,
  });

  const { data: allExaminerCandidates = [] } = useQuery({
    queryKey: ["examiner-all-candidates", user?.id],
    queryFn: async () => {
      if (!user?.id) return [];
      const aptIds = (appointments as any[]).map((a: any) => a.id);
      if (aptIds.length === 0) return [];
      const { data } = await supabase
        .from("polygraph_appointment_candidates" as any)
        .select("*, polygraph_appointments!inner(assigned_examiner_user_id)")
        .in("appointment_id", aptIds);
      return data || [];
    },
    enabled: !!(appointments as any[]).length,
  });

  const handleSignOut = async () => {
    setIsExiting(true);
    sessionStorage.removeItem('examiner_animation_played');
    setTimeout(async () => {
      await supabase.auth.signOut();
      navigate("/admin/login");
    }, 2000);
  };

  const upcomingCount = (appointments as any[]).filter((a: any) => ["assigned", "confirmed"].includes(a.status)).length;
  const completedCount = (appointments as any[]).filter((a: any) => a.status === "completed").length;

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "assigned": return <Badge className="bg-green-600 text-white text-xs">Assigned</Badge>;
      case "scheduled": return <Badge variant="secondary" className="bg-blue-100 text-blue-700 text-xs">Scheduled</Badge>;
      case "confirmed": return <Badge className="bg-primary text-primary-foreground text-xs">Confirmed</Badge>;
      case "completed": return <Badge variant="outline" className="text-xs">Completed</Badge>;
      default: return <Badge variant="outline" className="text-xs">{status}</Badge>;
    }
  };

  // --- Upload Logic ---
  const fileToBase64 = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.readAsDataURL(file);
      reader.onload = () => resolve((reader.result as string).split(',')[1]);
      reader.onerror = (error) => reject(error);
    });
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
    if (!selectedFile) return;
    const lowerName = selectedFile.name.toLowerCase();
    if (!/\.(pdf|docx)$/i.test(lowerName)) {
      toastHook({ title: "Invalid File", description: "Please upload a PDF or Word (.docx) file.", variant: "destructive" });
      return;
    }
    setFile(selectedFile);
  };

  const pickedCandidate = (allExaminerCandidates as any[]).find((c: any) => c.id === selectedCandidateId) || null;
  const pickedCandidateAppointment = pickedCandidate
    ? (appointments as any[]).find((a: any) => a.id === pickedCandidate.appointment_id)
    : null;

  const uploadRecordingsToOneDrive = async (): Promise<typeof uploadedRecordings> => {
    if (recordings.length === 0) return uploadedRecordings;

    const examinationDate = pickedCandidateAppointment?.scheduled_date
      ? new Date(pickedCandidateAppointment.scheduled_date).toISOString().split("T")[0]
      : new Date().toISOString().split("T")[0];
    const candidateName = pickedCandidate?.candidate_name || "Unknown Candidate";
    const bookingReference = pickedCandidateAppointment?.booking_reference || "NoRef";
    const examinerName = userName || user?.email || "Unassigned";

    const results: typeof uploadedRecordings = [...uploadedRecordings];
    for (let i = 0; i < recordings.length; i++) {
      const f = recordings[i];
      setRecordingsProgress({ current: i + 1, total: recordings.length, name: f.name });
      const fileBase64 = await fileToBase64(f);
      const { data, error } = await supabase.functions.invoke("upload-recording-to-onedrive", {
        body: {
          fileName: f.name,
          fileBase64,
          contentType: f.type || "application/octet-stream",
          examinerName,
          examinationDate,
          candidateName,
          bookingReference,
        },
      });
      if (error || !data?.success) {
        throw new Error(data?.error || error?.message || `Failed to upload ${f.name} to OneDrive`);
      }
      results.push({
        fileName: data.fileName,
        webUrl: data.webUrl,
        itemId: data.itemId,
        size: data.size,
        folderPath: data.folderPath,
      });
    }
    setUploadedRecordings(results);
    setRecordings([]);
    setRecordingsProgress(null);
    return results;
  };

  const handleSubmitReport = async () => {
    if (!file) return;
    if (!selectedCandidateId) {
      toast.error("Please select the candidate this report is for.");
      return;
    }
    const totalRecordings = recordings.length + uploadedRecordings.length;
    if (totalRecordings === 0) {
      toast.error("Polygraph recordings are required before submitting for review.");
      return;
    }
    setSaving(true);
    try {
      // 1. Upload recordings to OneDrive first (so links are saved with the report)
      let recordingLinks = uploadedRecordings;
      if (recordings.length > 0) {
        recordingLinks = await uploadRecordingsToOneDrive();
      }

      // 2. Upload the report PDF/DOCX to Supabase storage
      const uploadId = crypto.randomUUID();
      const fileName = `pending/${uploadId}/${file.name}`;
      const { error: uploadError } = await supabase.storage
        .from("polygraph-reports")
        .upload(fileName, file, { contentType: file.type });
      if (uploadError) throw uploadError;
      const { data: { publicUrl } } = supabase.storage.from("polygraph-reports").getPublicUrl(fileName);

      const accountId: string | null = pickedCandidateAppointment?.account_id || null;
      const storeId: string | null = pickedCandidateAppointment?.store_id || null;

      // Parse first/last name from candidate_name as a hint for the reviewer
      const nameParts = (pickedCandidate?.candidate_name || "").trim().split(/\s+/);
      const firstName = nameParts[0] || null;
      const lastName = nameParts.length > 1 ? nameParts.slice(1).join(" ") : null;
      const examinationDate = pickedCandidateAppointment?.scheduled_date
        ? new Date(pickedCandidateAppointment.scheduled_date).toISOString().split("T")[0]
        : new Date().toISOString().split("T")[0];

      const pendingPayload = {
        account_id: accountId,
        store_id: storeId,
        examiner_id: null,
        original_file_url: publicUrl,
        original_file_name: file.name,
        extracted_data: null,
        first_name: firstName,
        last_name: lastName,
        id_number: pickedCandidate?.candidate_id_number || null,
        examination_date: examinationDate,
        status: "pending",
        uploaded_by: user?.id,
        onedrive_recordings: recordingLinks,
      };

      const { error } = await supabase.from("pending_polygraph_uploads").insert([pendingPayload as any]);
      if (error) throw error;

      toastHook({
        title: "Report Submitted",
        description: `Report linked to ${pickedCandidate?.candidate_name} submitted for Master Admin review.${recordingLinks.length ? ` ${recordingLinks.length} recording(s) saved to OneDrive.` : ""}`,
      });
      setFile(null);
      setSelectedCandidateId("");
      setUploadedRecordings([]);
      setActiveView("dashboard");
    } catch (err: any) {
      toastHook({ title: "Error", description: err.message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-black">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-red-600" />
      </div>
    );
  }

  // Portal cards for the examiner dashboard
  const portalCards = [
    {
      key: "appointments",
      title: "Appointments",
      description: "View assigned appointments and candidates",
      icon: CalendarIcon,
      badge: upcomingCount > 0 ? upcomingCount : null,
    },
    {
      key: "upload",
      title: "Upload Report",
      description: "Upload completed polygraph reports",
      icon: Upload,
      badge: null,
    },
  ];

  // ====== DASHBOARD VIEW ======
  if (activeView === "dashboard") {
    return (
      <div className="min-h-screen bg-black relative overflow-hidden">
        {/* Entry Animation */}
        <div className={`fixed inset-0 bg-black z-50 ${isAnimating ? "opacity-100" : "opacity-0 pointer-events-none"}`}>
          <div className="absolute inset-0 flex items-center justify-center"
            style={{ animation: isAnimating ? 'scanline 2s ease-out forwards' : 'none', opacity: 0 }}>
            <div className="w-1 h-full bg-red-600" style={{ boxShadow: '0 0 40px rgba(239,68,68,0.8), 0 0 80px rgba(239,68,68,0.5)' }} />
          </div>
          <div className="absolute inset-0 flex flex-col items-center justify-center px-4"
            style={{ animation: isAnimating ? 'logoSequence 3s ease-in-out 2s both' : 'none' }}>
            <img src={tldvLogo} alt="TLDV Logo" className="w-3/4 sm:w-1/2 max-w-2xl object-contain" />
            {userName && (
              <h2 className="text-xl sm:text-2xl md:text-3xl font-semibold text-red-500 mt-4 sm:mt-8 tracking-wide text-center">
                Welcome, {userName}
              </h2>
            )}
            <h1 className="text-2xl sm:text-3xl md:text-4xl font-bold text-white mt-2 sm:mt-4 tracking-wider text-center">
              Examiner Portal
            </h1>
          </div>
        </div>

        {/* Exit Animation */}
        <div className={`fixed inset-0 bg-black z-50 transition-opacity duration-500 ${isExiting ? "opacity-100" : "opacity-0 pointer-events-none"}`}>
          <div className="absolute inset-0 flex items-center justify-center px-4"
            style={{ animation: isExiting ? 'portalExit 2s ease-in-out forwards' : 'none' }}>
            <div className="relative">
              <div className="w-48 h-48 sm:w-72 sm:h-72 rounded-full border-4 border-red-600"
                style={{ boxShadow: '0 0 60px rgba(239,68,68,0.8), inset 0 0 60px rgba(239,68,68,0.5)', animation: isExiting ? 'portalShrink 2s ease-in-out forwards' : 'none' }} />
              <p className="absolute inset-0 flex items-center justify-center text-white text-lg sm:text-xl font-bold">Exiting Portal...</p>
            </div>
          </div>
        </div>

        {/* Main Dashboard */}
        <div className={`min-h-screen flex items-center justify-center py-6 sm:py-8 pb-12 ${!hasSeenAnimation ? "transition-all duration-1000" : ""} ${isAnimating ? "opacity-0" : "opacity-100"}`}>
          <div className="container mx-auto px-3 sm:px-4 max-w-4xl relative">
            <div className="absolute top-2 sm:top-0 right-2 sm:right-4 flex gap-2">
              <button
                onClick={() => setDebugOpen(true)}
                className="px-2 sm:px-3 py-2 sm:py-3 text-sm bg-gray-800/50 border-2 border-gray-700 text-gray-400 rounded-lg hover:bg-gray-700/50 hover:text-white transition-all duration-300"
                title="System Diagnostics"
              >
                <Bug className="w-4 h-4" />
              </button>
              <button onClick={handleSignOut}
                className="px-3 sm:px-6 py-2 sm:py-3 text-sm sm:text-base bg-red-600/20 border-2 border-red-600 text-white rounded-lg hover:bg-red-600/40 hover:shadow-[0_0_20px_rgba(239,68,68,0.6)] transition-all duration-300">
                Sign Out
              </button>
            </div>

            <h1 className="text-2xl sm:text-3xl md:text-4xl font-bold text-white text-center mb-6 sm:mb-8 md:mb-12 mt-12 sm:mt-8">
              Examiner Portal
            </h1>

            {/* Stats row */}
            <div className="grid grid-cols-3 gap-3 mb-8">
              <div className="border-2 border-red-600/30 rounded-lg p-4 text-center bg-black">
                <p className="text-2xl font-bold text-red-500">{(appointments as any[]).length}</p>
                <p className="text-xs text-gray-400">Total</p>
              </div>
              <div className="border-2 border-red-600/30 rounded-lg p-4 text-center bg-black">
                <p className="text-2xl font-bold text-green-500">{upcomingCount}</p>
                <p className="text-xs text-gray-400">Upcoming</p>
              </div>
              <div className="border-2 border-red-600/30 rounded-lg p-4 text-center bg-black">
                <p className="text-2xl font-bold text-gray-400">{completedCount}</p>
                <p className="text-xs text-gray-400">Completed</p>
              </div>
            </div>

            {/* Portal Cards */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 sm:gap-6">
              {portalCards.map((portal) => (
                <Card
                  key={portal.key}
                  onClick={() => setActiveView(portal.key as ActiveView)}
                  className="p-5 sm:p-8 cursor-pointer transition-all duration-500 hover:scale-105 bg-black border-[3px] border-red-600 hover:border-red-500 hover:shadow-[0_0_40px_rgba(239,68,68,0.5)] relative"
                >
                  {portal.badge !== null && (
                    <Badge className="absolute top-4 right-4 bg-red-600 text-white text-xs">{portal.badge}</Badge>
                  )}
                  <div className="flex flex-col items-center text-center space-y-3 sm:space-y-4">
                    <div className="p-4 sm:p-6 rounded-full border-2 bg-red-600/30 border-red-600 shadow-[0_0_20px_rgba(239,68,68,0.4)]">
                      <portal.icon className="w-10 h-10 sm:w-16 sm:h-16 text-red-500" strokeWidth={2.5} />
                    </div>
                    <h2 className="text-lg sm:text-2xl font-bold text-white">{portal.title}</h2>
                    <p className="text-sm text-gray-300">{portal.description}</p>
                  </div>
                </Card>
              ))}
            </div>
          </div>
        </div>

        <style>{`
          @keyframes scanline { 0% { transform: translateX(-100vw); opacity: 0; } 10% { opacity: 1; } 90% { opacity: 1; } 100% { transform: translateX(100vw); opacity: 0; } }
          @keyframes logoSequence { 0% { opacity: 0; transform: scale(0.95); } 10% { opacity: 1; transform: scale(1); } 80% { opacity: 1; transform: scale(1); } 100% { opacity: 0; transform: scale(1.05); } }
          @keyframes portalExit { 0% { opacity: 0; } 20% { opacity: 1; } 100% { opacity: 1; } }
          @keyframes portalShrink { 0% { transform: scale(1); opacity: 1; } 50% { transform: scale(1.2); opacity: 1; } 100% { transform: scale(0); opacity: 0; } }
        `}</style>
      </div>
    );
  }

  // ====== INNER VIEWS (Appointments / Upload) ======
  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b bg-black">
        <div className="container mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="sm" onClick={() => setActiveView("dashboard")} className="text-white hover:text-red-500">
              <ArrowLeft className="h-4 w-4 mr-1" /> Back
            </Button>
            <div>
              <h1 className="text-lg font-bold text-white">
                {activeView === "appointments" ? "Appointments" : "Upload Report"}
              </h1>
              <p className="text-xs text-gray-400">{user?.email}</p>
            </div>
          </div>
          <Button variant="ghost" size="sm" onClick={handleSignOut} className="text-white hover:text-red-500">
            <LogOut className="h-4 w-4 mr-1" /> Sign Out
          </Button>
        </div>
      </header>

      <main className="container mx-auto px-4 py-6 space-y-6">
        {/* ====== APPOINTMENTS VIEW ====== */}
        {activeView === "appointments" && (
          <Card>
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <CalendarIcon className="h-5 w-5 text-primary" /> My Appointments
              </CardTitle>
            </CardHeader>
            <CardContent>
              {(appointments as any[]).length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-8">No appointments assigned yet.</p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Date</TableHead>
                      <TableHead>Time</TableHead>
                      <TableHead>Venue</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Reference</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {(appointments as any[]).map((apt: any) => (
                      <TableRow key={apt.id}>
                        <TableCell className="text-sm">
                          {apt.scheduled_date ? format(new Date(apt.scheduled_date), "dd MMM yyyy") : "—"}
                        </TableCell>
                        <TableCell className="text-sm">{apt.scheduled_time || "—"}</TableCell>
                        <TableCell className="text-xs">
                          <p className="font-medium">{apt.venue_type === "tldv_venue" ? "TLDV Venue" : apt.venue_type === "own_location" ? "Client Location" : "Rented Venue"}</p>
                          <p className="text-muted-foreground truncate max-w-[200px]">{apt.venue_address || "—"}</p>
                        </TableCell>
                        <TableCell>{getStatusBadge(apt.status)}</TableCell>
                        <TableCell className="text-xs font-mono">{apt.booking_reference || "—"}</TableCell>
                        <TableCell className="text-right space-x-1">
                          <Button variant="ghost" size="sm" title="View Candidates" onClick={() => setViewCandidatesApt(apt)}>
                            <Users className="h-4 w-4" />
                          </Button>
                          {apt.booking_reference && (
                            <Button variant="ghost" size="sm" title="Booking Confirmation" onClick={() => setViewBookingApt(apt)}>
                              <FileText className="h-4 w-4" />
                            </Button>
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        )}

        {/* ====== UPLOAD VIEW ====== */}
        {activeView === "upload" && (
          <Card>
            <CardHeader>
              <CardTitle>Upload Completed Report</CardTitle>
              <CardDescription>
                Upload a completed polygraph report. The system will automatically try to match it to a scheduled candidate.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="text-center p-8 border-2 border-dashed rounded-lg">
                <Upload className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
                <input type="file" accept=".pdf,.docx" onChange={handleFileChange} className="hidden" id="examiner-report-upload" />
                <label htmlFor="examiner-report-upload">
                  <Button variant="outline" asChild className="cursor-pointer"><span>Select PDF or Word File</span></Button>
                </label>
                {file && !uploading && !extractedData && (
                  <div className="mt-4">
                    <p className="text-sm font-medium">{file.name}</p>
                    <Button onClick={handleExtract} className="mt-2">Extract Report Data</Button>
                  </div>
                )}
                {uploading && (
                  <div className="mt-6 space-y-3 max-w-md mx-auto">
                    <div className="flex items-center justify-center gap-2">
                      <Loader2 className="h-5 w-5 animate-spin text-primary" />
                      <span className="text-sm font-medium">Extracting data...</span>
                    </div>
                    <Progress value={extractionProgress} className="h-3" />
                    <p className="text-center text-sm font-semibold text-primary">{Math.round(extractionProgress)}%</p>
                  </div>
                )}
              </div>

              {extractedData && (
                <div className="space-y-4">
                  {matchedCandidate ? (
                    <div className="p-4 rounded-lg border border-green-300 bg-green-50">
                      <p className="text-sm font-semibold text-green-700">✓ Auto-matched to scheduled candidate</p>
                      <p className="text-sm text-green-600">{matchedCandidate.candidate_name} {matchedCandidate.candidate_id_number ? `(${matchedCandidate.candidate_id_number})` : ""}</p>
                    </div>
                  ) : (
                    <div className="p-4 rounded-lg border border-amber-300 bg-amber-50">
                      <p className="text-sm font-semibold text-amber-700">⚠ No automatic match found</p>
                      <p className="text-sm text-amber-600">The report will be submitted for manual review by the Master Admin.</p>
                    </div>
                  )}
                  <Card className="bg-muted/50">
                    <CardHeader><CardTitle className="text-base">Extracted Candidate Data</CardTitle></CardHeader>
                    <CardContent>
                      <div className="grid grid-cols-2 gap-4 text-sm">
                        <div><span className="text-muted-foreground">Name:</span><span className="ml-2 font-medium">{extractedData.candidate?.firstName} {extractedData.candidate?.lastName}</span></div>
                        <div><span className="text-muted-foreground">ID Number:</span><span className="ml-2 font-medium">{extractedData.candidate?.idNumber || "—"}</span></div>
                        <div><span className="text-muted-foreground">Contact:</span><span className="ml-2 font-medium">{extractedData.candidate?.contactNumber || "—"}</span></div>
                        <div><span className="text-muted-foreground">Result:</span><span className="ml-2 font-medium">
                          {(() => {
                            const result = mapOverallResult(extractedData.examQuestions);
                            if (result === 'passed') return <Badge className="bg-green-600 text-white">Passed (NSR)</Badge>;
                            if (result === 'failed') return <Badge className="bg-destructive text-destructive-foreground">Failed (SR)</Badge>;
                            return <Badge variant="secondary">Inconclusive</Badge>;
                          })()}
                        </span></div>
                      </div>
                    </CardContent>
                  </Card>

                  {/* OneDrive Recordings Upload */}
                  <Card className="border-dashed">
                    <CardHeader>
                      <CardTitle className="text-base flex items-center gap-2">
                        <Upload className="h-4 w-4 text-primary" /> Polygraph Recordings (OneDrive)
                      </CardTitle>
                      <CardDescription>
                        Upload complete PF folder for this report. <span className="text-destructive font-medium">Required before submission.</span>
                      </CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-3">
                      <input
                        type="file"
                        multiple
                        accept="audio/*,video/*,.dat,.bin,.zip,.lxe,.lx5,.lx6"
                        onChange={(e) => {
                          const files = Array.from(e.target.files || []);
                          setRecordings((prev) => [...prev, ...files]);
                          e.target.value = "";
                        }}
                        className="hidden"
                        id="examiner-recordings-upload"
                        disabled={saving || !!recordingsProgress}
                      />
                      <label htmlFor="examiner-recordings-upload">
                        <Button variant="outline" asChild className="cursor-pointer w-full" disabled={saving || !!recordingsProgress}>
                          <span>+ Add Recording Files</span>
                        </Button>
                      </label>

                      {recordings.length > 0 && (
                        <div className="space-y-1">
                          <p className="text-xs font-semibold text-muted-foreground">Pending upload ({recordings.length}):</p>
                          {recordings.map((f, i) => (
                            <div key={i} className="flex items-center justify-between rounded border bg-muted/30 px-2 py-1 text-xs">
                              <span className="truncate">{f.name}</span>
                              <span className="text-muted-foreground ml-2 whitespace-nowrap">
                                {(f.size / (1024 * 1024)).toFixed(1)} MB
                              </span>
                              <Button
                                variant="ghost"
                                size="sm"
                                className="h-6 px-2 ml-1"
                                onClick={() => setRecordings((prev) => prev.filter((_, idx) => idx !== i))}
                                disabled={saving || !!recordingsProgress}
                              >
                                ✕
                              </Button>
                            </div>
                          ))}
                        </div>
                      )}

                      {uploadedRecordings.length > 0 && (
                        <div className="space-y-1">
                          <p className="text-xs font-semibold text-green-700">Uploaded to OneDrive ({uploadedRecordings.length}):</p>
                          {uploadedRecordings.map((r, i) => (
                            <div key={i} className="flex items-center justify-between rounded border border-green-200 bg-green-50 px-2 py-1 text-xs">
                              <span className="truncate">✓ {r.fileName}</span>
                              {r.webUrl && (
                                <a href={r.webUrl} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline ml-2 whitespace-nowrap">
                                  Open
                                </a>
                              )}
                            </div>
                          ))}
                        </div>
                      )}

                      {recordingsProgress && (
                        <div className="rounded-md border bg-muted/30 p-3 text-xs space-y-1">
                          <div className="flex items-center gap-2">
                            <Loader2 className="h-4 w-4 animate-spin text-primary" />
                            <span>
                              Uploading {recordingsProgress.current}/{recordingsProgress.total}: {recordingsProgress.name}
                            </span>
                          </div>
                          <p className="text-muted-foreground">Large files may take a while. Please don't close this tab.</p>
                        </div>
                      )}
                    </CardContent>
                  </Card>

                  <Button
                    onClick={handleSubmitReport}
                    disabled={saving || (recordings.length + uploadedRecordings.length === 0)}
                    className="w-full"
                  >
                    {saving ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Submitting...</> : <><Upload className="mr-2 h-4 w-4" /> Submit Report for Review</>}
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>
        )}
      </main>

      {/* Candidates Dialog */}
      <Dialog open={!!viewCandidatesApt} onOpenChange={(open) => { if (!open) { setViewCandidatesApt(null); setSelectedCandidate(null); } }}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Appointment Candidates</DialogTitle>
            <DialogDescription>
              {viewCandidatesApt?.booking_reference && `Reference: ${viewCandidatesApt.booking_reference}`}
              {viewCandidatesApt?.scheduled_date && ` • ${format(new Date(viewCandidatesApt.scheduled_date), "dd MMM yyyy")}`}
            </DialogDescription>
          </DialogHeader>

          {!selectedCandidate ? (
            /* Candidate List */
            <div className="space-y-3">
              {(candidates as any[]).map((c: any) => {
                const app = candidateApplications.find((a: any) => a.id === c.application_id);
                const risk = riskData.find((r: any) => r.application_id === c.application_id);
                return (
                  <Card key={c.id} className="cursor-pointer hover:border-primary transition-colors" onClick={() => setSelectedCandidate(c)}>
                    <CardContent className="p-4 flex items-center justify-between">
                      <div className="flex-1">
                        <p className="font-semibold">{c.candidate_name}</p>
                        <p className="text-xs text-muted-foreground">ID: {c.candidate_id_number || "—"}</p>
                      </div>
                      <div className="flex items-center gap-2">
                        {app && <Badge variant="outline" className="text-xs bg-green-50 text-green-700 border-green-300">PreAppliChecked</Badge>}
                        {risk?.id_verified && <Badge variant="outline" className="text-xs bg-green-50 text-green-700 border-green-300">ID Verified</Badge>}
                        {risk?.risk_assessment_result === "clear" ? (
                          <Badge className="bg-green-600 text-white text-xs">No Risk</Badge>
                        ) : risk?.risk_assessment_result === "flagged" ? (
                          <Badge className="bg-destructive text-destructive-foreground text-xs">Risk Identified</Badge>
                        ) : null}
                        <Eye className="h-4 w-4 text-muted-foreground" />
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
              {candidates.length === 0 && (
                <p className="text-center text-muted-foreground py-8">No candidates linked to this appointment.</p>
              )}
            </div>
          ) : (
            /* Candidate Detail View */
            (() => {
              const c = selectedCandidate;
              const app = candidateApplications.find((a: any) => a.id === c.application_id);
              const risk = riskData.find((r: any) => r.application_id === c.application_id);
              const appAnswers = app?.answers as any;
              const personalDetails = appAnswers?.personalDetails;
              const popiaAccepted = appAnswers?.popiaAccepted;
              const indemnityAccepted = appAnswers?.indemnityAccepted;
              const deviceData = appAnswers?.deviceData;

              return (
                <div className="space-y-4">
                  <Button variant="ghost" size="sm" onClick={() => setSelectedCandidate(null)} className="mb-2">
                    <ArrowLeft className="h-4 w-4 mr-1" /> Back to list
                  </Button>

                  {/* Candidate Header */}
                  <Card>
                    <CardContent className="p-5">
                      <div className="flex items-start justify-between">
                        <div>
                          <h3 className="text-xl font-bold">{c.candidate_name}</h3>
                          <p className="text-sm text-muted-foreground mt-1">ID Number: <span className="font-mono font-medium text-foreground">{c.candidate_id_number || "—"}</span></p>
                          {personalDetails?.email && <p className="text-sm text-muted-foreground">Email: {personalDetails.email}</p>}
                          {personalDetails?.contactNumber && <p className="text-sm text-muted-foreground">Contact: {personalDetails.contactNumber}</p>}
                        </div>
                      </div>
                    </CardContent>
                  </Card>

                  {/* Status Cards Grid */}
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                    {/* PreAppliCheck Status */}
                    <Card className={`border-2 ${app ? "border-green-400 bg-green-50" : "border-muted"}`}>
                      <CardContent className="p-3 text-center">
                        <ShieldCheck className={`h-6 w-6 mx-auto mb-1 ${app ? "text-green-600" : "text-muted-foreground"}`} />
                        <p className="text-xs font-semibold">PreAppliChecked</p>
                        <p className={`text-xs mt-1 ${app ? "text-green-700" : "text-muted-foreground"}`}>
                          {app ? "Approved" : "Not Available"}
                        </p>
                      </CardContent>
                    </Card>

                    {/* ID Verification */}
                    <Card className={`border-2 ${risk?.id_verified ? "border-green-400 bg-green-50" : risk?.id_verified === false ? "border-destructive bg-red-50" : "border-muted"}`}>
                      <CardContent className="p-3 text-center">
                        {risk?.id_verified ? (
                          <CheckCircle className="h-6 w-6 mx-auto mb-1 text-green-600" />
                        ) : risk?.id_verified === false ? (
                          <XCircle className="h-6 w-6 mx-auto mb-1 text-destructive" />
                        ) : (
                          <AlertTriangle className="h-6 w-6 mx-auto mb-1 text-muted-foreground" />
                        )}
                        <p className="text-xs font-semibold">ID Verification</p>
                        <p className={`text-xs mt-1 ${risk?.id_verified ? "text-green-700" : risk?.id_verified === false ? "text-destructive" : "text-muted-foreground"}`}>
                          {risk?.id_verified ? "Verified" : risk?.id_verified === false ? "Not Verified" : "Pending"}
                        </p>
                      </CardContent>
                    </Card>

                    {/* Risk Assessment */}
                    <Card className={`border-2 ${risk?.risk_assessment_result === "clear" ? "border-green-400 bg-green-50" : risk?.risk_assessment_result === "flagged" ? "border-destructive bg-red-50" : "border-muted"}`}>
                      <CardContent className="p-3 text-center">
                        <FileText className={`h-6 w-6 mx-auto mb-1 ${risk?.risk_assessment_result === "clear" ? "text-green-600" : risk?.risk_assessment_result === "flagged" ? "text-destructive" : "text-muted-foreground"}`} />
                        <p className="text-xs font-semibold">Risk Assessment</p>
                        <p className={`text-xs mt-1 ${risk?.risk_assessment_result === "clear" ? "text-green-700" : risk?.risk_assessment_result === "flagged" ? "text-destructive" : "text-muted-foreground"}`}>
                          {risk?.risk_assessment_result === "clear" ? "No Risk Identified" : risk?.risk_assessment_result === "flagged" ? "Risk Identified" : "Pending"}
                        </p>
                      </CardContent>
                    </Card>

                    {/* POPIA & Indemnity */}
                    <Card className={`border-2 ${popiaAccepted && indemnityAccepted ? "border-green-400 bg-green-50" : "border-muted"}`}>
                      <CardContent className="p-3 text-center">
                        <ShieldCheck className={`h-6 w-6 mx-auto mb-1 ${popiaAccepted && indemnityAccepted ? "text-green-600" : "text-muted-foreground"}`} />
                        <p className="text-xs font-semibold">POPIA & Indemnity</p>
                        <p className={`text-xs mt-1 ${popiaAccepted && indemnityAccepted ? "text-green-700" : "text-muted-foreground"}`}>
                          {popiaAccepted && indemnityAccepted ? "Accepted" : "Not Available"}
                        </p>
                      </CardContent>
                    </Card>
                  </div>

                  {/* Document Actions */}
                  <Accordion type="multiple" className="w-full">
                    {/* PreAppliCheck Section */}
                    {app && (
                      <AccordionItem value="preapplicheck">
                        <AccordionTrigger className="text-sm font-semibold">
                          <span className="flex items-center gap-2"><ShieldCheck className="h-4 w-4 text-green-600" /> PreAppliCheck Application</span>
                        </AccordionTrigger>
                        <AccordionContent>
                          <div className="space-y-3">
                            <p className="text-sm text-muted-foreground">View the full PreAppliCheck submission completed by the candidate.</p>
                            <Button variant="outline" size="sm" onClick={() => setViewAppDetails(app)}>
                              <Eye className="h-4 w-4 mr-2" /> View PreAppliCheck
                            </Button>
                          </div>
                        </AccordionContent>
                      </AccordionItem>
                    )}

                    {/* Risk Assessment Section */}
                    {risk?.risk_assessment_url && (
                      <AccordionItem value="risk-assessment">
                        <AccordionTrigger className="text-sm font-semibold">
                          <span className="flex items-center gap-2"><FileText className="h-4 w-4 text-primary" /> Risk Assessment Document</span>
                        </AccordionTrigger>
                        <AccordionContent>
                          <div className="space-y-3">
                            <div className="grid grid-cols-2 gap-2 text-sm">
                              <div><span className="text-muted-foreground">ID Verified:</span> <span className={`font-medium ${risk.id_verified ? "text-green-700" : "text-destructive"}`}>{risk.id_verified ? "Yes" : "No"}</span></div>
                              <div><span className="text-muted-foreground">Result:</span> <span className={`font-medium ${risk.risk_assessment_result === "clear" ? "text-green-700" : "text-destructive"}`}>{risk.risk_assessment_result === "clear" ? "No Risk Identified" : "Risk Identified"}</span></div>
                            </div>
                            <Button variant="outline" size="sm" onClick={async () => {
                              let filePath = risk.risk_assessment_url;
                              // Extract path from full URL if needed
                              const bucketMarker = "/object/public/employee-documents/";
                              const bucketMarker2 = "/object/sign/employee-documents/";
                              if (filePath.includes(bucketMarker)) {
                                filePath = filePath.split(bucketMarker)[1];
                              } else if (filePath.includes(bucketMarker2)) {
                                filePath = filePath.split(bucketMarker2)[1];
                              }
                              const { data, error } = await supabase.storage.from("employee-documents").createSignedUrl(filePath, 3600);
                              if (data?.signedUrl) setViewRiskUrl(data.signedUrl);
                              else { console.error("Signed URL error:", error); toast.error("Could not load document"); }
                            }}>
                              <Eye className="h-4 w-4 mr-2" /> View Risk Assessment
                            </Button>
                          </div>
                        </AccordionContent>
                      </AccordionItem>
                    )}

                    {/* POPIA & Indemnity Section */}
                    {(popiaAccepted || indemnityAccepted) && (
                      <AccordionItem value="popia-indemnity">
                        <AccordionTrigger className="text-sm font-semibold">
                          <span className="flex items-center gap-2"><ShieldCheck className="h-4 w-4 text-primary" /> POPIA & Indemnity Details</span>
                        </AccordionTrigger>
                        <AccordionContent>
                          <div className="space-y-3">
                            <div className="grid grid-cols-1 gap-2 text-sm">
                              <div className="flex justify-between py-1.5 border-b border-border/50">
                                <span className="text-muted-foreground">POPIA Declaration:</span>
                                <span className={`font-medium ${popiaAccepted ? "text-green-700" : "text-muted-foreground"}`}>
                                  {popiaAccepted ? "✓ Accepted" : "Not accepted"}
                                </span>
                              </div>
                              <div className="flex justify-between py-1.5 border-b border-border/50">
                                <span className="text-muted-foreground">Indemnity Form:</span>
                                <span className={`font-medium ${indemnityAccepted ? "text-green-700" : "text-muted-foreground"}`}>
                                  {indemnityAccepted ? "✓ Accepted" : "Not accepted"}
                                </span>
                              </div>
                              {deviceData && (
                                <>
                                  <Separator className="my-2" />
                                  <p className="text-xs font-semibold text-muted-foreground">Electronic Signature Metadata</p>
                                  {deviceData.timestamp && (
                                    <div className="flex justify-between py-1">
                                      <span className="text-muted-foreground text-xs">Signed At:</span>
                                      <span className="text-xs font-medium">{format(new Date(deviceData.timestamp), "dd MMM yyyy, HH:mm:ss")}</span>
                                    </div>
                                  )}
                                  {deviceData.ipAddress && (
                                    <div className="flex justify-between py-1">
                                      <span className="text-muted-foreground text-xs">IP Address:</span>
                                      <span className="text-xs font-mono">{deviceData.ipAddress}</span>
                                    </div>
                                  )}
                                  {(deviceData.gpsLatitude || deviceData.gps_latitude) && (
                                    <div className="flex justify-between py-1">
                                      <span className="text-muted-foreground text-xs">GPS:</span>
                                      <span className="text-xs font-mono">{deviceData.gpsLatitude || deviceData.gps_latitude}, {deviceData.gpsLongitude || deviceData.gps_longitude}</span>
                                    </div>
                                  )}
                                  {deviceData.userAgent && (
                                    <div className="flex justify-between py-1">
                                      <span className="text-muted-foreground text-xs">Device:</span>
                                      <span className="text-xs truncate max-w-[250px]">{deviceData.userAgent}</span>
                                    </div>
                                  )}
                                </>
                              )}
                            </div>
                          </div>
                        </AccordionContent>
                      </AccordionItem>
                    )}
                  </Accordion>
                </div>
              );
            })()
          )}
        </DialogContent>
      </Dialog>

      {/* PreAppliCheck viewer */}
      <ApplicationReviewDialog
        application={viewAppDetails}
        open={!!viewAppDetails}
        onClose={() => setViewAppDetails(null)}
        onApprove={undefined as any}
        onReject={undefined as any}
        readOnly
      />

      {/* Risk Assessment viewer */}
      <Dialog open={!!viewRiskUrl} onOpenChange={() => setViewRiskUrl(null)}>
        <DialogContent className="max-w-3xl max-h-[85vh]">
          <DialogHeader>
            <DialogTitle>Risk Assessment Report</DialogTitle>
            <DialogDescription>View the risk assessment document.</DialogDescription>
          </DialogHeader>
          {viewRiskUrl && <iframe src={viewRiskUrl} className="w-full h-[65vh] border rounded" title="Risk Assessment" />}
        </DialogContent>
      </Dialog>

      {/* Booking Confirmation viewer */}
      <BookingConfirmationView
        open={!!viewBookingApt}
        onClose={() => setViewBookingApt(null)}
        data={viewBookingApt ? {
          bookingReference: viewBookingApt.booking_reference || "",
          scheduledDate: viewBookingApt.scheduled_date || "",
          scheduledTime: viewBookingApt.scheduled_time || "",
          venueType: viewBookingApt.venue_type || "",
          venueAddress: viewBookingApt.venue_address || "",
          status: viewBookingApt.status || "",
          candidates: [],
        } : null}
      />
      <DebugDiagnosticsDialog open={debugOpen} onOpenChange={setDebugOpen} />
    </div>
  );
};

export default ExaminerPortal;
