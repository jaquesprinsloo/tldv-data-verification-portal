
insert into storage.buckets (id, name, public)
values ('candex-selfies', 'candex-selfies', true)
on conflict (id) do nothing;

-- Allow public uploads (applicants are unauthenticated)
create policy "Anyone can upload candex selfies"
on storage.objects for insert
to public
with check (bucket_id = 'candex-selfies');

-- Allow public read (bucket is public)
create policy "Anyone can view candex selfies"
on storage.objects for select
to public
using (bucket_id = 'candex-selfies');
