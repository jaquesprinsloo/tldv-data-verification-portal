import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { CalendarDays, Clock, MapPin, Users, AlertCircle, Pencil } from "lucide-react";
import { format, parseISO, isToday, isFuture, isPast, isThisWeek } from "date-fns";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";

interface AppointmentsScheduleProps {
  isMasterAdmin: boolean;
}

const AppointmentsSchedule = ({ isMasterAdmin }: AppointmentsScheduleProps) => {
  const queryClient = useQueryClient();
  const [editing, setEditing] = useState<any | null>(null);
  const [form, setForm] = useState<any>({});

  const { data: appointments = [], isLoading } = useQuery({
    queryKey: ["appointments-schedule-overview"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("polygraph_appointments" as any)
        .select("*")
        .order("scheduled_date", { ascending: true });
      if (error) throw error;
      return data || [];
    },
  });

  const { data: clients = [] } = useQuery({
    queryKey: ["schedule-clients"],
    queryFn: async () => {
      const { data } = await supabase.from("candex_clients").select("id, name, company_name");
      return data || [];
    },
  });

  const { data: examiners = [] } = useQuery({
    queryKey: ["schedule-examiners"],
    queryFn: async () => {
      const { data } = await supabase
        .from("examiners")
        .select("id, name, email, is_active")
        .eq("is_active", true)
        .order("name");
      if (!data?.length) return [];
      const { data: roles } = await supabase
        .from("user_roles")
        .select("user_id")
        .eq("role", "examiner");
      if (!roles?.length) return [];
      const userIds = roles.map((r: any) => r.user_id);
      const { data: profiles } = await supabase
        .from("profiles")
        .select("email")
        .in("id", userIds);
      const allowed = new Set(
        (profiles || [])
          .map((p: any) => (p.email || "").toLowerCase())
          .filter(Boolean)
      );
      return (data as any[]).filter((e: any) => allowed.has((e.email || "").toLowerCase()));
    },
  });

  // Users with examiner role — used to link an appointment to the portal user
  const { data: examinerProfiles = [] } = useQuery({
    queryKey: ["schedule-examiner-profiles"],
    queryFn: async () => {
      const { data: roles } = await supabase
        .from("user_roles")
        .select("user_id")
        .eq("role", "examiner");
      if (!roles?.length) return [];
      const userIds = roles.map((r) => r.user_id);
      const { data: profiles } = await supabase
        .from("profiles")
        .select("id, email, full_name")
        .in("id", userIds);
      return profiles || [];
    },
  });

  const { data: venues = [] } = useQuery({
    queryKey: ["schedule-venues"],
    queryFn: async () => {
      const { data } = await supabase.from("polygraph_venues" as any).select("*");
      return data || [];
    },
  });

  // Fetch candidate counts per appointment
  const { data: candidateCounts = {} } = useQuery({
    queryKey: ["schedule-candidate-counts"],
    queryFn: async () => {
      const { data } = await supabase
        .from("polygraph_appointment_candidates" as any)
        .select("appointment_id");
      if (!data) return {};
      const counts: Record<string, number> = {};
      (data as any[]).forEach((c: any) => {
        counts[c.appointment_id] = (counts[c.appointment_id] || 0) + 1;
      });
      return counts;
    },
  });

  const openEdit = (apt: any) => {
    setEditing(apt);
    setForm({
      scheduled_date: apt.scheduled_date || "",
      scheduled_time: apt.scheduled_time ? String(apt.scheduled_time).slice(0, 5) : "",
      venue_id: apt.venue_id || "",
      venue_address: apt.venue_address || "",
      venue_type: apt.venue_type || "own_location",
      examiner_id: apt.examiner_id || "",
      status: apt.status || "requested",
      notes: apt.notes || "",
      booking_reference: apt.booking_reference || "",
      preferred_area: apt.preferred_area || "",
    });
  };

  const saveEdit = useMutation({
    mutationFn: async () => {
      if (!editing) return;
      // Auto-resolve assigned_examiner_user_id from the examiner's email
      let assignedUserId: string | null = null;
      if (form.examiner_id) {
        const ex: any = (examiners as any[]).find((e: any) => e.id === form.examiner_id);
        if (ex?.email) {
          const match: any = (examinerProfiles as any[]).find(
            (p: any) => (p.email || "").toLowerCase() === ex.email.toLowerCase()
          );
          assignedUserId = match?.id || null;
        }
      }
      const payload: any = {
        scheduled_date: form.scheduled_date || null,
        scheduled_time: form.scheduled_time || null,
        venue_id: form.venue_id || null,
        venue_address: form.venue_address?.trim() || null,
        venue_type: form.venue_type || null,
        examiner_id: form.examiner_id || null,
        assigned_examiner_user_id: assignedUserId,
        status: form.status,
        notes: form.notes?.trim() || null,
        booking_reference: form.booking_reference?.trim() || null,
        preferred_area: form.preferred_area?.trim() || null,
        updated_at: new Date().toISOString(),
      };
      const { error } = await supabase
        .from("polygraph_appointments" as any)
        .update(payload)
        .eq("id", editing.id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Appointment updated");
      queryClient.invalidateQueries({ queryKey: ["appointments-schedule-overview"] });
      queryClient.invalidateQueries({ queryKey: ["polygraph-appointments"] });
      setEditing(null);
    },
    onError: (e: any) => toast.error(e.message || "Failed to update"),
  });

  const getClientName = (clientId: string) => {
    const client = clients.find((c) => c.id === clientId);
    return (client as any)?.company_name || (client as any)?.name || "Unknown";
  };

  const getExaminerName = (examinerId: string | null) => {
    if (!examinerId) return "Unassigned";
    const examiner = examiners.find((e: any) => e.id === examinerId);
    return (examiner as any)?.name || "Unknown";
  };

  const getVenueName = (apt: any) => {
    if (apt.venue_id) {
      const venue = (venues as any[]).find((v: any) => v.id === apt.venue_id);
      return venue?.venue_name || apt.venue_address || "TBC";
    }
    return apt.venue_address || "TBC";
  };

  const getStatusBadge = (status: string) => {
    const variants: Record<string, { variant: "default" | "secondary" | "outline" | "destructive"; label: string }> = {
      requested: { variant: "secondary", label: "Requested" },
      scheduled: { variant: "default", label: "Scheduled" },
      assigned: { variant: "outline", label: "Assigned" },
      confirmed: { variant: "default", label: "Confirmed" },
      completed: { variant: "secondary", label: "Completed" },
      cancelled: { variant: "destructive", label: "Cancelled" },
    };
    const cfg = variants[status] || { variant: "outline" as const, label: status };
    return <Badge variant={cfg.variant}>{cfg.label}</Badge>;
  };

  const getDateIndicator = (dateStr: string | null) => {
    if (!dateStr) return null;
    const date = parseISO(dateStr);
    if (isToday(date)) return <Badge className="bg-green-600 text-white text-[10px] ml-1">Today</Badge>;
    if (isThisWeek(date) && isFuture(date)) return <Badge variant="outline" className="text-[10px] ml-1">This week</Badge>;
    return null;
  };

  // Stats
  const requested = appointments.filter((a: any) => a.status === "requested").length;
  const scheduled = appointments.filter((a: any) => a.status === "scheduled" || a.status === "assigned").length;
  const upcoming = appointments.filter((a: any) => a.scheduled_date && isFuture(parseISO(a.scheduled_date))).length;
  const completed = appointments.filter((a: any) => a.status === "completed").length;

  if (isLoading) {
    return (
      <div className="flex justify-center py-12">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Stats Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="pt-4 pb-3">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-amber-500/10">
                <AlertCircle className="h-5 w-5 text-amber-500" />
              </div>
              <div>
                <p className="text-2xl font-bold">{requested}</p>
                <p className="text-xs text-muted-foreground">Pending Requests</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-3">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-blue-500/10">
                <CalendarDays className="h-5 w-5 text-blue-500" />
              </div>
              <div>
                <p className="text-2xl font-bold">{scheduled}</p>
                <p className="text-xs text-muted-foreground">Scheduled</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-3">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-green-500/10">
                <Clock className="h-5 w-5 text-green-500" />
              </div>
              <div>
                <p className="text-2xl font-bold">{upcoming}</p>
                <p className="text-xs text-muted-foreground">Upcoming</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-3">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-muted">
                <Users className="h-5 w-5 text-muted-foreground" />
              </div>
              <div>
                <p className="text-2xl font-bold">{completed}</p>
                <p className="text-xs text-muted-foreground">Completed</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Appointments Table */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <CalendarDays className="h-5 w-5" />
            Appointment Schedule
          </CardTitle>
          <CardDescription>Overview of all polygraph appointments and their details</CardDescription>
        </CardHeader>
        <CardContent>
          {appointments.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <CalendarDays className="h-12 w-12 mx-auto mb-4 opacity-50" />
              <p className="font-medium">No appointments yet</p>
              <p className="text-sm">Appointments will appear here once clients request them</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Reference</TableHead>
                    <TableHead>Client</TableHead>
                    <TableHead>Date & Time</TableHead>
                    <TableHead>Venue</TableHead>
                    <TableHead>Candidates</TableHead>
                    <TableHead>Examiner</TableHead>
                    <TableHead>Status</TableHead>
                    {isMasterAdmin && <TableHead className="text-right">Actions</TableHead>}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {appointments.map((apt: any) => (
                    <TableRow key={apt.id}>
                      <TableCell className="font-mono text-xs">
                        {apt.booking_reference || "—"}
                      </TableCell>
                      <TableCell className="font-medium">
                        {getClientName(apt.client_id)}
                      </TableCell>
                      <TableCell>
                        {apt.scheduled_date ? (
                          <div className="flex flex-col">
                            <span className="flex items-center gap-1">
                              {format(parseISO(apt.scheduled_date), "dd MMM yyyy")}
                              {getDateIndicator(apt.scheduled_date)}
                            </span>
                            {apt.scheduled_time && (
                              <span className="text-xs text-muted-foreground flex items-center gap-1">
                                <Clock className="h-3 w-3" />
                                {apt.scheduled_time}
                              </span>
                            )}
                          </div>
                        ) : (
                          <span className="text-muted-foreground text-sm">Not scheduled</span>
                        )}
                      </TableCell>
                      <TableCell>
                        <div className="flex items-start gap-1 max-w-[200px]">
                          <MapPin className="h-3 w-3 mt-0.5 shrink-0 text-muted-foreground" />
                          <span className="text-sm truncate">{getVenueName(apt)}</span>
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-1">
                          <Users className="h-3 w-3 text-muted-foreground" />
                          <span>{(candidateCounts as any)[apt.id] || 0}</span>
                        </div>
                      </TableCell>
                      <TableCell className="text-sm">
                        {getExaminerName(apt.examiner_id)}
                      </TableCell>
                      <TableCell>
                        {getStatusBadge(apt.status)}
                      </TableCell>
                      {isMasterAdmin && (
                        <TableCell className="text-right">
                          <Button variant="ghost" size="sm" onClick={() => openEdit(apt)}>
                            <Pencil className="h-4 w-4 mr-1" /> Edit
                          </Button>
                        </TableCell>
                      )}
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={!!editing} onOpenChange={(o) => !o && setEditing(null)}>
        <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Edit Appointment</DialogTitle>
            <DialogDescription>Update scheduling, venue, examiner, and status.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label>Date</Label>
                <Input type="date" value={form.scheduled_date || ""} onChange={(e) => setForm({ ...form, scheduled_date: e.target.value })} />
              </div>
              <div className="space-y-1">
                <Label>Time</Label>
                <Input type="time" value={form.scheduled_time || ""} onChange={(e) => setForm({ ...form, scheduled_time: e.target.value })} />
              </div>
            </div>

            <div className="space-y-1">
              <Label>Pre-Approved Venue</Label>
              <Select value={form.venue_id || "none"} onValueChange={(v) => setForm({ ...form, venue_id: v === "none" ? "" : v })}>
                <SelectTrigger><SelectValue placeholder="Select venue" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">— None (use address below) —</SelectItem>
                  {(venues as any[]).map((v: any) => (
                    <SelectItem key={v.id} value={v.id}>{v.venue_name} — {v.city}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1">
              <Label>Venue Address / Notes</Label>
              <Textarea rows={2} value={form.venue_address || ""} onChange={(e) => setForm({ ...form, venue_address: e.target.value })} />
            </div>

            <div className="space-y-1">
              <Label>Preferred Area</Label>
              <Input value={form.preferred_area || ""} onChange={(e) => setForm({ ...form, preferred_area: e.target.value })} />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label>Examiner</Label>
                <Select value={form.examiner_id || "none"} onValueChange={(v) => setForm({ ...form, examiner_id: v === "none" ? "" : v })}>
                  <SelectTrigger><SelectValue placeholder="Unassigned" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">— Unassigned —</SelectItem>
                    {(examiners as any[]).map((e: any) => (
                      <SelectItem key={e.id} value={e.id}>{e.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-[10px] text-muted-foreground">
                  Only active pre-loaded examiners are listed. The appointment will flow to their Examiner Portal.
                </p>
              </div>
              <div className="space-y-1">
                <Label>Status</Label>
                <Select value={form.status} onValueChange={(v) => setForm({ ...form, status: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {["requested","scheduled","assigned","confirmed","completed","cancelled"].map((s) => (
                      <SelectItem key={s} value={s}>{s}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-1">
              <Label>Booking Reference</Label>
              <Input value={form.booking_reference || ""} onChange={(e) => setForm({ ...form, booking_reference: e.target.value })} />
            </div>

            <div className="space-y-1">
              <Label>Notes</Label>
              <Textarea rows={3} value={form.notes || ""} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditing(null)}>Cancel</Button>
            <Button onClick={() => saveEdit.mutate()} disabled={saveEdit.isPending}>
              {saveEdit.isPending ? "Saving..." : "Save Changes"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default AppointmentsSchedule;
