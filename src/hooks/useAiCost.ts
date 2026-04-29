import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

/**
 * Live USD -> ZAR exchange rate. Cached for 24 h via React Query.
 * Uses exchangerate.host (free, no key). Falls back to 18.5 on failure.
 */
export function useUsdZarRate() {
  return useQuery({
    queryKey: ["fx-usd-zar"],
    queryFn: async () => {
      try {
        const res = await fetch(
          "https://api.exchangerate.host/latest?base=USD&symbols=ZAR"
        );
        const json = await res.json();
        const rate = Number(json?.rates?.ZAR);
        if (rate && rate > 0) return rate;
        return 18.5;
      } catch {
        return 18.5;
      }
    },
    staleTime: 24 * 60 * 60 * 1000, // 24 h
    gcTime: 24 * 60 * 60 * 1000,
    retry: 1,
  });
}

/**
 * Total estimated AI cost (USD) per candex application.
 * Returns a Map keyed by application_id.
 */
export function useApplicationAiCosts(applicationIds: string[]) {
  const sortedKey = [...applicationIds].sort().join(",");
  return useQuery({
    queryKey: ["candex-ai-cost", sortedKey],
    queryFn: async () => {
      if (applicationIds.length === 0) return new Map<string, number>();
      const { data, error } = await supabase
        .from("candex_ai_usage" as any)
        .select("application_id, usd_cost")
        .in("application_id", applicationIds);
      if (error) throw error;
      const totals = new Map<string, number>();
      for (const row of (data || []) as any[]) {
        if (!row.application_id) continue;
        const prev = totals.get(row.application_id) || 0;
        totals.set(row.application_id, prev + Number(row.usd_cost || 0));
      }
      return totals;
    },
    enabled: applicationIds.length > 0,
  });
}

export function formatZar(usd: number, rate: number): string {
  const zar = usd * rate;
  return new Intl.NumberFormat("en-ZA", {
    style: "currency",
    currency: "ZAR",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(zar);
}

export function formatUsd(usd: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 4,
    maximumFractionDigits: 4,
  }).format(usd);
}