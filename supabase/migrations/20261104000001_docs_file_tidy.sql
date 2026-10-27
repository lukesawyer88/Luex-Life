-- Documents and Papers: tidying files nobody can reach any more. Two kinds:
--   1. papers kept "just mine" by a grown-up who left the household more than 30 days ago (nobody else may see them,
--      not even parents, so they are deleted rather than handed over; the 30 days allow for someone being added back);
--   2. pages that belong to no paper (a save cut off half-way, or a removed paper), at least a day old.
-- The database can't delete stored files itself, so the nightly "file-tidy" server function asks for the list and
-- deletes them through the storage service.

-- 1. a departed grown-up's own papers (rows only: their pages then belong to no paper and go the next night)
create or replace function public.doc_tidy_departed()
returns void language sql security definer set search_path = '' as $$
  delete from public.documents d using public.family_members m
  where m.id = d.private_to and m.archived_at < now() - interval '30 days'
$$;
revoke all on function public.doc_tidy_departed() from public, anon, authenticated;

-- 2. pages that belong to no paper (service only)
create or replace function public.doc_unused_files(p_limit integer)
returns setof text language sql stable security definer set search_path = '' as $$
  select o.name from storage.objects o
  where o.bucket_id = 'doc-files' and o.created_at < now() - interval '1 day'
    and not exists (select 1 from public.documents d where o.name = any (d.pages))
  order by o.created_at
  limit least(greatest(coalesce(p_limit, 500), 1), 1000)
$$;
revoke all on function public.doc_unused_files(integer) from public, anon, authenticated;
grant execute on function public.doc_unused_files(integer) to service_role;
