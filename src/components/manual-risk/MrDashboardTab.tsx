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
import { CHECK_META, isPlaceholderCandidate } from "@/lib/manualRiskPdf";
import { BarChart3, Percent, FileText, Users } from "lucide-react";

const sb = supabase as any;

export type MrDashboardSubmission = {
  id: string;
  order_number: string;
  client_id: string | null;
  created_at: string;
  sent_at: string | null;
  requested_checks: string[] | null;
};

type Cand = {
  id: string;
  submission_id: string;
  override_client_id: string | null;
  invoice_batch_id: string | null;
  is_tldv_internal: boolean | null;
  is_ptvs_discount: boolean | null;
  id_number: string;
  surname: string;
  first_name: string;
};

const CHECK_KEYS = [
  "id_verification", "credit", "criminal", "risk_assessment",
  "drivers_license", "pdp", "qualification",
];

function Stat({ label, value, icon, tone = "default" }: {
  label: string; value: number | string; icon?: React.ReactNode; tone?: "default" | "amber" | "blue" | "emerald";
}) {
  const toneCls =
    tone === "amber" ? "border-amber-300 bg-amber-50" :
    tone === "blue" ? "border-blue-300 bg-blue-50" :
    tone === "emerald" ? "border-emerald-300 bg-emerald-50" : "";
  return (
    <Card className={`p-4 ${toneCls}`}>
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        {icon}
        <span>{label}</span>
      </div>
      <p className="text-2xl font-bold mt-1">{value}</p>
    </Card>
  );
}

