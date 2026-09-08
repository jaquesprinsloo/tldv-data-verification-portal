UPDATE public.manual_risk_candidates
SET id_verification_result = 'invalid'
WHERE id_verification_result = 'valid'
  AND id_verification_notes ILIKE '%Status:%'
  AND (
    id_verification_notes ~* '(not\s*confirm|unconfirm|no\s*result|invalid|not\s*found|fail|unable|error|decease)'
  );