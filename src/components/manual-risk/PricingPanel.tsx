import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { supabase as sb } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Loader2, Save, Tag } from "lucide-react";
import { toast } from "sonner";
import { usePricing, CHECK_PRICE_KEYS, DISCOUNT_KEYS, type PricingRow } from "./pricing";

export default function PricingPanel() {
  const qc = useQueryClient();
  const { data: rows = [], isLoading } = usePricing();
  const [draft, setDraft] = useState<Record<string, { supplier_cost: string; client_price: string }>>({});
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const d: Record<string, { supplier_cost: string; client_price: string }> = {};
    for (const r of rows) d[r.item_key] = { supplier_cost: String(r.supplier_cost), client_price: String(r.client_price) };
    setDraft(d);
  }, [rows.length, rows.map((r) => `${r.supplier_cost}:${r.client_price}`).join("|")]);

  const set = (key: string, field: "supplier_cost" | "client_price", v: string) =>
    setDraft((prev) => ({ ...prev, [key]: { ...prev[key], [field]: v } }));

  const save = async () => {
    setSaving(true);
    try {
      let changed = 0;
      for (const r of rows) {
        const d = draft[r.item_key];
        if (!d) continue;
        const sc = parseFloat(d.supplier_cost) || 0;
        const cp = parseFloat(d.client_price) || 0;
        if (sc === r.supplier_cost && cp === r.client_price) continue;
        const { data, error } = await sb
          .from("manual_risk_pricing" as any)
          .update({ supplier_cost: sc, client_price: cp })
          .eq("id", r.id)
          .select("id");
        if (error) throw error;
        if (!data || data.length === 0) {
          throw new Error(
            `"${r.label}" could not be saved — your account does not have permission to change the price list.`,
          );
        }
        changed += 1;
      }
      toast.success(changed ? `Price list saved (${changed} updated)` : "No changes to save");
      await qc.invalidateQueries({ queryKey: ["mra-pricing"] });
    } catch (e: any) {
      toast.error(e.message ?? "Failed to save price list");
    } finally {
      setSaving(false);
    }
  };

  const checkRows = rows.filter((r) => CHECK_PRICE_KEYS.includes(r.item_key));
  const unsetKeys = ["risk_assessment", "id_verification"].filter((k) => {
    const r = rows.find((x) => x.item_key === k);
    return r && r.supplier_cost === 0 && r.client_price === 0;
  });
  const discountRows = rows.filter((r) => DISCOUNT_KEYS.includes(r.item_key));

  const renderRow = (r: PricingRow, isDiscount: boolean) => (
    <TableRow key={r.id}>
      <TableCell className="font-medium">{r.label}</TableCell>
      <TableCell>
        {isDiscount ? (
          <span className="text-xs text-muted-foreground">—</span>
        ) : (
          <Input
            type="number"
            step="0.01"
            className="h-9 w-32"
            value={draft[r.item_key]?.supplier_cost ?? ""}
            onChange={(e) => set(r.item_key, "supplier_cost", e.target.value)}
          />
        )}
      </TableCell>
      <TableCell>
        {isDiscount ? (
          <span className="text-xs text-muted-foreground">
            {r.item_key === "discount_tldv_internal"
              ? "Risk Assessment billed at R 0.00 · ID Verification charged in full"
              : "ID Verification charged in full · Risk Assessment at 50% of supplier cost"}
          </span>
        ) : (
          <Input
            type="number"
            step="0.01"
            className="h-9 w-32"
            value={draft[r.item_key]?.client_price ?? ""}
            onChange={(e) => set(r.item_key, "client_price", e.target.value)}
          />
        )}
      </TableCell>
      <TableCell className="text-right text-sm">
        {isDiscount ? (
          <span className="text-muted-foreground">fixed rule</span>
        ) : (
          (() => {
            const sc = parseFloat(draft[r.item_key]?.supplier_cost ?? "0") || 0;
            const cp = parseFloat(draft[r.item_key]?.client_price ?? "0") || 0;
            const m = cp - sc;
            return (
              <span className={m < 0 ? "text-destructive font-medium" : "text-emerald-600 font-medium"}>
                {m < 0 ? "-" : ""}R {Math.abs(m).toFixed(2)}
              </span>
            );
          })()
        )}
      </TableCell>
    </TableRow>
  );


  return (
    <Card className="p-4">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <Tag className="h-4 w-4 text-muted-foreground" />
          <h3 className="font-semibold">Price list</h3>
        </div>
        <Button size="sm" onClick={save} disabled={saving || isLoading}>
          {saving ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Save className="h-4 w-4 mr-2" />}
          Save prices
        </Button>
      </div>
      <p className="text-xs text-muted-foreground mb-3">
        Supplier cost is what our provider charges us per check. Client price is what we bill the client. These rates drive
        every cost, billing and profit figure in the reconciliation batches and the Invoiced tab.
      </p>
      {isLoading ? (
        <div className="py-8 text-center text-muted-foreground"><Loader2 className="h-5 w-5 animate-spin inline" /></div>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Item</TableHead>
              <TableHead>Supplier cost (R)</TableHead>
              <TableHead>Client price (R)</TableHead>
              <TableHead className="text-right">Margin</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {checkRows.map((r) => renderRow(r, false))}
            {discountRows.map((r) => renderRow(r, true))}
          </TableBody>
        </Table>
      )}
    </Card>
  );
}
