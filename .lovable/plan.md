# Review archive checks with unverified reports

## What will change
- Add a review list beneath the archive report audit for every order containing candidates still not confirmed by its attached report.
- Group candidates by order and show the account, submission date, order number, candidate names, and why the order needs review.
- Distinguish orders with no report from orders that have a report but still contain unconfirmed names.
- Let the master profile open the attached Risk Assessment and each indemnity directly from the review row.
- Add controls to delete an incorrect report or indemnity, then drag-and-drop or choose the correct replacement files for that same order.
- Refresh the audit totals and review list immediately after document changes.

## Safety
- Require confirmation before deleting files.
- Remove deleted files from private storage, their internal/client-shared OneDrive copies, and the order record.
- Keep archive orders, candidates, outcomes, and other documents unchanged.

## Technical details
- Reuse the existing signed-file viewing and OneDrive deletion flow already used by Reports First.
- Derive the list from archive candidates whose report confirmation is missing or does not match their order’s current report filename.
- Reuse the existing archive attachment flow so replacement files retain current storage and OneDrive behavior.
