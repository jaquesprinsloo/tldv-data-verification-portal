-- Update RLS policies to give all admins view access but only master_admin can modify

-- ============================================
-- SUBMISSIONS TABLE: Read-only for admins, write for master_admin
-- ============================================

-- Drop existing admin update policy and replace with master_admin only
DROP POLICY IF EXISTS "Admins can update all submissions" ON public.submissions;
CREATE POLICY "Master admin can update all submissions"
ON public.submissions
FOR UPDATE
USING (is_master_admin(auth.uid()));

-- Keep the admin SELECT policy (already exists)
-- "Admins can view all submissions" - no change needed

-- Drop existing admin delete policy and replace with master_admin only
DROP POLICY IF EXISTS "Admins can delete submissions" ON public.submissions;
CREATE POLICY "Master admin can delete submissions"
ON public.submissions
FOR DELETE
USING (is_master_admin(auth.uid()));

-- ============================================
-- EMPLOYEES TABLE: Read-only for admins, write for master_admin
-- ============================================

-- Drop existing admin update policy and replace with master_admin only
DROP POLICY IF EXISTS "Admins can update employees" ON public.employees;
CREATE POLICY "Master admin can update employees"
ON public.employees
FOR UPDATE
USING (is_master_admin(auth.uid()))
WITH CHECK (is_master_admin(auth.uid()));

-- Keep the admin SELECT policy (already exists)
-- "Admins can view all employees" - no change needed

-- Drop existing admin delete policy and replace with master_admin only
DROP POLICY IF EXISTS "Admins can delete employees" ON public.employees;
CREATE POLICY "Master admin can delete employees"
ON public.employees
FOR DELETE
USING (is_master_admin(auth.uid()));

-- Drop existing admin insert policy and replace with master_admin only
DROP POLICY IF EXISTS "Admins can insert employees" ON public.employees;
CREATE POLICY "Master admin can insert employees"
ON public.employees
FOR INSERT
WITH CHECK (is_master_admin(auth.uid()));

-- ============================================
-- EMPLOYEE_INVITATIONS TABLE: Read-only for admins, write for master_admin
-- ============================================

-- Drop existing admin policies and replace with master_admin only for modifications
DROP POLICY IF EXISTS "Admins can create invitations" ON public.employee_invitations;
CREATE POLICY "Master admin can create invitations"
ON public.employee_invitations
FOR INSERT
WITH CHECK (is_master_admin(auth.uid()));

DROP POLICY IF EXISTS "Admins can update invitations" ON public.employee_invitations;
CREATE POLICY "Master admin can update invitations"
ON public.employee_invitations
FOR UPDATE
USING (is_master_admin(auth.uid()));

DROP POLICY IF EXISTS "Admins can delete invitations" ON public.employee_invitations;
CREATE POLICY "Master admin can delete invitations"
ON public.employee_invitations
FOR DELETE
USING (is_master_admin(auth.uid()));

-- Keep the admin SELECT policy (already exists)
-- "Admins can view all invitations" - no change needed

-- ============================================
-- NEXT_OF_KIN TABLE: Read-only for admins
-- ============================================

-- Keep the admin SELECT policy (already exists)
-- "Admins can view all next of kin" - no change needed

-- ============================================
-- RENEWAL_REQUESTS TABLE: Read-only for admins, update for master_admin
-- ============================================

DROP POLICY IF EXISTS "Admins can update renewal requests" ON public.renewal_requests;
CREATE POLICY "Master admin can update renewal requests"
ON public.renewal_requests
FOR UPDATE
USING (is_master_admin(auth.uid()));

-- Keep the admin SELECT policy (already exists)
-- "Admins can view all renewal requests" - no change needed

-- ============================================
-- STORES TABLE: Read-only for admins, full access for master_admin
-- ============================================

DROP POLICY IF EXISTS "Admins can manage stores" ON public.stores;

CREATE POLICY "Admins can view stores"
ON public.stores
FOR SELECT
USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Master admin can insert stores"
ON public.stores
FOR INSERT
WITH CHECK (is_master_admin(auth.uid()));

CREATE POLICY "Master admin can update stores"
ON public.stores
FOR UPDATE
USING (is_master_admin(auth.uid()));

CREATE POLICY "Master admin can delete stores"
ON public.stores
FOR DELETE
USING (is_master_admin(auth.uid()));

-- ============================================
-- EMPLOYEE_STORE_ASSIGNMENTS TABLE: Read-only for admins, manage for master_admin
-- ============================================

DROP POLICY IF EXISTS "Admins can manage store assignments" ON public.employee_store_assignments;

CREATE POLICY "Master admin can manage store assignments"
ON public.employee_store_assignments
FOR ALL
USING (is_master_admin(auth.uid()))
WITH CHECK (is_master_admin(auth.uid()));

-- Keep the admin SELECT policy (already exists)
-- "Admins can view all store assignments" - no change needed

-- ============================================
-- POPIA_ACCEPTANCES TABLE: Read-only for admins
-- ============================================

-- Keep the admin SELECT policy (already exists)
-- "Admins can view all POPIA acceptances" - no change needed

-- ============================================
-- SUBMISSION_HISTORY TABLE: Read-only for admins
-- ============================================

-- Keep the admin SELECT policy (already exists)
-- "Admins can view all submission history" - no change needed