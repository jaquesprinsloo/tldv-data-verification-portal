import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell,
} from "recharts";
import { CHECK_COLUMNS, CHECK_META, isPlaceholderCandidate } from "@/lib/manualRiskPdf";
import {
  Users, ShieldCheck, Clock, AlertTriangle, CheckCircle2, Building2, Activity,
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
  label, value, sub, icon, tone = "slate",
}: {
  label: string; value: string | number; sub?: string; icon: React.ReactNode;
  tone?: "slate" | "emerald" | "amber" | "rose" | "blue";
}) {
  const ring =
    tone === "emerald" ? "bg-emerald-50 text-emerald-700 ring-emerald-100" :
    tone === "amber" ? "bg-amber-50 text-amber-700 ring-amber-100" :
    tone === "rose" ? "bg-rose-50 text-rose-700 ring-rose-100" :
    tone === "blue" ? "bg-blue-50 text-blue-700 ring-blue-100" :
    "bg-slate-100 text-slate-700 ring-slate-200";
  return (
    <Card className="p-5 border-slate-200/80 shadow-sm hover:shadow-md transition-shadow">
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

  const { data: candidates = [], isLoading } = useQuery<Cand[]>({
    queryKey: ["mra-client-dash-cands"],
    queryFn: async () => {
      const { data, error } = await sb.from("manual_risk_candidates").select("*");
      if (error) throw error;
      return (data as Cand[]).filter((c) => !isPlaceholderCandidate(c as any));
    },
  });

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

  const stats = useMemo(() => {
    let total = 0, pendingChecks = 0, completedCands = 0, flagged = 0, idInvalid = 0;
    const perAccount = new Map<string, number>();
    const perCheck = new Map<string, { done: number; pending: number }>();

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
      if (candPending > 0) pendingChecks += 1; else completedCands += 1;
      if (candFlag) flagged += 1;
      const idv = c[CHECK_COLUMNS.id_verification.result] as string | null;
      if (idv && ["invalid", "deceased"].includes(idv)) idInvalid += 1;
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

    return { total, pendingChecks, completedCands, flagged, idInvalid, accountBars, checkBars, accounts: perAccount.size };
  }, [candidates, subById, rangedSubIds, clientById]);

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
          sub="Awaiting verification feedback" />
        <Kpi label="Risk identified" value={stats.flagged} icon={<AlertTriangle className="h-5 w-5" />} tone="rose"
          sub="Candidates with an adverse finding" />
        <Kpi label="ID not valid" value={stats.idInvalid} icon={<ShieldCheck className="h-5 w-5" />} tone="slate"
          sub="Invalid or deceased on Home Affairs" />
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
    </div>
  );
}

export default MrClientDashboardTab;
