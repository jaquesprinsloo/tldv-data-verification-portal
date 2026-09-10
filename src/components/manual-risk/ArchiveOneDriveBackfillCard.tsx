import { useEffect, useRef, useState } from "react";
import { supabase as sb } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { CloudUpload } from "lucide-react";

/**
 * Copies archive reports and indemnities that were imported before OneDrive
 * mirroring existed into the same OneDrive folders current submissions use.
 *
 * The work runs on the server in small batches; this card keeps asking for the
 * next batch until nothing is left, and stops on its own if a batch makes no
 * further progress (so unreadable files never loop forever).
 */

type BatchResult = {
  success: boolean;
  error?: string;
  processed: number;
  uploaded: number;
  failed: number;
  remaining: number;
  logs?: string[];
};

export function ArchiveOneDriveBackfillCard({ addLog }: { addLog: (s: string) => void }) {
  const [remaining, setRemaining] = useState<number | null>(null);
  const [running, setRunning] = useState(false);
  const [copied, setCopied] = useState(0);
  const [failed, setFailed] = useState(0);
  const stop = useRef(false);

  const callBackfill = async (payload: Record<string, unknown>): Promise<BatchResult> => {
    const { data, error } = await sb.functions.invoke("backfill-archive-onedrive", { body: payload });
    if (error) throw error;
    if (!(data as any)?.success) throw new Error((data as any)?.error || "Backfill failed");
    return data as BatchResult;
  };

  const refreshCount = async () => {
    try {
      const res = await callBackfill({ countOnly: true });
      setRemaining(res.remaining);
    } catch {
      setRemaining(null);
    }
  };

  useEffect(() => { refreshCount(); /* eslint-disable-next-line */ }, []);

  const run = async () => {
    stop.current = false;
    setRunning(true);
    setCopied(0);
    setFailed(0);
    let totalUp = 0, totalBad = 0, lastRemaining = Infinity, stalls = 0;

    let wake: any = null;
    try { wake = await (navigator as any).wakeLock?.request?.("screen"); } catch { /* not available */ }

    try {
      for (let i = 0; i < 5000; i++) {
        if (stop.current) break;
        const res = await callBackfill({ maxCopies: 4 });

        totalUp += res.uploaded;
        totalBad += res.failed;
        setCopied(totalUp);
        setFailed(totalBad);
        setRemaining(res.remaining);
        (res.logs ?? []).forEach(addLog);
        if (res.remaining === 0) break;
        // No file moved and nothing left the queue — stop instead of spinning.
        if (res.uploaded === 0 && res.remaining >= lastRemaining) {
          stalls += 1;
          if (stalls >= 2) {
            addLog("Backfill stopped — the remaining files could not be copied.");
            break;
          }
        } else {
          stalls = 0;
        }
        lastRemaining = res.remaining;
      }
      toast.success(`OneDrive backfill: ${totalUp} file(s) copied${totalBad ? `, ${totalBad} failed` : ""}`);
    } catch (e: any) {
      toast.error("Backfill stopped: " + e.message);
      addLog(`Backfill error: ${e.message}`);
    } finally {
      setRunning(false);
      try { wake?.release?.(); } catch { /* ignore */ }
      refreshCount();
    }
  };

  return (
    <Card className="p-4 space-y-3">
      <h3 className="font-semibold flex items-center gap-2">
        <CloudUpload className="h-4 w-4 text-red-600" /> Copy older archive documents to OneDrive
      </h3>
      <p className="text-sm text-muted-foreground">
        Reports and indemnities that were loaded before the OneDrive copy existed are still only in the
        portal. This copies them into the same OneDrive folders as current submissions, including the
        client-shared folder for indemnities and reports. Files already copied are skipped.
      </p>

      <div className="flex flex-wrap items-center gap-3 text-sm">
        <span className="text-muted-foreground">
          {remaining === null ? "Checking what is outstanding…" :
            remaining === 0 ? "Everything is already on OneDrive." :
              `${remaining} order(s) still have documents to copy.`}
        </span>
        {running && <span className="text-muted-foreground">Copied {copied}{failed ? ` • ${failed} failed` : ""}</span>}
      </div>

      <div className="flex gap-2">
        <Button
          className="bg-red-600 hover:bg-red-700"
          size="sm"
          disabled={running || remaining === 0}
          onClick={run}
        >
          {running ? "Copying…" : "Start copying to OneDrive"}
        </Button>
        {running && (
          <Button size="sm" variant="outline" onClick={() => { stop.current = true; }}>
            Stop after this batch
          </Button>
        )}
        {!running && (
          <Button size="sm" variant="ghost" onClick={refreshCount}>Refresh</Button>
        )}
      </div>
    </Card>
  );
}
