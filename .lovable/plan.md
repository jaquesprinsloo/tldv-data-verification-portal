# Offline report capture for examiners

Yes, this is possible. The examiner app already installs to the phone/laptop as an app, so it can be extended to keep working with no signal and upload by itself once signal returns.

## What the examiner would experience

1. Before leaving, they open their profile once with signal. The app downloads the day's bookings, candidates and the blank report form onto the device. To start work, the examiner chooses **Single submission** (one report) or **Batch** (multiple reports under one sitting). A short setup follows as pop-ups — also working offline: first the **type of test** (Pre Employment, Periodic Screening, or Diagnostic), then the **client name** (chosen from a list that was downloaded, with a free-text option for a new client), the **appointment date**, and **where the appointment is taking place** (chosen from the pre-approved venues, with a free-text option). For a batch, these details are captured once and apply to every report in it.
2. On site, with no signal, they open the candidate and complete the report on screen — questions asked one at a time, answers captured as they go, nothing pre-filled from a previous person. If someone turns up unplanned, the examiner taps "Add walk-in candidate", enters the person's name and ID number, and completes the report the same way — the blank report form is on the device, so it works with no signal.
   - A batch can mix test types: when plans change on site, the examiner can add or change the test type per report inside the batch, so one sitting can hold both Pre Employment and Periodic Screening reports. The report form (template) that opens follows the test type chosen for that report.
   - The examiner does not need a list of names in advance — they capture each candidate's name, surname and ID number as they go. If that ID number and name exactly match a risk assessment or a completed PreAppliCheck screening already on the system, the report links to it automatically. The examiner only sees "Linked" — they can never open or read those other checks.
   - Once the report is uploaded and approved by the master profile, the link carries through to the client-facing search: when a client-facing profile searches an ID number, they see that person's risk assessment, their polygraph report, and their online screening together, whichever ones exist.
3. Recordings for that candidate are attached and held on the device.
4. They press Save. A clear badge shows "Saved on this device — waiting to upload".
5. When signal returns, the app uploads the report and recordings by itself, one file at a time, and the badge turns to "Uploaded — awaiting Master Admin review". If a file fails it retries; nothing is lost and nothing needs re-typing.
6. Master Admin sees it in the existing pending review queue, exactly as uploaded reports arrive today. Walk-in reports arrive flagged "unplanned" for the office to link to the right booking or client, so nothing gets invoiced or delivered to the wrong account.

This also removes the Word-template problem: instead of reusing a document with last person's answers still in it, each report starts blank and is tied to one named candidate, so answers can't carry over.

## What needs building

1. **On-screen report form** — the Word template turned into sections and questions on screen (suitability, exam questions and findings, admissions, notes, overall result), so answers are captured per candidate rather than typed into a reused document.
2. **Offline storage on the device** — reports, answers and recordings saved locally on the device, surviving the app being closed or the device restarting.
3. **Offline app shell and data** — the examiner pages, the report form and the day's bookings made available with no signal.
4. **Upload queue** — a visible list of items waiting to upload, with automatic retry when signal returns, plus a manual "Upload now" button and a per-item status.
5. **Recordings handling** — large files held on device and uploaded in the background with resume-on-failure, with a warning when device storage is low.
6. **Generated report document** — once uploaded, the captured answers produce the report in the standard layout, so Master Admin review and client delivery stay unchanged.

## Notes and limits

- Recordings are large. A phone can comfortably hold a day of them, but the examiner must not clear the app's data before uploading — the app will warn while items are still pending.
- Signing in must happen while online. The session stays valid offline for a period; if it lapses, work stays saved on the device and uploads after the next sign-in.
- Anything needing the internet during the interview (sanctions screening, ID verification look-ups) cannot run offline; those run once the report reaches the office.
- Everything uploaded keeps its own timestamps: when it was captured offline and when it was received, so the compliance trail stays intact.

## Technical detail

- PWA: extend `vite.config.ts` workbox config with a navigation fallback and an offline route allowance for `/examiner`; today the SW caches only the app shell and fonts.
- Local store: IndexedDB (via `idb`) with object stores `draft_reports`, `draft_answers`, `pending_files` (Blob), `sync_queue`; a `useOfflineDrafts` hook plus a sync worker triggered on `online`, on app focus, and on an interval.
- New tables: `examiner_report_drafts` (server copy of a submitted draft: examiner, appointment, candidate, answers jsonb, captured_at, device_id, sync status) with GRANTs and RLS (examiner sees own; admin/master_admin all). Reuse `pending_polygraph_uploads` for the review queue so Master Admin flow is unchanged.
- Report template: build the structured form from the Word template's fields, reusing the existing `SuitabilityQuestionnaire`, `ExamQuestionsForm`, `AdmissionAssessment` components where they fit; render the final PDF with the existing generator (`src/utils/polygraphTemplateGenerator.ts`).
- Uploads: resumable chunked upload to `polygraph-reports` and the OneDrive recording function, idempotent per draft id so retries don't duplicate.

## Suggested build order

Stage 1 — offline report form plus save/queue/upload for the report itself.
Stage 2 — offline recordings with background upload.
Stage 3 — generated report document and review-queue polish.