export function MrDashboardTab({
  submissions, clients,
}: {
  submissions: MrDashboardSubmission[];
  clients: { id: string; client_name: string; is_regular?: boolean }[];
}) {
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");

  const { data: candidates = [], isLoading } = useQuery<Cand[]>({
    queryKey: ["mra-dashboard-cands"],
    queryFn: async () => {
      const { data, error } = await sb
        .from("manual_risk_candidates")
        .select("id, submission_id, override_client_id, invoice_batch_id, is_tldv_internal, is_ptvs_discount, id_number, surname, first_name");
      if (error) throw error;
      return (data as Cand[]).filter((c) => !isPlaceholderCandidate(c as any));
    },
  });

  const subById = useMemo(() => new Map(submissions.map((s) => [s.id, s])), [submissions]);
  const clientById = useMemo(() => new Map(clients.map((c) => [c.id, c])), [clients]);

  // Submissions inside the created-date range
  const rangedSubIds = useMemo(() => {
    const from = fromDate ? new Date(fromDate + "T00:00:00").getTime() : null;
    const to = toDate ? new Date(toDate + "T23:59:59").getTime() : null;
    const set = new Set<string>();
    for (const s of submissions) {
      const ts = new Date(s.created_at).getTime();
      if (from !== null && ts < from) continue;
      if (to !== null && ts > to) continue;
      set.add(s.id);
    }
    return set;
  }, [submissions, fromDate, toDate]);

  const scoped = useMemo(
    () => candidates.filter((c) => rangedSubIds.has(c.submission_id)),
    [candidates, rangedSubIds],
  );

  const stats = useMemo(() => {
    const perCheck: Record<string, number> = {};
    for (const k of CHECK_KEYS) perCheck[k] = 0;
    let internal = 0, ptvs = 0, invoiced = 0;
    for (const c of scoped) {
      const sub = subById.get(c.submission_id);
      const checks = (sub?.requested_checks?.length ? sub.requested_checks : ["id_verification", "credit", "criminal"]);
      for (const k of checks) if (k in perCheck) perCheck[k] += 1;
      if (c.is_tldv_internal) internal += 1;
      if (c.is_ptvs_discount) ptvs += 1;
      if (c.invoice_batch_id) invoiced += 1;
    }
    const subs = submissions.filter((s) => rangedSubIds.has(s.id));
    return {
      perCheck,
      internal,
      ptvs,
      invoiced,
      totalChecks: scoped.length,
      totalSubmissions: subs.length,
      sentSubmissions: subs.filter((s) => !!s.sent_at).length,
      openSubmissions: subs.filter((s) => !s.sent_at).length,
      notInvoiced: scoped.length - invoiced,
    };
  }, [scoped, subById, submissions, rangedSubIds]);

  const perClient = useMemo(() => {
    const m = new Map<string, { name: string; isRegular: boolean; checks: number; invoiced: number; discounted: number }>();
    for (const c of scoped) {
      const sub = subById.get(c.submission_id);
      const effId = c.override_client_id ?? sub?.client_id ?? "__unassigned__";
      if (!m.has(effId)) {
        const cl = effId === "__unassigned__" ? null : clientById.get(effId) ?? null;
        m.set(effId, {
          name: cl?.client_name ?? "Unassigned",
          isRegular: !!cl?.is_regular,
          checks: 0, invoiced: 0, discounted: 0,
        });
      }
      const g = m.get(effId)!;
      g.checks += 1;
      if (c.invoice_batch_id) g.invoiced += 1;
      if (c.is_tldv_internal || c.is_ptvs_discount) g.discounted += 1;
    }
    return Array.from(m.values()).sort((a, b) => b.checks - a.checks);
  }, [scoped, subById, clientById]);

  const setPreset = (days: number | "month" | "all") => {
    const now = new Date();
    if (days === "all") { setFromDate(""); setToDate(""); return; }
    if (days === "month") {
      const start = new Date(now.getFullYear(), now.getMonth(), 1);
      setFromDate(start.toISOString().slice(0, 10));
      setToDate(now.toISOString().slice(0, 10));
      return;
    }
    const start = new Date(now.getTime() - days * 86400000);
    setFromDate(start.toISOString().slice(0, 10));
    setToDate(now.toISOString().slice(0, 10));
  };

  return (
    <div className="space-y-4">
      <Card className="p-4">
        <div className="flex flex-wrap items-end gap-3">
          <div className="flex items-center gap-2 mr-2">
            <BarChart3 className="h-5 w-5 text-red-600" />
            <span className="font-semibold">Submission dashboard</span>
          </div>
          <div>
            <Label className="text-xs">From (created date)</Label>
            <Input type="date" value={fromDate} onChange={(e) => setFromDate(e.target.value)} className="h-8 w-40" />
          </div>
          <div>
            <Label className="text-xs">To (created date)</Label>
            <Input type="date" value={toDate} onChange={(e) => setToDate(e.target.value)} className="h-8 w-40" />
          </div>
          <Button variant="outline" size="sm" onClick={() => setPreset(30)}>Last 30 days</Button>
          <Button variant="outline" size="sm" onClick={() => setPreset("month")}>This month</Button>
          <Button variant="ghost" size="sm" onClick={() => setPreset("all")}>All time</Button>
        </div>
        <p className="text-xs text-muted-foreground mt-2">
          {isLoading ? "Loading…" : `${stats.totalChecks} check(s) across ${stats.totalSubmissions} submission(s) in range. Each candidate on a submission counts as one check per requested verification.`}
        </p>
      </Card>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Stat label="Total checks" value={stats.totalChecks} icon={<Users className="h-3 w-3" />} />
        <Stat label="Submissions (sent / open)" value={`${stats.sentSubmissions} / ${stats.openSubmissions}`} icon={<FileText className="h-3 w-3" />} />
        <Stat label="Invoiced checks" value={stats.invoiced} tone="emerald" icon={<FileText className="h-3 w-3" />} />
        <Stat label="Awaiting invoice" value={stats.notInvoiced} tone="amber" icon={<FileText className="h-3 w-3" />} />
        <Stat label="TLDV internal (100% discount)" value={stats.internal} tone="blue" icon={<Percent className="h-3 w-3" />} />
        <Stat label="PTVS discount" value={stats.ptvs} tone="amber" icon={<Percent className="h-3 w-3" />} />
        <Stat label="Total discounted" value={stats.internal + stats.ptvs} icon={<Percent className="h-3 w-3" />} />
        <Stat label="Client accounts active" value={perClient.length} icon={<Users className="h-3 w-3" />} />
      </div>

      <Card className="p-4">
        <p className="font-semibold text-sm mb-3">Checks by verification type</p>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {CHECK_KEYS.map((k) => (
            <div key={k} className="border rounded-md p-3">
              <p className="text-xs text-muted-foreground">{CHECK_META[k]?.label ?? k}</p>
              <p className="text-xl font-bold">{stats.perCheck[k] ?? 0}</p>
            </div>
          ))}
        </div>
      </Card>

      <Card className="p-4">
        <p className="font-semibold text-sm mb-3">Breakdown by client account</p>
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Client</TableHead>
                <TableHead className="text-center">Checks</TableHead>
                <TableHead className="text-center">Invoiced</TableHead>
                <TableHead className="text-center">Awaiting invoice</TableHead>
                <TableHead className="text-center">Discounted</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {perClient.length === 0 && (
                <TableRow>
                  <TableCell colSpan={5} className="text-center text-muted-foreground py-6">
                    No checks in this date range.
                  </TableCell>
                </TableRow>
              )}
              {perClient.map((g) => (
                <TableRow key={g.name}>
                  <TableCell className="font-medium">
                    <div className="flex items-center gap-2">
                      {g.name}
                      {g.isRegular && <Badge className="bg-amber-500 text-white">Regular</Badge>}
                    </div>
                  </TableCell>
                  <TableCell className="text-center">{g.checks}</TableCell>
                  <TableCell className="text-center">{g.invoiced}</TableCell>
                  <TableCell className="text-center">
                    <Badge className={g.checks - g.invoiced ? "bg-amber-600" : "bg-emerald-600"}>
                      {g.checks - g.invoiced}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-center">{g.discounted}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </Card>
    </div>
  );
}
