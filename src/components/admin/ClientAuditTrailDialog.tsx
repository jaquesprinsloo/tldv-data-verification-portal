import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Download, Loader2, ShieldCheck } from "lucide-react";

const sb = supabase as any;

type Entry = {
  id: string;
  user_email: string | null;
  user_name: string | null;
  event_type: string;
  detail: string | null;
  metadata: Record<string, unknown> | null;
  created_at: string;
};

const LABELS: Record<string, string> = {
  login: "Signed in",
  logout: "Signed out",
  search: "Search",
  account_opened: "Opened account",
  download: "Download",
  view_report: "Viewed report",
  view_indemnity: "Viewed indemnities",
};

const TONE: Record<string, string> = {
  login: "bg-emerald-600",
  logout: "bg-slate-500",
  search: "bg-blue-600",
  account_opened: "bg-indigo-600",
  download: "bg-amber-600",
  view_report: "bg-sky-600",
  view_indemnity: "bg-purple-600",
};

/**
 * Full activity trail of one profile: sign ins, searches, documents opened and
 * documents downloaded — kept so the activity can be produced during an audit.
 */
export function ClientAuditTrailDialog({
  userId, userLabel, open, onOpenChange,
}: {
  userId: string | null;
  userLabel: string;
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");

  const { data: entries = [], isLoading } = useQuery<Entry[]>({
    queryKey: ["client-audit-trail", userId],
    enabled: !!userId && open,
    queryFn: async () => {
      const all: Entry[] = [];
      for (let from = 0; ; from += 1000) {
        const { data, error } = await sb
          .from("client_facing_audit_log")
          .select("id, user_email, user_name, event_type, detail, metadata, created_at")
          .eq("user_id", userId)
          .order("created_at", { ascending: false })
          .range(from, from + 999);
        if (error) throw error;
        all.push(...((data ?? []) as Entry[]));
        if (!data || data.length < 1000) break;
      }
      return all;
    },
  });

  const rows = useMemo(() => {
    const from = fromDate ? new Date(fromDate + "T00:00:00").getTime() : null;
    const to = toDate ? new Date(toDate + "T23:59:59").getTime() : null;
    return entries.filter((e) => {
      const t = new Date(e.created_at).getTime();
      if (from !== null && t < from) return false;
      if (to !== null && t > to) return false;
      return true;
    });
  }, [entries, fromDate, toDate]);

  const counts = useMemo(() => {
    const c: Record<string, number> = {};
    for (const e of rows) c[e.event_type] = (c[e.event_type] ?? 0) + 1;
    return c;
  }, [rows]);

  const exportCsv = () => {
    const header = ["Date & time", "Profile", "Email", "Event", "Detail", "Extra detail"];
    const csv = [header, ...rows.map((e) => [
      new Date(e.created_at).toLocaleString(),
      e.user_name ?? "",
      e.user_email ?? "",
      LABELS[e.event_type] ?? e.event_type,
      e.detail ?? "",
      e.metadata ? JSON.stringify(e.metadata) : "",
    ])]
      .map((line) => line.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(","))
      .join("\n");
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = `activity-trail-${(userLabel || "profile").replace(/[^a-z0-9]+/gi, "-").toLowerCase()}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-5xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ShieldCheck className="h-5 w-5 text-red-600" /> Activity trail — {userLabel}
          </DialogTitle>
          <DialogDescription>
            Every sign in, sign out, search, document opened and document downloaded on this
            profile, newest first.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-wrap items-end gap-2">
          <div>
            <Label className="text-xs">From</Label>
            <Input type="date" value={fromDate} onChange={(e) => setFromDate(e.target.value)} className="h-8 w-40" />
          </div>
          <div>
            <Label className="text-xs">To</Label>
            <Input type="date" value={toDate} onChange={(e) => setToDate(e.target.value)} className="h-8 w-40" />
          </div>
          {(fromDate || toDate) && (
            <Button variant="ghost" size="sm" onClick={() => { setFromDate(""); setToDate(""); }}>Clear</Button>
          )}
          <div className="flex-1" />
          <Button variant="outline" onClick={exportCsv} disabled={!rows.length}>
            <Download className="h-4 w-4 mr-2" /> Export trail (CSV)
          </Button>
        </div>

        <div className="flex flex-wrap gap-2 py-1">
          <Badge variant="outline">{rows.length} event(s)</Badge>
          {Object.entries(counts).map(([k, n]) => (
            <Badge key={k} className={TONE[k] ?? "bg-slate-600"}>{LABELS[k] ?? k}: {n}</Badge>
          ))}
        </div>

        {isLoading ? (
          <p className="text-sm text-muted-foreground flex items-center gap-2 py-6">
            <Loader2 className="h-4 w-4 animate-spin" /> Loading the trail…
          </p>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-48">Date &amp; time</TableHead>
                  <TableHead className="w-40">Event</TableHead>
                  <TableHead>What happened</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={3} className="text-center text-muted-foreground py-8">
                      No activity recorded for this profile in this period.
                    </TableCell>
                  </TableRow>
                ) : rows.map((e) => (
                  <TableRow key={e.id}>
                    <TableCell className="text-xs whitespace-nowrap">
                      {new Date(e.created_at).toLocaleString()}
                    </TableCell>
                    <TableCell>
                      <Badge className={TONE[e.event_type] ?? "bg-slate-600"}>
                        {LABELS[e.event_type] ?? e.event_type}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-sm">
                      {e.detail ?? "—"}
                      {e.metadata && Object.keys(e.metadata).length > 1 && (
                        <span className="block text-xs text-muted-foreground mt-0.5 break-all">
                          {Object.entries(e.metadata)
                            .filter(([k]) => k !== "at")
                            .map(([k, v]) => `${k}: ${Array.isArray(v) ? v.join(", ") : String(v)}`)
                            .join(" • ")}
                        </span>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

export default ClientAuditTrailDialog;
