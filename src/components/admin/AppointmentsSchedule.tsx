import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { CalendarDays, Clock, MapPin, Users, AlertCircle } from "lucide-react";
import { format, parseISO, isToday, isFuture, isPast, isThisWeek } from "date-fns";

interface AppointmentsScheduleProps {
  isMasterAdmin: boolean;
}

const AppointmentsSchedule = ({ isMasterAdmin }: AppointmentsScheduleProps) => {
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
      const { data } = await supabase.from("examiners").select("id, name");
      return data || [];
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
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default AppointmentsSchedule;
