// People on record without a full 13-digit South African ID — mostly foreign
// nationals who were checked on a passport, permit or asylum number. Their
// passport number can be captured here so they can be found by it.

import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { toast } from "sonner";
import { Globe, Loader2, RefreshCw, Save } from "lucide-react";

const sb = supabase as any;

type Row = {
  id: string;
  first_name: string | null;
  surname: string | null;
  id_number: string | null;
  passport_number: string | null;
  submission_id: string;
  order_number: string;
  client_id: string | null;
  created_at: string;
};

const digits = (v: unknown) => String(v ?? "").replace(/\D/g, "");

export function ArchivePassportsCard({
  clients,
}: {
  clients: { id: string; client_name: string }[];
}) {
  const qc = useQueryClient();
  const [edits, setEdits] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState<string | null>(null);
  const [search, setSearch] = useState("");

  const clientName = (id: string | null) =>
    (id ? clients.find((c) => c.id === id)?.client_name ?? "—" : "—");

  const { data: rows = [], isLoading, refetch } = useQuery<Row[]>({
    queryKey: ["mra-no-full-id-candidates"],
    staleTime: 0,
    refetchOnWindowFocus: true,
    queryFn: async () => {
      const cands: any[] = [];
      for (let from = 0; ; from += 1000) {
        const { data, error } = await sb
          .from("manual_risk_candidates")
          .select("id, first_name, surname, id_number, passport_number, submission_id")
          .range(from, from + 999);
        if (error) throw error;
        cands.push(...(data ?? []));
        if (!data || data.length < 1000) break;
      }
      const shortId = cands.filter((c) => digits(c.id_number).length !== 13);
      if (!shortId.length) return [];
      const subIds = Array.from(new Set(shortId.map((c) => c.submission_id)));
      const subs: any[] = [];
      for (let i = 0; i < subIds.length; i += 200) {
        const { data, error } = await sb
          .from("manual_risk_submissions")
          .select("id, order_number, client_id, created_at")
          .in("id", subIds.slice(i, i + 200));
        if (error) throw error;
        subs.push(...(data ?? []));
      }
      const byId = new Map(subs.map((s) => [s.id, s]));
      return shortId.map((c) => ({
        ...c,
        order_number: byId.get(c.submission_id)?.order_number ?? "—",
        client_id: byId.get(c.submission_id)?.client_id ?? null,
        created_at: byId.get(c.submission_id)?.created_at ?? "",
      })) as Row[];
    },
  });

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((r) =>
      [r.first_name, r.surname, r.id_number, r.passport_number, r.order_number, clientName(r.client_id)]
        .some((v) => String(v ?? "").toLowerCase().includes(q)),
    );
    /* eslint-disable-next-line react-hooks/exhaustive-deps */
  }, [rows, search, clients]);

  const withPassport = rows.filter((r) => (r.passport_number ?? "").trim()).length;

  const save = async (row: Row) => {
    const value = (edits[row.id] ?? "").trim().toUpperCase();
    if (!value) { toast.error("Type the passport number first"); return; }
    setSaving(row.id);
    const { error } = await sb
      .from("manual_risk_candidates")
      .update({ passport_number: value })
      .eq("id", row.id);
    setSaving(null);
    if (error) { toast.error("Could not save: " + error.message); return; }
    toast.success(`Passport number saved for ${row.first_name ?? ""} ${row.surname ?? ""}`.trim());
    setEdits((prev) => { const next = { ...prev }; delete next[row.id]; return next; });
    await qc.invalidateQueries({ queryKey: ["mra-no-full-id-candidates"] });
    await qc.invalidateQueries({ queryKey: ["mra-employee-check-records"] });
  };

  return (
    <Card className="p-4 space-y-3">
      <h3 className="font-semibold flex items-center gap-2">
        <Globe className="h-4 w-4 text-red-600" /> People without a full ID number
      </h3>
      <p className="text-sm text-muted-foreground">
        These people were checked on a passport, permit or asylum number instead of a 13-digit South
        African ID. Add the passport number so they can be found by it in any search.
      </p>

      <div className="flex flex-wrap items-center gap-2">
        <Badge variant="outline">{rows.length} person(s)</Badge>
        <Badge variant="outline" className="text-green-700 border-green-300">{withPassport} with a passport number</Badge>
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search name, surname, number, account or order"
          className="max-w-sm"
        />
        <Button
          size="sm"
          variant="outline"
          onClick={() => void refetch()}
          disabled={isLoading}
        >
          {isLoading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
          Refresh
        </Button>
      </div>

      {isLoading ? (
        <p className="text-sm text-muted-foreground flex items-center gap-2">
          <Loader2 className="h-3.5 w-3.5 animate-spin" /> Loading…
        </p>
      ) : (
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>First name</TableHead>
                <TableHead>Surname</TableHead>
                <TableHead>Number on record</TableHead>
                <TableHead>Account</TableHead>
                <TableHead>Order #</TableHead>
                <TableHead>Passport number</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="text-center text-muted-foreground py-6">
                    Nobody to show.
                  </TableCell>
                </TableRow>
              ) : filtered.map((r) => (
                <TableRow key={r.id}>
                  <TableCell className="text-sm">{r.first_name || "—"}</TableCell>
                  <TableCell className="text-sm">{r.surname || "—"}</TableCell>
                  <TableCell className="font-mono text-xs">{r.id_number || "—"}</TableCell>
                  <TableCell className="text-sm">{clientName(r.client_id)}</TableCell>
                  <TableCell className="font-mono text-xs">{r.order_number}</TableCell>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <Input
                        value={edits[r.id] ?? r.passport_number ?? ""}
                        onChange={(e) => setEdits((p) => ({ ...p, [r.id]: e.target.value }))}
                        placeholder="e.g. RC306654"
                        className="h-9 w-40 font-mono text-xs uppercase"
                      />
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={saving === r.id || (edits[r.id] ?? "") === ""}
                        onClick={() => void save(r)}
                      >
                        {saving === r.id
                          ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                          : <Save className="h-3.5 w-3.5" />}
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </Card>
  );
}

export default ArchivePassportsCard;
