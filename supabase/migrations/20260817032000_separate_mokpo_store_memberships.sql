-- Normalize the Mokpo Univ account so each real business is its own Marketing workspace.
-- Keep the obsolete combined store row for historical CGMA data, but detach this person's
-- login identities from it so it no longer appears as an active business workspace.

with target_users as (
  select distinct li.auth_user_id as user_id
  from public.login_identities li
  where lower(li.email) in (
    'topmaster.joseph@gmail.com',
    'ekodibiz@gmail.com',
    'cm0614538295@gmail.com'
  )
    and li.status = 'active'
), target_stores as (
  select st.id as store_id
  from public.stores st
  where st.slug in (
    'jadam-mokpo-univ',
    'pizzamaru-mokpo-univ',
    'yogurtpurple-mokpo-univ'
  )
)
insert into public.store_members (store_id, user_id, role)
select ts.store_id, tu.user_id, 'store_owner'
from target_stores ts
cross join target_users tu
on conflict do nothing;

with target_users as (
  select distinct li.auth_user_id as user_id
  from public.login_identities li
  where lower(li.email) in (
    'topmaster.joseph@gmail.com',
    'ekodibiz@gmail.com',
    'cm0614538295@gmail.com'
  )
    and li.status = 'active'
), legacy_store as (
  select st.id as store_id
  from public.stores st
  where st.slug = 'store-030'
    and st.name = '자담치킨&피자마루 목포대점'
)
delete from public.store_members sm
using target_users tu, legacy_store ls
where sm.user_id = tu.user_id
  and sm.store_id = ls.store_id
  and sm.role = 'store_owner';
