# Re-scan archive reports, passport numbers, and a searchable employee list

## 1. Full re-scan of every archive report (outcome verification)

Today the audit only ticks off which people a report names. It does not re-check
what the supplier report actually said about each person, so wrong outcomes stay
on record.

New behaviour on the archive audit card: a **Re-scan reports & verify outcomes**
button that reads every report again and rewrites each person's two results,
strictly per person:

- No ID check on the report → ID stays blank, and the Risk Assessment shows
  exactly what the report says (no risk / risk identified).
- ID check done and it failed → Risk Assessment is marked invalid with the
  standard explanation.
- ID check done and confirmed → ID valid, and the Risk Assessment stands on its
  own wording.
- One person's failed ID never affects anyone else on the same report; each
  person's wording is taken only from their own block, and copied wording is
  ignored.

The card reports how many people's results changed, and lists any order where
the report could not be read. Progress is shown per order and can be stopped.

## 2. Foreign nationals — add passport numbers

New panel in the Archive Import tab: **People without a full ID number**
(48 people today). Each row shows the person, their account and order, whatever
document number is on record, and a box to type and save their passport number.
Saved passport numbers are then searchable everywhere candidates are searched.

## 3. Employee Check tab (client-facing) — complete searchable list

Above the existing upload tool, add the full list of everyone on record for that
client: first name, surname, ID number, passport number, account, order and
screening date, with a search box at the top that matches on name, surname, ID
number or passport number. The list is paged so it stays fast, and can be
downloaded.

## Technical notes

- Migration: add `passport_number text` to `manual_risk_candidates` (nullable),
  plus an index for search. Grants/RLS unchanged (existing policies cover it).
- `src/lib/archiveReportOutcomes.ts`: export a reusable
  `applyArchiveOutcomesFromRecords(records, candidates)` so the audit reuses the
  exact same three-state ID classification and per-candidate isolation as the
  single-report path (no duplicate rules).
- `ArchiveReportAuditCard.tsx`: extend `auditFile` to also apply outcomes from
  the same extraction pass (one AI read per report, not two), and count changes.
- New `ArchivePassportsCard.tsx` rendered inside `ArchiveImportTab.tsx`.
- `MrEmployeeCheckTab.tsx`: reuse the existing paginated candidate load, add the
  searchable table, include `passport_number` in the select and in matching.
