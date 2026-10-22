# Project architecture
- Examiner education uses a dedicated private resource table and storage bucket; master admins manage materials, while examiner-role sessions read only shared resources, enforced by RLS.
- Active examiner profile listings use a master-only server function joining current examiner-role profiles to unbanned login accounts; appointment examiner name lists are not login profiles.
## Guided intake flow
- Store-staff submissions go through public staging tables (`manual_risk_intakes` / `manual_risk_intake_candidates`) via the `intake-public` Edge Function; they join `manual_risk_submissions` only when an admin clicks Process, so pending requests never pollute dashboards, accounts or invoicing. Why: keeps operational reports isolated from unvalidated public input.
