-- Fix cross-organization access: Update stores RLS policies to use account-scoped access

-- Drop existing policies
DROP POLICY IF EXISTS "Admins can view stores" ON stores;
DROP POLICY IF EXISTS "Admins can insert stores" ON stores;
DROP POLICY IF EXISTS "Admins can update stores" ON stores;
DROP POLICY IF EXISTS "Admins can delete stores" ON stores;

-- Recreate with account-scoped access
CREATE POLICY "Scoped admin access to stores"
ON stores FOR SELECT
USING (
  is_master_admin(auth.uid()) 
  OR 
  (has_role(auth.uid(), 'admin'::app_role) 
   AND has_account_access(auth.uid(), account_id))
);

CREATE POLICY "Scoped admin insert stores"
ON stores FOR INSERT
WITH CHECK (
  is_master_admin(auth.uid()) 
  OR 
  (has_role(auth.uid(), 'admin'::app_role) 
   AND has_account_access(auth.uid(), account_id))
);

CREATE POLICY "Scoped admin update stores"
ON stores FOR UPDATE
USING (
  is_master_admin(auth.uid()) 
  OR 
  (has_role(auth.uid(), 'admin'::app_role) 
   AND has_account_access(auth.uid(), account_id))
);

CREATE POLICY "Scoped admin delete stores"
ON stores FOR DELETE
USING (
  is_master_admin(auth.uid()) 
  OR 
  (has_role(auth.uid(), 'admin'::app_role) 
   AND has_account_access(auth.uid(), account_id))
);