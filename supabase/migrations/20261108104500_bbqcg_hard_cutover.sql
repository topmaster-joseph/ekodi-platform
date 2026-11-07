-- Owner-approved full URL cutover, without redirect or alias.
-- Customer / store UUIDs and all related data remain the same. Execute through guarded DEV -> PROD only.
begin;
do $bbqcg$
declare
  v_tenant_id uuid;
  v_store_id uuid;
  v_tenant_slug text;
  v_store_route text;
  v_total integer;
  v_owner text;
begin
  select count(*) into v_total
  from public.tenants
  where slug in ('bbqcheonggye','bbqcg');
  if v_total <> 1 then raise exception 'bbqcg tenant identity ambiguity, count=%',v_total; end if;

  select t.id,s.id,t.slug,s.operating_space_slug,t.settings->>'ownership'
    into v_tenant_id,v_store_id,v_tenant_slug,v_store_route,v_owner
  from public.tenants t
  join public.stores s on s.tenant_id=t.id
  where t.slug in ('bbqcheonggye','bbqcg')
    and t.name='BBQ 무안청계점'
    and t.kind='business'
    and s.name='BBQ 무안청계점'
    and s.slug='bbq-muan-cheonggye'
  for update of t,s;
  if v_tenant_id is null or v_store_id is null or v_owner<>'customer' then
    raise exception 'bbqcg original customer identity or ownership not verified';
  end if;
  if not (
      (v_tenant_slug='bbqcheonggye' and v_store_route='bbqcheonggye')
       or (v_tenant_slug='bbqcg' and v_store_route='bbqcg')
     ) then
    raise exception 'bbqcg inconsistent route; refusing partial or mixed identity';
  end if;
  if exists (
    select 1 from public.stores where operating_space_slug='bbqcg' and id<>v_store_id
  ) then raise exception 'bbqcg store route already belongs to another store'; end if;
  if exists (
    select 1 from public.store_user_sites us
    join public.stores s on s.id=us.store_id
    where s.id<>v_store_id and 'bbqcg'=any(us.alias_slugs)
  ) then raise exception 'bbqcg alias is already owned by another customer'; end if;
  if not exists(select 1 from public.store_user_sites where store_id=v_store_id) then
    raise exception 'original store_user_sites record missing; refusing replacement';
  end if;

  update public.tenants
  set slug='bbqcg',
      settings=(coalesce(settings,'{}'::jsonb)||
         jsonb_build_object('site_key','bbqcg','domain','https://ekodi.kr/bbqcg'))
  where id=v_tenant_id;

  update public.stores
  set operating_space_slug='bbqcg',updated_at=now()
  where id=v_store_id;

  update public.store_user_sites
  set alias_slugs=array_remove(alias_slugs,'bbqcheonggye'),
      page_theme=case when page_theme='bbqcheonggye' then 'bbqcg' else page_theme end,
      updated_at=now()
  where store_id=v_store_id;

  if (select operating_space_slug from public.stores where id=v_store_id)<>'bbqcg'
    or (select slug from public.tenants where id=v_tenant_id)<>'bbqcg'
    or exists(select 1 from public.stores where operating_space_slug='bbqcheonggye')
    or exists(select 1 from public.tenants where slug='bbqcheonggye')
    or exists(select 1 from public.store_user_sites where store_id=v_store_id and 'bbqcheonggye'=any(alias_slugs))
  then raise exception 'bbqcg canonical cutover verification failed'; end if;
end;
$bbqcg$;
commit;
-- No role grants, password or new customer/store identities.
