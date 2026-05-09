## Goal

Continue the deferred-extraction rollout by stripping AI extraction from the remaining upload paths, while preserving each component's existing UI, validation, and signed-URL handling.

## Changes

### 1. `src/components/reports/BatchUploadSection.tsx`
- Remove the per-file `supabase.functions.invoke('extract-polygraph-report', ...)` call inside the upload loop.
- Keep existing PDF/DOCX validation, file-list UI, per-file status indicators, batch name/account/store/examiner selectors, and the "Add Examiner" flow.
- Keep current storage upload pattern (private `polygraph-reports` bucket, signed URLs / proxy where used) — do **not** switch to `getPublicUrl`.
- Insert a row into `pending_polygraph_uploads` per file with `extracted_data: null`, `status: 'pending'`, the chosen `account_id`, `store_id`, `examiner_id`, `original_file_url`, `original_file_name`, `uploaded_by`.
- Toast copy: "Submitted for review — Master Admin will extract and approve."

### 2. `src/components/reports/DocumentUploadTab.tsx`
- Remove the call to `process-pending-upload`.
- Upload file to storage and insert a `pending_document_uploads` (or `pending_polygraph_uploads` for polygraph type) row with file metadata only — no AI extraction, no auto store match.
- Reviewer will assign store manually in the Pending Review screen.

### 3. `src/pages/ExaminerPortal.tsx`
- Remove the `extract-polygraph-report` invocation on examiner uploads.
- Keep file upload + insert pending row; examiner sees "submitted for review" confirmation.

### 4. `supabase/functions/approve-pending-upload/index.ts`
- Strip any branch that re-runs AI extraction on approval.
- For polygraph approvals: copy `extracted_data` (already populated by reviewer's manual extract step) into `polygraph_reports`.
- For invoice/document approvals: just promote file + manually entered metadata; no AI.

### 5. Delete unused edge functions
- `supabase/functions/process-pending-upload/` — no longer called.
- `supabase/functions/extract-invoice-data/` — out of scope per earlier confirmation.
- Call `supabase--delete_edge_functions` to remove them from the deployed backend.

## Not changing

- `extract-polygraph-report` — kept, only invoked from `PendingPolygraphReview.tsx` "Extract Data with AI" button (already implemented).
- `generate-pre-risk-profile` — unchanged, runs on PreAppliCheck submission.
- `PendingPolygraphReview.tsx` — already updated in previous step.
- `PolygraphReportsSection.tsx` (single upload) — already updated in previous step.

## Verification

After edits:
1. Confirm no remaining `extract-polygraph-report` or `process-pending-upload` invocations exist outside `PendingPolygraphReview.tsx` (`rg "extract-polygraph-report|process-pending-upload" src/`).
2. Build passes.
3. Manual smoke test: batch upload 2 PDFs → both appear in Pending Review with no extracted data → click "Extract Data with AI" on one → fields populate → Approve copies to `polygraph_reports`.

## Net result

AI runs only on PreAppliCheck submission and the reviewer's explicit "Extract Data" click. All other upload paths are pure file-upload + pending-row inserts.
