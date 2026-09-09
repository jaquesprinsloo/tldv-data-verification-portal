import { useEffect, useMemo, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { supabase as sb } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Loader2, Merge, Search, CheckCircle2 } from "lucide-react";

interface ClientLite {
  id: string;
  client_name: string;
  contact_person?: string | null;
  email?: string | null;
  is_regular?: boolean | null;
  created_at?: string | null;
}

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  clients: ClientLite[];
  onChanged: () => void;
}

/** Normalise a client name for comparison: lowercase, drop punctuation,
 *  drop a leading "the", collapse whitespace, drop common suffix words. */
const NOISE = new Set(["the", "pty", "ltd", "cc", "branch", "store", "shop"]);

function normalise(name: string) {
  const cleaned = name
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9 ]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  const tokens = cleaned.split(" ").filter((t) => t && !NOISE.has(t));
  return { key: tokens.join(" "), tokens };
}

function levenshtein(a: string, b: string) {
  if (a === b) return 0;
  const m = a.length, n = b.length;
  if (!m) return n;
  if (!n) return m;
  let prev = Array.from({ length: n + 1 }, (_, i) => i);
  for (let i = 1; i <= m; i++) {
    const cur = [i];
    for (let j = 1; j <= n; j++) {
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    }
    prev = cur;
  }
  return prev[n];
}

function similarity(a: string, b: string) {
  if (!a || !b) return 0;
  const max = Math.max(a.length, b.length);
  return 1 - levenshtein(a, b) / max;
}

function tokenOverlap(a: string[], b: string[]) {
  if (!a.length || !b.length) return 0;
  const setB = new Set(b);
  const shared = a.filter((t) => setB.has(t)).length;
  return shared / Math.min(a.length, b.length);
}

function isSimilar(a: ReturnType<typeof normalise>, b: ReturnType<typeof normalise>) {
  if (!a.key || !b.key) return false;
  if (a.key === b.key) return true;
  if (a.key.includes(b.key) || b.key.includes(a.key)) return true;
  if (tokenOverlap(a.tokens, b.tokens) === 1) return true;
  return similarity(a.key, b.key) >= 0.85;
}

interface Group {
  id: string;
  members: ClientLite[];
  keeperId: string;
}

