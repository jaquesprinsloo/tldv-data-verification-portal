# Archive Import of 1867 Historical Checks

Goal: load 1867 already-invoiced historical checks into the portal so they can be searched, and so their indemnities and old-style reports can be viewed (especially by client-facing profiles) — without affecting invoicing, profitability or the "in progress" workload.

## Step 1 — Account reconciliation (before anything is created)

You send the CSV. I produce a spreadsheet for you to approve, with three lists:

1. **Exact matches** — Store / Account values that already exist as clients.
2. **Possible duplicates** — close names (e.g. "Cash Crusaders Table Bay Mall" vs "CC Table Bay Mall"), shown side by side with how many old checks each covers, so you decide same or different.
3. **To be created** — everything left over.

Nothing is created until you confirm that sheet. Then the new clients are added with:
- Client name: exactly as in the Store / Account column
- Contact person: Ntombi
- Email: hradmin1@cashcrusaders.co.za
- CC: admin@tldv.co.za

## Step 2 — Load the candidates

Each **store + submission date** in the CSV becomes one archive order, e.g. "ARCHIVE — Cash Crusaders Table Bay Mall — 01 December 2024". Candidates are loaded under it with first name, second name, surname, ID number and gender, each recorded as having had ID Verification and Risk Assessment.

Every archive order is marked as already sent and already invoiced, and flagged as archive so it never appears in the submissions queue, the invoicing list, supplier reconciliation or any profit figure.

Outcomes (ID valid / risk) are left blank at load time and filled in from the old report where the report clearly states them — the report stays the authoritative record.

## Step 3 — A bulk document uploader

A new **Archive Import** screen (master admin only) inside Risk Assessments, with two bulk drop zones:

- **Indemnities** — you drag in a whole date folder (or a parent folder of many date folders). The screen reads the folder names to work out the date, shows which archive order each folder will attach to, and lets you correct any mismatch before uploading. Random file names are fine; files stay grouped under the order.
- **Reports** — one report per batch. Same folder-based date matching; the report is attached to the archive order so every candidate in it opens the same document.

The uploader shows live progress, keeps running while you switch tabs, skips anything already uploaded (so it is safe to re-run), and lists anything it could not match for you to place manually.

Optionally it also files the same documents into the client-shared OneDrive folder, matching how current submissions work.

## Step 4 — What each profile sees

- **Client-facing profiles**: archive candidates appear in Accounts and in the ID/name search, with an icon to view the old report and an icon to view the indemnities — view-only, no download, print or share, exactly as today.
- **Dashboard**: total candidates screened includes the archive (so your full history shows), but archive checks are counted as completed and invoiced — they never inflate "still in progress" and never touch profitability or costing.
- **Supplier reports**: not part of this at all.

## Step 5 — Verification

After loading I report back: candidates loaded vs 1867, orders created, clients created, indemnity files attached vs orders without any, reports attached vs orders without one. Anything unmatched is listed by name so you can fix it in one pass.

## Still needed from you

- The CSV file itself.
- The screenshots of how the indemnity folders are saved, the sample report, and your data sheet — they did not come through with your last message. The folder-naming detail decides how automatic the matching can be; if the dates are not in the folder names, the uploader falls back to you picking the order per folder.

## Technical notes

- New column `is_archive` (plus `archive_batch_label`) on `manual_risk_submissions`; all archive-excluding filters in `MrDashboardTab`, `MrClientDashboardTab`, `MrInvoicedTab`, `SupplierReconTab` and the submissions list keyed off it.
- Archive orders: `status` = sent, `sent_at` / `invoiced_at` populated from the submission date, `requested_checks` = ID verification + risk assessment.
- Indemnities reuse the existing `manual-risk-indemnities` bucket and the `indemnity_files` jsonb; a new private bucket `archive-reports` stores the old-style report per order, referenced by a new `archive_report_path` column.
- Report viewing for archive orders serves the stored PDF through the existing protected `PdfPreview` surface instead of regenerating from data.
- Import runs client-side in batched inserts with an idempotency key (client + date + ID number) so a re-run cannot duplicate candidates.
