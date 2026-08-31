import { useQuery } from "@tanstack/react-query";
import { supabase as sb } from "@/integrations/supabase/client";
import { CHECK_META } from "@/lib/manualRiskPdf";

export interface PricingRow {
  id: string;
  item_key: string;
  label: string;
  supplier_cost: number;
  client_price: number;
}

export const CHECK_PRICE_KEYS = [
  "risk_assessment",
  "id_verification",
  "criminal",
  "credit",
  "drivers_license",
  "pdp",
  "qualification",
];

export const DISCOUNT_KEYS = ["discount_tldv_internal", "discount_ptvs"];

export function usePricing() {
  return useQuery<PricingRow[]>({
    queryKey: ["mra-pricing"],
    queryFn: async () => {
      const { data, error } = await sb
        .from("manual_risk_pricing" as any)
        .select("*")
        .order("item_key", { ascending: true });
      if (error) throw error;
      return ((data ?? []) as any[]).map((r) => ({
        id: r.id,
        item_key: r.item_key,
        label: r.label,
        supplier_cost: Number(r.supplier_cost) || 0,
        client_price: Number(r.client_price) || 0,
      }));
    },
  });
}

export function priceMap(rows: PricingRow[]) {
  const m = new Map<string, PricingRow>();
  for (const r of rows) m.set(r.item_key, r);
  return m;
}

export function checkLabel(key: string) {
  return CHECK_META[key]?.label ?? key;
}

/** Supplier "Check title" -> our internal check key. */
export function supplierTitleToCheckKey(title: string | null | undefined): string | null {
  const t = (title ?? "").toLowerCase().trim();
  if (!t) return null;
  if (t.includes("verification of id") || t.includes("id verification") || t.includes("id number")) return "id_verification";
  if (t.includes("risk assessment") || t.includes("contact trace")) return "risk_assessment";
  if (t.includes("criminal")) return "criminal";
  if (t.includes("credit")) return "credit";
  if (t.includes("driver")) return "drivers_license";
  if (t.includes("pdp") || t.includes("professional driving")) return "pdp";
  if (t.includes("qualification") || t.includes("education")) return "qualification";
  return null;
}

export const money = (n: number) =>
  `R ${Number(n || 0).toLocaleString("en-ZA", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

/**
 * Billing rules per candidate:
 *  - Normal: every requested check billed at its client price.
 *  - TLDV internal: Risk Assessment is 100% discounted (R 0.00); all other
 *    checks (including ID Verification) are billed at the normal client price.
 *  - PTVS: ID Verification billed normally; Risk Assessment is billed at 50%
 *    of the supplier cost.
 * Cost is always the supplier cost of each requested check.
 */
export interface CandidateLineBilling {
  checkKey: string;
  cost: number;
  listPrice: number;
  charged: number;
  note?: string;
}

function requestedKeys(requestedChecks: string[] | null | undefined) {
  return (requestedChecks && requestedChecks.length ? requestedChecks : ["id_verification", "risk_assessment"]).filter(
    (k) => CHECK_PRICE_KEYS.includes(k),
  );
}

export function candidateBilling(
  requestedChecks: string[] | null | undefined,
  flags: { isTldvInternal?: boolean; isPtvsDiscount?: boolean },
  prices: Map<string, PricingRow>,
) {
  const keys = requestedKeys(requestedChecks);
  const lines: CandidateLineBilling[] = keys.map((k) => {
    const p = prices.get(k);
    const cost = p?.supplier_cost ?? 0;
    const listPrice = p?.client_price ?? 0;
    let charged = listPrice;
    let note: string | undefined;
    if (flags.isTldvInternal && k === "risk_assessment") {
      charged = 0;
      note = "TLDV internal — 100% discount";
    } else if (flags.isPtvsDiscount && k === "risk_assessment") {
      charged = cost * 0.5;
      note = "PTVS — 50% of supplier cost";
    }
    return { checkKey: k, cost, listPrice, charged, note };
  });
  const cost = lines.reduce((s, l) => s + l.cost, 0);
  const gross = lines.reduce((s, l) => s + l.listPrice, 0);
  const net = lines.reduce((s, l) => s + l.charged, 0);
  return { lines, cost, gross, net, discount: gross - net, checkKeys: keys };
}

/** Back-compat wrapper. */
export function candidateRevenue(
  requestedChecks: string[] | null | undefined,
  flags: { isTldvInternal?: boolean; isPtvsDiscount?: boolean },
  prices: Map<string, PricingRow>,
) {
  const b = candidateBilling(requestedChecks, flags, prices);
  return { gross: b.gross, discount: b.discount, net: b.net, checkKeys: b.checkKeys };
}

/** Our own supplier cost expectation for one candidate. */
export function candidateCost(
  requestedChecks: string[] | null | undefined,
  prices: Map<string, PricingRow>,
) {
  return requestedKeys(requestedChecks).reduce((sum, k) => sum + (prices.get(k)?.supplier_cost ?? 0), 0);
}

