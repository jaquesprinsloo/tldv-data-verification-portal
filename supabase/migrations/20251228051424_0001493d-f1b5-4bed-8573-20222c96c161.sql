-- Fix: Make polygraph-reports bucket private to protect sensitive data
UPDATE storage.buckets 
SET public = false 
WHERE id = 'polygraph-reports';