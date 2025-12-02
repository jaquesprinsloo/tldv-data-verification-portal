-- Update the invoices bucket to be public
UPDATE storage.buckets 
SET public = true 
WHERE id = 'invoices';