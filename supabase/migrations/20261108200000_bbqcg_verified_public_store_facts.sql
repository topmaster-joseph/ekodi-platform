-- Owner-approved BBQ Muan Cheonggye public facts, scoped to the existing customer store.
-- No store/tenant re-creation, publication flip, checkout enablement or membership changes.
begin;
do $bbq_public_facts$
declare
  v_store record;
  v_count integer;
  v_address constant text := '전남 무안군 청계면 승달산길 37-1, 건물 1층';
  v_phone constant text := '061-453-8295';
  v_hours constant jsonb := '{"display":"매일 11:00 ~ 23:00"}'::jsonb;
  v_description constant text := '대표자 박은희 · BBQ 무안청계점 매장 안내';
begin
  select count(*) into v_count
    from public.tenants t
    join public.stores s on s.tenant_id=t.id
    join public.store_user_sites us on us.store_id=s.id
   where t.slug='bbqcg' and t.name='BBQ 무안청계점'
     and t.kind='business' and t.status='active'
     and t.settings->>'ownership'='customer'
     and s.slug='bbq-muan-cheonggye' and s.operating_space_slug='bbqcg'
     and s.name='BBQ 무안청계점' and us.status='active';
  if v_count <> 1 then
    raise exception 'bbqcg verified public facts: customer identity not unique, count=%',v_count;
  end if;

  select s.* into v_store
    from public.stores s
    join public.tenants t on t.id=s.tenant_id
   where t.slug='bbqcg' and s.operating_space_slug='bbqcg'
   for update of s;

  if coalesce(v_store.public_address,'') not in ('',v_address) then
    raise exception 'bbqcg public address already differs; stop for operator review';
  end if;
  if coalesce(v_store.public_phone,'') not in ('',v_phone) then
    raise exception 'bbqcg public phone already differs; stop for operator review';
  end if;
  if coalesce(v_store.business_hours,'{}'::jsonb) not in ('{}'::jsonb,v_hours) then
    raise exception 'bbqcg public hours already differ; stop for operator review';
  end if;
  if coalesce(v_store.public_description,'') not in
       ('','매장 안내를 준비하고 있습니다.',v_description) then
    raise exception 'bbqcg public description differs; stop for operator review';
  end if;
  update public.stores
     set public_address=v_address,
         public_phone=v_phone,
         business_hours=v_hours,
         public_description=v_description
   where id=v_store.id
     and tenant_id=v_store.tenant_id
     and operating_space_slug='bbqcg';
  if not found then raise exception 'bbqcg public facts update did not match store'; end if;
  -- is_published/order_enabled remain unchanged. Other stores and private data untouched.
end
$bbq_public_facts$;
commit;
