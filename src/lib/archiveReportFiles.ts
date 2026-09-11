// An archive order can carry more than one Risk Assessment report: the original
// batch report plus any separate reports issued for individual people on the
// same order. The list lives in `archive_report_files`; the older single
// `archive_report_path`/`archive_report_name` columns are kept as the primary
// report so existing mirroring and viewers keep working.

export type ArchiveReportFile = {
  path: string;
  name: string;
  uploaded_at?: string | null;
  onedrive_item_id?: string | null;
  shared_onedrive_item_id?: string | null;
};

/** Every report attached to one archive order, oldest first, de-duplicated. */
export function archiveReportFiles(sub: any): ArchiveReportFile[] {
  const raw = Array.isArray(sub?.archive_report_files) ? sub.archive_report_files : [];
  const out: ArchiveReportFile[] = [];
  const seen = new Set<string>();
  const push = (f: ArchiveReportFile | null) => {
    if (!f?.path || seen.has(f.path)) return;
    seen.add(f.path);
    out.push(f);
  };
  raw.forEach((f: any) =>
    push(
      f?.path
        ? {
            path: String(f.path),
            name: String(f.name ?? String(f.path).split("/").pop() ?? "report.pdf"),
            uploaded_at: f.uploaded_at ?? null,
            onedrive_item_id: f.onedrive_item_id ?? null,
            shared_onedrive_item_id: f.shared_onedrive_item_id ?? null,
          }
        : null,
    ),
  );
  if (sub?.archive_report_path) {
    push({
      path: String(sub.archive_report_path),
      name: String(sub.archive_report_name ?? String(sub.archive_report_path).split("/").pop() ?? "report.pdf"),
      uploaded_at: null,
      onedrive_item_id: sub.report_onedrive_item_id ?? null,
      shared_onedrive_item_id: sub.report_shared_onedrive_item_id ?? null,
    });
  }
  return out;
}

/** File names of every report on the order, lower-cased for comparison. */
export function archiveReportNameSet(sub: any): Set<string> {
  return new Set(archiveReportFiles(sub).map((f) => f.name.trim().toLowerCase()));
}

export const hasArchiveReport = (sub: any) => archiveReportFiles(sub).length > 0;
