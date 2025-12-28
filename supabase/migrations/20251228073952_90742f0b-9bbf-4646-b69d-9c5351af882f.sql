-- Add 'absconded' to the employment_status enum
ALTER TYPE public.employment_status ADD VALUE IF NOT EXISTS 'absconded';