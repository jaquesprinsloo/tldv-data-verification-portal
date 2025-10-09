-- Storage policies to allow admins to view files and generate signed URLs
do $$
begin
  if not exists (
    select 1 from pg_policies 
    where schemaname = 'storage' 
    and tablename = 'objects' 
    and policyname = 'Admins can view employee selfies'
  ) then
    create policy "Admins can view employee selfies"
      on storage.objects for select
      using (bucket_id = 'employee-selfies' and has_role(auth.uid(), 'admin'));
  end if;

  if not exists (
    select 1 from pg_policies 
    where schemaname = 'storage' 
    and tablename = 'objects' 
    and policyname = 'Admins can view employee IDs'
  ) then
    create policy "Admins can view employee IDs"
      on storage.objects for select
      using (bucket_id = 'employee-ids' and has_role(auth.uid(), 'admin'));
  end if;
end $$;