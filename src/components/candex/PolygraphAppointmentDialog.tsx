import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { toast } from "sonner";
import { MapPin, Send, Building2, Store } from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

interface Candidate {
  id: string;
  candidate_name: string;
  candidate_id_number: string | null;
}

interface AccountOption {
  id: string;
  name: string;
  code: string;
}

interface PolygraphAppointmentDialogProps {
  open: boolean;
  onClose: () => void;
  candidates: Candidate[];
  clientId: string;
  userId: string;
  accounts: AccountOption[];
  defaultAccountId: string | null;
}

const PolygraphAppointmentDialog = ({
  open,
  onClose,
  candidates,
  clientId,
  userId,
  accounts,
  defaultAccountId,
}: PolygraphAppointmentDialogProps) => {
  const queryClient = useQueryClient();
  const [venueType, setVenueType] = useState<string>("own_location");
  const [venueAddress, setVenueAddress] = useState("");
  const [notes, setNotes] = useState("");
  const [selectedCandidates, setSelectedCandidates] = useState<string[]>([]);
  const [selectedAccountId, setSelectedAccountId] = useState(defaultAccountId || "");
  const [selectedStoreId, setSelectedStoreId] = useState("");
  const [preferredArea, setPreferredArea] = useState("");

  // Fetch stores for selected account
  const { data: accountStores = [] } = useQuery({
    queryKey: ["appointment-stores", selectedAccountId],
    queryFn: async () => {
      if (!selectedAccountId) return [];
      const { data } = await supabase
        .from("stores")
        .select("id, store_name, store_code")
        .eq("account_id", selectedAccountId)
        .order("store_name");
      return data || [];
    },
    enabled: !!selectedAccountId,
  });

  const toggleCandidate = (id: string) => {
    setSelectedCandidates((prev) =>
      prev.includes(id) ? prev.filter((c) => c !== id) : [...prev, id]
    );
  };

  const selectAll = () => {
    if (selectedCandidates.length === candidates.length) {
      setSelectedCandidates([]);
    } else {
      setSelectedCandidates(candidates.map((c) => c.id));
    }
  };

  const submitRequest = useMutation({
    mutationFn: async () => {
      if (selectedCandidates.length === 0) throw new Error("Please select at least one candidate");
      if (venueType !== "tldv_venue" && !venueAddress.trim()) throw new Error("Please provide a venue address");

      const { data: appointment, error: appErr } = await supabase
        .from("polygraph_appointments" as any)
        .insert({
          client_id: clientId,
           account_id: selectedAccountId || null,
           store_id: selectedStoreId || null,
          requested_by: userId,
          venue_type: venueType,
          venue_address: venueType === "tldv_venue" ? "TLDV Vetted Venue (to be confirmed)" : venueAddress.trim(),
          preferred_area: preferredArea.trim() || null,
          notes: notes.trim() || null,
          status: "requested",
        } as any)
        .select("id")
        .single();

      if (appErr) throw appErr;

      const candidateRows = selectedCandidates.map((appId) => {
        const cand = candidates.find((c) => c.id === appId);
        return {
          appointment_id: (appointment as any).id,
          application_id: appId,
          candidate_name: cand?.candidate_name || "",
          candidate_id_number: cand?.candidate_id_number || null,
        };
      });

      const { error: candErr } = await supabase
        .from("polygraph_appointment_candidates" as any)
        .insert(candidateRows as any);

      if (candErr) throw candErr;
    },
    onSuccess: () => {
      toast.success("Polygraph appointment request submitted successfully");
      queryClient.invalidateQueries({ queryKey: ["polygraph-appointments"] });
      resetAndClose();
    },
    onError: (e: any) => toast.error(e.message),
  });

  const resetAndClose = () => {
    setVenueType("own_location");
    setVenueAddress("");
    setNotes("");
    setSelectedCandidates([]);
    setSelectedAccountId(defaultAccountId || "");
    setSelectedStoreId("");
    setPreferredArea("");
    onClose();
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && resetAndClose()}>
      <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <MapPin className="h-5 w-5 text-primary" /> Request Polygraph Appointment
          </DialogTitle>
          <DialogDescription>
            Select the venue and candidates for the polygraph examination.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-5">
          {/* Account Selection */}
          <div className="space-y-2">
            <Label className="text-sm font-semibold flex items-center gap-1">
              <Building2 className="h-4 w-4" /> Assign to Account
            </Label>
            <Select value={selectedAccountId} onValueChange={(v) => { setSelectedAccountId(v); setSelectedStoreId(""); }}>
              <SelectTrigger><SelectValue placeholder="Select account" /></SelectTrigger>
              <SelectContent>
                {accounts.map((acc) => (
                  <SelectItem key={acc.id} value={acc.id}>{acc.name} ({acc.code})</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Sub-account (Store) Selection */}
          {selectedAccountId && accountStores.length > 0 && (
            <div className="space-y-2">
              <Label className="text-sm font-semibold flex items-center gap-1">
                <Store className="h-4 w-4" /> Sub-Account (Optional)
              </Label>
              <Select value={selectedStoreId} onValueChange={setSelectedStoreId}>
                <SelectTrigger><SelectValue placeholder="Select sub-account" /></SelectTrigger>
                <SelectContent>
                  {accountStores.map((s: any) => (
                    <SelectItem key={s.id} value={s.id}>{s.store_name} ({s.store_code})</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          {/* Venue Type */}
          <div className="space-y-3">
            <Label className="text-sm font-semibold">Venue Selection</Label>
            <RadioGroup value={venueType} onValueChange={setVenueType} className="space-y-2">
              <div className="flex items-start gap-3 p-3 border rounded-md hover:bg-muted/50">
                <RadioGroupItem value="own_location" id="own_location" className="mt-0.5" />
                <div>
                  <label htmlFor="own_location" className="text-sm font-medium cursor-pointer">Own Location</label>
                  <p className="text-xs text-muted-foreground">Provide your own address for the examination</p>
                </div>
              </div>
              <div className="flex items-start gap-3 p-3 border rounded-md hover:bg-muted/50">
                <RadioGroupItem value="rented_venue" id="rented_venue" className="mt-0.5" />
                <div>
                  <label htmlFor="rented_venue" className="text-sm font-medium cursor-pointer">Rented Venue</label>
                  <p className="text-xs text-muted-foreground">Provide the rented venue address</p>
                </div>
              </div>
              <div className="flex items-start gap-3 p-3 border rounded-md hover:bg-muted/50">
                <RadioGroupItem value="tldv_venue" id="tldv_venue" className="mt-0.5" />
                <div>
                  <label htmlFor="tldv_venue" className="text-sm font-medium cursor-pointer">True Lie Detectors & Vetting Venue</label>
                  <p className="text-xs text-muted-foreground">TLDV will arrange a vetted venue supplier</p>
                </div>
              </div>
            </RadioGroup>
          </div>

          {/* Address field */}
          {venueType !== "tldv_venue" && (
            <div className="space-y-2">
              <Label>
                {venueType === "own_location" ? "Your Location Address" : "Rented Venue Address"} *
              </Label>
              <Textarea
                placeholder="Enter full address..."
                value={venueAddress}
                onChange={(e) => setVenueAddress(e.target.value)}
                rows={3}
              />
            </div>
          )}

          {venueType === "tldv_venue" && (
            <div className="bg-muted/50 border rounded-md p-3">
              <p className="text-sm text-muted-foreground flex items-center gap-2">
                <Building2 className="h-4 w-4" />
                TLDV will confirm the venue details once the appointment is scheduled.
              </p>
            </div>
          )}

          {/* Candidate Selection */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label className="text-sm font-semibold">Select Candidates ({selectedCandidates.length})</Label>
              <Button variant="ghost" size="sm" onClick={selectAll} className="text-xs h-7">
                {selectedCandidates.length === candidates.length ? "Deselect All" : "Select All"}
              </Button>
            </div>
            <div className="border rounded-md max-h-48 overflow-y-auto">
              {candidates.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-4">No eligible candidates</p>
              ) : (
                candidates.map((cand) => (
                  <label
                    key={cand.id}
                    className="flex items-center gap-2 px-3 py-2 hover:bg-muted/50 cursor-pointer text-sm border-b last:border-b-0"
                  >
                    <Checkbox
                      checked={selectedCandidates.includes(cand.id)}
                      onCheckedChange={() => toggleCandidate(cand.id)}
                    />
                    <span className="font-medium">{cand.candidate_name}</span>
                    <span className="text-muted-foreground text-xs ml-auto">{cand.candidate_id_number || ""}</span>
                  </label>
                ))
              )}
            </div>
          </div>

          {/* Notes */}
          <div className="space-y-2">
            <Label>Additional Notes (Optional)</Label>
            <Textarea
              placeholder="Any additional information for the appointment..."
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={2}
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={resetAndClose}>Cancel</Button>
          <Button
            onClick={() => submitRequest.mutate()}
            disabled={submitRequest.isPending || selectedCandidates.length === 0}
          >
            <Send className="h-4 w-4 mr-1" />
            {submitRequest.isPending ? "Submitting..." : "Submit Request"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default PolygraphAppointmentDialog;
