-- ============================================
-- CREATE AUDIT LOG TABLE
-- ============================================

CREATE TABLE IF NOT EXISTS public.audit_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  table_name text NOT NULL,
  record_id uuid NOT NULL,
  action text NOT NULL, -- 'INSERT', 'UPDATE', 'DELETE'
  changed_by uuid REFERENCES auth.users(id),
  changed_at timestamp with time zone NOT NULL DEFAULT now(),
  old_data jsonb,
  new_data jsonb,
  changes_summary text
);

-- Enable RLS
ALTER TABLE public.audit_log ENABLE ROW LEVEL SECURITY;

-- Admins can view all audit logs
CREATE POLICY "Admins can view all audit logs"
ON public.audit_log
FOR SELECT
USING (has_role(auth.uid(), 'admin'::app_role));

-- System can insert audit logs
CREATE POLICY "System can insert audit logs"
ON public.audit_log
FOR INSERT
WITH CHECK (true);

-- Create index for faster queries
CREATE INDEX idx_audit_log_table_record ON public.audit_log(table_name, record_id);
CREATE INDEX idx_audit_log_changed_at ON public.audit_log(changed_at DESC);

-- ============================================
-- CREATE AUDIT LOG FUNCTION
-- ============================================

CREATE OR REPLACE FUNCTION public.log_audit_trail()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  changes_text text;
  old_json jsonb;
  new_json jsonb;
BEGIN
  -- Convert records to JSON
  IF TG_OP = 'DELETE' THEN
    old_json := to_jsonb(OLD);
    new_json := NULL;
    changes_text := 'Deleted record';
  ELSIF TG_OP = 'INSERT' THEN
    old_json := NULL;
    new_json := to_jsonb(NEW);
    changes_text := 'Created new record';
  ELSE -- UPDATE
    old_json := to_jsonb(OLD);
    new_json := to_jsonb(NEW);
    changes_text := 'Updated record';
  END IF;

  -- Insert audit log
  INSERT INTO public.audit_log (
    table_name,
    record_id,
    action,
    changed_by,
    old_data,
    new_data,
    changes_summary
  ) VALUES (
    TG_TABLE_NAME,
    COALESCE(NEW.id, OLD.id),
    TG_OP,
    auth.uid(),
    old_json,
    new_json,
    changes_text
  );

  RETURN COALESCE(NEW, OLD);
END;
$$;

-- ============================================
-- ADD TRIGGERS FOR AUDIT LOGGING
-- ============================================

-- Employees table audit
CREATE TRIGGER audit_employees
AFTER INSERT OR UPDATE OR DELETE ON public.employees
FOR EACH ROW
EXECUTE FUNCTION public.log_audit_trail();

-- Submissions table audit
CREATE TRIGGER audit_submissions
AFTER INSERT OR UPDATE OR DELETE ON public.submissions
FOR EACH ROW
EXECUTE FUNCTION public.log_audit_trail();

-- Employee invitations audit
CREATE TRIGGER audit_employee_invitations
AFTER INSERT OR UPDATE OR DELETE ON public.employee_invitations
FOR EACH ROW
EXECUTE FUNCTION public.log_audit_trail();

-- Stores audit
CREATE TRIGGER audit_stores
AFTER INSERT OR UPDATE OR DELETE ON public.stores
FOR EACH ROW
EXECUTE FUNCTION public.log_audit_trail();

-- Employee store assignments audit
CREATE TRIGGER audit_employee_store_assignments
AFTER INSERT OR UPDATE OR DELETE ON public.employee_store_assignments
FOR EACH ROW
EXECUTE FUNCTION public.log_audit_trail();

-- ============================================
-- UPDATE RLS POLICIES: GIVE ALL ADMINS FULL ACCESS
-- ============================================

-- SUBMISSIONS TABLE
DROP POLICY IF EXISTS "Master admin can update all submissions" ON public.submissions;
CREATE POLICY "Admins can update all submissions"
ON public.submissions
FOR UPDATE
USING (has_role(auth.uid(), 'admin'::app_role));

DROP POLICY IF EXISTS "Master admin can delete submissions" ON public.submissions;
CREATE POLICY "Admins can delete submissions"
ON public.submissions
FOR DELETE
USING (has_role(auth.uid(), 'admin'::app_role));

-- EMPLOYEES TABLE
DROP POLICY IF EXISTS "Master admin can update employees" ON public.employees;
CREATE POLICY "Admins can update employees"
ON public.employees
FOR UPDATE
USING (has_role(auth.uid(), 'admin'::app_role))
WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

DROP POLICY IF EXISTS "Master admin can delete employees" ON public.employees;
CREATE POLICY "Admins can delete employees"
ON public.employees
FOR DELETE
USING (has_role(auth.uid(), 'admin'::app_role));

DROP POLICY IF EXISTS "Master admin can insert employees" ON public.employees;
CREATE POLICY "Admins can insert employees"
ON public.employees
FOR INSERT
WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

-- EMPLOYEE_INVITATIONS TABLE
DROP POLICY IF EXISTS "Master admin can create invitations" ON public.employee_invitations;
CREATE POLICY "Admins can create invitations"
ON public.employee_invitations
FOR INSERT
WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

DROP POLICY IF EXISTS "Master admin can update invitations" ON public.employee_invitations;
CREATE POLICY "Admins can update invitations"
ON public.employee_invitations
FOR UPDATE
USING (has_role(auth.uid(), 'admin'::app_role));

DROP POLICY IF EXISTS "Master admin can delete invitations" ON public.employee_invitations;
CREATE POLICY "Admins can delete invitations"
ON public.employee_invitations
FOR DELETE
USING (has_role(auth.uid(), 'admin'::app_role));

-- RENEWAL_REQUESTS TABLE
DROP POLICY IF EXISTS "Master admin can update renewal requests" ON public.renewal_requests;
CREATE POLICY "Admins can update renewal requests"
ON public.renewal_requests
FOR UPDATE
USING (has_role(auth.uid(), 'admin'::app_role));

-- STORES TABLE
DROP POLICY IF EXISTS "Master admin can insert stores" ON public.stores;
DROP POLICY IF EXISTS "Master admin can update stores" ON public.stores;
DROP POLICY IF EXISTS "Master admin can delete stores" ON public.stores;

CREATE POLICY "Admins can insert stores"
ON public.stores
FOR INSERT
WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins can update stores"
ON public.stores
FOR UPDATE
USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins can delete stores"
ON public.stores
FOR DELETE
USING (has_role(auth.uid(), 'admin'::app_role));

-- EMPLOYEE_STORE_ASSIGNMENTS TABLE
DROP POLICY IF EXISTS "Master admin can manage store assignments" ON public.employee_store_assignments;

CREATE POLICY "Admins can manage store assignments"
ON public.employee_store_assignments
FOR ALL
USING (has_role(auth.uid(), 'admin'::app_role))
WITH CHECK (has_role(auth.uid(), 'admin'::app_role));