ALTER TABLE public.candex_clients ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admin view candex clients" ON public.candex_clients;
DROP POLICY IF EXISTS "Master admin manage candex clients" ON public.candex_clients;
DROP POLICY IF EXISTS "Admins can create own candex client" ON public.candex_clients;
DROP POLICY IF EXISTS "Admins can view own candex client" ON public.candex_clients;

CREATE POLICY "Admins can view own candex client"
ON public.candex_clients
FOR SELECT
TO authenticated
USING (
  is_master_admin(auth.uid())
  OR created_by = auth.uid()
);

CREATE POLICY "Admins can create own candex client"
ON public.candex_clients
FOR INSERT
TO authenticated
WITH CHECK (
  is_master_admin(auth.uid())
  OR (
    has_role(auth.uid(), 'admin'::app_role)
    AND created_by = auth.uid()
  )
);

CREATE POLICY "Master admin manage candex clients"
ON public.candex_clients
FOR ALL
TO authenticated
USING (is_master_admin(auth.uid()))
WITH CHECK (is_master_admin(auth.uid()));