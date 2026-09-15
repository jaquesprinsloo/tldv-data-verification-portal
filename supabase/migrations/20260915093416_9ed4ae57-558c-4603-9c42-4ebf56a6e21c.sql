DROP POLICY IF EXISTS "Scoped admin view accounts" ON public.accounts;
CREATE POLICY "Scoped admin view accounts" ON public.accounts FOR SELECT TO authenticated
USING (is_master_admin(auth.uid()) OR (has_role(auth.uid(), 'admin'::app_role) AND has_account_access(auth.uid(), id)));

DROP POLICY IF EXISTS "Scoped admin update accounts" ON public.accounts;
CREATE POLICY "Scoped admin update accounts" ON public.accounts FOR UPDATE TO authenticated
USING (is_master_admin(auth.uid()) OR (has_role(auth.uid(), 'admin'::app_role) AND has_account_access(auth.uid(), id)));

DROP POLICY IF EXISTS "Scoped admin access to stores" ON public.stores;
CREATE POLICY "Scoped admin access to stores" ON public.stores FOR SELECT TO authenticated
USING (is_master_admin(auth.uid()) OR (has_role(auth.uid(), 'admin'::app_role) AND has_account_access(auth.uid(), account_id)));

DROP POLICY IF EXISTS "Scoped admin insert stores" ON public.stores;
CREATE POLICY "Scoped admin insert stores" ON public.stores FOR INSERT TO authenticated
WITH CHECK (is_master_admin(auth.uid()) OR (has_role(auth.uid(), 'admin'::app_role) AND has_account_access(auth.uid(), account_id)));

DROP POLICY IF EXISTS "Scoped admin update stores" ON public.stores;
CREATE POLICY "Scoped admin update stores" ON public.stores FOR UPDATE TO authenticated
USING (is_master_admin(auth.uid()) OR (has_role(auth.uid(), 'admin'::app_role) AND has_account_access(auth.uid(), account_id)));

DROP POLICY IF EXISTS "Scoped admin delete stores" ON public.stores;
CREATE POLICY "Scoped admin delete stores" ON public.stores FOR DELETE TO authenticated
USING (is_master_admin(auth.uid()) OR (has_role(auth.uid(), 'admin'::app_role) AND has_account_access(auth.uid(), account_id)));

DROP POLICY IF EXISTS "Admins can view pending uploads for their accounts" ON public.pending_document_uploads;
CREATE POLICY "Admins can view pending uploads for their accounts" ON public.pending_document_uploads FOR SELECT TO authenticated
USING (has_role(auth.uid(), 'admin'::app_role) AND has_account_access(auth.uid(), account_id));

DROP POLICY IF EXISTS "Admins can create pending uploads for their accounts" ON public.pending_document_uploads;
CREATE POLICY "Admins can create pending uploads for their accounts" ON public.pending_document_uploads FOR INSERT TO authenticated
WITH CHECK (has_role(auth.uid(), 'admin'::app_role) AND has_account_access(auth.uid(), account_id));