// Historical (archive) orders predate the PreAppliCheck report template — the
// new template only applies from 01 July 2026. For those orders we always show
// and send the original supplier report exactly as it was received, never a
// regenerated summary. When an order carries several original reports they are
// merged into one PDF, in upload order.

import { supabase as sb } from "@/integrations/supabase/client";
import { archiveReportFiles } from "@/lib/archiveReportFiles";

/** True when the submission's report should be the stored original document. */
export function usesOriginalArchiveReport(sub: any): boolean {
  return !!sub?.is_archive && archiveReportFiles(sub).length > 0;
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

  try {
    const { PDFDocument } = await import("@cantoo/pdf-lib");
    const merged = await PDFDocument.create();
    for (const p of pdfs) {
      const src = await PDFDocument.load(await p.blob.arrayBuffer(), { ignoreEncryption: true });
      const pages = await merged.copyPages(src, src.getPageIndices());
      pages.forEach((pg) => merged.addPage(pg));
    }
    const bytes = await merged.save();
    return new Blob([new Uint8Array(bytes).slice().buffer], { type: "application/pdf" });
  } catch {
    return pdfs[0].blob;
  }
}
