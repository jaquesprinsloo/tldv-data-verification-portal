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
import { usePricing, priceMap, candidateBilling, money } from "@/components/manual-risk/pricing";
import { BarChart3, Percent, FileText, Users, Link2, TrendingUp } from "lucide-react";

const sb = supabase as any;

export type MrDashboardSubmission = {
  id: string;
  order_number: string;
  client_id: string | null;
  created_at: string;
  sent_at: string | null;
  requested_checks: string[] | null;
  is_archive?: boolean | null;
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


function Stat({ label, value, icon, tone = "default", details }: {
  label: string; value: number | string; icon?: React.ReactNode; tone?: "default" | "amber" | "blue" | "emerald" | "rose";
  details?: { label: string; value: string; strong?: boolean }[];
}) {
  const toneCls =
    tone === "amber" ? "border-amber-300 bg-amber-50" :
    tone === "blue" ? "border-blue-300 bg-blue-50" :
    tone === "rose" ? "border-rose-300 bg-rose-50" :
    tone === "emerald" ? "border-emerald-300 bg-emerald-50" : "";
  return (
    <Card className={`p-4 ${toneCls}`}>
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        {icon}
        <span>{label}</span>
      </div>
      <p className="text-2xl font-bold mt-1">{value}</p>
      {details && details.length > 0 && (
        <div className="mt-2 space-y-0.5">
          {details.map((d) => (
            <div key={d.label} className="flex justify-between text-[11px]">
              <span className="text-muted-foreground">{d.label}</span>
              <span className={d.strong ? "font-semibold text-rose-700" : "font-medium"}>{d.value}</span>
            </div>
          ))}
        </div>
      )}
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

  // Supplier statement lines (reconciliation)
  const { data: reconLines = [] } = useQuery<{ matched_candidate_id: string | null; check_key: string | null; match_status: string; supplier_created_at: string | null; created_at: string }[]>({
    queryKey: ["mra-dashboard-recon-lines"],
    queryFn: async () => {
      const { data, error } = await sb
        .from("manual_risk_supplier_lines")
        .select("matched_candidate_id, check_key, match_status, supplier_created_at, created_at");
      if (error) throw error;
      return (data ?? []) as any[];
    },
  });

  const { data: pricingRows = [] } = usePricing();
  const pm = useMemo(() => priceMap(pricingRows), [pricingRows]);

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

  // Historical archive records are already invoiced: they count towards volume
  // but never towards costing, invoicing or profitability.
  const archiveSubIds = useMemo(
    () => new Set(submissions.filter((s) => s.is_archive).map((s) => s.id)),
    [submissions],
  );

  const scopedAll = useMemo(
    () => candidates.filter((c) => rangedSubIds.has(c.submission_id)),
    [candidates, rangedSubIds],
  );

  const scoped = useMemo(
    () => scopedAll.filter((c) => !archiveSubIds.has(c.submission_id)),
    [scopedAll, archiveSubIds],
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
    const liveSubs = subs.filter((s) => !s.is_archive);
    return {
      perCheck,
      internal,
      ptvs,
      invoiced,
      totalChecks: scopedAll.length,
      billableChecks: scoped.length,
      archiveChecks: scopedAll.length - scoped.length,
      archiveSubmissions: subs.length - liveSubs.length,
      totalSubmissions: liveSubs.length,
      sentSubmissions: liveSubs.filter((s) => !!s.sent_at).length,
      openSubmissions: liveSubs.filter((s) => !s.sent_at).length,
      notInvoiced: scoped.length - invoiced,
    };
  }, [scoped, scopedAll, subById, submissions, rangedSubIds]);


  // Reconciliation coverage for the candidates in range
  const recon = useMemo(() => {
    const scopedIds = new Set(scoped.map((c) => c.id));
    let matchedLines = 0;
    const matchedCands = new Set<string>();
    for (const l of reconLines) {
      if (l.match_status !== "matched" || !l.matched_candidate_id) continue;
      if (!scopedIds.has(l.matched_candidate_id)) continue;
      matchedLines += 1;
      matchedCands.add(l.matched_candidate_id);
    }
    return {
      matchedLines,
      matchedCandidates: matchedCands.size,
      unmatchedCandidates: Math.max(0, scoped.length - matchedCands.size),
      totalStatementLines: reconLines.length,
    };
  }, [scoped, reconLines]);

  // Discount economics (Risk Assessment is the discounted item)
  const discountEcon = useMemo(() => {
    const blank = { count: 0, discount: 0, cost: 0, recovered: 0, absorbed: 0 };
    const tldv = { ...blank };
    const ptvs = { ...blank };
    for (const c of scoped) {
      const sub = subById.get(c.submission_id);
      const isTldv = !!c.is_tldv_internal;
      const isPtvs = !!c.is_ptvs_discount;
      if (!isTldv && !isPtvs) continue;
      const b = candidateBilling(sub?.requested_checks, { isTldvInternal: isTldv, isPtvsDiscount: isPtvs }, pm);
      const ra = b.lines.find((l) => l.checkKey === "risk_assessment");
      const bucket = isTldv ? tldv : ptvs;
      bucket.count += 1;
      if (!ra) continue;
      bucket.discount += ra.listPrice - ra.charged;
      bucket.cost += ra.cost;
      bucket.recovered += ra.charged;
      bucket.absorbed += ra.cost - ra.charged;
    }
    return { tldv, ptvs };
  }, [scoped, subById, pm]);

  // Overall profitability, adjusted by whatever supplier statement lines are loaded
  const profitability = useMemo(() => {
    const scopedIds = new Set(scoped.map((c) => c.id));
    type Row = {
      key: string; qty: number; expectedCost: number; gross: number; charged: number;
      discount: number; reconQty: number; reconCost: number;
    };
    const rows = new Map<string, Row>();
    const get = (k: string) => {
      if (!rows.has(k)) rows.set(k, { key: k, qty: 0, expectedCost: 0, gross: 0, charged: 0, discount: 0, reconQty: 0, reconCost: 0 });
      return rows.get(k)!;
    };

    for (const c of scoped) {
      const sub = subById.get(c.submission_id);
      const b = candidateBilling(
        sub?.requested_checks,
        { isTldvInternal: !!c.is_tldv_internal, isPtvsDiscount: !!c.is_ptvs_discount },
        pm,
      );
      for (const l of b.lines) {
        const r = get(l.checkKey);
        r.qty += 1;
        r.expectedCost += l.cost;
        r.gross += l.listPrice;
        r.charged += l.charged;
        r.discount += l.listPrice - l.charged;
      }
    }

    // Statement lines matched to candidates in range -> actual supplier charges
    const from = fromDate ? new Date(fromDate + "T00:00:00").getTime() : null;
    const to = toDate ? new Date(toDate + "T23:59:59").getTime() : null;
    const lineInRange = (l: { supplier_created_at: string | null; created_at: string }) => {
      if (from === null && to === null) return true;
      const ts = new Date(l.supplier_created_at ?? l.created_at).getTime();
      if (Number.isNaN(ts)) return false;
      if (from !== null && ts < from) return false;
      if (to !== null && ts > to) return false;
      return true;
    };
    let unaccountedQty = 0, unaccountedCost = 0;
    for (const l of reconLines) {
      const key = l.check_key;
      const supplierCost = key ? (pm.get(key)?.supplier_cost ?? 0) : 0;
      if (l.match_status === "matched" && l.matched_candidate_id && scopedIds.has(l.matched_candidate_id)) {
        if (!key) continue;
        const r = get(key);
        r.reconQty += 1;
        r.reconCost += supplierCost;
      } else if (l.match_status !== "matched" && lineInRange(l)) {
        // Only supplier charges dated inside the selected window count against
        // the revenue shown for that window.
        unaccountedQty += 1;
        unaccountedCost += supplierCost;
      }
    }

    const list = [...rows.values()].sort((a, b) => b.qty - a.qty);
    const totals = list.reduce(
      (t, r) => {
        // Cost billed by supplier: what the statement shows for matched lines,
        // plus our expected cost for checks the statement has not covered yet.
        const uncoveredQty = Math.max(0, r.qty - r.reconQty);
        const rate = pm.get(r.key)?.supplier_cost ?? 0;
        const cost = r.reconCost + uncoveredQty * rate;
        t.qty += r.qty;
        t.reconQty += r.reconQty;
        t.cost += cost;
        t.gross += r.gross;
        t.charged += r.charged;
        t.discount += r.discount;
        (r as any).effectiveCost = cost;
        (r as any).profit = r.charged - cost;
        return t;
      },
      { qty: 0, reconQty: 0, cost: 0, gross: 0, charged: 0, discount: 0 },
    );

    const netCost = totals.cost + unaccountedCost;
    const profit = totals.charged - netCost;
    const margin = totals.charged > 0 ? (profit / totals.charged) * 100 : 0;
    return {
      rows: list as (Row & { effectiveCost: number; profit: number })[],
      totals, unaccountedQty, unaccountedCost, netCost, profit, margin,
    };
  }, [scoped, subById, pm, reconLines, fromDate, toDate]);




  const perClient = useMemo(() => {
    const m = new Map<string, { name: string; isRegular: boolean; checks: number; invoiced: number; discounted: number }>();
    for (const c of scopedAll) {

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
        <Stat
          label="TLDV internal (risk assessment 100% off)"
          value={stats.internal}
          tone="blue"
          icon={<Percent className="h-3 w-3" />}
          details={[
            { label: "Discount given", value: money(discountEcon.tldv.discount) },
            { label: "Supplier cost", value: money(discountEcon.tldv.cost) },
            { label: "Recovered", value: money(discountEcon.tldv.recovered) },
            { label: "TLDV loss", value: money(discountEcon.tldv.absorbed), strong: true },
          ]}
        />
        <Stat
          label="PTVS discount (risk assessment at 50% of cost)"
          value={stats.ptvs}
          tone="amber"
          icon={<Percent className="h-3 w-3" />}
          details={[
            { label: "Discount given", value: money(discountEcon.ptvs.discount) },
            { label: "Supplier cost", value: money(discountEcon.ptvs.cost) },
            { label: "Recovered from PTVS", value: money(discountEcon.ptvs.recovered) },
            { label: "TLDV loss (50%)", value: money(discountEcon.ptvs.absorbed), strong: true },
          ]}
        />
        <Stat
          label="Matched to supplier recon"
          value={`${recon.matchedCandidates} / ${stats.totalChecks}`}
          tone={recon.unmatchedCandidates ? "amber" : "emerald"}
          icon={<Link2 className="h-3 w-3" />}
          details={[
            { label: "Matched statement lines", value: String(recon.matchedLines) },
            { label: "Candidates not on statement", value: String(recon.unmatchedCandidates) },
            { label: "Statement lines loaded", value: String(recon.totalStatementLines) },
          ]}
        />
        <Stat label="Client accounts active" value={perClient.length} icon={<Users className="h-3 w-3" />} />

      </div>

      <Card className="p-4">
        <div className="flex items-center gap-2 mb-1">
          <TrendingUp className="h-4 w-4 text-emerald-600" />
          <p className="font-semibold text-sm">Overall profitability</p>
        </div>
        <p className="text-xs text-muted-foreground mb-3">
          Supplier cost uses reconciled statement lines where available, and the price-list rate for checks not yet on a
          statement. Charges are after TLDV internal and PTVS discounts.
        </p>

        <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-4">
          <div className="border rounded-md p-3">
            <p className="text-xs text-muted-foreground">Gross (list)</p>
            <p className="text-lg font-bold">{money(profitability.totals.gross)}</p>
          </div>
          <div className="border rounded-md p-3 bg-amber-50 border-amber-300">
            <p className="text-xs text-muted-foreground">Discounts</p>
            <p className="text-lg font-bold text-amber-700">− {money(profitability.totals.discount)}</p>
          </div>
          <div className="border rounded-md p-3">
            <p className="text-xs text-muted-foreground">Charged to clients</p>
            <p className="text-lg font-bold">{money(profitability.totals.charged)}</p>
          </div>
          <div className="border rounded-md p-3">
            <p className="text-xs text-muted-foreground">Supplier cost</p>
            <p className="text-lg font-bold">{money(profitability.netCost)}</p>
            <p className="text-[11px] text-muted-foreground">
              {profitability.totals.reconQty} of {profitability.totals.qty} reconciled
            </p>
          </div>
          <div className={`border rounded-md p-3 ${profitability.profit < 0 ? "bg-rose-50 border-rose-300" : "bg-emerald-50 border-emerald-300"}`}>
            <p className="text-xs text-muted-foreground">Profit / margin</p>
            <p className={`text-lg font-bold ${profitability.profit < 0 ? "text-rose-700" : "text-emerald-700"}`}>
              {money(profitability.profit)}
            </p>
            <p className="text-[11px] text-muted-foreground">{profitability.margin.toFixed(1)}%</p>
          </div>
        </div>

        {profitability.unaccountedQty > 0 && (
          <div className="mb-3 rounded-md border border-rose-300 bg-rose-50 p-2 text-xs text-rose-800">
            {profitability.unaccountedQty} supplier statement line(s) could not be matched to our records —{" "}
            {money(profitability.unaccountedCost)} of supplier charges is included in the cost above as unaccounted.
          </div>
        )}

        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Check type</TableHead>
                <TableHead className="text-center">Qty</TableHead>
                <TableHead className="text-center">Reconciled</TableHead>
                <TableHead className="text-right">Cost</TableHead>
                <TableHead className="text-right">Gross</TableHead>
                <TableHead className="text-right">Discount</TableHead>
                <TableHead className="text-right">Charged</TableHead>
                <TableHead className="text-right">Profit</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {profitability.rows.length === 0 && (
                <TableRow>
                  <TableCell colSpan={8} className="text-center text-muted-foreground py-6">
                    No checks in this date range.
                  </TableCell>
                </TableRow>
              )}
              {profitability.rows.map((r) => (
                <TableRow key={r.key}>
                  <TableCell className="font-medium">{CHECK_META[r.key]?.label ?? r.key}</TableCell>
                  <TableCell className="text-center">{r.qty}</TableCell>
                  <TableCell className="text-center">
                    <Badge className={r.reconQty >= r.qty ? "bg-emerald-600" : "bg-amber-600"}>
                      {r.reconQty}/{r.qty}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right">{money(r.effectiveCost)}</TableCell>
                  <TableCell className="text-right">{money(r.gross)}</TableCell>
                  <TableCell className="text-right text-amber-700">{r.discount ? `− ${money(r.discount)}` : "—"}</TableCell>
                  <TableCell className="text-right">{money(r.charged)}</TableCell>
                  <TableCell className={`text-right font-semibold ${r.profit < 0 ? "text-rose-700" : "text-emerald-700"}`}>
                    {money(r.profit)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </Card>

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
