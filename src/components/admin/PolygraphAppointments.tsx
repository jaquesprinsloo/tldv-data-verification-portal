import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { toast } from "sonner";
import { format } from "date-fns";
import { CalendarIcon, Clock, Eye, Check, UserPlus, MapPin, Users, Send, Download, Building2 } from "lucide-react";
import BookingConfirmationView, { type BookingData } from "@/components/shared/BookingConfirmationView";

const PolygraphAppointments = () => {
  const queryClient = useQueryClient();
  const [selectedAppointment, setSelectedAppointment] = useState<any>(null);
  const [scheduleOpen, setScheduleOpen] = useState(false);
  const [scheduleDate, setScheduleDate] = useState<Date | undefined>();
  const [scheduleTime, setScheduleTime] = useState("");
  const [selectedVenueId, setSelectedVenueId] = useState("");
  const [assignExaminerOpen, setAssignExaminerOpen] = useState(false);
  const [selectedExaminerId, setSelectedExaminerId] = useState("");
  const [selectedExaminerUserId, setSelectedExaminerUserId] = useState("");
  const [viewCandidatesOpen, setViewCandidatesOpen] = useState(false);
  const [viewBookingConfirmation, setViewBookingConfirmation] = useState<BookingData | null>(null);

  // Fetch all appointments
  const { data: appointments = [], isLoading } = useQuery({
    queryKey: ["polygraph-appointments-master"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("polygraph_appointments" as any)
        .select("*")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data || [];
    },
  });

  // Fetch clients
  const { data: clients = [] } = useQuery({
    queryKey: ["appointment-clients"],
    queryFn: async () => {
      const { data } = await supabase.from("candex_clients").select("id, name, company_name");
      return data || [];
    },
  });

  // Fetch examiners
  const { data: examiners = [] } = useQuery({
    queryKey: ["appointment-examiners"],
    queryFn: async () => {
      const { data } = await supabase.from("examiners").select("*").eq("is_active", true);
      return data || [];
    },
  });

  // Fetch TLDV venues
  const { data: venues = [] } = useQuery({
    queryKey: ["polygraph-venues"],
    queryFn: async () => {
      const { data } = await supabase
        .from("polygraph_venues" as any)
        .select("*")
        .eq("is_active", true)
        .order("venue_name");
      return data || [];
    },
  });

  // Fetch examiner user profiles (users with examiner role)
  const { data: examinerProfiles = [] } = useQuery({
    queryKey: ["examiner-user-profiles"],
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

  // Fetch candidates for selected appointment
  const { data: appointmentCandidates = [] } = useQuery({
    queryKey: ["appointment-candidates", selectedAppointment?.id],
    queryFn: async () => {
      if (!selectedAppointment?.id) return [];
      const { data } = await supabase
        .from("polygraph_appointment_candidates" as any)
        .select("*")
        .eq("appointment_id", selectedAppointment.id);
      return data || [];
    },
    enabled: !!selectedAppointment?.id,
  });

  // Schedule appointment
  const confirmSchedule = useMutation({
    mutationFn: async () => {
      if (!selectedAppointment || !scheduleDate || !scheduleTime) throw new Error("Select date and time");
      const bookingRef = `PG-${Date.now().toString(36).toUpperCase()}`;

      const isTldv = (selectedAppointment as any).venue_type === "tldv_venue";
      const selectedVenue = isTldv && selectedVenueId ? (venues as any[]).find((v: any) => v.id === selectedVenueId) : null;

      const updateData: any = {
        scheduled_date: format(scheduleDate, "yyyy-MM-dd"),
        scheduled_time: scheduleTime,
        status: "scheduled",
        confirmed_at: new Date().toISOString(),
        booking_reference: bookingRef,
      };

      if (selectedVenue) {
        updateData.venue_id = selectedVenue.id;
        updateData.venue_address = `${selectedVenue.venue_name}, ${selectedVenue.address}`;
      }

      const { error } = await supabase
        .from("polygraph_appointments" as any)
        .update(updateData)
        .eq("id", selectedAppointment.id);
      if (error) throw error;

      // Send confirmation email
      try {
        const client = clients.find((c) => c.id === (selectedAppointment as any).client_id);
        const clientEmail = (client as any)?.contact_email;
        const venueInfo = selectedVenue
          ? `${selectedVenue.venue_name}, ${selectedVenue.address}`
          : (selectedAppointment as any).venue_address || "To be confirmed";
        if (clientEmail) {
          await supabase.functions.invoke("send-request-notification", {
            body: {
              subject: `Polygraph Appointment Confirmed - ${bookingRef}`,
              message: `Your polygraph appointment has been confirmed.\n\nBooking Reference: ${bookingRef}\nDate: ${format(scheduleDate, "dd MMMM yyyy")}\nTime: ${scheduleTime}\nVenue: ${venueInfo}\n\nPlease ensure all candidates are available at the scheduled time.`,
            },
          });
        }
      } catch (e) {
        console.error("Failed to send confirmation email:", e);
      }
    },
    onSuccess: () => {
      toast.success("Appointment scheduled and confirmation sent");
      setScheduleOpen(false);
      setSelectedAppointment(null);
      setScheduleDate(undefined);
      setScheduleTime("");
      setSelectedVenueId("");
      queryClient.invalidateQueries({ queryKey: ["polygraph-appointments-master"] });
    },
    onError: (e: any) => toast.error(e.message),
  });

  // Assign examiner
  const assignExaminer = useMutation({
    mutationFn: async () => {
      if (!selectedAppointment || !selectedExaminerId) throw new Error("Select an examiner");
      const { error } = await supabase
        .from("polygraph_appointments" as any)
        .update({
          examiner_id: selectedExaminerId,
          assigned_examiner_user_id: selectedExaminerUserId || null,
          status: "assigned",
        } as any)
        .eq("id", selectedAppointment.id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Examiner assigned to appointment");
      setAssignExaminerOpen(false);
      setSelectedAppointment(null);
      setSelectedExaminerId("");
      setSelectedExaminerUserId("");
      queryClient.invalidateQueries({ queryKey: ["polygraph-appointments-master"] });
    },
    onError: (e: any) => toast.error(e.message),
  });

  const generateBookingConfirmation = (apt: any) => {
    const client = clients.find((c) => c.id === apt.client_id);
    const candidatesList = apt._candidates || [];
    const venueInfo = apt.venue_address || "To be confirmed";
    const content = `
BOOKING CONFIRMATION
====================

Booking Reference: ${apt.booking_reference || "N/A"}
Status: ${(apt.status || "").toUpperCase()}

CLIENT DETAILS
--------------
Client: ${client?.name || client?.company_name || "N/A"}

APPOINTMENT DETAILS
-------------------
Date: ${apt.scheduled_date ? format(new Date(apt.scheduled_date), "dd MMMM yyyy") : "To be confirmed"}
Time: ${apt.scheduled_time || "To be confirmed"}
Venue Type: ${getVenueLabel(apt.venue_type)}
Venue: ${venueInfo}
Preferred Area: ${apt.preferred_area || "Not specified"}

CANDIDATES
----------
${candidatesList.length > 0 ? candidatesList.map((c: any, i: number) => `${i + 1}. ${c.candidate_name} (ID: ${c.candidate_id_number || "N/A"})`).join("\n") : "No candidates listed"}

Notes: ${apt.notes || "None"}

---
Generated: ${format(new Date(), "dd MMMM yyyy HH:mm")}
True Lie Detectors & Vetting
    `.trim();

    const blob = new Blob([content], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `Booking_Confirmation_${apt.booking_reference || apt.id}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "requested": return <Badge variant="secondary" className="bg-amber-100 text-amber-700 text-xs">Requested</Badge>;
      case "scheduled": return <Badge variant="secondary" className="bg-blue-100 text-blue-700 text-xs">Scheduled</Badge>;
      case "assigned": return <Badge className="bg-green-600 text-white text-xs">Assigned</Badge>;
      case "completed": return <Badge className="bg-primary text-primary-foreground text-xs">Completed</Badge>;
      default: return <Badge variant="outline" className="text-xs">{status}</Badge>;
    }
  };

  const getVenueLabel = (type: string) => {
    switch (type) {
      case "own_location": return "Own Location";
      case "rented_venue": return "Rented Venue";
      case "tldv_venue": return "TLDV Venue";
      default: return type;
    }
  };

  const requested = (appointments as any[]).filter((a) => a.status === "requested");
  const scheduled = (appointments as any[]).filter((a) => a.status === "scheduled");
  const assigned = (appointments as any[]).filter((a) => a.status === "assigned");
  const completed = (appointments as any[]).filter((a) => a.status === "completed");

  // Enrich appointments with candidates for download
  const enrichWithCandidates = async (apt: any) => {
    const { data } = await supabase
      .from("polygraph_appointment_candidates" as any)
      .select("*")
      .eq("appointment_id", apt.id);
    return { ...apt, _candidates: data || [] };
  };

  const renderTable = (items: any[]) => (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Client</TableHead>
          <TableHead>Venue</TableHead>
          <TableHead>Area</TableHead>
          <TableHead>Date/Time</TableHead>
          <TableHead>Status</TableHead>
          <TableHead>Reference</TableHead>
          <TableHead className="text-right">Actions</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {items.map((apt) => {
          const client = clients.find((c) => c.id === apt.client_id);
          return (
            <TableRow key={apt.id}>
              <TableCell className="font-medium">{client?.name || client?.company_name || "—"}</TableCell>
              <TableCell>
                <div className="text-xs">
                  <Badge variant="outline" className="text-xs mb-1">{getVenueLabel(apt.venue_type)}</Badge>
                  <p className="text-muted-foreground truncate max-w-[200px]">{apt.venue_address || "—"}</p>
                </div>
              </TableCell>
              <TableCell className="text-xs">{apt.preferred_area || "—"}</TableCell>
              <TableCell className="text-xs">
                {apt.scheduled_date ? (
                  <div>
                    <p>{format(new Date(apt.scheduled_date), "dd MMM yyyy")}</p>
                    {apt.scheduled_time && <p className="text-muted-foreground">{apt.scheduled_time}</p>}
                  </div>
                ) : (
                  <span className="text-muted-foreground">Not scheduled</span>
                )}
              </TableCell>
              <TableCell>{getStatusBadge(apt.status)}</TableCell>
              <TableCell className="text-xs font-mono">{apt.booking_reference || "—"}</TableCell>
              <TableCell className="text-right">
                <div className="flex gap-1 justify-end">
                  <Button variant="ghost" size="sm" title="View Candidates" onClick={() => {
                    setSelectedAppointment(apt);
                    setViewCandidatesOpen(true);
                  }}>
                    <Users className="h-4 w-4" />
                  </Button>
                  {apt.booking_reference && (
                    <Button variant="ghost" size="sm" title="View Confirmation" onClick={async () => {
                      const enriched = await enrichWithCandidates(apt);
                      const client = clients.find((c) => c.id === apt.client_id);
                      const candidatesList = enriched._candidates || [];
                      setViewBookingConfirmation({
                        bookingReference: apt.booking_reference,
                        status: apt.status,
                        clientName: client?.name || client?.company_name || undefined,
                        scheduledDate: apt.scheduled_date ? format(new Date(apt.scheduled_date), "dd MMMM yyyy") : undefined,
                        scheduledTime: apt.scheduled_time || undefined,
                        venueType: apt.venue_type,
                        venueAddress: apt.venue_address || undefined,
                        preferredArea: apt.preferred_area || undefined,
                        candidates: candidatesList.map((c: any) => ({ name: c.candidate_name, idNumber: c.candidate_id_number })),
                        notes: apt.notes || undefined,
                      });
                    }}>
                      <Eye className="h-4 w-4" />
                    </Button>
                  )}
                  {apt.status === "requested" && (
                    <Button variant="ghost" size="sm" title="Schedule" onClick={() => {
                      setSelectedAppointment(apt);
                      setScheduleOpen(true);
                    }}>
                      <CalendarIcon className="h-4 w-4" />
                    </Button>
                  )}
                  {(apt.status === "scheduled") && (
                    <Button variant="ghost" size="sm" title="Assign Examiner" onClick={() => {
                      setSelectedAppointment(apt);
                      setAssignExaminerOpen(true);
                    }}>
                      <UserPlus className="h-4 w-4" />
                    </Button>
                  )}
                </div>
              </TableCell>
            </TableRow>
          );
        })}
      </TableBody>
    </Table>
  );

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Card><CardContent className="py-4 text-center"><p className="text-2xl font-bold text-amber-600">{requested.length}</p><p className="text-xs text-muted-foreground">Requested</p></CardContent></Card>
        <Card><CardContent className="py-4 text-center"><p className="text-2xl font-bold text-blue-600">{scheduled.length}</p><p className="text-xs text-muted-foreground">Scheduled</p></CardContent></Card>
        <Card><CardContent className="py-4 text-center"><p className="text-2xl font-bold text-green-600">{assigned.length}</p><p className="text-xs text-muted-foreground">Assigned</p></CardContent></Card>
        <Card><CardContent className="py-4 text-center"><p className="text-2xl font-bold text-primary">{completed.length}</p><p className="text-xs text-muted-foreground">Completed</p></CardContent></Card>
      </div>

      <Tabs defaultValue="requested" className="space-y-4">
        <TabsList>
          <TabsTrigger value="requested" className="relative">
            Requested
            {requested.length > 0 && (
              <Badge variant="destructive" className="absolute -top-2 -right-2 h-5 w-5 p-0 flex items-center justify-center text-[10px]">{requested.length}</Badge>
            )}
          </TabsTrigger>
          <TabsTrigger value="scheduled">Scheduled</TabsTrigger>
          <TabsTrigger value="assigned">Assigned</TabsTrigger>
          <TabsTrigger value="completed">Completed</TabsTrigger>
        </TabsList>

        <TabsContent value="requested">
          <Card><CardContent className="pt-6">
            {requested.length === 0 ? <p className="text-sm text-muted-foreground text-center py-8">No pending requests</p> : renderTable(requested)}
          </CardContent></Card>
        </TabsContent>
        <TabsContent value="scheduled">
          <Card><CardContent className="pt-6">
            {scheduled.length === 0 ? <p className="text-sm text-muted-foreground text-center py-8">No scheduled appointments</p> : renderTable(scheduled)}
          </CardContent></Card>
        </TabsContent>
        <TabsContent value="assigned">
          <Card><CardContent className="pt-6">
            {assigned.length === 0 ? <p className="text-sm text-muted-foreground text-center py-8">No assigned appointments</p> : renderTable(assigned)}
          </CardContent></Card>
        </TabsContent>
        <TabsContent value="completed">
          <Card><CardContent className="pt-6">
            {completed.length === 0 ? <p className="text-sm text-muted-foreground text-center py-8">No completed appointments</p> : renderTable(completed)}
          </CardContent></Card>
        </TabsContent>
      </Tabs>

      {/* Schedule Dialog */}
      <Dialog open={scheduleOpen} onOpenChange={setScheduleOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Schedule Appointment</DialogTitle>
            <DialogDescription>Set the date, time, and venue for this polygraph examination.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            {selectedAppointment && (
              <div className="bg-muted/50 rounded-md p-3 text-sm space-y-1">
                <p><strong>Venue Type:</strong> {getVenueLabel((selectedAppointment as any).venue_type)}</p>
                {(selectedAppointment as any).preferred_area && (
                  <p><strong>Preferred Area:</strong> {(selectedAppointment as any).preferred_area}</p>
                )}
                <p className="text-muted-foreground">{(selectedAppointment as any).venue_address}</p>
              </div>
            )}

            {/* TLDV Venue Selection */}
            {selectedAppointment && (selectedAppointment as any).venue_type === "tldv_venue" && (
              <div>
                <Label className="flex items-center gap-1"><Building2 className="h-4 w-4" /> Select TLDV Venue *</Label>
                <Select value={selectedVenueId} onValueChange={setSelectedVenueId}>
                  <SelectTrigger className="mt-1"><SelectValue placeholder="Select a vetted venue" /></SelectTrigger>
                  <SelectContent>
                    {(venues as any[]).map((v: any) => (
                      <SelectItem key={v.id} value={v.id}>
                        <div>
                          <span className="font-medium">{v.venue_name}</span>
                          <span className="text-muted-foreground text-xs ml-2">{v.city}{v.province ? `, ${v.province}` : ""}</span>
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {selectedVenueId && (() => {
                  const v = (venues as any[]).find((v: any) => v.id === selectedVenueId);
                  return v ? (
                    <div className="mt-2 bg-muted/30 border rounded p-2 text-xs space-y-0.5">
                      <p><strong>{v.venue_name}</strong></p>
                      <p>{v.address}</p>
                      {v.gps_latitude && v.gps_longitude && (
                        <p className="text-muted-foreground">GPS: {v.gps_latitude}, {v.gps_longitude}</p>
                      )}
                    </div>
                  ) : null;
                })()}
              </div>
            )}

            <div>
              <Label>Date *</Label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline" className="w-full justify-start text-left font-normal mt-1">
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    {scheduleDate ? format(scheduleDate, "dd MMM yyyy") : "Select date"}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0"><Calendar mode="single" selected={scheduleDate} onSelect={setScheduleDate} /></PopoverContent>
              </Popover>
            </div>
            <div>
              <Label>Time *</Label>
              <Input type="time" value={scheduleTime} onChange={(e) => setScheduleTime(e.target.value)} className="mt-1" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setScheduleOpen(false)}>Cancel</Button>
            <Button onClick={() => confirmSchedule.mutate()} disabled={confirmSchedule.isPending || !scheduleDate || !scheduleTime}>
              <Check className="h-4 w-4 mr-1" /> Confirm Schedule
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Assign Examiner Dialog */}
      <Dialog open={assignExaminerOpen} onOpenChange={setAssignExaminerOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Assign Examiner</DialogTitle>
            <DialogDescription>Select an examiner and optionally link to an examiner user profile.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Examiner *</Label>
              <Select value={selectedExaminerId} onValueChange={setSelectedExaminerId}>
                <SelectTrigger className="mt-1"><SelectValue placeholder="Select examiner" /></SelectTrigger>
                <SelectContent>
                  {examiners.map((ex: any) => (
                    <SelectItem key={ex.id} value={ex.id}>{ex.name}{ex.email ? ` (${ex.email})` : ""}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Examiner User Profile (for portal access)</Label>
              <Select value={selectedExaminerUserId} onValueChange={setSelectedExaminerUserId}>
                <SelectTrigger className="mt-1"><SelectValue placeholder="Select user profile (optional)" /></SelectTrigger>
                <SelectContent>
                  {examinerProfiles.map((ep: any) => (
                    <SelectItem key={ep.id} value={ep.id}>{ep.full_name || ep.email}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAssignExaminerOpen(false)}>Cancel</Button>
            <Button onClick={() => assignExaminer.mutate()} disabled={assignExaminer.isPending || !selectedExaminerId}>
              <UserPlus className="h-4 w-4 mr-1" /> Assign
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* View Candidates Dialog */}
      <Dialog open={viewCandidatesOpen} onOpenChange={setViewCandidatesOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Appointment Candidates</DialogTitle>
            <DialogDescription>
              {selectedAppointment?.booking_reference && `Reference: ${(selectedAppointment as any).booking_reference}`}
            </DialogDescription>
          </DialogHeader>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>ID Number</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {(appointmentCandidates as any[]).map((c: any) => (
                <TableRow key={c.id}>
                  <TableCell className="font-medium">{c.candidate_name}</TableCell>
                  <TableCell className="text-xs">{c.candidate_id_number || "—"}</TableCell>
                </TableRow>
              ))}
              {appointmentCandidates.length === 0 && (
                <TableRow><TableCell colSpan={2} className="text-center text-muted-foreground py-4">No candidates</TableCell></TableRow>
              )}
            </TableBody>
          </Table>
        </DialogContent>
      </Dialog>

      {/* Booking Confirmation View */}
      <BookingConfirmationView
        open={!!viewBookingConfirmation}
        onClose={() => setViewBookingConfirmation(null)}
        data={viewBookingConfirmation}
      />
    </div>
  );
};

export default PolygraphAppointments;
