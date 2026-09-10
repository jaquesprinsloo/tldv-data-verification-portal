import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell,
} from "recharts";
import { CHECK_COLUMNS, CHECK_META, isPlaceholderCandidate, generateManualRiskPdf, type ManualRiskCandidatePdf } from "@/lib/manualRiskPdf";
import { PdfPreview } from "@/pages/ManualRiskAssessments";
import { toast } from "sonner";
import {
  Users, ShieldCheck, Clock, AlertTriangle, CheckCircle2, Building2, Activity, Eye, Loader2,
} from "lucide-react";

const sb = supabase as any;

export type ClientDashSubmission = {
  id: string;
  order_number: string;
  client_id: string | null;
  created_at: string;
  sent_at: string | null;
  status: string;
  requested_checks: string[] | null;
};

type Cand = Record<string, any> & {
  id: string;
  submission_id: string;
  override_client_id: string | null;
  id_number: string;
  surname: string;
  first_name: string;
};

const ADVERSE: Record<string, string[]> = {
  credit: ["medium", "high", "very_high"],
  criminal: ["record_found"],
  risk_assessment: ["risk_identified"],
  drivers_license: ["invalid", "expired"],
  pdp: ["invalid", "expired"],
  qualification: ["not_verified"],
  id_verification: ["invalid", "deceased"],
};

function Kpi({
  label, value, sub, icon, tone = "slate", onClick,
}: {
  label: string; value: string | number; sub?: string; icon: React.ReactNode;
  tone?: "slate" | "emerald" | "amber" | "rose" | "blue";
  onClick?: () => void;
}) {
  const ring =
    tone === "emerald" ? "bg-emerald-50 text-emerald-700 ring-emerald-100" :
    tone === "amber" ? "bg-amber-50 text-amber-700 ring-amber-100" :
    tone === "rose" ? "bg-rose-50 text-rose-700 ring-rose-100" :
    tone === "blue" ? "bg-blue-50 text-blue-700 ring-blue-100" :
    "bg-slate-100 text-slate-700 ring-slate-200";
  return (
    <Card
      className={`p-5 border-slate-200/80 shadow-sm hover:shadow-md transition-shadow ${onClick ? "cursor-pointer hover:ring-2 hover:ring-slate-300" : ""}`}
      onClick={onClick}
      role={onClick ? "button" : undefined}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[11px] uppercase tracking-wide text-muted-foreground font-medium">{label}</p>
          <p className="text-3xl font-semibold mt-1 tabular-nums">{value}</p>
          {sub && <p className="text-xs text-muted-foreground mt-1 truncate">{sub}</p>}
        </div>
        <span className={`shrink-0 rounded-xl p-2.5 ring-1 ${ring}`}>{icon}</span>
      </div>
    </Card>
  );
}

