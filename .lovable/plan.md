## Goal

Polygraph reports should upload **without** running AI extraction. The reviewer opens the upload, reads the raw PDF, then clicks **"Extract Data"** to run AI extraction on demand, reviews the result, and finally clicks **Approve**.

PreAppliCheck Pre-Risk extraction (on candidate submission) stays exactly as-is.

## What changes

### 1. Upload paths — stop auto-extracting

| Where | Today | After |
|---|---|---|
| **Reports → Polygraph Reports** (single upload) | Upload → AI extracts → save to `polygraph_reports` | Upload → row created in `pending_polygraph_uploads` with file only, no AI. Goes to Pending Review queue. |
| **Reports → Batch Upload** | Each file → AI extracts → `pending_polygraph_uploads` | Each file → `pending_polygraph_uploads` with file only, no AI. |
| **Reports → Document Upload** (generic) | AI runs `process-pending-upload` (matches store, extracts) | Upload only — file saved, no AI. Reviewer assigns store manually. |
| **Examiner Portal upload** | AI extracts on upload | Upload only, no AI. |

### 2. Pending Polygraph Review screen — add "Extract Data" button

In `PendingPolygraphReview.tsx` review dialog:
- Header shows raw PDF viewer + file metadata (no extracted fields populated yet).
- New **"Extract Data with AI"** button (visible when `extracted_data` is null).
- Clicking it calls `extract-polygraph-report`, saves results back to the row, populates the editable fields below.
- Button changes to **"Re-extract"** afterwards (in case reviewer wants to retry).
- **Approve** button stays the same — it copies the (now-extracted, possibly edited) data into `polygraph_reports`. No AI runs at approval time.

### 3. Functions removed

- `process-pending-upload` (no longer called) — delete edge function.
- `extract-invoice-data` (out of scope per earlier confirmation) — delete edge function and remove invoice AI extraction UI.
- `approve-pending-upload` keeps working for non-polygraph docs but no longer invokes AI.

### 4. Functions kept

- `extract-polygraph-report` — now only called from the reviewer's dialog button.
- `generate-pre-risk-profile` — unchanged, still runs at PreAppliCheck submission.

## Files affected

**Edit:**
- `src/components/reports/PolygraphReportsSection.tsx` — remove extraction call from upload; insert into `pending_polygraph_uploads` instead.
- `src/components/reports/BatchUploadSection.tsx` — remove extraction call from upload loop.
- `src/components/reports/DocumentUploadTab.tsx` — remove `process-pending-upload` call; just upload + insert pending row.
- `src/pages/ExaminerPortal.tsx` — remove extraction on upload.
- `src/pages/PendingPolygraphReview.tsx` — add "Extract Data with AI" button in review dialog; show raw-PDF-only state when no extracted_data yet.
- `supabase/functions/approve-pending-upload/index.ts` — strip any AI re-processing.

**Delete:**
- `supabase/functions/process-pending-upload/`
- `supabase/functions/extract-invoice-data/`

## Net result

- AI runs **only** on: PreAppliCheck submission, and the reviewer's explicit "Extract Data" click.
- Uploads are instant (no waiting for AI).
- Rejected uploads cost zero AI credits.
- Reviewer sees raw PDF first, decides whether to invest the AI extraction.
