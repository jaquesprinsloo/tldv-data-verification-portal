-- Add address and contact fields to stores table
ALTER TABLE public.stores
ADD COLUMN center_mall_name text,
ADD COLUMN shop_number text,
ADD COLUMN street_number text,
ADD COLUMN street_name text,
ADD COLUMN town text,
ADD COLUMN province text,
ADD COLUMN postal_code text,
ADD COLUMN contact_number text;