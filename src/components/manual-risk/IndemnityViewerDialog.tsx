import { useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import * as pdfjsLib from "pdfjs-dist";
import pdfWorkerUrl from "pdfjs-dist/build/pdf.worker.min.mjs?url";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { FileText, Lock, ArrowLeft } from "lucide-react";

pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorkerUrl;

export type IndemnityFileRef = { path: string; name?: string };

/** Canvas-rendered, view-only document surface (no download / print / copy). */
function ProtectedDoc({ blob, name }: { blob: Blob; name: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const [status, setStatus] = useState("Loading document…");

  useEffect(() => {
    let cancelled = false;
    const tasks: any[] = [];
    let pdfDoc: any = null;
    let objectUrl: string | null = null;

    const run = async () => {
      const container = ref.current;
      if (!container) return;
      container.innerHTML = "";
      try {
        if (blob.type.startsWith("image/")) {
          objectUrl = URL.createObjectURL(blob);
          const img = document.createElement("img");
          img.src = objectUrl;
          img.style.maxWidth = "100%";
          img.style.display = "block";
          img.style.margin = "0 auto";
          img.draggable = false;
          container.appendChild(img);
          if (!cancelled) setStatus("");
          return;
        }

        const data = await blob.arrayBuffer();
        pdfDoc = await pdfjsLib.getDocument({ data }).promise;
        if (cancelled) return;
        const targetWidth = Math.min(880, Math.max(320, container.clientWidth - 32));
        const ratio = window.devicePixelRatio || 1;

        for (let n = 1; n <= pdfDoc.numPages; n += 1) {
          const page = await pdfDoc.getPage(n);
          if (cancelled) return;
          const base = page.getViewport({ scale: 1 });
          const viewport = page.getViewport({ scale: targetWidth / base.width });
          const canvas = document.createElement("canvas");
          const ctx = canvas.getContext("2d");
          if (!ctx) continue;
          canvas.width = Math.floor(viewport.width * ratio);
          canvas.height = Math.floor(viewport.height * ratio);
          canvas.style.width = `${viewport.width}px`;
          canvas.style.height = `${viewport.height}px`;
          canvas.style.display = "block";
          canvas.style.background = "white";
          canvas.style.boxShadow = "0 1px 8px rgba(0,0,0,0.12)";
          ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
          const wrap = document.createElement("div");
          wrap.style.display = "flex";
          wrap.style.justifyContent = "center";
          wrap.style.padding = "12px";
          wrap.appendChild(canvas);
          container.appendChild(wrap);
          const task = page.render({ canvasContext: ctx as any, viewport });
          tasks.push(task);
          await task.promise;
        }
        if (!cancelled) setStatus("");
      } catch (e: any) {
        if (cancelled || e?.name === "RenderingCancelledException") return;
        setStatus("This document cannot be displayed in the viewer.");
      }
    };

    run();
    return () => {
      cancelled = true;
      tasks.forEach((t) => t.cancel?.());
      pdfDoc?.destroy?.();
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [blob]);

  return (
    <div
      className="flex-1 min-h-0 overflow-auto bg-muted/30 select-none no-print"
      onContextMenu={(e) => e.preventDefault()}
      onDragStart={(e) => e.preventDefault()}
      aria-label={name}
    >
      {status && <div className="p-6 text-sm text-muted-foreground">{status}</div>}
      <div ref={ref} className="min-h-full" role="document" />
    </div>
  );
}

/**
 * Read-only indemnity viewer for client-facing profiles: lists the indemnity
 * documents uploaded for a submission and displays them inside the app only.
 */
export function IndemnityViewerDialog({
  orderNumber, files, onClose,
}: {
  orderNumber: string;
  files: IndemnityFileRef[];
  onClose: () => void;
}) {
  const [open, setOpen] = useState<{ blob: Blob; name: string } | null>(null);
  const [loading, setLoading] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const view = async (f: IndemnityFileRef) => {
    setLoading(f.path);
    setError(null);
    try {
      const { data, error: dlErr } = await supabase.storage
        .from("manual-risk-indemnities")
        .download(f.path);
      if (dlErr || !data) throw dlErr ?? new Error("File unavailable");
      setOpen({ blob: data, name: f.name ?? f.path.split("/").pop() ?? "Indemnity" });
    } catch (e) {
      setError((e as Error).message || "Unable to open this document.");
    } finally {
      setLoading(null);
    }
  };

  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-4xl max-h-[92vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileText className="h-4 w-4 text-red-600" />
            Indemnities — {orderNumber}
          </DialogTitle>
          <DialogDescription className="flex items-center gap-1.5">
            <Lock className="h-3 w-3" /> View only. Downloading, printing and sharing are disabled.
          </DialogDescription>
        </DialogHeader>

        {open ? (
          <div className="flex-1 min-h-0 flex flex-col">
            <div className="flex items-center gap-2 pb-2">
              <Button variant="outline" size="sm" onClick={() => setOpen(null)}>
                <ArrowLeft className="h-4 w-4 mr-1" /> Back to list
              </Button>
              <span className="text-sm text-muted-foreground truncate">{open.name}</span>
            </div>
            <ProtectedDoc blob={open.blob} name={open.name} />
          </div>
        ) : (
          <div className="flex-1 min-h-0 overflow-auto space-y-2">
            {error && <p className="text-sm text-red-600">{error}</p>}
            {files.length === 0 ? (
              <p className="text-sm text-muted-foreground py-6 text-center">
                No indemnity documents were uploaded for this submission.
              </p>
            ) : files.map((f) => (
              <Card key={f.path} className="p-3 flex items-center justify-between gap-3">
                <span className="text-sm truncate">{f.name ?? f.path.split("/").pop()}</span>
                <Button size="sm" variant="outline" disabled={loading === f.path} onClick={() => view(f)}>
                  {loading === f.path ? "Opening…" : "View"}
                </Button>
              </Card>
            ))}
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Close</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default IndemnityViewerDialog;
