# TFS check (sanctions screening) as a billable check

## What gets added

**1. New check option: "TFS Check"**
- Appears as a tick box wherever checks are chosen (new submission and Edit check selection), alongside ID Verification, Risk Assessment, etc.
- Outcomes: *Not Listed*, *Possible Match — under review*, *Listed (confirmed)*, *Pending*.

**2. Runs automatically when the submission is created**
- As soon as an order with TFS ticked is saved, every candidate on it is compared against the current Consolidated United Nations Security Council Sanctions list uploaded in the Compliance tab.
- Comparison uses, per candidate: first name + surname (including listed aliases), ID number, and passport number where one is captured.
- No hit → the candidate is marked **Not Listed** immediately, stamped with the list name, its version/date and the exact detail combination used.
- Hit → the candidate is left as **Possible Match — under review** and a possible match is logged for the Compliance tab.
- If TFS is added later through Edit check selection, screening runs then. A "Re-run TFS screening" action is available on the order.
- If no sanctions list has been uploaded yet, the candidate stays *Pending* with a note saying screening could not run, and the user is told to upload the list.

**3. Compliance tab notification**
- The Compliance tab gets a red count badge whenever possible matches are awaiting review.
- In "Possible sanctions matches" each row shows the candidate, ID/passport, the listed name, why it matched, and which list version. Confirming sets that candidate to **Listed (confirmed)**; dismissing sets **Not Listed**, with the reviewer's name and date recorded on the candidate.

**4. On the report**
- New TFS column in the results table.
- New section under the results: "Terrorist Financing Sanctions (TFS) screening" stating
  - the list compared against (name, version/date, number of people and organisations on it, when it was loaded),
  - the detail combination used per candidate (name & surname / ID number / passport number),
  - the outcome wording (*Not listed on the Consolidated United Nations Security Council Sanctions List* / *Listed*), and the date screened.

**5. Pricing and profitability**
- New line in the Price list: **TFS Check** with supplier cost and client price.
- Because billing is driven by the checks requested on an order, the TFS charge flows straight into batch profitability, the Invoiced tab and the dashboard revenue/cost/profit figures. Existing TLDV-internal and PTVS discount rules are untouched (they only affect Risk Assessment).

## Technical notes

- Migration: add `tfs_result`, `tfs_notes`, `tfs_screened_at`, `tfs_list_id`, `tfs_list_version`, `tfs_match_basis` to `manual_risk_candidates`; add `submission_id`, `list_version`, `matched_via` to `manual_risk_sanctions_matches`; insert a `tfs` row into `manual_risk_pricing`.
- `CHECK_META` / `CHECK_COLUMNS` in `src/lib/manualRiskPdf.ts` gain a `tfs` entry; `CHECK_PRICE_KEYS` in `pricing.ts` gains `tfs`.
- New `src/lib/tfsScreening.ts` holds the screening routine (token/alias name match plus ID and passport match against `manual_risk_sanctions_entries` of the current list) and is called from submission create, check-selection save, and a manual re-run.
- `ComplianceTab.tsx` review actions write back to the candidate's TFS columns; tab badge added in `ManualRiskAssessments.tsx`.
- Report changes in `generateManualRiskPdf`.
