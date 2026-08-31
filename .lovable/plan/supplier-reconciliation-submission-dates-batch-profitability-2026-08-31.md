# Supplier reconciliation, submission dates & batch profitability

## 1. Submission date visible and filterable

- Every check now carries two dates: **Submitted** (when the submission was created) and **Sent** (when the report was released). Both are shown side by side in the Accounts tables and in the Excel export.
- The Accounts tab gets a **time-window filter** at the top: from/to dates plus quick presets (this week, this month, last month, this year). A selector chooses whether the window applies to the *submitted* date or the *sent* date — default submitted.
- While a window is active, the Accounts tab shows a flat "checks in this window" list across all accounts (client, order #, candidate, ID number, submitted, sent, discount flags) with the per-account totals recalculated for that window, and an Excel export of exactly that list.
- The date filter inside each account dialog uses the same submitted/sent basis.

## 2. Supplier statement upload and reconciliation (new "Supplier Recon" tab)

- Upload the supplier `.xlsx` (the format of the attached file: header row `Enquiry no / Created at / Internal order number / Contact name / Full name / ID number / DOB / Gender / Check status / Check title / Check result`). The summary block above the header is ignored; parsing starts at the detected header row.
- Each upload creates a **statement batch** (name, period, source filename, optional supplier invoice number/total, notes). All rows are stored so the data stays on the system for reference.
- **Auto-matching** against our own records, per line: match on ID number, then confirm the check type (supplier `Check title` → our check keys, e.g. *Verification of ID number* → ID verification, *Risk Assessment* → risk assessment) and, when available, the internal order number.
  - `Matched` — we have that candidate and that check.
  - `Check not requested` — candidate exists but we never requested this check type.
  - `Not on system` — no candidate with that ID number.
- Rows we cannot account for are **highlighted in red** (not on system) and **amber** (check not requested), with a summary strip: total lines, matched, unmatched, plus the reverse view — checks we submitted in the batch period that do **not** appear on the supplier statement.
- Filters: show all / unmatched only / matched only, and free-text search on name or ID number. Export the reconciliation to Excel.

## 3. Price list and batch profitability

- New **Pricing** panel (inside the Supplier Recon tab) holding editable rates: supplier cost and client price for *Risk Assessment*, *ID Verification*, *Criminal*, *Credit*, *Driver's licence*, *PDP*, *Qualification*, plus the *TLDV internal* discount (default 100%) and the *PTVS* discount percentage. Rates are stored in the database and used for all calculations.
- Each statement batch shows a **profit summary**:
  - Supplier cost — from the statement lines (line count per check type × supplier cost), plus an optional manually entered supplier invoice total so any difference against the calculated cost is flagged.
  - Client billing — from our own checks in that batch/window (per check type × client price), with TLDV internal and PTVS discounts applied.
  - Gross profit and margin %, with a red warning when a batch runs at a loss.
- Existing invoice batches in the Invoiced tab get the same billing/cost/profit figures using the price list, so invoicing on our side can be compared against the supplier charge.

## Technical notes

- New tables: `manual_risk_supplier_batches`, `manual_risk_supplier_lines`, `manual_risk_pricing` (key/value rate rows). RLS restricted to `admin` / `master_admin`, with grants; batch delete cascades to lines.
- Parsing/export uses the `xlsx` package already in the project; no edge function needed — the file is read in the browser and rows are inserted in chunks.
- Accounts date filtering reads `manual_risk_submissions.created_at` (already adjustable when a submission is created) for the submitted date and `sent_at` for the release date.
- Work is contained in `src/pages/ManualRiskAssessments.tsx` plus new components under `src/components/manual-risk/` (`SupplierReconTab.tsx`, `PricingPanel.tsx`) to keep the page manageable.
