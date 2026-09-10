UPDATE public.manual_risk_submissions
SET status = 'completed',
    compliance_flag = NULL,
    compliance_reviewed_at = now(),
    updated_at = now()
WHERE sent_at IS NOT NULL
  AND status = 'open';