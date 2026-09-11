# Stop the data timeouts on the Risk Assessments screens

## What is happening

The database is cancelling some of the app's read requests because they take too
long. When that happens the screen shows a spinner and then an empty list.

The cause is not table size — the orders and candidate tables are small and
already indexed. The cause is how much the screens ask for and how often:

- The orders list asks for every column of every order, with no page size.
- Several screens each read every candidate row in 1,000-row pages, even when
  their tab is not open.
- Account, employee-check and archive screens repeat those full reads.

Under bulk work (archive imports, report audits) all of that runs at once, and
some requests get cancelled.

## Proposed changes

1. Only load a tab's data when that tab is open, instead of on page entry.
2. Ask for just the fields each screen uses, instead of every column.
3. Give the orders list a bounded page size with a filter on date/account, so it
   never reads the whole table in one request.
4. Cache the archive-wide candidate scans and share one copy between the archive
   reconciliation and audit cards instead of two independent full reads.
5. Re-check the timeout log afterwards and confirm it stops.

## Technical notes

- `src/pages/ManualRiskAssessments.tsx`: replace `select("*")` on
  `manual_risk_submissions` with an explicit column list; gate the heavy tab
  queries on `activeTab`.
- `MrDashboardTab.tsx`, `MrEmployeeCheckTab.tsx`, Accounts queries: shared
  candidate query key with narrowed columns, one paginated fetch reused.
- Archive cards: single shared `useQuery` for archive candidates.
- Also worth reviewing the `has_account_access` permission-denied entries seen at
  the same timestamps; the helper may need `GRANT EXECUTE` for the roles the
  policies run as.
