import { useMemo, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { toast } from "sonner";
import { jsPDF } from "jspdf";
import html2canvas from "html2canvas";
import {
  CalendarPlus,
  Download,
  Eye,
  FileText,
  Loader2,
  Mail,
  Send,
  Trash2,
} from "lucide-react";
import { format, parseISO } from "date-fns";
import BookingConfirmationDocument from "./BookingConfirmationDocument";
import { useBookingLists } from "./BookingListsManager";
import {
  BookingConfirmationRecord,
  SERVICE_OPTIONS,
  bookingFileName,
  buildBookingEmailHtml,
  buildBookingIcs,
  formatTimeLabel,
  generateBookingReference,
} from "@/lib/bookingConfirmation";

const ALWAYS_CC = "admin@tldv.co.za";

const emptyForm = (): BookingConfirmationRecord => ({
  booking_reference: "",
  attention_name: "",
  attention_email: "",
  company_name: "",
  scheduled_date: "",
  scheduled_time: "09:00",
  examiners: [],
  examiner_emails: [],
  service_required: SERVICE_OPTIONS[0],
  polygraph_types: [],
  vetting_types: [],
  candidate_quantity: 1,
  venue_id: null,
  location_label: "",
  special_notes: "",
});

const BookingConfirmationsTab = ({ isMasterAdmin }: { isMasterAdmin: boolean }) => {
  const queryClient = useQueryClient();
  const [form, setForm] = useState<BookingConfirmationRecord>(emptyForm());
  const [editorOpen, setEditorOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [previewing, setPreviewing] = useState<BookingConfirmationRecord | null>(null);
  const [extraRecipients, setExtraRecipients] = useState("");
  const [sending, setSending] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const docRef = useRef<HTMLDivElement>(null);

  const { data: options = [] } = useBookingLists();
  const optionsOf = (type: string) => options.filter((o) => o.list_type === type);

  const { data: venues = [] } = useQuery({
    queryKey: ["booking-venues"],
    queryFn: async () => {
      const { data } = await supabase
        .from("polygraph_venues" as any)
        .select("id, venue_name, address, city")
        .eq("is_active", true)
        .order("venue_name");
      return (data || []) as any[];
    },
  });

  const { data: confirmations = [], isLoading } = useQuery({
    queryKey: ["booking-confirmations"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("booking_confirmations" as any)
        .select("*")
        .order("scheduled_date", { ascending: false });
      if (error) throw error;
      return (data || []) as any[];
    },
  });

  const venueLabel = (rec: BookingConfirmationRecord) => {
    const v = venues.find((x: any) => x.id === rec.venue_id);
    if (v) return `${v.venue_name}${v.address ? ` — ${v.address}` : ""}`;
    return rec.location_label || "";
  };

  const toggleIn = (key: "examiners" | "polygraph_types" | "vetting_types", label: string) => {
    setForm((f) => {
      const current = f[key] || [];
      const next = current.includes(label)
        ? current.filter((x) => x !== label)
        : [...current, label];
      if (key === "examiners") {
        const emails = next
          .map((n) => optionsOf("examiner").find((o) => o.label === n)?.email)
          .filter(Boolean) as string[];
        return { ...f, examiners: next, examiner_emails: emails };
      }
      return { ...f, [key]: next };
    });
  };

  const openNew = () => {
    setForm(emptyForm());
    setEditingId(null);
    setEditorOpen(true);
  };

  const openEdit = (rec: any) => {
    setForm({
      booking_reference: rec.booking_reference,
      attention_name: rec.attention_name,
      attention_email: rec.attention_email || "",
      company_name: rec.company_name,
      scheduled_date: rec.scheduled_date,
      scheduled_time: String(rec.scheduled_time || "09:00").slice(0, 5),
      examiners: rec.examiners || [],
      examiner_emails: rec.examiner_emails || [],
      service_required: rec.service_required,
      polygraph_types: rec.polygraph_types || [],
      vetting_types: rec.vetting_types || [],
      candidate_quantity: rec.candidate_quantity || 1,
      venue_id: rec.venue_id,
      location_label: rec.location_label || "",
      special_notes: rec.special_notes || "",
      status: rec.status,
    });
    setEditingId(rec.id);
    setEditorOpen(true);
  };

  const save = useMutation({
    mutationFn: async () => {
      if (!form.attention_name.trim()) throw new Error("Please choose whose attention this is for");
      if (!form.company_name.trim()) throw new Error("Please choose the company");
      if (!form.scheduled_date) throw new Error("Please choose the appointment date");
      if (!form.scheduled_time) throw new Error("Please choose the appointment time");
      if (!form.examiners.length) throw new Error("Please choose at least one examiner");
      if (!form.venue_id && !form.location_label?.trim())
        throw new Error("Please choose the location");

      const payload: any = {
        attention_name: form.attention_name.trim(),
        attention_email: form.attention_email?.trim() || null,
        company_name: form.company_name.trim(),
        scheduled_date: form.scheduled_date,
        scheduled_time: form.scheduled_time,
        examiners: form.examiners,
        examiner_emails: form.examiner_emails,
        service_required: form.service_required,
        polygraph_types: form.polygraph_types,
        vetting_types: form.vetting_types,
        candidate_quantity: form.candidate_quantity,
        venue_id: form.venue_id || null,
        location_label: form.location_label?.trim() || null,
        special_notes: form.special_notes?.trim() || null,
      };

      if (editingId) {
        const { error } = await supabase
          .from("booking_confirmations" as any)
          .update(payload)
          .eq("id", editingId);
        if (error) throw error;
        return editingId;
      }

      const { data: userData } = await supabase.auth.getUser();
      payload.booking_reference =
        form.booking_reference.trim() ||
        generateBookingReference(form.company_name, form.scheduled_date);
      payload.created_by = userData?.user?.id || null;
      payload.status = "draft";
      const { data, error } = await supabase
        .from("booking_confirmations" as any)
        .insert(payload)
        .select("id")
        .single();
      if (error) throw error;
      return (data as any).id as string;
    },
    onSuccess: () => {
      toast.success(editingId ? "Booking confirmation updated" : "Booking confirmation created");
      queryClient.invalidateQueries({ queryKey: ["booking-confirmations"] });
      queryClient.invalidateQueries({ queryKey: ["appointments-calendar"] });
      setEditorOpen(false);
    },
    onError: (e: any) => toast.error(e.message),
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("booking_confirmations" as any).delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Booking confirmation deleted");
      queryClient.invalidateQueries({ queryKey: ["booking-confirmations"] });
      queryClient.invalidateQueries({ queryKey: ["appointments-calendar"] });
    },
    onError: (e: any) => toast.error(e.message),
  });

  const buildPdf = async () => {
    if (!docRef.current || !previewing) return null;
    const canvas = await html2canvas(docRef.current, {
      scale: 2,
      useCORS: true,
      backgroundColor: "#ffffff",
    });
    const pdf = new jsPDF("p", "mm", "a4");
    const imgWidth = 190;
    const imgHeight = (canvas.height * imgWidth) / canvas.width;
    pdf.addImage(canvas.toDataURL("image/jpeg", 0.92), "JPEG", 10, 10, imgWidth, imgHeight);
    return pdf;
  };

  const handleDownload = async () => {
    if (!previewing) return;
    setDownloading(true);
    try {
      const pdf = await buildPdf();
      pdf?.save(bookingFileName(previewing));
    } catch (e: any) {
      toast.error("Could not create the document");
    } finally {
      setDownloading(false);
    }
  };

  const recipientsFor = (rec: BookingConfirmationRecord) => {
    const extra = extraRecipients
      .split(/[,;\s]+/)
      .map((s) => s.trim())
      .filter((s) => s.includes("@"));
    const all = [rec.attention_email || "", ...(rec.examiner_emails || []), ...extra].filter(
      (e) => e && e.includes("@"),
    );
    return Array.from(new Set(all.map((e) => e.toLowerCase())));
  };

  const handleSend = async () => {
    if (!previewing) return;
    const to = recipientsFor(previewing);
    if (!to.length) {
      toast.error("No email addresses — add one on the lists tab or type one below");
      return;
    }
    setSending(true);
    try {
      const pdf = await buildPdf();
      const pdfBase64 = pdf ? (pdf.output("datauristring").split(",")[1] as string) : undefined;
      const label = venueLabel(previewing);
      const { data, error } = await supabase.functions.invoke("send-booking-confirmation", {
        body: {
          to,
          cc: [ALWAYS_CC],
          subject: `Booking Confirmation — ${previewing.company_name} — ${format(
            parseISO(previewing.scheduled_date),
            "dd MMMM yyyy",
          )} at ${formatTimeLabel(previewing.scheduled_time)}`,
          html: buildBookingEmailHtml(previewing, label),
          ics: buildBookingIcs(previewing, label, to),
          pdfBase64,
          filename: bookingFileName(previewing),
          bookingReference: previewing.booking_reference,
        },
      });
      if (error) throw error;
      if ((data as any)?.error) throw new Error((data as any).error);

      if (previewing.id) {
        await supabase
          .from("booking_confirmations" as any)
          .update({ status: "sent", sent_at: new Date().toISOString(), sent_to: to })
          .eq("id", previewing.id);
      }
      toast.success("Booking confirmation and calendar invite sent");
      queryClient.invalidateQueries({ queryKey: ["booking-confirmations"] });
      queryClient.invalidateQueries({ queryKey: ["appointments-calendar"] });
      setPreviewing(null);
      setExtraRecipients("");
    } catch (e: any) {
      toast.error(e.message || "Could not send the booking confirmation");
    } finally {
      setSending(false);
    }
  };

  const sentCount = useMemo(
    () => confirmations.filter((c: any) => c.status === "sent").length,
    [confirmations],
  );

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="font-semibold flex items-center gap-2">
            <FileText className="h-5 w-5 text-primary" /> Booking Confirmations
          </h2>
          <p className="text-sm text-muted-foreground">
            {confirmations.length} in total · {sentCount} sent. Sent confirmations appear on the schedule calendar.
          </p>
        </div>
        <Button onClick={openNew}>
          <CalendarPlus className="h-4 w-4 mr-1" /> New Booking Confirmation
        </Button>
      </div>

      <Card>
        <CardContent className="pt-6">
          {isLoading ? (
            <div className="flex justify-center py-10">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
            </div>
          ) : confirmations.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <FileText className="h-12 w-12 mx-auto mb-3 opacity-50" />
              <p className="font-medium">No booking confirmations yet</p>
              <p className="text-sm">Create one and it will show on the calendar once sent.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Reference</TableHead>
                    <TableHead>Company</TableHead>
                    <TableHead>Attention</TableHead>
                    <TableHead>Date &amp; Time</TableHead>
                    <TableHead>Examiner(s)</TableHead>
                    <TableHead>Service</TableHead>
                    <TableHead>Qty</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {confirmations.map((c: any) => (
                    <TableRow key={c.id}>
                      <TableCell className="font-mono text-xs">{c.booking_reference}</TableCell>
                      <TableCell className="font-medium">{c.company_name}</TableCell>
                      <TableCell>{c.attention_name}</TableCell>
                      <TableCell className="whitespace-nowrap">
                        {format(parseISO(c.scheduled_date), "dd MMM yyyy")}
                        <span className="text-xs text-muted-foreground ml-1">
                          {formatTimeLabel(c.scheduled_time)}
                        </span>
                      </TableCell>
                      <TableCell className="text-sm">{(c.examiners || []).join(", ")}</TableCell>
                      <TableCell className="text-sm">{c.service_required}</TableCell>
                      <TableCell>{c.candidate_quantity}</TableCell>
                      <TableCell>
                        {c.status === "sent" ? (
                          <Badge className="bg-green-600 text-white">Sent</Badge>
                        ) : (
                          <Badge variant="secondary">Draft</Badge>
                        )}
                      </TableCell>
                      <TableCell className="text-right whitespace-nowrap">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => {
                            setPreviewing({
                              ...c,
                              scheduled_time: String(c.scheduled_time || "09:00").slice(0, 5),
                            });
                            setExtraRecipients("");
                          }}
                        >
                          <Eye className="h-4 w-4" />
                        </Button>
                        <Button variant="ghost" size="sm" onClick={() => openEdit(c)}>
                          Edit
                        </Button>
                        {isMasterAdmin && (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => remove.mutate(c.id)}
                            className="text-destructive"
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Editor */}
      <Dialog open={editorOpen} onOpenChange={setEditorOpen}>
        <DialogContent className="max-w-2xl max-h-[88vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingId ? "Edit" : "New"} Booking Confirmation</DialogTitle>
            <DialogDescription>
              All the choices below come from your saved lists on the Booking Lists tab.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="grid sm:grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label>Attention (who booked)</Label>
                <Select
                  value={form.attention_name}
                  onValueChange={(v) => {
                    const opt = optionsOf("attention_contact").find((o) => o.label === v);
                    setForm({ ...form, attention_name: v, attention_email: opt?.email || "" });
                  }}
                >
                  <SelectTrigger><SelectValue placeholder="Select a person" /></SelectTrigger>
                  <SelectContent>
                    {optionsOf("attention_contact").map((o) => (
                      <SelectItem key={o.id} value={o.label}>{o.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Input
                  className="mt-1"
                  placeholder="Email for this person"
                  value={form.attention_email || ""}
                  onChange={(e) => setForm({ ...form, attention_email: e.target.value })}
                />
              </div>
              <div className="space-y-1">
                <Label>Company</Label>
                <Select
                  value={form.company_name}
                  onValueChange={(v) => setForm({ ...form, company_name: v })}
                >
                  <SelectTrigger><SelectValue placeholder="Select a company" /></SelectTrigger>
                  <SelectContent>
                    {optionsOf("company").map((o) => (
                      <SelectItem key={o.id} value={o.label}>{o.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="grid sm:grid-cols-3 gap-3">
              <div className="space-y-1">
                <Label>Appointment date</Label>
                <Input
                  type="date"
                  value={form.scheduled_date}
                  onChange={(e) => setForm({ ...form, scheduled_date: e.target.value })}
                />
              </div>
              <div className="space-y-1">
                <Label>Start time</Label>
                <Input
                  type="time"
                  value={form.scheduled_time}
                  onChange={(e) => setForm({ ...form, scheduled_time: e.target.value })}
                />
              </div>
              <div className="space-y-1">
                <Label>Candidate quantity</Label>
                <Select
                  value={String(form.candidate_quantity)}
                  onValueChange={(v) => setForm({ ...form, candidate_quantity: Number(v) })}
                >
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {Array.from({ length: 30 }, (_, i) => i + 1).map((n) => (
                      <SelectItem key={n} value={String(n)}>{n}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-2">
              <Label>Examiner(s) — choose one or more</Label>
              <div className="border rounded-md p-2 flex flex-wrap gap-x-4 gap-y-2">
                {optionsOf("examiner").length === 0 && (
                  <p className="text-sm text-muted-foreground">Add examiners on the Booking Lists tab.</p>
                )}
                {optionsOf("examiner").map((o) => (
                  <label key={o.id} className="flex items-center gap-2 text-sm cursor-pointer">
                    <Checkbox
                      checked={form.examiners.includes(o.label)}
                      onCheckedChange={() => toggleIn("examiners", o.label)}
                    />
                    {o.label}
                  </label>
                ))}
              </div>
            </div>

            <div className="space-y-1">
              <Label>Service required</Label>
              <Select
                value={form.service_required}
                onValueChange={(v) => setForm({ ...form, service_required: v })}
              >
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {SERVICE_OPTIONS.map((s) => (
                    <SelectItem key={s} value={s}>{s}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {form.service_required !== "Vetting" && (
              <div className="space-y-2">
                <Label>Polygraph examination type</Label>
                <div className="border rounded-md p-2 flex flex-wrap gap-x-4 gap-y-2">
                  {optionsOf("polygraph_type").map((o) => (
                    <label key={o.id} className="flex items-center gap-2 text-sm cursor-pointer">
                      <Checkbox
                        checked={form.polygraph_types.includes(o.label)}
                        onCheckedChange={() => toggleIn("polygraph_types", o.label)}
                      />
                      {o.label}
                    </label>
                  ))}
                </div>
              </div>
            )}

            {form.service_required !== "Polygraph Examinations" && (
              <div className="space-y-2">
                <Label>Vetting type</Label>
                <div className="border rounded-md p-2 flex flex-wrap gap-x-4 gap-y-2">
                  {optionsOf("vetting_type").map((o) => (
                    <label key={o.id} className="flex items-center gap-2 text-sm cursor-pointer">
                      <Checkbox
                        checked={form.vetting_types.includes(o.label)}
                        onCheckedChange={() => toggleIn("vetting_types", o.label)}
                      />
                      {o.label}
                    </label>
                  ))}
                </div>
              </div>
            )}

            <div className="space-y-1">
              <Label>Location (pre-approved venues)</Label>
              <Select
                value={form.venue_id || "none"}
                onValueChange={(v) => setForm({ ...form, venue_id: v === "none" ? null : v })}
              >
                <SelectTrigger><SelectValue placeholder="Select venue" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">— Other (type below) —</SelectItem>
                  {venues.map((v: any) => (
                    <SelectItem key={v.id} value={v.id}>
                      {v.venue_name}{v.city ? ` — ${v.city}` : ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {!form.venue_id && (
                <Input
                  className="mt-1"
                  placeholder="e.g. Store — Cash Crusaders Northcliff"
                  value={form.location_label || ""}
                  onChange={(e) => setForm({ ...form, location_label: e.target.value })}
                />
              )}
            </div>

            <div className="space-y-1">
              <Label>Special notes</Label>
              <Textarea
                rows={3}
                placeholder="Direct message shown on the confirmation..."
                value={form.special_notes || ""}
                onChange={(e) => setForm({ ...form, special_notes: e.target.value })}
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setEditorOpen(false)}>Cancel</Button>
            <Button onClick={() => save.mutate()} disabled={save.isPending}>
              {save.isPending ? "Saving..." : "Save"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Preview & send */}
      <Dialog open={!!previewing} onOpenChange={(o) => !o && setPreviewing(null)}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Booking Confirmation</DialogTitle>
            <DialogDescription>
              {previewing?.booking_reference} — sends the confirmation and an Outlook calendar invite.
            </DialogDescription>
          </DialogHeader>

          {previewing && (
            <>
              <div className="border rounded-md overflow-hidden">
                <BookingConfirmationDocument
                  ref={docRef}
                  record={previewing}
                  venueLabel={venueLabel(previewing)}
                />
              </div>

              <div className="space-y-2">
                <Label className="flex items-center gap-1">
                  <Mail className="h-4 w-4" /> Recipients
                </Label>
                <p className="text-xs text-muted-foreground">
                  {recipientsFor(previewing).join(", ") || "None yet"} · always copied to {ALWAYS_CC}
                </p>
                <Input
                  placeholder="Add more email addresses, separated by commas"
                  value={extraRecipients}
                  onChange={(e) => setExtraRecipients(e.target.value)}
                />
              </div>
            </>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => setPreviewing(null)}>Close</Button>
            <Button variant="outline" onClick={handleDownload} disabled={downloading}>
              {downloading ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Download className="h-4 w-4 mr-1" />}
              Download PDF
            </Button>
            <Button onClick={handleSend} disabled={sending}>
              {sending ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Send className="h-4 w-4 mr-1" />}
              {sending ? "Sending..." : "Send & Invite"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default BookingConfirmationsTab;
