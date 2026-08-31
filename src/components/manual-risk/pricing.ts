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
 * Revenue for one candidate: sum of client prices for each requested check,
 * with TLDV-internal / PTVS discount percentages applied.
 */
export function candidateRevenue(
  requestedChecks: string[] | null | undefined,
  flags: { isTldvInternal?: boolean; isPtvsDiscount?: boolean },
  prices: Map<string, PricingRow>,
) {
  const keys = (requestedChecks && requestedChecks.length ? requestedChecks : ["id_verification", "risk_assessment"]).filter(
    (k) => CHECK_PRICE_KEYS.includes(k),
  );
  const gross = keys.reduce((sum, k) => sum + (prices.get(k)?.client_price ?? 0), 0);
  let discountPct = 0;
  if (flags.isTldvInternal) discountPct = Math.max(discountPct, prices.get("discount_tldv_internal")?.client_price ?? 100);
  if (flags.isPtvsDiscount) discountPct = Math.max(discountPct, prices.get("discount_ptvs")?.client_price ?? 0);
  const discount = (gross * Math.min(discountPct, 100)) / 100;
  return { gross, discount, net: gross - discount, checkKeys: keys };
}

/** Our own supplier cost expectation for one candidate. */
export function candidateCost(
  requestedChecks: string[] | null | undefined,
  prices: Map<string, PricingRow>,
) {
  const keys = (requestedChecks && requestedChecks.length ? requestedChecks : ["id_verification", "risk_assessment"]).filter(
    (k) => CHECK_PRICE_KEYS.includes(k),
  );
  return keys.reduce((sum, k) => sum + (prices.get(k)?.supplier_cost ?? 0), 0);
}
