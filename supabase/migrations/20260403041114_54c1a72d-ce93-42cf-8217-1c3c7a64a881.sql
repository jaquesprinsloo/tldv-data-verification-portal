
CREATE TABLE public.portal_card_order (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  card_key text NOT NULL,
  sort_order integer NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  UNIQUE (card_key)
);

ALTER TABLE public.portal_card_order ENABLE ROW LEVEL SECURITY;

-- All authenticated users can read the card order
CREATE POLICY "Authenticated users can read card order"
ON public.portal_card_order FOR SELECT TO authenticated
USING (true);

-- Only master admins can insert/update/delete
CREATE POLICY "Master admins can insert card order"
ON public.portal_card_order FOR INSERT TO authenticated
WITH CHECK (public.is_master_admin(auth.uid()));

CREATE POLICY "Master admins can update card order"
ON public.portal_card_order FOR UPDATE TO authenticated
USING (public.is_master_admin(auth.uid()))
WITH CHECK (public.is_master_admin(auth.uid()));

CREATE POLICY "Master admins can delete card order"
ON public.portal_card_order FOR DELETE TO authenticated
USING (public.is_master_admin(auth.uid()));
