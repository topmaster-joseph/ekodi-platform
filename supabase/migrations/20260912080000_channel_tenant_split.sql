-- Separate company, Mall and Trade operating tenants while preserving public URLs and IDs.
do $$
declare
  v_biz uuid;
  v_trade uuid;
  v_mall uuid;
begin
  select id into v_biz from public.tenants where slug='ekodi-biz' limit 1;
  update public.tenants
     set slug='ekoditrade',name='에코디무역',
         settings=settings || jsonb_build_object('domain','ekodi.kr/ekodibiz/trade','site_key','trade')
   where slug='ekodi-trade'
     and not exists(select 1 from public.tenants where slug='ekoditrade');

  insert into public.tenants(slug,name,status,kind,settings)
  values('ekoditrade','에코디무역','active','business',
    jsonb_build_object('domain','ekodi.kr/ekodibiz/trade','site_key','trade','ownership','ekodi',
      'operating_model','customer-site','default_activity_role','representative','default_activity_role_label','대표'))
  on conflict(slug) do update set name=excluded.name,status='active',settings=public.tenants.settings || excluded.settings;
  insert into public.tenants(slug,name,status,kind,settings)
  values('ekodimall','에코디몰','active','business',
    jsonb_build_object('domain','ekodi.kr/ekodibiz/mall','site_key','mall','ownership','ekodi',
      'operating_model','customer-site','default_activity_role','operator','default_activity_role_label','운영관리자'))
  on conflict(slug) do update set name=excluded.name,status='active',settings=public.tenants.settings || excluded.settings;

  select id into v_trade from public.tenants where slug='ekoditrade' limit 1;
  select id into v_mall from public.tenants where slug='ekodimall' limit 1;

  update public.trade_counterparties set workspace_tenant_id=v_trade where workspace_tenant_id=v_biz;
  update public.trade_admin_grants set workspace_tenant_id=v_trade where workspace_tenant_id=v_biz;
  update public.trade_access_audit_log set workspace_tenant_id=v_trade where workspace_tenant_id=v_biz;
  update public.trade_engagements set workspace_tenant_id=v_trade where workspace_tenant_id=v_biz;

  insert into public.site_access_registry(email,site_key,tenant_id,role,status,source,note,plan,created_at,updated_at)
  select email,'trade',v_trade,role,status,'channel_tenant_split',coalesce(note,'') || ' · migrated from ekodi-biz','standard',created_at,now()
    from public.site_access_registry
   where site_key='trade' and tenant_id=v_biz
  on conflict(email,site_key,tenant_id,role) do update set status=excluded.status,source=excluded.source,note=excluded.note,updated_at=now();
  delete from public.site_access_registry where site_key='trade' and tenant_id=v_biz;

  insert into public.site_access_registry(email,site_key,tenant_id,role,status,source,note,plan,created_at,updated_at)
  values
   ('ekodibiz@gmail.com','mall',v_mall,'tenant_admin'::public.app_role,'active','channel_tenant_split','에코디몰 소유자 계정','standard',now(),now()),
   ('topmaster.joseph@gmail.com','mall',v_mall,'tenant_admin'::public.app_role,'active','channel_tenant_split','에코디몰 운영 관리자 계정','standard',now(),now())
  on conflict(email,site_key,tenant_id,role) do update set status='active',source=excluded.source,note=excluded.note,updated_at=now();
end
$$;
