-- Avoid per-row auth/helper re-evaluation in Creator portfolio RLS policies.

drop policy if exists "creator_portfolio_person_select" on public.creator_portfolio_items;
create policy "creator_portfolio_person_select"
on public.creator_portfolio_items
for select
to authenticated
using (
  owner_user_id = (select auth.uid())
  or person_id = (select private.current_person_id())
);

drop policy if exists "creator_portfolio_owner_insert" on public.creator_portfolio_items;
create policy "creator_portfolio_owner_insert"
on public.creator_portfolio_items
for insert
to authenticated
with check (owner_user_id = (select auth.uid()));

drop policy if exists "creator_portfolio_owner_update" on public.creator_portfolio_items;
create policy "creator_portfolio_owner_update"
on public.creator_portfolio_items
for update
to authenticated
using (
  owner_user_id = (select auth.uid())
  or person_id = (select private.current_person_id())
)
with check (
  owner_user_id = (select auth.uid())
  or person_id = (select private.current_person_id())
);

drop policy if exists "creator_portfolio_owner_delete" on public.creator_portfolio_items;
create policy "creator_portfolio_owner_delete"
on public.creator_portfolio_items
for delete
to authenticated
using (
  owner_user_id = (select auth.uid())
  or person_id = (select private.current_person_id())
);
