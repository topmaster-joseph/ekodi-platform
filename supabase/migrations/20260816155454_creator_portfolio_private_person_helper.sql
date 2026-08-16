-- Move the Creator portfolio person helper out of the public API schema.

create or replace function private.current_person_id()
returns uuid
language sql
stable
security definer
set search_path = public, auth
as $$
  select li.person_id
    from public.login_identities li
   where li.auth_user_id = auth.uid()
     and li.status = 'active'
   limit 1
$$;

revoke all on function private.current_person_id() from public, anon;
grant execute on function private.current_person_id() to authenticated;

drop policy if exists "creator_portfolio_person_select" on public.creator_portfolio_items;
create policy "creator_portfolio_person_select"
on public.creator_portfolio_items
for select
to authenticated
using (
  owner_user_id = auth.uid()
  or person_id = private.current_person_id()
);

drop policy if exists "creator_portfolio_owner_update" on public.creator_portfolio_items;
create policy "creator_portfolio_owner_update"
on public.creator_portfolio_items
for update
to authenticated
using (
  owner_user_id = auth.uid()
  or person_id = private.current_person_id()
)
with check (
  owner_user_id = auth.uid()
  or person_id = private.current_person_id()
);

drop policy if exists "creator_portfolio_owner_delete" on public.creator_portfolio_items;
create policy "creator_portfolio_owner_delete"
on public.creator_portfolio_items
for delete
to authenticated
using (
  owner_user_id = auth.uid()
  or person_id = private.current_person_id()
);

drop function if exists public.current_person_id();

comment on function private.current_person_id() is
  'Returns the current EKODI person id for person-scoped RLS without exposing the helper through the public API schema.';
