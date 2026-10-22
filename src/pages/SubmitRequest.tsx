import { useEffect, useMemo, useState } from "react";
import { useLocation } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Card, CardContent } from "@/components/ui/card";
import { CheckCircle2, ChevronLeft, ChevronRight, FileUp, Loader2, Trash2, Users } from "lucide-react";
import preApplicheckLogo from "@/assets/preapplicheck-logo-mark.png";
import { parseSaId, parseBatchCsv, storeSlug, type IntakeCandidate } from "@/components/manual-risk/intakeLogic";

const sb = supabase as any;
const INDEMNITY_BUCKET = "manual-risk-indemnities";
const ALLOWED_DOC_TYPES = ["application/pdf", "image/jpeg", "image/png", "application/msword", "application/vnd.openxmlformats-officedocument.wordprocessingml.document"];

type Store = { id: string; client_name: string };
type CandidateRow = IntakeCandidate & { key: string; genderExplicit: boolean };

const emptyCandidate = (): CandidateRow => ({
  key: crypto.randomUUID(), id_number: "", surname: "", first_name: "",
  gender: null, date_of_birth: null, genderExplicit: false,
});

export default function SubmitRequest() {
  const { search } = useLocation();

  const [stores, setStores] = useState<Store[]>([]);
  const [storeChosen, setStoreChosen] = useState<string>("");
  const [storesLoading, setStoresLoading] = useState(true);
  const [storesError, setStoresError] = useState<string | null>(null);

  const [step, setStep] = useState(1);
  const [submitter, setSubmitter] = useState({ first_name: "", surname: "", email: "", phone: "" });
  const [saveToBook, setSaveToBook] = useState(true);
  const [lookupDone, setLookupDone] = useState(false);

  const [mode, setMode] = useState<"single" | "batch" | null>(null);
  const [batchRows, setBatchRows] = useState<CandidateRow[]>([]);
  const [consent, setConsent] = useState(false);
  const [files, setFiles] = useState<File[]>([]);
  const [submitting, setSubmitting] = useState(false);

  const [result, setResult] = useState<{ order_number: string } | null>(null);
  const [finished, setFinished] = useState(false);

  // Load the directory of loaded stores once.
  useEffect(() => {
    (async () => {
      try {
        const { data, error } = await supabase.functions.invoke("intake-public", { body: { action: "directory" } });
        if (error) throw error;
        const list: Store[] = data?.clients ?? [];
        setStores(list);
        // Preselect via ?store=<slug> or ?client=<uuid>
        const params = new URLSearchParams(search);
        const storeParam = (params.get("store") ?? "").toLowerCase();
        const clientParam = params.get("client") ?? "";
        const match = list.find((s) => s.id === clientParam)
          ?? list.find((s) => storeSlug(s.client_name) === storeParam);
        if (match) setStoreChosen(match.id);
        else if (storeParam || clientParam) {
          setStoresError("The store link you followed is not available — choose the store from the list below.");
        }
      } catch (e) {
        setStoresError("Could not load the store list. Please check your connection and try again.");
      } finally {
        setStoresLoading(false);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Address book autofill: exact email match returns the saved name only.
  useEffect(() => {
    const email = submitter.email.trim().toLowerCase();
    if (!email || lookupDone || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return;
    const timer = setTimeout(async () => {
      try {
        const { data } = await supabase.functions.invoke("intake-public", { body: { action: "contact_lookup", email } });
        if (data?.known && data?.name && !submitter.first_name && !submitter.surname) {
          const parts = String(data.name).trim().split(/\s+/);
          const first = parts.shift() ?? "";
          const rest = parts.join(" ");
          setSubmitter((s) => ({ ...s, first_name: s.first_name || first, surname: s.surname || rest }));
        }
        setLookupDone(true);
      } catch { /* autofill is best-effort */ }
    }, 600);
    return () => clearTimeout(timer);
  }, [submitter.email, lookupDone, submitter.first_name, submitter.surname]);

  const updateCandidate = (key: string, patch: Partial<CandidateRow>) => {
    setBatchRows((rows) => rows.map((r) => {
      if (r.key !== key) return r;
      const next = { ...r, ...patch };
      // 13-digit SA ID auto-fills gender + DOB unless the user picked them explicitly.
      if (patch.id_number !== undefined && !r.genderExplicit) {
        const parsed = parseSaId(patch.id_number);
        next.gender = parsed?.gender ?? null;
        next.date_of_birth = parsed?.date_of_birth ?? null;
      }
      return next;
    }));
  };

  const singleRow = batchRows[0];
  const setSingle = (patch: Partial<CandidateRow>) => {
    if (!singleRow) { setBatchRows([emptyCandidate()]); return; }
    updateCandidate(singleRow.key, patch);
  };

  const onFilesChosen = (list: FileList | null) => {
    if (!list) return;
    const ok: File[] = [];
    for (const f of Array.from(list)) {
      if (f.size > 10 * 1024 * 1024) { toast.error(`"${f.name}" is larger than 10MB`); continue; }
      if (f.type && !ALLOWED_DOC_TYPES.includes(f.type)) { toast.error(`"${f.name}" is not a PDF, image or Word document`); continue; }
      ok.push(f);
    }
    setFiles((prev) => [...prev, ...ok].slice(0, 10));
  };

  const validateCandidate = (c: CandidateRow) => {
    const id = c.id_number.trim();
    if (!id) return "Every candidate needs an ID number";
    const isSa = /^\d{13}$/.test(id);
    const isPassport = /^[A-Za-z0-9]{6,30}$/.test(id);
    if (!isSa && !isPassport) return `"${id}" is not a valid ID or passport number`;
    if (isSa && !parseSaId(id)) return `"${id}" is not a valid 13-digit ID number`;
    if (!c.first_name.trim()) return "Every candidate needs a first name";
    if (!c.surname.trim()) return "Every candidate needs a surname";
    if (isSa) return null;
    if (!["M", "F"].includes(c.gender ?? "")) return `Select a gender for ${c.first_name} ${c.surname}`;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(c.date_of_birth ?? "")) return `Select a date of birth for ${c.first_name} ${c.surname}`;
    return null;
  };

  const canContinueStep2 = submitter.first_name.trim().length > 0
    && submitter.surname.trim().length > 0
    && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(submitter.email.trim());

  const startSubmission = (chosenMode: "single" | "batch") => {
    setMode(chosenMode);
    setBatchRows(chosenMode === "single" ? [emptyCandidate()] : [emptyCandidate()]);
    setStep(3);
  };

  const submitRequest = async () => {
    if (!storeChosen) { toast.error("Select the store first"); return; }
    if (!consent) { toast.error("Please confirm you have the required consent before submitting"); return; }
    if (!files.length) { toast.error("Upload at least one document (for example the signed indemnity)"); return; }
    const candidates = batchRows.filter((c) => c.id_number.trim() || c.first_name.trim() || c.surname.trim());
    if (!candidates.length) { toast.error("Add at least one candidate"); return; }
    for (const c of candidates) {
      const err = validateCandidate(c);
      if (err) { toast.error(err); return; }
    }
    setSubmitting(true);
    try {
      const folder = crypto.randomUUID();
      const paths: string[] = [];
      for (const f of files) {
        const safeName = f.name.replace(/[^\w.\-]+/g, "_");
        const path = `intake/${folder}/${Date.now()}_${crypto.randomUUID().slice(0, 8)}_${safeName}`;
        const { error: upErr } = await sb.storage.from(INDEMNITY_BUCKET).upload(path, f, {
          contentType: f.type || "application/pdf", upsert: false,
        });
        if (upErr) throw new Error(`"${f.name}" could not be uploaded: ${upErr.message}`);
        paths.push(path);
      }
      const { data, error } = await supabase.functions.invoke("intake-public", {
        body: {
          action: "submit",
          client_id: storeChosen,
          submission_type: mode === "batch" ? "batch" : "single",
          submitter: {
            first_name: submitter.first_name.trim(),
            surname: submitter.surname.trim(),
            email: submitter.email.trim(),
            phone: submitter.phone.trim(),
            save_to_address_book: saveToBook,
          },
          candidates: candidates.map((c) => ({
            id_number: c.id_number.trim(),
            surname: c.surname.trim(),
            first_name: c.first_name.trim(),
            gender: c.gender ?? null,
            date_of_birth: c.date_of_birth ?? null,
          })),
          indemnity_paths: paths,
          notes: "",
        },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      setResult({ order_number: data.order_number });
      setStep(4);
      window.scrollTo({ top: 0, behavior: "smooth" });
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setSubmitting(false);
    }
  };

  const resetForAnother = () => {
    setMode(null);
    setBatchRows([]);
    setConsent(false);
    setFiles([]);
    setResult(null);
    setLookupDone(false);
    setStep(2);
  };

  const stepTitles = ["Store", "Your details", "Candidates", "Done"];
  const chosenStore = useMemo(() => stores.find((s) => s.id === storeChosen), [stores, storeChosen]);

  if (finished) {
    return (
      <div className="min-h-screen bg-white flex flex-col items-center justify-center px-4">
        <img src={preApplicheckLogo} alt="PreAppliCheck" className="h-24 mb-8" />
        <h1 className="text-2xl font-bold mb-2">Thank you</h1>
        <p className="text-muted-foreground text-center max-w-md">
          All requests have been received. You can close this window now — a confirmation email has been sent to you.
        </p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-white flex flex-col">
      {/* Header */}
      <header className="border-b bg-white">
        <div className="max-w-3xl mx-auto px-4 py-4 flex flex-col items-center gap-2">
          <img src={preApplicheckLogo} alt="PreAppliCheck" className="h-16 sm:h-20" />
          <p className="text-sm text-muted-foreground text-center">Background screening requests — Vetting driven by Intelligence</p>
        </div>
      </header>

      <main className="flex-1 max-w-3xl w-full mx-auto px-4 py-6">
        {/* Stepper */}
        <ol className="flex items-center justify-center gap-2 mb-8 text-sm">
          {stepTitles.map((t, i) => (
            <li key={t} className={`flex items-center gap-2 ${i + 1 === step ? "font-semibold" : "text-muted-foreground"}`}>
              <span className={`inline-flex items-center justify-center w-7 h-7 rounded-full border text-xs ${i + 1 < step ? "bg-emerald-600 text-white border-emerald-600" : i + 1 === step ? "border-red-600 text-red-600" : "border-muted"}`}>
                {i + 1 < step ? "✓" : i + 1}
              </span>
              <span className="hidden sm:inline">{t}</span>
              {i < stepTitles.length - 1 && <ChevronRight className="h-4 w-4 text-muted-foreground" />}
            </li>
          ))}
        </ol>

        {/* Step 1: store */}
        {step === 1 && (
          <Card>
            <CardContent className="pt-6 space-y-5">
              <div>
                <h2 className="text-lg font-semibold mb-1">Which store is this submission for?</h2>
                <p className="text-sm text-muted-foreground">
                  The request will be allocated to the account you choose below — please select it carefully, as the
                  results are billed to that account.
                </p>
              </div>
              {storesError && <p className="text-sm text-red-600">{storesError}</p>}
              {storesLoading ? (
                <div className="flex items-center justify-center py-8 text-muted-foreground">
                  <Loader2 className="h-5 w-5 mr-2 animate-spin" /> Loading stores…
                </div>
              ) : (
                <div className="grid gap-2 sm:grid-cols-2">
                  {stores.map((s) => (
                    <button
                      key={s.id}
                      onClick={() => { setStoreChosen(s.id); setStep(2); }}
                      className={`min-h-[44px] rounded-lg border px-4 py-3 text-left text-sm transition-colors ${storeChosen === s.id ? "border-red-600 bg-red-50 font-medium" : "hover:border-red-300 hover:bg-muted/50"}`}
                    >
                      {s.client_name}
                    </button>
                  ))}
                  {stores.length === 0 && <p className="text-sm text-muted-foreground">No stores are currently loaded.</p>}
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {/* Step 2: submitter */}
        {step === 2 && (
          <Card>
            <CardContent className="pt-6 space-y-4">
              <div>
                <h2 className="text-lg font-semibold mb-1">Your details</h2>
                <p className="text-sm text-muted-foreground">We use these to confirm your submission and keep you updated on the order.</p>
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label htmlFor="sr-first">First name</Label>
                  <Input id="sr-first" className="min-h-[44px] text-base" value={submitter.first_name}
                    onChange={(e) => setSubmitter({ ...submitter, first_name: e.target.value })} />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="sr-last">Surname</Label>
                  <Input id="sr-last" className="min-h-[44px] text-base" value={submitter.surname}
                    onChange={(e) => setSubmitter({ ...submitter, surname: e.target.value })} />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="sr-email">Email address</Label>
                  <Input id="sr-email" type="email" inputMode="email" autoComplete="email" className="min-h-[44px] text-base" value={submitter.email}
                    onChange={(e) => { setSubmitter({ ...submitter, email: e.target.value }); setLookupDone(false); }} />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="sr-phone">Contact number <span className="text-muted-foreground font-normal">(optional)</span></Label>
                  <Input id="sr-phone" type="tel" inputMode="tel" className="min-h-[44px] text-base" value={submitter.phone}
                    onChange={(e) => setSubmitter({ ...submitter, phone: e.target.value })} />
                </div>
              </div>
              <label className="flex items-center gap-2 text-sm">
                <Checkbox checked={saveToBook} onCheckedChange={(v) => setSaveToBook(!!v)} />
                Save my details so I don't have to type them next time
              </label>
              <div className="flex items-center justify-between pt-2">
                <Button variant="outline" onClick={() => setStep(1)}><ChevronLeft className="h-4 w-4 mr-1" /> Back</Button>
                <Button disabled={!canContinueStep2} onClick={() => setStep(3)}>
                  Continue <ChevronRight className="h-4 w-4 ml-1" />
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Step 3: candidates */}
        {step === 3 && (
          <div className="space-y-4">
            {!mode && (
              <Card>
                <CardContent className="pt-6 space-y-4 text-center">
                  <h2 className="text-lg font-semibold">How many candidates?</h2>
                  <p className="text-sm text-muted-foreground">Choose one candidate, or several in one request.</p>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <button onClick={() => startSubmission("single")}
                      className="min-h-[88px] rounded-lg border-2 border-dashed hover:border-red-400 hover:bg-muted/50 px-4 py-4 transition-colors">
                      <Users className="h-6 w-6 mx-auto mb-1 text-red-600" />
                      <span className="font-medium text-sm">Single submission</span>
                      <p className="text-xs text-muted-foreground mt-1">One candidate</p>
                    </button>
                    <button onClick={() => startSubmission("batch")}
                      className="min-h-[88px] rounded-lg border-2 border-dashed hover:border-red-400 hover:bg-muted/50 px-4 py-4 transition-colors">
                      <Users className="h-6 w-6 mx-auto mb-1 text-red-600" />
                      <span className="font-medium text-sm">Batch submission</span>
                      <p className="text-xs text-muted-foreground mt-1">More than one candidate</p>
                    </button>
                  </div>
                  <div className="flex justify-start pt-2">
                    <Button variant="outline" onClick={() => setStep(2)}><ChevronLeft className="h-4 w-4 mr-1" /> Back</Button>
                  </div>
                </CardContent>
              </Card>
            )}

            {mode === "single" && singleRow && (
              <CandidateCard
                title="Candidate details"
                row={singleRow}
                onChange={(patch) => setSingle(patch)}
                onGenderPick={(g) => {
                  if (!singleRow) return;
                  updateCandidate(singleRow.key, { gender: g, genderExplicit: true });
                }}
              />
            )}

            {mode === "batch" && (
              <>
                <Card>
                  <CardContent className="pt-6 space-y-4">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <h2 className="text-lg font-semibold">Candidates ({batchRows.length})</h2>
                      <div className="flex gap-2">
                        <label className="inline-flex">
                          <input type="file" accept=".csv,text/csv,.txt" className="hidden" onChange={(e) => {
                            const f = e.target.files?.[0];
                            if (!f) return;
                            const reader = new FileReader();
                            reader.onload = () => {
                              const parsed = parseBatchCsv(String(reader.result ?? ""));
                              if (!parsed.length) { toast.error("No candidate rows found in that file"); return; }
                              setBatchRows(parsed.map((c) => ({ ...c, key: crypto.randomUUID(), genderExplicit: !!c.gender })));
                              toast.success(`${parsed.length} candidate(s) loaded`);
                            };
                            reader.readAsText(f);
                            e.currentTarget.value = "";
                          }} />
                          <Button type="button" variant="outline" size="sm" onClick={(e) => (e.currentTarget.parentElement?.querySelector("input") as HTMLInputElement)?.click()}>
                            <FileUp className="h-4 w-4 mr-1" /> Upload CSV list
                          </Button>
                        </label>
                        <Button type="button" variant="outline" size="sm" onClick={() => setBatchRows((r) => [...r, emptyCandidate()])}>
                          + Add candidate
                        </Button>
                      </div>
                    </div>
                    <p className="text-sm text-muted-foreground">
                      Type a 13-digit ID number and the gender and date of birth fill in automatically. Or upload a CSV
                      with columns: ID number, Surname, First name, Gender, Date of birth.
                    </p>
                  </CardContent>
                </Card>
                {batchRows.map((row, idx) => (
                  <CandidateCard
                    key={row.key}
                    title={`Candidate ${idx + 1}`}
                    row={row}
                    onChange={(patch) => updateCandidate(row.key, patch)}
                    onGenderPick={(g) => updateCandidate(row.key, { gender: g, genderExplicit: true })}
                    onRemove={batchRows.length > 1 ? () => setBatchRows((r) => r.filter((x) => x.key !== row.key)) : undefined}
                  />
                ))}
              </>
            )}

            {mode && (
              <div className="space-y-4">
                <Card>
                  <CardContent className="pt-6 space-y-4">
                    <div>
                      <h2 className="text-lg font-semibold mb-1">Documents</h2>
                      <p className="text-sm text-muted-foreground">
                        Attach the signed indemnity (and any other consent documents). PDF, image or Word files up to 10MB.
                      </p>
                    </div>
                    <label className="block">
                      <input type="file" multiple accept=".pdf,.jpg,.jpeg,.png,.doc,.docx" className="hidden"
                        onChange={(e) => { onFilesChosen(e.target.files); e.currentTarget.value = ""; }} />
                      <span className="inline-flex items-center justify-center min-h-[44px] rounded-md border border-dashed px-4 py-2 text-sm hover:bg-muted/50 cursor-pointer">
                        <FileUp className="h-4 w-4 mr-2" /> Choose files to upload
                      </span>
                    </label>
                    {files.length > 0 && (
                      <ul className="space-y-1">
                        {files.map((f, i) => (
                          <li key={i} className="flex items-center justify-between text-sm border rounded px-3 py-2">
                            <span className="truncate">{f.name} <span className="text-muted-foreground">({Math.round(f.size / 1024)} KB)</span></span>
                            <button className="min-w-[44px] min-h-[44px] flex items-center justify-center text-red-600"
                              onClick={() => setFiles((prev) => prev.filter((_, j) => j !== i))} aria-label={`Remove ${f.name}`}>
                              <Trash2 className="h-4 w-4" />
                            </button>
                          </li>
                        ))}
                      </ul>
                    )}
                  </CardContent>
                </Card>

                <Card>
                  <CardContent className="pt-6 space-y-4">
                    <label className="flex items-start gap-3 text-sm">
                      <Checkbox className="mt-0.5" checked={consent} onCheckedChange={(v) => setConsent(!!v)} />
                      <span>
                        I confirm that all the relevant consent has been obtained from the candidate(s) listed above to
                        request these background checks, and that the information provided is correct.
                      </span>
                    </label>
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <Button variant="outline" onClick={() => setMode(null)}><ChevronLeft className="h-4 w-4 mr-1" /> Back</Button>
                      <Button className="bg-red-600 hover:bg-red-700 min-h-[44px]" disabled={submitting} onClick={() => void submitRequest()}>
                        {submitting ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null}
                        {submitting ? "Submitting…" : "Submit request"}
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              </div>
            )}
          </div>
        )}

        {/* Step 4: success */}
        {step === 4 && result && (
          <Card>
            <CardContent className="pt-8 pb-8 text-center space-y-4">
              <CheckCircle2 className="h-14 w-14 mx-auto text-emerald-600" />
              <h2 className="text-xl font-bold">Request submitted</h2>
              <p className="text-sm text-muted-foreground">Your order number for {chosenStore?.client_name} is:</p>
              <p className="text-2xl font-mono font-bold text-red-600 break-words">{result.order_number}</p>
              <p className="text-sm text-muted-foreground max-w-md mx-auto">
                A confirmation email has been sent to <strong>{submitter.email}</strong>. You will receive another
                email when the order is processed, and the report follows once the checks are complete.
              </p>
              <div className="flex flex-wrap justify-center gap-3 pt-2">
                <Button onClick={resetForAnother}>Submit another request</Button>
                <Button variant="outline" onClick={() => setFinished(true)}>No, I'm done</Button>
              </div>
            </CardContent>
          </Card>
        )}
      </main>

      <footer className="border-t py-4">
        <p className="text-center text-xs text-muted-foreground px-4">
          PreAppliCheck — a division of True Lie Detectors &amp; Vetting · We process personal information in accordance
          with the Protection of Personal Information Act (POPIA) ·{" "}
          <a href="/privacy-policy" className="underline">Privacy Policy</a>
        </p>
      </footer>
    </div>
  );
}

function CandidateCard({ title, row, onChange, onGenderPick, onRemove }: {
  title: string;
  row: CandidateRow;
  onChange: (patch: Partial<CandidateRow>) => void;
  onGenderPick: (g: "M" | "F") => void;
  onRemove?: () => void;
}) {
  const parsedId = parseSaId(row.id_number);
  const fromId = !!parsedId && !row.genderExplicit;
  return (
    <Card>
      <CardContent className="pt-5 space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="font-semibold text-sm">{title}</h3>
          {onRemove && (
            <button onClick={onRemove} className="min-w-[44px] min-h-[44px] flex items-center justify-center text-red-600" aria-label="Remove candidate">
              <Trash2 className="h-4 w-4" />
            </button>
          )}
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor={`c-id-${row.key}`}>ID number</Label>
            <Input id={`c-id-${row.key}`} className="min-h-[44px] text-base" inputMode="numeric" value={row.id_number}
              onChange={(e) => onChange({ id_number: e.target.value.trim() })} />
            {parsedId && (
              <p className="text-xs text-muted-foreground">
                {parsedId.gender === "M" ? "Male" : "Female"} · {parsedId.date_of_birth} (from ID)
              </p>
            )}
          </div>
          <div className="space-y-1.5">
            <Label htmlFor={`c-first-${row.key}`}>First name</Label>
            <Input id={`c-first-${row.key}`} className="min-h-[44px] text-base" value={row.first_name}
              onChange={(e) => onChange({ first_name: e.target.value })} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor={`c-last-${row.key}`}>Surname</Label>
            <Input id={`c-last-${row.key}`} className="min-h-[44px] text-base" value={row.surname}
              onChange={(e) => onChange({ surname: e.target.value })} />
          </div>
          <div className="space-y-1.5">
            <Label>Gender {fromId && <span className="text-xs text-muted-foreground font-normal">(auto-filled — tap to change)</span>}</Label>
            <div className="flex gap-2">
              {(["M", "F"] as const).map((g) => (
                <button key={g} type="button" onClick={() => onGenderPick(g)}
                  className={`min-h-[44px] flex-1 rounded-md border text-sm transition-colors ${row.gender === g ? "border-red-600 bg-red-50 font-semibold" : "hover:bg-muted/50"}`}>
                  {g === "M" ? "Male" : "Female"}
                </button>
              ))}
            </div>
          </div>
          <div className="space-y-1.5 sm:col-span-2">
            <Label htmlFor={`c-dob-${row.key}`}>Date of birth</Label>
            <Input id={`c-dob-${row.key}`} type="date" className="min-h-[44px] text-base" value={row.date_of_birth ?? ""}
              onChange={(e) => onChange({ date_of_birth: e.target.value || null })} />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