const DuplicateClientsDialog = ({ open, onOpenChange, clients, onChanged }: Props) => {
  const [counts, setCounts] = useState<Record<string, { orders: number; candidates: number }>>({});
  const [loading, setLoading] = useState(false);
  const [merging, setMerging] = useState<string | null>(null);
  const [dismissed, setDismissed] = useState<Set<string>>(new Set());
  const [keepers, setKeepers] = useState<Record<string, string>>({});

  const groups = useMemo<Group[]>(() => {
    const normed = clients.map((c) => ({ c, n: normalise(c.client_name) }));
    const used = new Set<string>();
    const out: Group[] = [];
    for (let i = 0; i < normed.length; i++) {
      if (used.has(normed[i].c.id)) continue;
      const members = [normed[i]];
      for (let j = i + 1; j < normed.length; j++) {
        if (used.has(normed[j].c.id)) continue;
        if (members.some((m) => isSimilar(m.n, normed[j].n))) {
          members.push(normed[j]);
          used.add(normed[j].c.id);
        }
      }
      if (members.length > 1) {
        used.add(normed[i].c.id);
        const sorted = members.map((m) => m.c).sort((a, b) => a.client_name.localeCompare(b.client_name));
        const id = sorted.map((m) => m.id).join("|");
        out.push({ id, members: sorted, keeperId: sorted[0].id });
      }
    }
    return out.filter((g) => !dismissed.has(g.id));
  }, [clients, dismissed]);

  useEffect(() => {
    if (!open) return;
    const ids = Array.from(new Set(groups.flatMap((g) => g.members.map((m) => m.id))));
    if (!ids.length) { setCounts({}); return; }
    (async () => {
      setLoading(true);
      const next: Record<string, { orders: number; candidates: number }> = {};
      const { data: subs } = await sb
        .from("manual_risk_submissions")
        .select("id, client_id")
        .in("client_id", ids);
      const subIds: string[] = [];
      const subToClient: Record<string, string> = {};
      (subs ?? []).forEach((s: any) => {
        if (!s.client_id) return;
        next[s.client_id] = next[s.client_id] ?? { orders: 0, candidates: 0 };
        next[s.client_id].orders += 1;
        subIds.push(s.id);
        subToClient[s.id] = s.client_id;
      });
      if (subIds.length) {
        const { data: cands } = await sb
          .from("manual_risk_candidates")
          .select("id, submission_id")
          .in("submission_id", subIds);
        (cands ?? []).forEach((c: any) => {
          const cid = subToClient[c.submission_id];
          if (!cid) return;
          next[cid] = next[cid] ?? { orders: 0, candidates: 0 };
          next[cid].candidates += 1;
        });
      }
      setCounts(next);
      setLoading(false);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, groups.map((g) => g.id).join(",")]);

  const mergeGroup = async (group: Group) => {
    const keeperId = keepers[group.id] ?? group.keeperId;
    const keeper = group.members.find((m) => m.id === keeperId);
    const losers = group.members.filter((m) => m.id !== keeperId);
    if (!keeper || !losers.length) return;
    if (!confirm(`Merge ${losers.length} account(s) into "${keeper.client_name}"? All their orders, candidates and contacts move across and the duplicates are removed.`)) return;

    setMerging(group.id);
    try {
      const loserIds = losers.map((l) => l.id);

      const { error: subErr } = await sb.from("manual_risk_submissions").update({ client_id: keeperId }).in("client_id", loserIds);
      if (subErr) throw subErr;

      const { error: ovErr } = await sb.from("manual_risk_candidates").update({ override_client_id: keeperId }).in("override_client_id", loserIds);
      if (ovErr) throw ovErr;

      const { error: batchErr } = await sb.from("manual_risk_invoice_batches").update({ client_id: keeperId }).in("client_id", loserIds);
      if (batchErr) throw batchErr;

      // Move contacts, skipping addresses the keeper already has
      const { data: keeperContacts } = await sb.from("manual_risk_contacts").select("email").eq("client_id", keeperId);
      const existing = new Set((keeperContacts ?? []).map((c: any) => (c.email || "").toLowerCase()));
      const { data: loserContacts } = await sb.from("manual_risk_contacts").select("id, email").in("client_id", loserIds);
      for (const contact of loserContacts ?? []) {
        const email = ((contact as any).email || "").toLowerCase();
        if (existing.has(email)) {
          await sb.from("manual_risk_contacts").delete().eq("id", (contact as any).id);
        } else {
          existing.add(email);
          await sb.from("manual_risk_contacts").update({ client_id: keeperId, is_default: false }).eq("id", (contact as any).id);
        }
      }

      const { error: delErr } = await sb.from("manual_risk_clients").delete().in("id", loserIds);
      if (delErr) throw delErr;

      toast.success(`Merged into "${keeper.client_name}"`);
      setDismissed((prev) => new Set(prev).add(group.id));
      onChanged();
    } catch (err: any) {
      toast.error(err?.message || "Merge failed");
    } finally {
      setMerging(null);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[88vh]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Search className="h-5 w-5 text-red-600" /> Similar accounts
          </DialogTitle>
          <DialogDescription>
            Accounts whose names look like the same client (spelling differences, extra words like "The"). Pick the one to keep and merge the rest into it.
          </DialogDescription>
        </DialogHeader>

        <ScrollArea className="max-h-[62vh] pr-3">
          {groups.length === 0 ? (
            <div className="text-center py-10 text-muted-foreground flex flex-col items-center gap-2">
              <CheckCircle2 className="h-8 w-8 text-green-600" />
              No similar account names found.
            </div>
          ) : (
            <div className="space-y-3">
              {loading && (
                <p className="text-xs text-muted-foreground flex items-center gap-2">
                  <Loader2 className="h-3 w-3 animate-spin" /> Counting orders and candidates…
                </p>
              )}
              {groups.map((group) => {
                const keeperId = keepers[group.id] ?? group.keeperId;
                return (
                  <Card key={group.id} className="p-3">
                    <div className="space-y-2">
                      {group.members.map((m) => {
                        const c = counts[m.id] ?? { orders: 0, candidates: 0 };
                        return (
                          <label key={m.id} className="flex items-center gap-3 cursor-pointer">
                            <input
                              type="radio"
                              name={`keep-${group.id}`}
                              checked={keeperId === m.id}
                              onChange={() => setKeepers((p) => ({ ...p, [group.id]: m.id }))}
                              className="accent-red-600"
                            />
                            <span className="font-medium flex-1">{m.client_name}</span>
                            {m.is_regular && <Badge className="bg-amber-500 text-white">Regular</Badge>}
                            <span className="text-xs text-muted-foreground whitespace-nowrap">
                              {c.orders} order(s) · {c.candidates} candidate(s)
                            </span>
                            {keeperId === m.id && <Badge variant="outline">Keep</Badge>}
                          </label>
                        );
                      })}
                    </div>
                    <div className="flex justify-end gap-2 mt-3">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setDismissed((prev) => new Set(prev).add(group.id))}
                      >
                        Not the same
                      </Button>
                      <Button
                        size="sm"
                        className="bg-red-600 hover:bg-red-700"
                        disabled={merging === group.id}
                        onClick={() => mergeGroup(group)}
                      >
                        {merging === group.id ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Merge className="h-4 w-4 mr-2" />}
                        Merge into selected
                      </Button>
                    </div>
                  </Card>
                );
              })}
            </div>
          )}
        </ScrollArea>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Close</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default DuplicateClientsDialog;
