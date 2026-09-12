UPDATE public.manual_risk_candidates
SET surname = 'Sesinyi',
    id_verification_notes = COALESCE(id_verification_notes || ' • ', '') || 'Archive tidy-up: date of birth 14 Nov 2000 was captured in the surname field; document number 306654 retained as supplied (not a 13-digit SA ID).'
WHERE id = '6e1a7d73-ed74-4034-b18f-0956af8a45f3';