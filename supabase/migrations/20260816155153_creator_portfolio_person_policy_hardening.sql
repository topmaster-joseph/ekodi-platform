-- Harden person-scoped Creator portfolio policies so linked Google identities
-- resolve through a SECURITY DEFINER helper instead of depending on RLS visibility
-- of login_identities inside another policy expression.

create or replace function public.current_person_id()
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

revoke all on function public.current_person_id() from public, anon;
grant execute on function public.current_person_id() to authenticated;

drop policy if exists "creator_portfolio_person_select" on public.creator_portfolio_items;
create policy "creator_portfolio_person_select"
on public.creator_portfolio_items
for select
to authenticated
using (
  owner_user_id = auth.uid()
  or person_id = public.current_person_id()
);

drop policy if exists "creator_portfolio_owner_update" on public.creator_portfolio_items;
create policy "creator_portfolio_owner_update"
on public.creator_portfolio_items
for update
to authenticated
using (
  owner_user_id = auth.uid()
  or person_id = public.current_person_id()
)
with check (
  owner_user_id = auth.uid()
  or person_id = public.current_person_id()
);

drop policy if exists "creator_portfolio_owner_delete" on public.creator_portfolio_items;
create policy "creator_portfolio_owner_delete"
on public.creator_portfolio_items
for delete
to authenticated
using (
  owner_user_id = auth.uid()
  or person_id = public.current_person_id()
);

comment on function public.current_person_id() is
  'Returns the current EKODI person id without requiring authenticated users to read login_identities directly; used by person-scoped RLS policies.';
