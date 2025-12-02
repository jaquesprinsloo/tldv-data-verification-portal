-- Drop the existing foreign key constraint that's blocking user deletion
ALTER TABLE public.audit_log DROP CONSTRAINT IF EXISTS audit_log_changed_by_fkey;

-- Re-add the constraint with ON DELETE SET NULL so audit history is preserved
-- but users can be deleted
ALTER TABLE public.audit_log 
ADD CONSTRAINT audit_log_changed_by_fkey 
FOREIGN KEY (changed_by) REFERENCES auth.users(id) ON DELETE SET NULL;