export function MrClientDashboardTab({
  submissions, clients,
}: {
  submissions: ClientDashSubmission[];
  clients: { id: string; client_name: string }[];
}) {
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");

  const qc = useQueryClient();

  const { data: candidates = [], isLoading } = useQuery<Cand[]>({
    queryKey: ["mra-client-dash-cands"],
    queryFn: async () => {
      // Page through all rows — PostgREST caps a single select at 1000 rows.
      const all: Cand[] = [];
      for (let from = 0; ; from += 1000) {
        const { data, error } = await sb.from("manual_risk_candidates").select("*").range(from, from + 999);
        if (error) throw error;
        all.push(...((data ?? []) as Cand[]));
        if (!data || data.length < 1000) break;
      }
      return all.filter((c) => !isPlaceholderCandidate(c as any));
    },
  });

  // Live refresh: new submissions, saved results and released reports show up
  // without the viewer having to reload the page.
  useEffect(() => {
    const bump = () => {
      qc.invalidateQueries({ queryKey: ["mra-client-dash-cands"] });
      qc.invalidateQueries({ queryKey: ["mra-submissions"] });
    };
    const channel = supabase
      .channel("mra-client-dashboard-live")
      .on("postgres_changes", { event: "*", schema: "public", table: "manual_risk_submissions" }, bump)
      .on("postgres_changes", { event: "*", schema: "public", table: "manual_risk_candidates" }, bump)
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [qc]);

  const clientById = useMemo(() => new Map(clients.map((c) => [c.id, c])), [clients]);
  const subById = useMemo(() => new Map(submissions.map((s) => [s.id, s])), [submissions]);

  const inRange = (iso: string) => {
    const from = fromDate ? new Date(fromDate + "T00:00:00").getTime() : null;
    const to = toDate ? new Date(toDate + "T23:59:59").getTime() : null;
    const ts = new Date(iso).getTime();
    if (from !== null && ts < from) return false;
    if (to !== null && ts > to) return false;
    return true;
  };

  const rangedSubs = useMemo(
    () => submissions.filter((s) => inRange(s.created_at)),
    [submissions, fromDate, toDate],
  );
  const rangedSubIds = useMemo(() => new Set(rangedSubs.map((s) => s.id)), [rangedSubs]);

  type CandRow = { id: string; name: string; surname: string; idNumber: string; account: string; order: string; subId: string; released: boolean };

  const stats = useMemo(() => {
    let total = 0, pendingChecks = 0, completedCands = 0, flagged = 0, idInvalid = 0;
    const perAccount = new Map<string, number>();
    const perCheck = new Map<string, { done: number; pending: number }>();
    const pendingList: CandRow[] = [];
    const flaggedList: CandRow[] = [];
    const idInvalidList: CandRow[] = [];

    for (const c of candidates) {
      const s = subById.get(c.submission_id);
      if (!s || !rangedSubIds.has(s.id)) continue;
      // A released (report sent) submission is finished, regardless of any
      // blank result fields left behind on individual candidate rows.
      const released = !!s.sent_at;
      total += 1;

      const effId = c.override_client_id ?? s.client_id ?? "__unassigned__";
      const name = effId === "__unassigned__"
        ? "Unassigned"
        : clientById.get(effId)?.client_name ?? "Unassigned";
      perAccount.set(name, (perAccount.get(name) ?? 0) + 1);

      const row: CandRow = {
        id: c.id,
        name: c.first_name,
        surname: c.surname,
        idNumber: c.id_number,
        account: name,
        order: s.order_number,
        subId: s.id,
        released,
      };

      const active = (s.requested_checks?.length ? s.requested_checks : ["id_verification", "credit", "criminal"])
        .filter((k) => CHECK_COLUMNS[k]);
      let candPending = 0;
      let candFlag = false;
      for (const k of active) {
        const v = c[CHECK_COLUMNS[k].result] as string | null;
        const entry = perCheck.get(k) ?? { done: 0, pending: 0 };
        if ((!v || v === "pending") && !released) { candPending += 1; entry.pending += 1; }
        else {
          entry.done += 1;
          if (v && (ADVERSE[k] ?? []).includes(v)) candFlag = true;
        }
        perCheck.set(k, entry);
      }
      if (candPending > 0) { pendingChecks += 1; pendingList.push(row); } else completedCands += 1;
      if (candFlag) { flagged += 1; flaggedList.push(row); }
      const idv = c[CHECK_COLUMNS.id_verification.result] as string | null;
      if (idv && ["invalid", "deceased"].includes(idv)) { idInvalid += 1; idInvalidList.push(row); }
    }

    const accountBars = Array.from(perAccount.entries())
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 8);

    const checkBars = Array.from(perCheck.entries()).map(([k, v]) => ({
      name: CHECK_META[k]?.short ?? k,
      Completed: v.done,
      "In progress": v.pending,
    }));

    return { total, pendingChecks, completedCands, flagged, idInvalid, accountBars, checkBars, accounts: perAccount.size, pendingList, flaggedList, idInvalidList };
  }, [candidates, subById, rangedSubIds, clientById]);

  const [listView, setListView] = useState<null | "pending" | "flagged" | "idInvalid">(null);
  const [reportPreview, setReportPreview] = useState<{ blob: Blob; title: string } | null>(null);
  const [previewingSub, setPreviewingSub] = useState<string | null>(null);

  // Renders the exact report that was sent for the candidate's submission,
  // using the same unencrypted in-app preview the Accounts tab uses.
  const viewReport = async (row: CandRow) => {
    setPreviewingSub(row.subId);
    try {
      const [{ data: sub, error: subErr }, { data: cands, error: candErr }, { data: settings }] = await Promise.all([
        sb.from("manual_risk_submissions").select("*").eq("id", row.subId).single(),
        sb.from("manual_risk_candidates").select("*").eq("submission_id", row.subId).order("sort_order", { ascending: true }),
        sb.from("manual_risk_settings").select("terms_and_conditions").limit(1).maybeSingle(),
      ]);
      if (subErr) throw subErr;
      if (candErr) throw candErr;

      let client: any = null;
      if (sub.client_id) {
        const { data } = await sb.from("manual_risk_clients").select("*").eq("id", sub.client_id).maybeSingle();
        client = data;
      }

      const activeChecks = (sub.requested_checks?.length
        ? sub.requested_checks
        : ["id_verification", "credit", "criminal"]
      ).filter((k: string) => CHECK_COLUMNS[k]);

      const pdfCandidates: ManualRiskCandidatePdf[] = (cands ?? [])
        .filter((c: any) => !isPlaceholderCandidate(c))
        .map((c: any) => {
          const results: Record<string, string | null> = {};
          const notes: Record<string, string | null> = {};
          for (const k of activeChecks) {
            results[k] = c[CHECK_COLUMNS[k].result] ?? null;
            notes[k] = c[CHECK_COLUMNS[k].notes] ?? null;
          }
          return {
            id_number: c.id_number,
            surname: c.surname,
            first_name: c.first_name,
            results,
            notes,
            id_verification_data: c.id_verification_data ?? null,
          };
        });

      const blob = await generateManualRiskPdf({
        orderNumber: sub.order_number,
        clientName: client?.client_name,
        clientContact: client?.contact_person,
        clientEmail: client?.email,
        submissionType: sub.submission_type,
        candidates: pdfCandidates,
        termsAndConditions: settings?.terms_and_conditions ?? "",
        requestedChecks: activeChecks,
        skipEncryption: true,
      });
      setReportPreview({ blob, title: `PreAppliCheck Report — ${sub.order_number}` });
    } catch (e: any) {
      toast.error("Failed to load report: " + (e?.message ?? String(e)));
    } finally {
      setPreviewingSub(null);
    }
  };

  const inProgress = useMemo(
    () => rangedSubs
      .filter((s) => !s.sent_at && s.status !== "completed")
      .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
      .slice(0, 12),
    [rangedSubs],
  );

  const preset = (kind: "month" | "last-month" | "year") => {
    const now = new Date();
    const fmt = (d: Date) => d.toISOString().slice(0, 10);
    if (kind === "month") {
      setFromDate(fmt(new Date(now.getFullYear(), now.getMonth(), 1)));
      setToDate(fmt(new Date(now.getFullYear(), now.getMonth() + 1, 0)));
    } else if (kind === "last-month") {
      setFromDate(fmt(new Date(now.getFullYear(), now.getMonth() - 1, 1)));
      setToDate(fmt(new Date(now.getFullYear(), now.getMonth(), 0)));
    } else {
      setFromDate(fmt(new Date(now.getFullYear(), 0, 1)));
      setToDate(fmt(new Date(now.getFullYear(), 11, 31)));
    }
  };

  return (
    <div className="space-y-5">
      <Card className="p-4 border-slate-200/80">
        <div className="flex flex-wrap items-end gap-3">
          <div>
            <Label className="text-xs">From</Label>
            <Input type="date" value={fromDate} onChange={(e) => setFromDate(e.target.value)} className="h-9 w-40" />
          </div>
          <div>
            <Label className="text-xs">To</Label>
            <Input type="date" value={toDate} onChange={(e) => setToDate(e.target.value)} className="h-9 w-40" />
          </div>
          <div className="flex items-center gap-1">
            <Button variant="outline" size="sm" onClick={() => preset("month")}>This month</Button>
            <Button variant="outline" size="sm" onClick={() => preset("last-month")}>Last month</Button>
            <Button variant="outline" size="sm" onClick={() => preset("year")}>This year</Button>
            {(fromDate || toDate) && (
              <Button variant="ghost" size="sm" onClick={() => { setFromDate(""); setToDate(""); }}>All time</Button>
            )}
          </div>
          <div className="flex-1" />
          <p className="text-xs text-muted-foreground">
            {isLoading ? "Loading screening data…" : `${rangedSubs.length} submission(s) in view`}
          </p>
        </div>
      </Card>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
        <Kpi label="Candidates screened" value={stats.total} icon={<Users className="h-5 w-5" />} tone="blue"
          sub={`${stats.accounts} account(s)`} />
        <Kpi label="Completed" value={stats.completedCands} icon={<CheckCircle2 className="h-5 w-5" />} tone="emerald"
          sub={stats.total ? `${Math.round((stats.completedCands / stats.total) * 100)}% of candidates` : "—"} />
        <Kpi label="Still in progress" value={stats.pendingChecks} icon={<Clock className="h-5 w-5" />} tone="amber"
          sub="Awaiting verification feedback" onClick={() => setListView("pending")} />
        <Kpi label="Risk identified" value={stats.flagged} icon={<AlertTriangle className="h-5 w-5" />} tone="rose"
          sub="Candidates with an adverse finding" onClick={() => setListView("flagged")} />
        <Kpi label="ID not valid" value={stats.idInvalid} icon={<ShieldCheck className="h-5 w-5" />} tone="slate"
          sub="Invalid or deceased on Home Affairs" onClick={() => setListView("idInvalid")} />
      </div>

      <div className="grid gap-5 lg:grid-cols-2">
        <Card className="p-5 border-slate-200/80">
          <div className="flex items-center gap-2 mb-4">
            <Activity className="h-4 w-4 text-red-600" />
            <h3 className="font-semibold">Progress by check type</h3>
          </div>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={stats.checkBars} margin={{ top: 4, right: 8, left: -20, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                <XAxis dataKey="name" tick={{ fontSize: 11 }} interval={0} angle={-15} textAnchor="end" height={50} />
                <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
                <Tooltip />
                <Bar dataKey="Completed" stackId="a" fill="#059669" radius={[0, 0, 0, 0]} />
                <Bar dataKey="In progress" stackId="a" fill="#f59e0b" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>

        <Card className="p-5 border-slate-200/80">
          <div className="flex items-center gap-2 mb-4">
            <Building2 className="h-4 w-4 text-red-600" />
            <h3 className="font-semibold">Busiest accounts</h3>
          </div>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={stats.accountBars} layout="vertical" margin={{ top: 4, right: 16, left: 8, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#e2e8f0" />
                <XAxis type="number" tick={{ fontSize: 11 }} allowDecimals={false} />
                <YAxis type="category" dataKey="name" width={130} tick={{ fontSize: 11 }} />
                <Tooltip />
                <Bar dataKey="count" name="Candidates" radius={[0, 4, 4, 0]}>
                  {stats.accountBars.map((_, i) => (
                    <Cell key={i} fill={i === 0 ? "#dc2626" : "#94a3b8"} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>
      </div>

      <Card className="p-5 border-slate-200/80">
        <div className="flex items-center gap-2 mb-3">
          <Clock className="h-4 w-4 text-amber-600" />
          <h3 className="font-semibold">Checks still in progress</h3>
        </div>
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Order #</TableHead>
                <TableHead>Account</TableHead>
                <TableHead>Submitted</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {inProgress.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={4} className="text-center text-muted-foreground py-6">
                    Nothing outstanding — every check in this period is complete.
                  </TableCell>
                </TableRow>
              ) : inProgress.map((s) => (
                <TableRow key={s.id}>
                  <TableCell className="font-mono text-xs">{s.order_number}</TableCell>
                  <TableCell className="text-sm">
                    {s.client_id ? clientById.get(s.client_id)?.client_name ?? "Unassigned" : "Unassigned"}
                  </TableCell>
                  <TableCell className="text-sm">{new Date(s.created_at).toLocaleDateString()}</TableCell>
                  <TableCell>
                    <Badge className="bg-amber-500 hover:bg-amber-500 text-white">In progress</Badge>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </Card>

      <Dialog open={listView !== null} onOpenChange={(open) => { if (!open) setListView(null); }}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {listView === "pending" && `Candidates still in progress (${stats.pendingChecks})`}
              {listView === "flagged" && `Candidates with risk identified (${stats.flagged})`}
              {listView === "idInvalid" && `Candidates with invalid IDs (${stats.idInvalid})`}
            </DialogTitle>
          </DialogHeader>
          {(() => {
            const rows =
              listView === "pending" ? stats.pendingList :
              listView === "flagged" ? stats.flaggedList :
              listView === "idInvalid" ? stats.idInvalidList : [];
            return rows.length === 0 ? (
              <p className="text-sm text-muted-foreground py-6 text-center">No candidates in this category.</p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Name</TableHead>
                    <TableHead>Surname</TableHead>
                    <TableHead>ID Number</TableHead>
                    <TableHead>Account</TableHead>
                    {listView !== "pending" && <TableHead className="w-12 text-right">Report</TableHead>}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map((r) => (
                    <TableRow key={r.id}>
                      <TableCell className="text-sm">{r.name}</TableCell>
                      <TableCell className="text-sm">{r.surname}</TableCell>
                      <TableCell className="font-mono text-xs">{r.idNumber}</TableCell>
                      <TableCell className="text-sm">{r.account}</TableCell>
                      {listView !== "pending" && (
                        <TableCell className="text-right">
                          {r.released && (
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8"
                              title="View the report that was sent"
                              disabled={previewingSub === r.subId}
                              onClick={() => viewReport(r)}
                            >
                              {previewingSub === r.subId
                                ? <Loader2 className="h-4 w-4 animate-spin" />
                                : <Eye className="h-4 w-4" />}
                            </Button>
                          )}
                        </TableCell>
                      )}
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            );
          })()}
        </DialogContent>
      </Dialog>

      <Dialog open={!!reportPreview} onOpenChange={(open) => { if (!open) setReportPreview(null); }}>
        <DialogContent className="max-w-6xl h-[92vh] p-0 overflow-hidden flex flex-col">
          <DialogHeader className="px-4 pt-4 pb-2 border-b">
            <DialogTitle>{reportPreview?.title ?? "Report Preview"}</DialogTitle>
          </DialogHeader>
          {reportPreview && (
            <PdfPreview blob={reportPreview.blob} title={reportPreview.title} />
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

export default MrClientDashboardTab;
