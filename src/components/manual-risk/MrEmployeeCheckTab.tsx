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
import { toast } from "sonner";
import { Upload, FileSpreadsheet, CheckCircle2, XCircle, Download, Loader2 } from "lucide-react";
import { isPlaceholderCandidate } from "@/lib/manualRiskPdf";

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
          .select("id, order_number, client_id, created_at")
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

        const info = hit ? describe(hit) : { account: "—", order: "—", screenedOn: "—" };
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

  const found = rows?.filter((r) => r.matched).length ?? 0;
  const missing = (rows?.length ?? 0) - found;

  return (
    <div className="space-y-5">
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
          </div>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>First name</TableHead>
                  <TableHead>Surname</TableHead>
                  <TableHead>ID number</TableHead>
                  <TableHead>On record</TableHead>
                  <TableHead>Account</TableHead>
                  <TableHead>Order #</TableHead>
                  <TableHead>Screened on</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center text-muted-foreground py-6">
                      No usable rows in that file.
                    </TableCell>
                  </TableRow>
                ) : rows.map((r) => (
                  <TableRow key={r.key} className={r.matched ? "bg-emerald-50/70" : "bg-rose-50/70"}>
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
