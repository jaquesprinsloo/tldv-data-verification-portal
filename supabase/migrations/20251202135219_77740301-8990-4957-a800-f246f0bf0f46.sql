-- Add expense category columns to invoices table
ALTER TABLE public.invoices 
ADD COLUMN polygraph_amount numeric DEFAULT 0,
ADD COLUMN risk_assessment_amount numeric DEFAULT 0,
ADD COLUMN travel_amount numeric DEFAULT 0,
ADD COLUMN tolls_amount numeric DEFAULT 0,
ADD COLUMN accommodation_amount numeric DEFAULT 0,
ADD COLUMN other_amount numeric DEFAULT 0;