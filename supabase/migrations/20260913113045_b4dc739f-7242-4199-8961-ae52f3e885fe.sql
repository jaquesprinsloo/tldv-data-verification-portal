ALTER TABLE public.manual_risk_candidates
  ADD COLUMN IF NOT EXISTS superseded_by_candidate_id uuid REFERENCES public.manual_risk_candidates(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS superseded_note text;

CREATE INDEX IF NOT EXISTS manual_risk_candidates_superseded_idx
  ON public.manual_risk_candidates (superseded_by_candidate_id);

WITH flagged AS (
  SELECT c.id, c.first_name, c.surname, c.id_number, s.created_at AS scr
  FROM public.manual_risk_candidates c
  JOIN public.manual_risk_submissions s ON s.id = c.submission_id
  WHERE c.superseded_by_candidate_id IS NULL
    AND (c.id_verification_result = 'invalid' OR c.risk_assessment_result IN ('invalid','risk_identified'))
), clean AS (
  SELECT c.id, c.first_name, c.surname, c.id_number, s.order_number, s.created_at AS scr
  FROM public.manual_risk_candidates c
  JOIN public.manual_risk_submissions s ON s.id = c.submission_id
  WHERE c.risk_assessment_result IN ('no_risk','clear')
    AND COALESCE(c.id_verification_result,'') <> 'invalid'
), pairs AS (
  SELECT DISTINCT ON (f.id) f.id AS failed_id, cl.id AS clean_id, cl.order_number, cl.scr
  FROM flagged f
  JOIN clean cl ON cl.id <> f.id AND cl.scr >= f.scr AND (
        cl.id_number = f.id_number
     OR (lower(cl.surname) = lower(f.surname)
         AND lower(split_part(cl.first_name,' ',1)) = lower(split_part(f.first_name,' ',1)))
     OR (length(cl.id_number) = 13 AND length(f.id_number) = 13
         AND left(cl.id_number,6) = left(f.id_number,6)
         AND lower(cl.surname) = lower(f.surname))
  )
  ORDER BY f.id, cl.scr ASC
)
UPDATE public.manual_risk_candidates c
SET superseded_by_candidate_id = p.clean_id,
    superseded_note = 'Superseded — clear check on record (' || p.order_number || ', ' || to_char(p.scr, 'DD Mon YYYY') || ')',
    updated_at = now()
FROM pairs p
WHERE c.id = p.failed_id;

UPDATE public.manual_risk_candidates
SET first_name = btrim(regexp_replace(first_name, '\s*Resubmission\s*', ' ', 'gi')),
    updated_at = now()
WHERE first_name ~* 'Resubmission';