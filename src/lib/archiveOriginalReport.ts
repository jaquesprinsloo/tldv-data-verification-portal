// Historical (archive) orders predate the PreAppliCheck report template — the
// new template only applies from 01 July 2026. For those orders we always show
// and send the original supplier report exactly as it was received, never a
// regenerated summary. When an order carries several original reports they are
// combined into one PDF, in upload order.
//
// Most supplier reports arrive password-protected. Copying pages out of a
// protected file leaves the page content unreadable, which is why orders with
// more than one report were opening completely blank. Those are combined by
// re-drawing each page as a picture instead, which always reads correctly.

import { supabase as sb } from "@/integrations/supabase/client";
import { archiveReportFiles } from "@/lib/archiveReportFiles";
import pdfWorkerUrl from "pdfjs-dist/build/pdf.worker.min.mjs?url";

/** True when the submission's report should be the stored original document. */
export function usesOriginalArchiveReport(sub: any): boolean {
  return !!sub?.is_archive && archiveReportFiles(sub).length > 0;
}

const isProtected = (bytes: Uint8Array) => {
  const head = new TextDecoder("latin1").decode(bytes);
  return head.includes("/Encrypt");
};

/** Combines protected PDFs by drawing every page as a picture into a new PDF. */
async function mergeByRedrawing(files: { bytes: Uint8Array; name: string }[]): Promise<Blob> {
  const [pdfjsLib, { PDFDocument }] = await Promise.all([
    import("pdfjs-dist"),
    import("@cantoo/pdf-lib"),
  ]);
  const workerUrl = (await import("pdfjs-dist/build/pdf.worker.min.mjs?url")).default;
  (pdfjsLib as any).GlobalWorkerOptions.workerSrc = workerUrl;

  const out = await PDFDocument.create();

  for (const f of files) {
    const doc = await (pdfjsLib as any).getDocument({ data: f.bytes.slice() }).promise;
    for (let i = 1; i <= doc.numPages; i++) {
      const page = await doc.getPage(i);
      const viewport = page.getViewport({ scale: 2 });
      const canvas = document.createElement("canvas");
      canvas.width = Math.ceil(viewport.width);
      canvas.height = Math.ceil(viewport.height);
      const ctx = canvas.getContext("2d")!;
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      await page.render({ canvasContext: ctx, viewport, canvas }).promise;

      const dataUrl = canvas.toDataURL("image/jpeg", 0.85);
      const img = await out.embedJpg(dataUrl);
      const base = page.getViewport({ scale: 1 });
      const pg = out.addPage([base.width, base.height]);
      pg.drawImage(img, { x: 0, y: 0, width: base.width, height: base.height });
      canvas.width = 0;
      canvas.height = 0;
    }
    await doc.destroy();
  }

  const bytes = await out.save();
  return new Blob([new Uint8Array(bytes).slice().buffer], { type: "application/pdf" });
}

/**
 * Downloads the original report(s) attached to an archive order.
 * Returns null when the order is not an archive order or has no stored report.
 */
export async function fetchArchiveOriginalReport(sub: any): Promise<Blob | null> {
  const files = sub?.is_archive ? archiveReportFiles(sub) : [];
  if (!files.length) return null;

  const blobs: { blob: Blob; name: string }[] = [];
  for (const f of files) {
    const { data, error } = await sb.storage.from("archive-reports").download(f.path);
    if (error || !data) continue;
    blobs.push({ blob: data, name: f.name });
  }
  if (!blobs.length) throw new Error("Original report unavailable");
  if (blobs.length === 1) return blobs[0].blob;

  const pdfs = blobs.filter((b) => /\.pdf$/i.test(b.name));
  if (pdfs.length <= 1) return blobs[0].blob;

  const loaded: { bytes: Uint8Array; name: string }[] = [];
  for (const p of pdfs) loaded.push({ bytes: new Uint8Array(await p.blob.arrayBuffer()), name: p.name });

  const anyProtected = loaded.some((l) => isProtected(l.bytes));

  if (!anyProtected) {
    try {
      const { PDFDocument } = await import("@cantoo/pdf-lib");
      const merged = await PDFDocument.create();
      for (const p of loaded) {
        const src = await PDFDocument.load(p.bytes.slice(), { ignoreEncryption: true });
        const pages = await merged.copyPages(src, src.getPageIndices());
        pages.forEach((pg) => merged.addPage(pg));
      }
      const bytes = await merged.save();
      return new Blob([new Uint8Array(bytes).slice().buffer], { type: "application/pdf" });
    } catch {
      /* fall through to redrawing */
    }
  }

  try {
    return await mergeByRedrawing(loaded);
  } catch {
    // Never hand back a blank document: fall back to the first original.
    return pdfs[0].blob;
  }
}
