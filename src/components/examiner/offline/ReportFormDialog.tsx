import { useEffect, useRef, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Badge } from "@/components/ui/badge";
import { Plus, Trash2, Upload, X, FileText, Save, Send } from "lucide-react";
import { toast } from "sonner";
import {
  TEST_TYPES,
  emptyAnswers,
  newId,
  saveReport,
  type OfflineReport,
  type OfflineSession,
} from "@/lib/offlineExaminerDb";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  session: OfflineSession;
  report: OfflineReport | null; // null = new report
  isWalkIn?: boolean;
  onSaved: () => void;
}

const FINDINGS = ["SR", "NSR", "INC", "PNC"] as const;
const RESULTS = [
  { value: "passed", label: "Passed" },
  { value: "failed", label: "Failed" },
  { value: "inconclusive", label: "Inconclusive" },
] as const;

export default function ReportFormDialog({ open, onOpenChange, session, report, isWalkIn = false, onSaved }: Props) {
  const [draft, setDraft] = useState<OfflineReport | null>(null);
  const pfInputRef = useRef<HTMLInputElement>(null);
  const essInputRef = useRef<HTMLInputElement>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    if (report) {
      setDraft({ ...report, answers: { ...emptyAnswers(), ...report.answers, suitability: { ...emptyAnswers().suitability, ...report.answers?.suitability } } });
    } else {
      setDraft({
        id: newId(),
        sessionId: session.id,
        testType: session.testType,
        firstName: "",
        surname: "",
        idNumber: "",
        isWalkIn,
        answers: emptyAnswers(),
        pfFiles: [],
        essFile: null,
        status: "draft",
        createdAt: new Date().toISOString(),
      });
    }
  }, [open, report, session.id, session.testType, isWalkIn]);

  if (!open || !draft) return null;

  const setAnswers = (patch: Partial<OfflineReport["answers"]>) =>
    setDraft((d) => d && { ...d, answers: { ...d.answers, ...patch } });
  const setSuitability = (patch: Partial<OfflineReport["answers"]["suitability"]>) =>
    setDraft((d) => d && { ...d, answers: { ...d.answers, suitability: { ...d.answers.suitability, ...patch } } });

  const addPfFiles = (files: FileList | null) => {
    if (!files) return;
    const refs = Array.from(files).map((f) => ({ name: f.name, size: f.size, blob: f as Blob }));
    setDraft((d) => d && { ...d, pfFiles: [...d.pfFiles, ...refs] });
  };

  const canPublish =
    draft.firstName.trim() &&
    draft.surname.trim() &&
    draft.answers.overallResult &&
    draft.answers.findingMade &&
    draft.answers.reviewedByExaminer &&
    draft.pfFiles.length > 0 &&
    !!draft.essFile;

  const persist = async (publish: boolean) => {
    if (!draft.firstName.trim() || !draft.surname.trim()) {
      toast.error("Enter the candidate's name and surname first.");
      return;
    }
    setSaving(true);
    try {
      const now = new Date().toISOString();
      const toSave: OfflineReport = {
        ...draft,
        status: publish ? (navigator.onLine ? "published_waiting" : "published_waiting") : draft.status === "uploaded" ? draft.status : "draft",
        capturedAt: draft.capturedAt || now,
        publishedAt: publish ? draft.publishedAt || now : draft.publishedAt,
      };
      await saveReport(toSave);
      toast.success(publish ? "Published (waiting to upload)" : "Saved on this device");
      onSaved();
      onOpenChange(false);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {report ? "Edit report" : isWalkIn ? "Walk-in candidate" : "New report"}
            {isWalkIn && <Badge className="ml-2 bg-amber-500 text-white text-xs">Unplanned</Badge>}
          </DialogTitle>
          <DialogDescription>
            {session.clientName} · {session.appointmentDate} · {session.venueLabel} — saved on this device, works with no signal.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6 py-2">
          {/* Candidate details */}
          <section className="space-y-3">
            <h3 className="font-semibold text-sm">Candidate</h3>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div className="space-y-1">
                <Label>Name *</Label>
                <Input value={draft.firstName} onChange={(e) => setDraft({ ...draft, firstName: e.target.value })} className="text-base" />
              </div>
              <div className="space-y-1">
                <Label>Surname *</Label>
                <Input value={draft.surname} onChange={(e) => setDraft({ ...draft, surname: e.target.value })} className="text-base" />
              </div>
              <div className="space-y-1">
                <Label>ID / Passport number</Label>
                <Input value={draft.idNumber} onChange={(e) => setDraft({ ...draft, idNumber: e.target.value })} className="text-base" />
              </div>
            </div>
            <div className="space-y-1">
              <Label>Type of test for this report</Label>
              <Select value={draft.testType} onValueChange={(v) => setDraft({ ...draft, testType: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {TEST_TYPES.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </section>

          <Separator />

          {/* Suitability */}
          <section className="space-y-3">
            <h3 className="font-semibold text-sm">Suitability</h3>
            <div className="space-y-1">
              <Label>General health status</Label>
              <Input value={draft.answers.suitability.healthStatus} onChange={(e) => setSuitability({ healthStatus: e.target.value })} className="text-base" />
            </div>
            {(
              [
                { key: "enoughSleep", label: "Had enough sleep" },
                { key: "medicationTaken", label: "Took medication", detailKey: "medicationDetails", detailLabel: "Medication details" },
                { key: "recentAlcoholUse", label: "Recent alcohol use", detailKey: "alcoholDetails", detailLabel: "Alcohol details" },
              ] as const
            ).map((row) => (
              <div key={row.key} className="space-y-1">
                <div className="flex items-center justify-between gap-3">
                  <Label>{row.label}</Label>
                  <Select
                    value={draft.answers.suitability[row.key] === null ? "" : draft.answers.suitability[row.key] ? "yes" : "no"}
                    onValueChange={(v) => setSuitability({ [row.key]: v === "yes" } as any)}
                  >
                    <SelectTrigger className="w-28"><SelectValue placeholder="—" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="yes">Yes</SelectItem>
                      <SelectItem value="no">No</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                {"detailKey" in row && draft.answers.suitability[row.key] && (
                  <Input
                    value={(draft.answers.suitability as any)[row.detailKey]}
                    onChange={(e) => setSuitability({ [row.detailKey]: e.target.value } as any)}
                    placeholder={row.detailLabel}
                    className="text-base"
                  />
                )}
              </div>
            ))}
            <div className="flex items-center justify-between gap-3">
              <Label className="font-medium">Suitable for examination?</Label>
              <Select
                value={draft.answers.suitability.suitableForExam === null ? "" : draft.answers.suitability.suitableForExam ? "yes" : "no"}
                onValueChange={(v) => setSuitability({ suitableForExam: v === "yes" })}
              >
                <SelectTrigger className="w-28"><SelectValue placeholder="—" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="yes">Yes</SelectItem>
                  <SelectItem value="no">No</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <Textarea
              value={draft.answers.suitability.suitabilityComment}
              onChange={(e) => setSuitability({ suitabilityComment: e.target.value })}
              placeholder="Suitability comment"
              className="text-base"
            />
          </section>

          <Separator />

          {/* Exam questions */}
          <section className="space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="font-semibold text-sm">Exam questions</h3>
              <Button
                variant="outline" size="sm"
                onClick={() => setAnswers({ questions: [...draft.answers.questions, { questionText: "", response: null, finding: null }] })}
              >
                <Plus className="h-4 w-4 mr-1" /> Add question
              </Button>
            </div>
            {draft.answers.questions.length === 0 && (
              <p className="text-xs text-muted-foreground">No questions yet — add them as you ask.</p>
            )}
            {draft.answers.questions.map((q, i) => (
              <div key={i} className="border rounded-lg p-3 space-y-2">
                <div className="flex items-start gap-2">
                  <span className="text-xs text-muted-foreground mt-2 w-6">Q{i + 1}</span>
                  <Input
                    value={q.questionText}
                    onChange={(e) => {
                      const questions = [...draft.answers.questions];
                      questions[i] = { ...q, questionText: e.target.value };
                      setAnswers({ questions });
                    }}
                    placeholder="Question text"
                    className="text-base"
                  />
                  <Button
                    variant="ghost" size="sm"
                    onClick={() => setAnswers({ questions: draft.answers.questions.filter((_, j) => j !== i) })}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
                <div className="flex gap-2 pl-8">
                  <Select
                    value={q.response || ""}
                    onValueChange={(v) => {
                      const questions = [...draft.answers.questions];
                      questions[i] = { ...q, response: v as "yes" | "no" };
                      setAnswers({ questions });
                    }}
                  >
                    <SelectTrigger className="w-28"><SelectValue placeholder="Answer" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="yes">Yes</SelectItem>
                      <SelectItem value="no">No</SelectItem>
                    </SelectContent>
                  </Select>
                  <Select
                    value={q.finding || ""}
                    onValueChange={(v) => {
                      const questions = [...draft.answers.questions];
                      questions[i] = { ...q, finding: v as any };
                      setAnswers({ questions });
                    }}
                  >
                    <SelectTrigger className="w-32"><SelectValue placeholder="Finding" /></SelectTrigger>
                    <SelectContent>
                      {FINDINGS.map((f) => <SelectItem key={f} value={f}>{f}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            ))}
          </section>

          <Separator />

          {/* Admissions */}
          <section className="space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="font-semibold text-sm">Admissions</h3>
              <Button
                variant="outline" size="sm"
                onClick={() => setAnswers({ admissions: [...draft.answers.admissions, { category: "", confirmed: false, details: "" }] })}
              >
                <Plus className="h-4 w-4 mr-1" /> Add admission
              </Button>
            </div>
            {draft.answers.admissions.map((a, i) => (
              <div key={i} className="border rounded-lg p-3 space-y-2">
                <div className="flex items-center gap-2">
                  <Input
                    value={a.category}
                    onChange={(e) => {
                      const admissions = [...draft.answers.admissions];
                      admissions[i] = { ...a, category: e.target.value };
                      setAnswers({ admissions });
                    }}
                    placeholder="Category"
                    className="text-base"
                  />
                  <label className="flex items-center gap-1.5 text-sm whitespace-nowrap">
                    <Checkbox
                      checked={a.confirmed}
                      onCheckedChange={(c) => {
                        const admissions = [...draft.answers.admissions];
                        admissions[i] = { ...a, confirmed: !!c };
                        setAnswers({ admissions });
                      }}
                    />
                    Confirmed
                  </label>
                  <Button
                    variant="ghost" size="sm"
                    onClick={() => setAnswers({ admissions: draft.answers.admissions.filter((_, j) => j !== i) })}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
                <Textarea
                  value={a.details}
                  onChange={(e) => {
                    const admissions = [...draft.answers.admissions];
                    admissions[i] = { ...a, details: e.target.value };
                    setAnswers({ admissions });
                  }}
                  placeholder="Details"
                  className="text-base"
                />
              </div>
            ))}
            <div className="space-y-1">
              <Label>Post-exam admissions</Label>
              <Textarea value={draft.answers.postExamAdmissions} onChange={(e) => setAnswers({ postExamAdmissions: e.target.value })} className="text-base" />
            </div>
          </section>

          <Separator />

          {/* Finding */}
          <section className="space-y-3">
            <h3 className="font-semibold text-sm">Finding & review</h3>
            <div className="space-y-1">
              <Label>Overall result *</Label>
              <Select
                value={draft.answers.overallResult || ""}
                onValueChange={(v) => setAnswers({ overallResult: v as any })}
              >
                <SelectTrigger><SelectValue placeholder="Select result…" /></SelectTrigger>
                <SelectContent>
                  {RESULTS.map((r) => <SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label>Examiner notes</Label>
              <Textarea value={draft.answers.examinerNotes} onChange={(e) => setAnswers({ examinerNotes: e.target.value })} className="text-base" />
            </div>
            <label className="flex items-center gap-2 text-sm">
              <Checkbox checked={draft.answers.findingMade} onCheckedChange={(c) => setAnswers({ findingMade: !!c })} />
              Analysis completed and finding made
            </label>
            <label className="flex items-center gap-2 text-sm">
              <Checkbox checked={draft.answers.reviewedByExaminer} onCheckedChange={(c) => setAnswers({ reviewedByExaminer: !!c })} />
              I have reviewed this report
            </label>
          </section>

          <Separator />

          {/* Required attachments */}
          <section className="space-y-3">
            <h3 className="font-semibold text-sm">Required attachments</h3>
            <div className="border rounded-lg p-3 space-y-2">
              <div className="flex items-center justify-between">
                <Label className="font-medium">PF folder *</Label>
                <Button variant="outline" size="sm" onClick={() => pfInputRef.current?.click()}>
                  <Upload className="h-4 w-4 mr-1" /> Add files
                </Button>
                <input
                  ref={pfInputRef} type="file" multiple className="hidden"
                  accept="audio/*,video/*,.dat,.bin,.zip,.lxe,.lx5,.lx6,image/*,application/pdf"
                  onChange={(e) => { addPfFiles(e.target.files); e.target.value = ""; }}
                />
              </div>
              {draft.pfFiles.length === 0 ? (
                <p className="text-xs text-muted-foreground">No files yet — publishing is blocked until the PF folder is attached.</p>
              ) : (
                <ul className="space-y-1">
                  {draft.pfFiles.map((f, i) => (
                    <li key={i} className="flex items-center justify-between text-sm">
                      <span className="truncate flex items-center gap-1.5"><FileText className="h-3.5 w-3.5 shrink-0" />{f.name}</span>
                      <Button variant="ghost" size="sm" onClick={() => setDraft({ ...draft, pfFiles: draft.pfFiles.filter((_, j) => j !== i) })}>
                        <X className="h-3.5 w-3.5" />
                      </Button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
            <div className="border rounded-lg p-3 space-y-2">
              <div className="flex items-center justify-between">
                <Label className="font-medium">ESS report *</Label>
                <Button variant="outline" size="sm" onClick={() => essInputRef.current?.click()}>
                  <Upload className="h-4 w-4 mr-1" /> {draft.essFile ? "Replace" : "Attach"}
                </Button>
                <input
                  ref={essInputRef} type="file" className="hidden"
                  accept=".pdf,.doc,.docx,image/*"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) setDraft({ ...draft, essFile: { name: f.name, size: f.size, blob: f } });
                    e.target.value = "";
                  }}
                />
              </div>
              {draft.essFile ? (
                <p className="text-sm flex items-center gap-1.5"><FileText className="h-3.5 w-3.5" />{draft.essFile.name}</p>
              ) : (
                <p className="text-xs text-muted-foreground">Publishing is blocked until the ESS report is attached.</p>
              )}
            </div>
          </section>
        </div>

        <div className="flex flex-col sm:flex-row gap-2 justify-between pt-2">
          <Button variant="outline" onClick={() => persist(false)} disabled={saving}>
            <Save className="h-4 w-4 mr-1" /> Save
          </Button>
          <Button
            onClick={() => persist(true)}
            disabled={saving || !canPublish}
            className="bg-red-600 hover:bg-red-700 text-white"
            title={!canPublish ? "Complete the finding, review the report and attach the PF folder and ESS report first" : "Publish for peer review"}
          >
            <Send className="h-4 w-4 mr-1" /> Publish for peer review
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
