import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { User, Users, ArrowLeft, ArrowRight } from "lucide-react";
import {
  TEST_TYPES,
  getCachedLists,
  newId,
  saveSession,
  type OfflineSession,
} from "@/lib/offlineExaminerDb";

const CUSTOM = "__custom__";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  examinerUserId: string;
  onCreated: (session: OfflineSession) => void;
}

type Step = "mode" | "testType" | "client" | "date" | "venue";

const STEPS: Step[] = ["mode", "testType", "client", "date", "venue"];

export default function SessionSetupDialog({ open, onOpenChange, examinerUserId, onCreated }: Props) {
  const [step, setStep] = useState<Step>("mode");
  const [mode, setMode] = useState<"single" | "batch" | null>(null);
  const [testType, setTestType] = useState<string>("");
  const [clientName, setClientName] = useState("");
  const [clientCustom, setClientCustom] = useState("");
  const [appointmentDate, setAppointmentDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [venueLabel, setVenueLabel] = useState("");
  const [venueCustom, setVenueCustom] = useState("");
  const [saving, setSaving] = useState(false);

  const lists = getCachedLists();

  const reset = () => {
    setStep("mode");
    setMode(null);
    setTestType("");
    setClientName("");
    setClientCustom("");
    setAppointmentDate(new Date().toISOString().slice(0, 10));
    setVenueLabel("");
    setVenueCustom("");
  };

  const stepIndex = STEPS.indexOf(step);

  const canContinue = (): boolean => {
    switch (step) {
      case "mode": return !!mode;
      case "testType": return !!testType;
      case "client": return clientName === CUSTOM ? clientCustom.trim().length > 0 : clientName.length > 0;
      case "date": return !!appointmentDate;
      case "venue": return venueLabel === CUSTOM ? venueCustom.trim().length > 0 : venueLabel.length > 0;
    }
  };

  const next = () => {
    if (stepIndex < STEPS.length - 1) setStep(STEPS[stepIndex + 1]);
  };
  const back = () => {
    if (stepIndex > 0) setStep(STEPS[stepIndex - 1]);
  };

  const finish = async () => {
    if (!mode || !canContinue()) return;
    setSaving(true);
    const session: OfflineSession = {
      id: newId(),
      examinerUserId,
      mode,
      testType,
      clientName: clientName === CUSTOM ? clientCustom.trim() : clientName,
      appointmentDate,
      venueLabel: venueLabel === CUSTOM ? venueCustom.trim() : venueLabel,
      status: "open",
      createdAt: new Date().toISOString(),
    };
    await saveSession(session);
    setSaving(false);
    onCreated(session);
    onOpenChange(false);
    reset();
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { onOpenChange(o); if (!o) reset(); }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>
            {step === "mode" && "Start a new report"}
            {step === "testType" && "Type of test"}
            {step === "client" && "Client name"}
            {step === "date" && "Appointment date"}
            {step === "venue" && "Appointment venue"}
          </DialogTitle>
          <DialogDescription>
            Step {stepIndex + 1} of {STEPS.length}
            {mode === "batch" && " — these details apply to every report in the batch."}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {step === "mode" && (
            <div className="grid grid-cols-2 gap-3">
              <button
                onClick={() => setMode("single")}
                className={`p-4 rounded-lg border-2 flex flex-col items-center gap-2 transition-all ${mode === "single" ? "border-red-600 bg-red-600/10" : "border-border hover:border-red-600/50"}`}
              >
                <User className="h-8 w-8 text-red-500" />
                <span className="font-semibold text-sm">Single submission</span>
                <span className="text-xs text-muted-foreground text-center">One report only</span>
              </button>
              <button
                onClick={() => setMode("batch")}
                className={`p-4 rounded-lg border-2 flex flex-col items-center gap-2 transition-all ${mode === "batch" ? "border-red-600 bg-red-600/10" : "border-border hover:border-red-600/50"}`}
              >
                <Users className="h-8 w-8 text-red-500" />
                <span className="font-semibold text-sm">Batch</span>
                <span className="text-xs text-muted-foreground text-center">Multiple reports in one sitting</span>
              </button>
            </div>
          )}

          {step === "testType" && (
            <div className="space-y-2">
              <Label>What type of test will you be doing?</Label>
              <div className="space-y-2">
                {TEST_TYPES.map((t) => (
                  <button
                    key={t}
                    onClick={() => setTestType(t)}
                    className={`w-full p-3 rounded-lg border-2 text-left font-medium transition-all ${testType === t ? "border-red-600 bg-red-600/10" : "border-border hover:border-red-600/50"}`}
                  >
                    {t}
                  </button>
                ))}
              </div>
              <p className="text-xs text-muted-foreground">In a batch you can still change the test type per report later.</p>
            </div>
          )}

          {step === "client" && (
            <div className="space-y-2">
              <Label>Which client is the appointment for?</Label>
              <Select value={clientName} onValueChange={setClientName}>
                <SelectTrigger><SelectValue placeholder="Select a client…" /></SelectTrigger>
                <SelectContent>
                  {lists.companies.map((c) => (
                    <SelectItem key={c} value={c}>{c}</SelectItem>
                  ))}
                  <SelectItem value={CUSTOM}>Other — type a new client name</SelectItem>
                </SelectContent>
              </Select>
              {clientName === CUSTOM && (
                <Input
                  value={clientCustom}
                  onChange={(e) => setClientCustom(e.target.value)}
                  placeholder="Client name"
                  className="text-base"
                  autoFocus
                />
              )}
            </div>
          )}

          {step === "date" && (
            <div className="space-y-2">
              <Label>Date of the appointment</Label>
              <Input
                type="date"
                value={appointmentDate}
                onChange={(e) => setAppointmentDate(e.target.value)}
                className="text-base"
              />
            </div>
          )}

          {step === "venue" && (
            <div className="space-y-2">
              <Label>Where is the appointment taking place?</Label>
              <Select value={venueLabel} onValueChange={setVenueLabel}>
                <SelectTrigger><SelectValue placeholder="Select a venue…" /></SelectTrigger>
                <SelectContent>
                  {lists.venues.map((v) => (
                    <SelectItem key={v} value={v}>{v}</SelectItem>
                  ))}
                  <SelectItem value={CUSTOM}>Other — type the venue</SelectItem>
                </SelectContent>
              </Select>
              {venueLabel === CUSTOM && (
                <Input
                  value={venueCustom}
                  onChange={(e) => setVenueCustom(e.target.value)}
                  placeholder="Venue / location"
                  className="text-base"
                  autoFocus
                />
              )}
            </div>
          )}
        </div>

        <div className="flex justify-between pt-2">
          <Button variant="ghost" onClick={back} disabled={stepIndex === 0 || saving}>
            <ArrowLeft className="h-4 w-4 mr-1" /> Back
          </Button>
          {stepIndex < STEPS.length - 1 ? (
            <Button onClick={next} disabled={!canContinue()}>
              Next <ArrowRight className="h-4 w-4 ml-1" />
            </Button>
          ) : (
            <Button onClick={finish} disabled={!canContinue() || saving} className="bg-red-600 hover:bg-red-700 text-white">
              {saving ? "Creating…" : mode === "batch" ? "Create batch" : "Create report"}
            </Button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
