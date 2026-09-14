import { useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import * as XLSX from "xlsx";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { Upload, FileSpreadsheet, CheckCircle2, XCircle, Download, Loader2, Search } from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { isPlaceholderCandidate } from "@/lib/manualRiskPdf";
import {
  downloadOrderDocuments, type DownloadWhat, type OrderDocsTarget,
} from "@/lib/clientDocumentDownload";
import { logClientEvent, makeSearchLogger } from "@/lib/clientAudit";

const sb = supabase as any;

type Row = {
  key: string;
  firstName: string;
  surname: string;
  idNumber: string;
  matched: boolean;
  matchedOn: "id" | "name" | null;
  account: string;
  order: string;
  screenedOn: string;
  /** The order the match belongs to, so its documents can be downloaded. */
  subId: string | null;
  released: boolean;
  indemnities: { path: string; name?: string }[];
};

const normId = (v: any) => {
  let s = String(v ?? "").replace(/\D/g, "");
  if (s && s.length >= 9 && s.length < 13) s = s.padStart(13, "0");
  return s;
};
const normName = (v: any) =>
  String(v ?? "").toLowerCase().replace(/[^a-z]/g, "");

const pick = (row: Record<string, any>, keys: string[]) => {
  for (const k of Object.keys(row)) {
    const kk = k.toLowerCase().replace(/[^a-z]/g, "");
    if (keys.includes(kk)) {
      const v = row[k];
      if (v !== null && v !== undefined && String(v).trim() !== "") return String(v).trim();
    }
  }
  return "";
};

export function MrEmployeeCheckTab({
  clients,
}: {
  clients: { id: string; client_name: string }[];
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [rows, setRows] = useState<Row[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [fileName, setFileName] = useState("");
  const [search, setSearch] = useState("");
  const [shown, setShown] = useState(100);



  // Searches and downloads on this screen are written to the profile's audit trail.
  const logSearch = useRef(makeSearchLogger("people on record in Employee Check")).current;

  const clientById = useMemo(() => new Map(clients.map((c) => [c.id, c.client_name])), [clients]);

  const { data: records = [], isLoading } = useQuery({
    queryKey: ["mra-employee-check-records"],
    queryFn: async () => {
      const all: any[] = [];
      for (let from = 0; ; from += 1000) {
        const { data, error } = await sb
          .from("manual_risk_candidates")
          .select("id, submission_id, id_number, passport_number, surname, first_name, override_client_id, id_verification_result, risk_assessment_result")
          .range(from, from + 999);
        if (error) throw error;
        all.push(...(data ?? []));
        if (!data || data.length < 1000) break;
      }
      const subs: any[] = [];
      for (let from = 0; ; from += 1000) {
        const { data, error } = await sb
          .from("manual_risk_submissions")
          .select("id, order_number, client_id, created_at, sent_at, indemnity_files")
          .range(from, from + 999);
        if (error) throw error;
        subs.push(...(data ?? []));
        if (!data || data.length < 1000) break;
      }
      const subById = new Map(subs.map((s) => [s.id, s]));
      return all
        .filter((c) => !isPlaceholderCandidate(c as any))
        .map((c) => ({ ...c, sub: subById.get(c.submission_id) }));
    },
  });


  const byId = useMemo(() => {
    const m = new Map<string, any>();
    for (const r of records) {
      const k = normId(r.id_number);
      if (k && !m.has(k)) m.set(k, r);
    }
    return m;
  }, [records]);

  /** Passport / permit numbers, so foreign nationals are found too. */
  const byDoc = useMemo(() => {
    const m = new Map<string, any>();
    for (const r of records) {
      for (const v of [r.passport_number, r.id_number]) {
        const k = String(v ?? "").toUpperCase().replace(/[^A-Z0-9]/g, "");
        if (k.length >= 5 && !/^\d{13}$/.test(k) && !m.has(k)) m.set(k, r);
      }
    }
    return m;
  }, [records]);


  const byName = useMemo(() => {
    const m = new Map<string, any>();
    for (const r of records) {
      const k = normName(r.surname) + "|" + normName(r.first_name);
      if (k !== "|" && !m.has(k)) m.set(k, r);
    }
    return m;
  }, [records]);

  const describe = (r: any) => ({
    account: clientById.get(r.override_client_id ?? r.sub?.client_id ?? "") ?? "—",
    order: r.sub?.order_number ?? "—",
    screenedOn: r.sub?.created_at ? new Date(r.sub.created_at).toLocaleDateString() : "—",
    subId: r.sub?.id ?? null,
    released: !!r.sub?.sent_at,
    indemnities: (Array.isArray(r.sub?.indemnity_files) ? r.sub.indemnity_files : [])
      .map((f: any) => ({ path: String(f?.path ?? ""), name: f?.name }))
      .filter((f: any) => f.path),
  });

  const handleFile = async (file: File) => {
    setBusy(true);
    setFileName(file.name);
    try {
      const buf = await file.arrayBuffer();
      const wb = XLSX.read(buf, { type: "array" });
      const sheet = wb.Sheets[wb.SheetNames[0]];
      const raw = XLSX.utils.sheet_to_json<Record<string, any>>(sheet, { defval: "" });
      if (!raw.length) { toast.error("No rows found in that file"); return; }

      const out: Row[] = raw.map((r, i) => {
        const rawDoc = pick(r, ["idnumber", "id", "idno", "identitynumber", "sanumber", "passport", "passportnumber", "passportno"]);
        const idNumber = normId(rawDoc);
        const docKey = String(rawDoc).toUpperCase().replace(/[^A-Z0-9]/g, "");
        const fullName = pick(r, ["fullname", "name", "names", "employee", "employeename"]);
        let firstName = pick(r, ["firstname", "firstnames", "name", "initials", "givenname"]);
        let surname = pick(r, ["surname", "lastname", "familyname"]);
        if (!surname && fullName.includes(" ")) {
          const parts = fullName.trim().split(/\s+/);
          surname = parts[parts.length - 1];
          firstName = parts.slice(0, -1).join(" ");
        }
        const idHit = (idNumber && byId.get(idNumber)) || (docKey && byDoc.get(docKey));
        const hit = idHit || byName.get(normName(surname) + "|" + normName(firstName));
        const matchedOn: Row["matchedOn"] = !hit ? null : idHit ? "id" : "name";

        const info = hit
          ? describe(hit)
          : { account: "—", order: "—", screenedOn: "—", subId: null, released: false, indemnities: [] };
        return {
          key: `${i}-${idNumber || surname}`,
          firstName, surname, idNumber,
          matched: !!hit,
          matchedOn,
          ...info,
        };
      }).filter((r) => r.idNumber || r.surname || r.firstName);

      setRows(out);
      const found = out.filter((r) => r.matched).length;
      void logClientEvent("search", `Checked an employee list (${file.name}) against the screening records`, {
        where: "employee-check-upload", file: file.name, checked: out.length, onRecord: found,
      });
      toast.success(`${found} of ${out.length} employee(s) have a screening record`);
    } catch (e: any) {
      toast.error("Could not read that file: " + (e?.message ?? String(e)));
    } finally {
      setBusy(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  const downloadResults = () => {
    if (!rows?.length) return;
    const header = ["First name", "Surname", "ID number", "On record", "Matched by", "Account", "Order", "Screened on"];
    const csv = [header, ...rows.map((r) => [
      r.firstName, r.surname, r.idNumber, r.matched ? "Yes" : "No",
      r.matchedOn ?? "", r.account, r.order, r.screenedOn,
    ])]
      .map((line) => line.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(","))
      .join("\n");
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = "employee-screening-check.csv";
    a.click();
    URL.revokeObjectURL(url);
  };

  const downloadTemplate = () => {
    const csv = "First Name,Surname,ID Number\nJohn,Doe,8001015009087\n";
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = "employee-list-template.csv";
    a.click();
    URL.revokeObjectURL(url);
  };

  /** Shared download of released documents for a set of orders. */
  const [what, setWhat] = useState<DownloadWhat>("both");
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [pickedRows, setPickedRows] = useState<Set<string>>(new Set());
  const [pickedPeople, setPickedPeople] = useState<Set<string>>(new Set());

  const runDownload = async (targets: OrderDocsTarget[], key: string, zipName: string) => {
    const seen = new Set<string>();
    const unique = targets.filter((t) => {
      if (!t.submissionId || seen.has(t.submissionId)) return false;
      seen.add(t.submissionId);
      return true;
    });
    if (!unique.length) { toast.error("No released documents for that selection"); return; }
    setBusyKey(key);
    try {
      const { files, missing } = await downloadOrderDocuments(unique, what, { zipName });
      if (!files) toast.error("None of these documents are available to download yet");
      else toast.success(`${files} document(s) downloaded`);
      if (files) {
        void logClientEvent(
          "download",
          `Downloaded ${what === "report" ? "report(s)" : what === "indemnities" ? "indemnities" : "report(s) and indemnities"} for ${unique.length} order(s) from Employee Check`,
          { where: "employee-check", what, orders: unique.map((t) => t.orderNumber), files },
        );
      }
      if (missing.length) {
        toast.warning(
          `Not available: ${missing.slice(0, 5).join("; ")}${missing.length > 5 ? ` and ${missing.length - 5} more` : ""}`,
        );
      }
    } catch (e: any) {
      toast.error(e?.message ?? String(e));
    } finally {
      setBusyKey(null);
    }
  };

  const WhatPicker = () => (
    <Select value={what} onValueChange={(v) => setWhat(v as DownloadWhat)}>
      <SelectTrigger className="h-9 w-48"><SelectValue /></SelectTrigger>
      <SelectContent>
        <SelectItem value="report">Report only</SelectItem>
        <SelectItem value="indemnities">Indemnities only</SelectItem>
        <SelectItem value="both">Report and indemnities</SelectItem>
      </SelectContent>
    </Select>
  );

  const personTarget = (r: any): OrderDocsTarget => ({
    submissionId: r.sub?.id ?? "",
    orderNumber: r.sub?.order_number ?? "order",
    indemnities: (Array.isArray(r.sub?.indemnity_files) ? r.sub.indemnity_files : [])
      .map((f: any) => ({ path: String(f?.path ?? ""), name: f?.name }))
      .filter((f: any) => f.path),
  });

  const found = rows?.filter((r) => r.matched).length ?? 0;
  const missing = (rows?.length ?? 0) - found;

  /** Everyone on record, newest screening first, filtered by the search box. */
  const people = useMemo(() => {
    const q = search.trim().toLowerCase();
    const list = [...records].sort((a, b) =>
      String(b.sub?.created_at ?? "").localeCompare(String(a.sub?.created_at ?? "")));
    if (!q) return list;
    const qDigits = q.replace(/\D/g, "");
    return list.filter((r) => {
      const hay = [r.first_name, r.surname, r.id_number, r.passport_number, r.sub?.order_number,
        clientById.get(r.override_client_id ?? r.sub?.client_id ?? "")]
        .map((v) => String(v ?? "").toLowerCase());
      if (hay.some((v) => v.includes(q))) return true;
      if (qDigits.length >= 4) {
        const id = String(r.id_number ?? "").replace(/\D/g, "");
        if (id.includes(qDigits)) return true;
      }
      return false;
    });
  }, [records, search, clientById]);

  const downloadPeople = () => {
    const header = ["First name", "Surname", "ID number", "Passport number", "Account", "Order", "Screened on"];
    const csv = [header, ...people.map((r) => [
      r.first_name ?? "", r.surname ?? "", r.id_number ?? "", r.passport_number ?? "",
      clientById.get(r.override_client_id ?? r.sub?.client_id ?? "") ?? "",
      r.sub?.order_number ?? "",
      r.sub?.created_at ? new Date(r.sub.created_at).toLocaleDateString() : "",
    ])]
      .map((line) => line.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(","))
      .join("\n");
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = "screening-records.csv";
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-5">
      <Card className="p-5 border-slate-200/80">
        <div className="flex items-center gap-2 mb-2">
          <Search className="h-4 w-4 text-red-600" />
          <h3 className="font-semibold">Everyone on record</h3>
        </div>
        <p className="text-sm text-muted-foreground mb-4">
          Search by name, surname, ID number or passport number to see whether someone has a
          screening on record.
        </p>
        <div className="flex flex-wrap items-center gap-2 mb-4">
          <Input
            value={search}
            onChange={(e) => { setSearch(e.target.value); setShown(100); logSearch(e.target.value); }}
            placeholder="Search name, surname, ID number or passport number"
            className="max-w-md"
          />
          <Badge variant="outline">{people.length} of {records.length} person(s)</Badge>
          <Button variant="outline" onClick={downloadPeople} disabled={!people.length}>
            <Download className="h-4 w-4 mr-2" />Download list (CSV)
          </Button>
          <WhatPicker />
          <Button
            variant="outline"
            disabled={!pickedPeople.size || !!busyKey}
            onClick={() => runDownload(
              people.filter((r) => pickedPeople.has(r.id) && r.sub?.sent_at).map(personTarget),
              "people-selected", "selected-screening-documents",
            )}
          >
            <Download className="h-4 w-4 mr-2" />
            {busyKey === "people-selected" ? "Preparing…" : `Download selected (${pickedPeople.size})`}
          </Button>
          <Button
            className="bg-red-600 hover:bg-red-700"
            disabled={!people.length || !!busyKey}
            onClick={() => runDownload(
              people.filter((r) => r.sub?.sent_at).map(personTarget),
              "people-all", "screening-documents",
            )}
          >
            <Download className="h-4 w-4 mr-2" />
            {busyKey === "people-all" ? "Preparing…" : "Download all shown"}
          </Button>
        </div>
        {isLoading ? (
          <p className="text-sm text-muted-foreground flex items-center gap-2">
            <Loader2 className="h-3.5 w-3.5 animate-spin" /> Loading records…
          </p>
        ) : (
          <>
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-10">
                      <Checkbox
                        checked={pickedPeople.size > 0 && people.slice(0, shown).every((r) => pickedPeople.has(r.id))}
                        onCheckedChange={(v) => setPickedPeople(
                          v ? new Set(people.slice(0, shown).map((r) => r.id)) : new Set(),
                        )}
                      />
                    </TableHead>
                    <TableHead>First name</TableHead>
                    <TableHead>Surname</TableHead>
                    <TableHead>ID number</TableHead>
                    <TableHead>Passport number</TableHead>
                    <TableHead>Account</TableHead>
                    <TableHead>Order #</TableHead>
                    <TableHead>Screened on</TableHead>
                    <TableHead className="w-10"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {people.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={9} className="text-center text-muted-foreground py-6">
                        Nobody on record matches that search.
                      </TableCell>
                    </TableRow>
                  ) : people.slice(0, shown).map((r) => (
                    <TableRow key={r.id}>
                      <TableCell>
                        <Checkbox
                          checked={pickedPeople.has(r.id)}
                          disabled={!r.sub?.sent_at}
                          onCheckedChange={() => setPickedPeople((prev) => {
                            const next = new Set(prev);
                            if (next.has(r.id)) next.delete(r.id); else next.add(r.id);
                            return next;
                          })}
                        />
                      </TableCell>
                      <TableCell className="text-sm">{r.first_name || "—"}</TableCell>
                      <TableCell className="text-sm">{r.surname || "—"}</TableCell>
                      <TableCell className="font-mono text-xs">{r.id_number || "—"}</TableCell>
                      <TableCell className="font-mono text-xs">{r.passport_number || "—"}</TableCell>
                      <TableCell className="text-sm">
                        {clientById.get(r.override_client_id ?? r.sub?.client_id ?? "") ?? "—"}
                      </TableCell>
                      <TableCell className="font-mono text-xs">{r.sub?.order_number ?? "—"}</TableCell>
                      <TableCell className="text-sm">
                        {r.sub?.created_at ? new Date(r.sub.created_at).toLocaleDateString() : "—"}
                      </TableCell>
                      <TableCell>
                        <Button
                          variant="ghost"
                          size="icon"
                          disabled={!r.sub?.sent_at || !!busyKey}
                          title={r.sub?.sent_at ? "Download this person's documents" : "Not released yet"}
                          onClick={() => runDownload([personTarget(r)], `person-${r.id}`, `${r.sub?.order_number ?? "order"}-documents`)}
                        >
                          <Download className={busyKey === `person-${r.id}` ? "h-4 w-4 animate-pulse" : "h-4 w-4 text-emerald-700"} />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
            {people.length > shown && (
              <div className="pt-3">
                <Button variant="outline" onClick={() => setShown((n) => n + 200)}>
                  Show more ({people.length - shown} left)
                </Button>
              </div>
            )}
          </>
        )}
      </Card>

      <Card className="p-5 border-slate-200/80">
        <div className="flex items-center gap-2 mb-2">
          <FileSpreadsheet className="h-4 w-4 text-red-600" />
          <h3 className="font-semibold">Check your employees against our records</h3>
        </div>

        <p className="text-sm text-muted-foreground mb-4">
          Upload a list of your staff with their names and ID numbers. Everyone who already has a
          screening on record shows in green, and anyone without a record shows in red.
        </p>
        <div className="flex flex-wrap items-center gap-2">
          <input
            ref={fileRef}
            type="file"
            accept=".csv,.xls,.xlsx"
            className="hidden"
            onChange={(e) => { const f = e.target.files?.[0]; if (f) void handleFile(f); }}
          />
          <Button onClick={() => fileRef.current?.click()} disabled={busy || isLoading}>
            {busy || isLoading ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Upload className="h-4 w-4 mr-2" />}
            {isLoading ? "Loading records…" : "Upload employee list"}
          </Button>
          <Button variant="outline" onClick={downloadTemplate}>
            <Download className="h-4 w-4 mr-2" />Download template
          </Button>
          {rows && rows.length > 0 && (
            <Button variant="outline" onClick={downloadResults}>
              <Download className="h-4 w-4 mr-2" />Download results
            </Button>
          )}
          {fileName && <span className="text-xs text-muted-foreground">{fileName}</span>}
        </div>
      </Card>

      {rows && (
        <Card className="p-5 border-slate-200/80">
          <div className="flex flex-wrap items-center gap-3 mb-4">
            <Badge className="bg-emerald-600 hover:bg-emerald-600">{found} on record</Badge>
            <Badge className="bg-rose-600 hover:bg-rose-600">{missing} not on record</Badge>
            <span className="text-xs text-muted-foreground">{rows.length} employee(s) checked</span>
            <div className="flex-1" />
            <WhatPicker />
            <Button
              variant="outline"
              disabled={!pickedRows.size || !!busyKey}
              onClick={() => runDownload(
                rows.filter((r) => pickedRows.has(r.key) && r.released && r.subId)
                  .map((r) => ({ submissionId: r.subId!, orderNumber: r.order, indemnities: r.indemnities })),
                "rows-selected", "selected-employee-documents",
              )}
            >
              <Download className="h-4 w-4 mr-2" />
              {busyKey === "rows-selected" ? "Preparing…" : `Download selected (${pickedRows.size})`}
            </Button>
            <Button
              className="bg-red-600 hover:bg-red-700"
              disabled={!found || !!busyKey}
              onClick={() => runDownload(
                rows.filter((r) => r.matched && r.released && r.subId)
                  .map((r) => ({ submissionId: r.subId!, orderNumber: r.order, indemnities: r.indemnities })),
                "rows-all", "employee-documents",
              )}
            >
              <Download className="h-4 w-4 mr-2" />
              {busyKey === "rows-all" ? "Preparing…" : "Download all on record"}
            </Button>
          </div>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-10">
                    <Checkbox
                      checked={pickedRows.size > 0 && rows.filter((r) => r.matched && r.released).every((r) => pickedRows.has(r.key))}
                      onCheckedChange={(v) => setPickedRows(
                        v ? new Set(rows.filter((r) => r.matched && r.released).map((r) => r.key)) : new Set(),
                      )}
                    />
                  </TableHead>
                  <TableHead>First name</TableHead>
                  <TableHead>Surname</TableHead>
                  <TableHead>ID number</TableHead>
                  <TableHead>On record</TableHead>
                  <TableHead>Account</TableHead>
                  <TableHead>Order #</TableHead>
                  <TableHead>Screened on</TableHead>
                  <TableHead className="w-10"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={9} className="text-center text-muted-foreground py-6">
                      No usable rows in that file.
                    </TableCell>
                  </TableRow>
                ) : rows.map((r) => (
                  <TableRow key={r.key} className={r.matched ? "bg-emerald-50/70" : "bg-rose-50/70"}>
                    <TableCell>
                      <Checkbox
                        checked={pickedRows.has(r.key)}
                        disabled={!r.matched || !r.released}
                        onCheckedChange={() => setPickedRows((prev) => {
                          const next = new Set(prev);
                          if (next.has(r.key)) next.delete(r.key); else next.add(r.key);
                          return next;
                        })}
                      />
                    </TableCell>
                    <TableCell className="text-sm">{r.firstName || "—"}</TableCell>
                    <TableCell className="text-sm">{r.surname || "—"}</TableCell>
                    <TableCell className="font-mono text-xs">{r.idNumber || "—"}</TableCell>
                    <TableCell>
                      {r.matched ? (
                        <span className="inline-flex items-center gap-1 text-emerald-700 text-sm font-medium">
                          <CheckCircle2 className="h-4 w-4" />
                          {r.matchedOn === "name" ? "Yes (name match)" : "Yes"}
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-rose-700 text-sm font-medium">
                          <XCircle className="h-4 w-4" /> No record
                        </span>
                      )}
                    </TableCell>
                    <TableCell className="text-sm">{r.account}</TableCell>
                    <TableCell className="font-mono text-xs">{r.order}</TableCell>
                    <TableCell className="text-sm">{r.screenedOn}</TableCell>
                    <TableCell>
                      <Button
                        variant="ghost"
                        size="icon"
                        disabled={!r.matched || !r.released || !!busyKey}
                        title={r.matched && r.released ? "Download this employee's documents" : "No released documents"}
                        onClick={() => runDownload(
                          [{ submissionId: r.subId!, orderNumber: r.order, indemnities: r.indemnities }],
                          `row-${r.key}`, `${r.order}-documents`,
                        )}
                      >
                        <Download className={busyKey === `row-${r.key}` ? "h-4 w-4 animate-pulse" : "h-4 w-4 text-emerald-700"} />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </Card>
      )}
    </div>
  );
}

export default MrEmployeeCheckTab;
