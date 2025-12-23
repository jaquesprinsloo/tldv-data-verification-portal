-- Comprehensive Account-Scoped RLS Migration
-- This migration updates all tables to scope admin access to their authorized accounts

-- =====================================================
-- HELPER FUNCTIONS
-- =====================================================

-- Function to check if user has access to an employee via account
CREATE OR REPLACE FUNCTION public.has_employee_access(_user_id uuid, _employee_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT 
    is_master_admin(_user_id)
    OR 
    EXISTS (
      SELECT 1 
      FROM public.employees e
      JOIN public.stores s ON e.store_id = s.id
      WHERE e.id = _employee_id
        AND has_account_access(_user_id, s.account_id)
    )
$$;

-- Function to check if user has access to a store via account
CREATE OR REPLACE FUNCTION public.has_store_access(_user_id uuid, _store_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT 
    is_master_admin(_user_id)
    OR 
    EXISTS (
      SELECT 1 
      FROM public.stores s
      WHERE s.id = _store_id
        AND has_account_access(_user_id, s.account_id)
    )
$$;

-- =====================================================
-- ACCOUNTS TABLE - Scope to authorized accounts only
-- =====================================================
DROP POLICY IF EXISTS "Admins can view all accounts" ON accounts;
DROP POLICY IF EXISTS "Admins can insert accounts" ON accounts;
DROP POLICY IF EXISTS "Admins can update accounts" ON accounts;
DROP POLICY IF EXISTS "Admins can delete accounts" ON accounts;

CREATE POLICY "Scoped admin view accounts"
ON accounts FOR SELECT
USING (
  is_master_admin(auth.uid()) 
  OR 
  (has_role(auth.uid(), 'admin'::app_role) AND has_account_access(auth.uid(), id))
);

CREATE POLICY "Scoped admin insert accounts"
ON accounts FOR INSERT
WITH CHECK (
  is_master_admin(auth.uid())
);

CREATE POLICY "Scoped admin update accounts"
ON accounts FOR UPDATE
USING (
  is_master_admin(auth.uid()) 
  OR 
  (has_role(auth.uid(), 'admin'::app_role) AND has_account_access(auth.uid(), id))
);

CREATE POLICY "Scoped admin delete accounts"
ON accounts FOR DELETE
USING (
  is_master_admin(auth.uid())
);

-- =====================================================
-- EMPLOYEES TABLE - Scope via store -> account
-- =====================================================
DROP POLICY IF EXISTS "Admins can view all employees" ON employees;
DROP POLICY IF EXISTS "Admins can insert employees" ON employees;
DROP POLICY IF EXISTS "Admins can update employees" ON employees;
DROP POLICY IF EXISTS "Admins can delete employees" ON employees;

CREATE POLICY "Scoped admin view employees"
ON employees FOR SELECT
USING (
  is_master_admin(auth.uid()) 
  OR 
  (has_role(auth.uid(), 'admin'::app_role) AND has_store_access(auth.uid(), store_id))
);

CREATE POLICY "Scoped admin insert employees"
ON employees FOR INSERT
WITH CHECK (
  is_master_admin(auth.uid()) 
  OR 
  (has_role(auth.uid(), 'admin'::app_role) AND has_store_access(auth.uid(), store_id))
);

CREATE POLICY "Scoped admin update employees"
ON employees FOR UPDATE
USING (
  is_master_admin(auth.uid()) 
  OR 
  (has_role(auth.uid(), 'admin'::app_role) AND has_store_access(auth.uid(), store_id))
)
WITH CHECK (
  is_master_admin(auth.uid()) 
  OR 
  (has_role(auth.uid(), 'admin'::app_role) AND has_store_access(auth.uid(), store_id))
);

CREATE POLICY "Scoped admin delete employees"
ON employees FOR DELETE
USING (
  is_master_admin(auth.uid()) 
  OR 
  (has_role(auth.uid(), 'admin'::app_role) AND has_store_access(auth.uid(), store_id))
);

-- =====================================================
-- SUBMISSIONS TABLE - Scope via employee -> store -> account
-- =====================================================
DROP POLICY IF EXISTS "Admins can view all submissions" ON submissions;
DROP POLICY IF EXISTS "Admins can update all submissions" ON submissions;
DROP POLICY IF EXISTS "Admins can delete submissions" ON submissions;

CREATE POLICY "Scoped admin view submissions"
ON submissions FOR SELECT
USING (
  auth.uid() IS NOT NULL 
  AND (
    is_master_admin(auth.uid()) 
    OR 
    (has_role(auth.uid(), 'admin'::app_role) AND has_employee_access(auth.uid(), employee_id))
  )
);

CREATE POLICY "Scoped admin update submissions"
ON submissions FOR UPDATE
USING (
  auth.uid() IS NOT NULL 
  AND (
    is_master_admin(auth.uid()) 
    OR 
    (has_role(auth.uid(), 'admin'::app_role) AND has_employee_access(auth.uid(), employee_id))
  )
);

CREATE POLICY "Scoped admin delete submissions"
ON submissions FOR DELETE
USING (
  auth.uid() IS NOT NULL 
  AND (
    is_master_admin(auth.uid()) 
    OR 
    (has_role(auth.uid(), 'admin'::app_role) AND has_employee_access(auth.uid(), employee_id))
  )
);

-- =====================================================
-- EMPLOYEE_INVITATIONS TABLE - Scope via employee -> store -> account
-- =====================================================
DROP POLICY IF EXISTS "Admins can view all invitations" ON employee_invitations;
DROP POLICY IF EXISTS "Admins can create invitations" ON employee_invitations;
DROP POLICY IF EXISTS "Admins can update invitations" ON employee_invitations;
DROP POLICY IF EXISTS "Admins can delete invitations" ON employee_invitations;

CREATE POLICY "Scoped admin view invitations"
ON employee_invitations FOR SELECT
USING (
  is_master_admin(auth.uid()) 
  OR 
  (has_role(auth.uid(), 'admin'::app_role) AND has_employee_access(auth.uid(), employee_id))
);

CREATE POLICY "Scoped admin create invitations"
ON employee_invitations FOR INSERT
WITH CHECK (
  is_master_admin(auth.uid()) 
  OR 
  (has_role(auth.uid(), 'admin'::app_role) AND has_employee_access(auth.uid(), employee_id))
);

CREATE POLICY "Scoped admin update invitations"
ON employee_invitations FOR UPDATE
USING (
  is_master_admin(auth.uid()) 
  OR 
  (has_role(auth.uid(), 'admin'::app_role) AND has_employee_access(auth.uid(), employee_id))
);

CREATE POLICY "Scoped admin delete invitations"
ON employee_invitations FOR DELETE
USING (
  is_master_admin(auth.uid()) 
  OR 
  (has_role(auth.uid(), 'admin'::app_role) AND has_employee_access(auth.uid(), employee_id))
);

-- =====================================================
-- POLYGRAPH_REPORTS TABLE - Scope via store -> account
-- =====================================================
DROP POLICY IF EXISTS "Admins can view all polygraph reports" ON polygraph_reports;
DROP POLICY IF EXISTS "Admins can insert polygraph reports" ON polygraph_reports;
DROP POLICY IF EXISTS "Admins can update polygraph reports" ON polygraph_reports;
DROP POLICY IF EXISTS "Admins can delete polygraph reports" ON polygraph_reports;

CREATE POLICY "Scoped admin view polygraph_reports"
ON polygraph_reports FOR SELECT
USING (
  is_master_admin(auth.uid()) 
  OR has_role(auth.uid(), 'master_admin'::app_role)
  OR 
  (has_role(auth.uid(), 'admin'::app_role) AND has_store_access(auth.uid(), store_id))
);

CREATE POLICY "Scoped admin insert polygraph_reports"
ON polygraph_reports FOR INSERT
WITH CHECK (
  is_master_admin(auth.uid()) 
  OR has_role(auth.uid(), 'master_admin'::app_role)
  OR 
  (has_role(auth.uid(), 'admin'::app_role) AND has_store_access(auth.uid(), store_id))
);

CREATE POLICY "Scoped admin update polygraph_reports"
ON polygraph_reports FOR UPDATE
USING (
  is_master_admin(auth.uid()) 
  OR has_role(auth.uid(), 'master_admin'::app_role)
  OR 
  (has_role(auth.uid(), 'admin'::app_role) AND has_store_access(auth.uid(), store_id))
);

CREATE POLICY "Scoped admin delete polygraph_reports"
ON polygraph_reports FOR DELETE
USING (
  is_master_admin(auth.uid()) 
  OR has_role(auth.uid(), 'master_admin'::app_role)
  OR 
  (has_role(auth.uid(), 'admin'::app_role) AND has_store_access(auth.uid(), store_id))
);

-- =====================================================
-- POLYGRAPH_CANDIDATES TABLE - Scope via store -> account
-- =====================================================
DROP POLICY IF EXISTS "Admins can view all polygraph candidates" ON polygraph_candidates;
DROP POLICY IF EXISTS "Admins can insert polygraph candidates" ON polygraph_candidates;
DROP POLICY IF EXISTS "Admins can update polygraph candidates" ON polygraph_candidates;
DROP POLICY IF EXISTS "Admins can delete polygraph candidates" ON polygraph_candidates;

CREATE POLICY "Scoped admin view polygraph_candidates"
ON polygraph_candidates FOR SELECT
USING (
  is_master_admin(auth.uid()) 
  OR has_role(auth.uid(), 'master_admin'::app_role)
  OR 
  (has_role(auth.uid(), 'admin'::app_role) AND has_store_access(auth.uid(), store_id))
);

CREATE POLICY "Scoped admin insert polygraph_candidates"
ON polygraph_candidates FOR INSERT
WITH CHECK (
  is_master_admin(auth.uid()) 
  OR has_role(auth.uid(), 'master_admin'::app_role)
  OR 
  (has_role(auth.uid(), 'admin'::app_role) AND has_store_access(auth.uid(), store_id))
);

CREATE POLICY "Scoped admin update polygraph_candidates"
ON polygraph_candidates FOR UPDATE
USING (
  is_master_admin(auth.uid()) 
  OR has_role(auth.uid(), 'master_admin'::app_role)
  OR 
  (has_role(auth.uid(), 'admin'::app_role) AND has_store_access(auth.uid(), store_id))
);

CREATE POLICY "Scoped admin delete polygraph_candidates"
ON polygraph_candidates FOR DELETE
USING (
  is_master_admin(auth.uid()) 
  OR has_role(auth.uid(), 'master_admin'::app_role)
  OR 
  (has_role(auth.uid(), 'admin'::app_role) AND has_store_access(auth.uid(), store_id))
);

-- =====================================================
-- NEXT_OF_KIN TABLE - Scope via submission -> employee -> store -> account
-- =====================================================
DROP POLICY IF EXISTS "Admins can view all next of kin" ON next_of_kin;

CREATE POLICY "Scoped admin view next_of_kin"
ON next_of_kin FOR SELECT
USING (
  is_master_admin(auth.uid()) 
  OR 
  (has_role(auth.uid(), 'admin'::app_role) AND EXISTS (
    SELECT 1 FROM submissions s
    WHERE s.id = submission_id
      AND has_employee_access(auth.uid(), s.employee_id)
  ))
);

-- =====================================================
-- POPIA_ACCEPTANCES TABLE - Scope via employee -> store -> account
-- =====================================================
DROP POLICY IF EXISTS "Admins can view all POPIA acceptances" ON popia_acceptances;

CREATE POLICY "Scoped admin view popia_acceptances"
ON popia_acceptances FOR SELECT
USING (
  is_master_admin(auth.uid()) 
  OR 
  (has_role(auth.uid(), 'admin'::app_role) AND has_employee_access(auth.uid(), employee_id))
);

-- =====================================================
-- SUBMISSION_HISTORY TABLE - Scope via employee -> store -> account
-- =====================================================
DROP POLICY IF EXISTS "Admins can view all submission history" ON submission_history;

CREATE POLICY "Scoped admin view submission_history"
ON submission_history FOR SELECT
USING (
  is_master_admin(auth.uid()) 
  OR 
  (has_role(auth.uid(), 'admin'::app_role) AND has_employee_access(auth.uid(), employee_id))
);

-- =====================================================
-- INVOICES TABLE - Scope via store -> account
-- =====================================================
DROP POLICY IF EXISTS "Admins can view all invoices" ON invoices;
DROP POLICY IF EXISTS "Admins can insert invoices" ON invoices;
DROP POLICY IF EXISTS "Admins can update invoices" ON invoices;
DROP POLICY IF EXISTS "Admins can delete invoices" ON invoices;

CREATE POLICY "Scoped admin view invoices"
ON invoices FOR SELECT
USING (
  is_master_admin(auth.uid()) 
  OR 
  (has_role(auth.uid(), 'admin'::app_role) AND has_store_access(auth.uid(), store_id))
);

CREATE POLICY "Scoped admin insert invoices"
ON invoices FOR INSERT
WITH CHECK (
  is_master_admin(auth.uid()) 
  OR 
  (has_role(auth.uid(), 'admin'::app_role) AND has_store_access(auth.uid(), store_id))
);

CREATE POLICY "Scoped admin update invoices"
ON invoices FOR UPDATE
USING (
  is_master_admin(auth.uid()) 
  OR 
  (has_role(auth.uid(), 'admin'::app_role) AND has_store_access(auth.uid(), store_id))
);

CREATE POLICY "Scoped admin delete invoices"
ON invoices FOR DELETE
USING (
  is_master_admin(auth.uid()) 
  OR 
  (has_role(auth.uid(), 'admin'::app_role) AND has_store_access(auth.uid(), store_id))
);

-- =====================================================
-- EXAMINATIONS TABLE - Scope via store -> account
-- =====================================================
DROP POLICY IF EXISTS "Admins can view all examinations" ON examinations;
DROP POLICY IF EXISTS "Admins can insert examinations" ON examinations;
DROP POLICY IF EXISTS "Admins can update examinations" ON examinations;
DROP POLICY IF EXISTS "Admins can delete examinations" ON examinations;

CREATE POLICY "Scoped admin view examinations"
ON examinations FOR SELECT
USING (
  is_master_admin(auth.uid()) 
  OR 
  (has_role(auth.uid(), 'admin'::app_role) AND has_store_access(auth.uid(), store_id))
);

CREATE POLICY "Scoped admin insert examinations"
ON examinations FOR INSERT
WITH CHECK (
  is_master_admin(auth.uid()) 
  OR 
  (has_role(auth.uid(), 'admin'::app_role) AND has_store_access(auth.uid(), store_id))
);

CREATE POLICY "Scoped admin update examinations"
ON examinations FOR UPDATE
USING (
  is_master_admin(auth.uid()) 
  OR 
  (has_role(auth.uid(), 'admin'::app_role) AND has_store_access(auth.uid(), store_id))
);

CREATE POLICY "Scoped admin delete examinations"
ON examinations FOR DELETE
USING (
  is_master_admin(auth.uid()) 
  OR 
  (has_role(auth.uid(), 'admin'::app_role) AND has_store_access(auth.uid(), store_id))
);

-- =====================================================
-- RISK_ASSESSMENTS TABLE - Scope via store -> account
-- =====================================================
DROP POLICY IF EXISTS "Admins can view all risk_assessments" ON risk_assessments;
DROP POLICY IF EXISTS "Admins can insert risk_assessments" ON risk_assessments;
DROP POLICY IF EXISTS "Admins can update risk_assessments" ON risk_assessments;
DROP POLICY IF EXISTS "Admins can delete risk_assessments" ON risk_assessments;

CREATE POLICY "Scoped admin view risk_assessments"
ON risk_assessments FOR SELECT
USING (
  is_master_admin(auth.uid()) 
  OR 
  (has_role(auth.uid(), 'admin'::app_role) AND has_store_access(auth.uid(), store_id))
);

CREATE POLICY "Scoped admin insert risk_assessments"
ON risk_assessments FOR INSERT
WITH CHECK (
  is_master_admin(auth.uid()) 
  OR 
  (has_role(auth.uid(), 'admin'::app_role) AND has_store_access(auth.uid(), store_id))
);

CREATE POLICY "Scoped admin update risk_assessments"
ON risk_assessments FOR UPDATE
USING (
  is_master_admin(auth.uid()) 
  OR 
  (has_role(auth.uid(), 'admin'::app_role) AND has_store_access(auth.uid(), store_id))
);

CREATE POLICY "Scoped admin delete risk_assessments"
ON risk_assessments FOR DELETE
USING (
  is_master_admin(auth.uid()) 
  OR 
  (has_role(auth.uid(), 'admin'::app_role) AND has_store_access(auth.uid(), store_id))
);

-- =====================================================
-- RENEWAL_REQUESTS TABLE - Scope via employee -> store -> account
-- =====================================================
DROP POLICY IF EXISTS "Admins can view all renewal requests" ON renewal_requests;
DROP POLICY IF EXISTS "Admins can update renewal requests" ON renewal_requests;

CREATE POLICY "Scoped admin view renewal_requests"
ON renewal_requests FOR SELECT
USING (
  is_master_admin(auth.uid()) 
  OR 
  (has_role(auth.uid(), 'admin'::app_role) AND has_employee_access(auth.uid(), employee_id))
);

CREATE POLICY "Scoped admin update renewal_requests"
ON renewal_requests FOR UPDATE
USING (
  is_master_admin(auth.uid()) 
  OR 
  (has_role(auth.uid(), 'admin'::app_role) AND has_employee_access(auth.uid(), employee_id))
);

-- =====================================================
-- INVOICE_EXAMINATIONS TABLE - Scope via invoice -> store -> account
-- =====================================================
DROP POLICY IF EXISTS "Admins can view all invoice_examinations" ON invoice_examinations;
DROP POLICY IF EXISTS "Admins can insert invoice_examinations" ON invoice_examinations;
DROP POLICY IF EXISTS "Admins can update invoice_examinations" ON invoice_examinations;
DROP POLICY IF EXISTS "Admins can delete invoice_examinations" ON invoice_examinations;

CREATE POLICY "Scoped admin view invoice_examinations"
ON invoice_examinations FOR SELECT
USING (
  is_master_admin(auth.uid()) 
  OR 
  (has_role(auth.uid(), 'admin'::app_role) AND EXISTS (
    SELECT 1 FROM invoices i
    WHERE i.id = invoice_id
      AND has_store_access(auth.uid(), i.store_id)
  ))
);

CREATE POLICY "Scoped admin insert invoice_examinations"
ON invoice_examinations FOR INSERT
WITH CHECK (
  is_master_admin(auth.uid()) 
  OR 
  (has_role(auth.uid(), 'admin'::app_role) AND EXISTS (
    SELECT 1 FROM invoices i
    WHERE i.id = invoice_id
      AND has_store_access(auth.uid(), i.store_id)
  ))
);

CREATE POLICY "Scoped admin update invoice_examinations"
ON invoice_examinations FOR UPDATE
USING (
  is_master_admin(auth.uid()) 
  OR 
  (has_role(auth.uid(), 'admin'::app_role) AND EXISTS (
    SELECT 1 FROM invoices i
    WHERE i.id = invoice_id
      AND has_store_access(auth.uid(), i.store_id)
  ))
);

CREATE POLICY "Scoped admin delete invoice_examinations"
ON invoice_examinations FOR DELETE
USING (
  is_master_admin(auth.uid()) 
  OR 
  (has_role(auth.uid(), 'admin'::app_role) AND EXISTS (
    SELECT 1 FROM invoices i
    WHERE i.id = invoice_id
      AND has_store_access(auth.uid(), i.store_id)
  ))
);

-- =====================================================
-- EMPLOYEE_STORE_ASSIGNMENTS TABLE - Scope via store -> account
-- =====================================================
DROP POLICY IF EXISTS "Admins can manage store assignments" ON employee_store_assignments;
DROP POLICY IF EXISTS "Admins can view all store assignments" ON employee_store_assignments;

CREATE POLICY "Scoped admin view store_assignments"
ON employee_store_assignments FOR SELECT
USING (
  is_master_admin(auth.uid()) 
  OR 
  (has_role(auth.uid(), 'admin'::app_role) AND has_store_access(auth.uid(), store_id))
);

CREATE POLICY "Scoped admin manage store_assignments"
ON employee_store_assignments FOR ALL
USING (
  is_master_admin(auth.uid()) 
  OR 
  (has_role(auth.uid(), 'admin'::app_role) AND has_store_access(auth.uid(), store_id))
)
WITH CHECK (
  is_master_admin(auth.uid()) 
  OR 
  (has_role(auth.uid(), 'admin'::app_role) AND has_store_access(auth.uid(), store_id))
);

-- =====================================================
-- POLYGRAPH_BATCHES TABLE - Scope via store -> account
-- =====================================================
DROP POLICY IF EXISTS "Admins can view all polygraph batches" ON polygraph_batches;
DROP POLICY IF EXISTS "Admins can insert polygraph batches" ON polygraph_batches;
DROP POLICY IF EXISTS "Admins can update polygraph batches" ON polygraph_batches;
DROP POLICY IF EXISTS "Admins can delete polygraph batches" ON polygraph_batches;

CREATE POLICY "Scoped admin view polygraph_batches"
ON polygraph_batches FOR SELECT
USING (
  is_master_admin(auth.uid()) 
  OR has_role(auth.uid(), 'master_admin'::app_role)
  OR 
  (has_role(auth.uid(), 'admin'::app_role) AND has_store_access(auth.uid(), store_id))
);

CREATE POLICY "Scoped admin insert polygraph_batches"
ON polygraph_batches FOR INSERT
WITH CHECK (
  is_master_admin(auth.uid()) 
  OR has_role(auth.uid(), 'master_admin'::app_role)
  OR 
  (has_role(auth.uid(), 'admin'::app_role) AND has_store_access(auth.uid(), store_id))
);

CREATE POLICY "Scoped admin update polygraph_batches"
ON polygraph_batches FOR UPDATE
USING (
  is_master_admin(auth.uid()) 
  OR has_role(auth.uid(), 'master_admin'::app_role)
  OR 
  (has_role(auth.uid(), 'admin'::app_role) AND has_store_access(auth.uid(), store_id))
);

CREATE POLICY "Scoped admin delete polygraph_batches"
ON polygraph_batches FOR DELETE
USING (
  is_master_admin(auth.uid()) 
  OR has_role(auth.uid(), 'master_admin'::app_role)
  OR 
  (has_role(auth.uid(), 'admin'::app_role) AND has_store_access(auth.uid(), store_id))
);

-- =====================================================
-- POLYGRAPH RELATED TABLES - Scope via report -> store -> account
-- =====================================================

-- POLYGRAPH_EXAM_QUESTIONS
DROP POLICY IF EXISTS "Admins can view all polygraph exam questions" ON polygraph_exam_questions;
DROP POLICY IF EXISTS "Admins can insert polygraph exam questions" ON polygraph_exam_questions;
DROP POLICY IF EXISTS "Admins can update polygraph exam questions" ON polygraph_exam_questions;
DROP POLICY IF EXISTS "Admins can delete polygraph exam questions" ON polygraph_exam_questions;

CREATE POLICY "Scoped admin view polygraph_exam_questions"
ON polygraph_exam_questions FOR SELECT
USING (
  is_master_admin(auth.uid()) 
  OR has_role(auth.uid(), 'master_admin'::app_role)
  OR 
  (has_role(auth.uid(), 'admin'::app_role) AND EXISTS (
    SELECT 1 FROM polygraph_reports pr
    WHERE pr.id = report_id
      AND has_store_access(auth.uid(), pr.store_id)
  ))
);

CREATE POLICY "Scoped admin insert polygraph_exam_questions"
ON polygraph_exam_questions FOR INSERT
WITH CHECK (
  is_master_admin(auth.uid()) 
  OR has_role(auth.uid(), 'master_admin'::app_role)
  OR 
  (has_role(auth.uid(), 'admin'::app_role) AND EXISTS (
    SELECT 1 FROM polygraph_reports pr
    WHERE pr.id = report_id
      AND has_store_access(auth.uid(), pr.store_id)
  ))
);

CREATE POLICY "Scoped admin update polygraph_exam_questions"
ON polygraph_exam_questions FOR UPDATE
USING (
  is_master_admin(auth.uid()) 
  OR has_role(auth.uid(), 'master_admin'::app_role)
  OR 
  (has_role(auth.uid(), 'admin'::app_role) AND EXISTS (
    SELECT 1 FROM polygraph_reports pr
    WHERE pr.id = report_id
      AND has_store_access(auth.uid(), pr.store_id)
  ))
);

CREATE POLICY "Scoped admin delete polygraph_exam_questions"
ON polygraph_exam_questions FOR DELETE
USING (
  is_master_admin(auth.uid()) 
  OR has_role(auth.uid(), 'master_admin'::app_role)
  OR 
  (has_role(auth.uid(), 'admin'::app_role) AND EXISTS (
    SELECT 1 FROM polygraph_reports pr
    WHERE pr.id = report_id
      AND has_store_access(auth.uid(), pr.store_id)
  ))
);

-- POLYGRAPH_SUITABILITY
DROP POLICY IF EXISTS "Admins can view all polygraph suitability" ON polygraph_suitability;
DROP POLICY IF EXISTS "Admins can insert polygraph suitability" ON polygraph_suitability;
DROP POLICY IF EXISTS "Admins can update polygraph suitability" ON polygraph_suitability;
DROP POLICY IF EXISTS "Admins can delete polygraph suitability" ON polygraph_suitability;

CREATE POLICY "Scoped admin view polygraph_suitability"
ON polygraph_suitability FOR SELECT
USING (
  is_master_admin(auth.uid()) 
  OR has_role(auth.uid(), 'master_admin'::app_role)
  OR 
  (has_role(auth.uid(), 'admin'::app_role) AND EXISTS (
    SELECT 1 FROM polygraph_reports pr
    WHERE pr.id = report_id
      AND has_store_access(auth.uid(), pr.store_id)
  ))
);

CREATE POLICY "Scoped admin insert polygraph_suitability"
ON polygraph_suitability FOR INSERT
WITH CHECK (
  is_master_admin(auth.uid()) 
  OR has_role(auth.uid(), 'master_admin'::app_role)
  OR 
  (has_role(auth.uid(), 'admin'::app_role) AND EXISTS (
    SELECT 1 FROM polygraph_reports pr
    WHERE pr.id = report_id
      AND has_store_access(auth.uid(), pr.store_id)
  ))
);

CREATE POLICY "Scoped admin update polygraph_suitability"
ON polygraph_suitability FOR UPDATE
USING (
  is_master_admin(auth.uid()) 
  OR has_role(auth.uid(), 'master_admin'::app_role)
  OR 
  (has_role(auth.uid(), 'admin'::app_role) AND EXISTS (
    SELECT 1 FROM polygraph_reports pr
    WHERE pr.id = report_id
      AND has_store_access(auth.uid(), pr.store_id)
  ))
);

CREATE POLICY "Scoped admin delete polygraph_suitability"
ON polygraph_suitability FOR DELETE
USING (
  is_master_admin(auth.uid()) 
  OR has_role(auth.uid(), 'master_admin'::app_role)
  OR 
  (has_role(auth.uid(), 'admin'::app_role) AND EXISTS (
    SELECT 1 FROM polygraph_reports pr
    WHERE pr.id = report_id
      AND has_store_access(auth.uid(), pr.store_id)
  ))
);

-- POLYGRAPH_ADMISSIONS
DROP POLICY IF EXISTS "Admins can view all polygraph admissions" ON polygraph_admissions;
DROP POLICY IF EXISTS "Admins can insert polygraph admissions" ON polygraph_admissions;
DROP POLICY IF EXISTS "Admins can update polygraph admissions" ON polygraph_admissions;
DROP POLICY IF EXISTS "Admins can delete polygraph admissions" ON polygraph_admissions;

CREATE POLICY "Scoped admin view polygraph_admissions"
ON polygraph_admissions FOR SELECT
USING (
  is_master_admin(auth.uid()) 
  OR has_role(auth.uid(), 'master_admin'::app_role)
  OR 
  (has_role(auth.uid(), 'admin'::app_role) AND EXISTS (
    SELECT 1 FROM polygraph_reports pr
    WHERE pr.id = report_id
      AND has_store_access(auth.uid(), pr.store_id)
  ))
);

CREATE POLICY "Scoped admin insert polygraph_admissions"
ON polygraph_admissions FOR INSERT
WITH CHECK (
  is_master_admin(auth.uid()) 
  OR has_role(auth.uid(), 'master_admin'::app_role)
  OR 
  (has_role(auth.uid(), 'admin'::app_role) AND EXISTS (
    SELECT 1 FROM polygraph_reports pr
    WHERE pr.id = report_id
      AND has_store_access(auth.uid(), pr.store_id)
  ))
);

CREATE POLICY "Scoped admin update polygraph_admissions"
ON polygraph_admissions FOR UPDATE
USING (
  is_master_admin(auth.uid()) 
  OR has_role(auth.uid(), 'master_admin'::app_role)
  OR 
  (has_role(auth.uid(), 'admin'::app_role) AND EXISTS (
    SELECT 1 FROM polygraph_reports pr
    WHERE pr.id = report_id
      AND has_store_access(auth.uid(), pr.store_id)
  ))
);

CREATE POLICY "Scoped admin delete polygraph_admissions"
ON polygraph_admissions FOR DELETE
USING (
  is_master_admin(auth.uid()) 
  OR has_role(auth.uid(), 'master_admin'::app_role)
  OR 
  (has_role(auth.uid(), 'admin'::app_role) AND EXISTS (
    SELECT 1 FROM polygraph_reports pr
    WHERE pr.id = report_id
      AND has_store_access(auth.uid(), pr.store_id)
  ))
);

-- =====================================================
-- PROFILES TABLE - Scope to users within accessible accounts
-- =====================================================
DROP POLICY IF EXISTS "Admins can view all profiles" ON profiles;

CREATE POLICY "Scoped admin view profiles"
ON profiles FOR SELECT
USING (
  is_master_admin(auth.uid()) 
  OR 
  -- Admin can view profiles of users who have access to the same accounts
  (has_role(auth.uid(), 'admin'::app_role) AND EXISTS (
    SELECT 1 FROM account_access aa1
    JOIN account_access aa2 ON aa1.account_id = aa2.account_id
    WHERE aa1.user_id = auth.uid()
      AND aa2.user_id = profiles.id
  ))
  -- Or profiles of employees in accessible stores
  OR 
  (has_role(auth.uid(), 'admin'::app_role) AND EXISTS (
    SELECT 1 FROM employees e
    WHERE e.user_id = profiles.id
      AND has_store_access(auth.uid(), e.store_id)
  ))
);

-- =====================================================
-- FIX STORES EMPLOYEE POLICY - Scope to own account stores only
-- =====================================================
DROP POLICY IF EXISTS "Actual employees can view stores" ON stores;

CREATE POLICY "Employees can view own account stores"
ON stores FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM employees e
    WHERE e.user_id = auth.uid()
      AND (e.store_id = stores.id OR EXISTS (
        SELECT 1 FROM employee_store_assignments esa
        WHERE esa.employee_id = e.id AND esa.store_id = stores.id
      ))
  )
);