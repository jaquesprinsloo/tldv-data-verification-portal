import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ArrowLeft, CalendarIcon, MapPin, Users, Eye, LogOut, FileText } from "lucide-react";
import { format } from "date-fns";
import { toast } from "sonner";
import ApplicationReviewDialog from "@/components/candex/ApplicationReviewDialog";
import { User } from "@supabase/supabase-js";

const ExaminerPortal = () => {
  const navigate = useNavigate();
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [viewCandidatesApt, setViewCandidatesApt] = useState<any>(null);
  const [viewAppDetails, setViewAppDetails] = useState<any>(null);
  const [viewRiskUrl, setViewRiskUrl] = useState<string | null>(null);

  useEffect(() => {
    const checkAuth = async () => {
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) { navigate("/admin/login"); return; }

        const { data: roleData } = await supabase
          .from("user_roles")
          .select("role")
          .eq("user_id", user.id)
          .eq("role", "examiner")
          .single();

        if (!roleData) {
          toast.error("Access denied. Examiner role required.");
          await supabase.auth.signOut();
          navigate("/admin/login");
          return;
        }

        setUser(user);
      } catch (error) {
        navigate("/admin/login");
      } finally {
        setLoading(false);
      }
    };
    checkAuth();
  }, [navigate]);

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

  // Fetch application + risk data for each candidate when viewing
  const { data: candidateApplications = [] } = useQuery({
    queryKey: ["examiner-candidate-apps", viewCandidatesApt?.id],
    queryFn: async () => {
      if (!candidates.length) return [];
      const appIds = (candidates as any[]).map((c: any) => c.application_id);
      const { data: apps } = await supabase
        .from("candex_applications")
        .select("*")
        .in("id", appIds);
      return apps || [];
    },
    enabled: !!candidates.length,
  });

  // Fetch risk candidate data
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

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    navigate("/admin/login");
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "assigned": return <Badge className="bg-green-600 text-white text-xs">Assigned</Badge>;
      case "scheduled": return <Badge variant="secondary" className="bg-blue-100 text-blue-700 text-xs">Scheduled</Badge>;
      case "completed": return <Badge className="bg-primary text-primary-foreground text-xs">Completed</Badge>;
      default: return <Badge variant="outline" className="text-xs">{status}</Badge>;
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b bg-card">
        <div className="container mx-auto px-4 py-3 flex items-center justify-between">
          <div>
            <h1 className="text-lg font-bold">Examiner Portal</h1>
            <p className="text-xs text-muted-foreground">{user?.email}</p>
          </div>
          <Button variant="ghost" size="sm" onClick={handleSignOut}>
            <LogOut className="h-4 w-4 mr-1" /> Sign Out
          </Button>
        </div>
      </header>

      <main className="container mx-auto px-4 py-6 space-y-6">
        {/* Stats */}
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
          <Card><CardContent className="py-4 text-center">
            <p className="text-2xl font-bold text-primary">{(appointments as any[]).length}</p>
            <p className="text-xs text-muted-foreground">Total Appointments</p>
          </CardContent></Card>
          <Card><CardContent className="py-4 text-center">
            <p className="text-2xl font-bold text-green-600">{(appointments as any[]).filter((a: any) => a.status === "assigned").length}</p>
            <p className="text-xs text-muted-foreground">Upcoming</p>
          </CardContent></Card>
          <Card><CardContent className="py-4 text-center">
            <p className="text-2xl font-bold text-muted-foreground">{(appointments as any[]).filter((a: any) => a.status === "completed").length}</p>
            <p className="text-xs text-muted-foreground">Completed</p>
          </CardContent></Card>
        </div>

        {/* Appointments list */}
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
                      <TableCell className="text-right">
                        <Button variant="ghost" size="sm" title="View Candidates" onClick={() => setViewCandidatesApt(apt)}>
                          <Users className="h-4 w-4" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </main>

      {/* Candidates Dialog with PreAppliCheck and Risk Assessment access */}
      <Dialog open={!!viewCandidatesApt} onOpenChange={() => setViewCandidatesApt(null)}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Appointment Candidates</DialogTitle>
            <DialogDescription>
              {viewCandidatesApt?.booking_reference && `Reference: ${viewCandidatesApt.booking_reference}`}
              {viewCandidatesApt?.scheduled_date && ` • ${format(new Date(viewCandidatesApt.scheduled_date), "dd MMM yyyy")}`}
            </DialogDescription>
          </DialogHeader>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>ID Number</TableHead>
                <TableHead>Risk</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {(candidates as any[]).map((c: any) => {
                const app = candidateApplications.find((a: any) => a.id === c.application_id);
                const risk = riskData.find((r: any) => r.application_id === c.application_id);
                return (
                  <TableRow key={c.id}>
                    <TableCell className="font-medium">{c.candidate_name}</TableCell>
                    <TableCell className="text-xs">{c.candidate_id_number || "—"}</TableCell>
                    <TableCell>
                      {risk?.risk_assessment_result === "clear" ? (
                        <Badge className="bg-green-600 text-white text-xs">No Risk</Badge>
                      ) : risk?.risk_assessment_result === "flagged" ? (
                        <Badge className="bg-destructive text-destructive-foreground text-xs">Risk</Badge>
                      ) : (
                        <Badge variant="outline" className="text-xs">—</Badge>
                      )}
                    </TableCell>
                    <TableCell className="text-right flex gap-1 justify-end">
                      {app && (
                        <Button variant="ghost" size="sm" title="View PreAppliCheck" onClick={() => setViewAppDetails(app)}>
                          <Eye className="h-4 w-4" />
                        </Button>
                      )}
                      {risk?.risk_assessment_url && (
                        <Button variant="ghost" size="sm" title="View Risk Assessment" onClick={async () => {
                          const url = risk.risk_assessment_url;
                          if (url.startsWith("http")) { setViewRiskUrl(url); return; }
                          const { data } = await supabase.storage.from("employee-documents").createSignedUrl(url, 3600);
                          if (data?.signedUrl) setViewRiskUrl(data.signedUrl);
                          else toast.error("Could not load document");
                        }}>
                          <FileText className="h-4 w-4" />
                        </Button>
                      )}
                    </TableCell>
                  </TableRow>
                );
              })}
              {candidates.length === 0 && (
                <TableRow><TableCell colSpan={4} className="text-center text-muted-foreground py-4">No candidates</TableCell></TableRow>
              )}
            </TableBody>
          </Table>
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
    </div>
  );
};

export default ExaminerPortal;
