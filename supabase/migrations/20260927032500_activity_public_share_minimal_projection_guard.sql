begin;

update public.activity_public_shares
set field_policy=jsonb_build_object(
  'seq',true,
  'name',coalesce((field_policy->>'name')::boolean,true),
  'status',coalesce((field_policy->>'status')::boolean,true),
  'party_size',coalesce((field_policy->>'party_size')::boolean,true)
);

create or replace function public.activity_admin_create_share(
  p_workspace_slug text,
  p_activity_key text,
  p_expires_at timestamptz,
  p_field_policy jsonb default '{}'::jsonb
) returns jsonb
language plpgsql
security definer
set search_path=public,auth,extensions,pg_temp
as $$
declare
  v_activity public.activities%rowtype;
  v_tenant_slug text;
  v_token text;
  v_hash text;
  v_policy jsonb;
  v_share public.activity_public_shares%rowtype;
begin
  select a.* into v_activity
  from public.activities a
  join public.tenants t on t.id=a.workspace_tenant_id
  where t.slug=lower(trim(p_workspace_slug))
    and a.activity_key=p_activity_key;
  v_tenant_slug:=lower(trim(p_workspace_slug));

  if not found or not public.activity_is_workspace_operator(v_activity.workspace_tenant_id) then
    raise exception 'ACTIVITY_ADMIN_FORBIDDEN';
  end if;
  if p_expires_at is null or p_expires_at<=now()+interval '10 minutes' then
    raise exception 'ACTIVITY_SHARE_EXPIRY_TOO_SOON';
  end if;
  if p_expires_at>now()+interval '31 days' then
    raise exception 'ACTIVITY_SHARE_EXPIRY_TOO_LATE';
  end if;

  v_policy:=jsonb_build_object(
    'seq',true,
    'name',case when p_field_policy ? 'name' then coalesce((p_field_policy->>'name')::boolean,false) else true end,
    'status',case when p_field_policy ? 'status' then coalesce((p_field_policy->>'status')::boolean,false) else true end,
    'party_size',case when p_field_policy ? 'party_size' then coalesce((p_field_policy->>'party_size')::boolean,false) else true end
  );

  v_token:=rtrim(translate(encode(extensions.gen_random_bytes(32),'base64'),'+/','-_'),'=');
  v_hash:=encode(extensions.digest(v_token,'sha256'),'hex');

  update public.activity_public_shares
  set status='revoked',revoked_at=now()
  where activity_id=v_activity.id and status='active';

  insert into public.activity_public_shares(
    activity_id,token_hash,status,expires_at,field_policy,created_by
  ) values (
    v_activity.id,v_hash,'active',p_expires_at,v_policy,auth.uid()
  )
  returning * into v_share;

  return jsonb_build_object(
    'ok',true,
    'share_id',v_share.id,
    'token',v_token,
    'share_path','/'||v_tenant_slug||'/share/'||v_token,
    'expires_at',v_share.expires_at,
    'field_policy',v_share.field_policy
  );
end;
$$;
revoke all on function public.activity_admin_create_share(text,text,timestamptz,jsonb) from public, anon, authenticated;
grant execute on function public.activity_admin_create_share(text,text,timestamptz,jsonb) to authenticated, service_role;
comment on function public.activity_admin_create_share(text,text,timestamptz,jsonb) is
  'Privacy-minimal share policy: accepts only seq/name/status/party_size for external read-only links.';

create or replace function public.activity_public_share_snapshot(
  p_token text
) returns jsonb
language plpgsql
security definer
set search_path=public,auth,extensions,pg_temp
as $$
declare
  v_hash text;
  v_share public.activity_public_shares%rowtype;
  v_activity public.activities%rowtype;
  v_policy jsonb;
begin
  if p_token is null or length(p_token)<32 or length(p_token)>200 or p_token !~ '^[A-Za-z0-9_-]+$' then
    return jsonb_build_object('ok',false);
  end if;

  v_hash:=encode(extensions.digest(p_token,'sha256'),'hex');

  select * into v_share
  from public.activity_public_shares
  where token_hash=v_hash
  limit 1;

  if not found or v_share.status<>'active' or v_share.expires_at<=now() then
    if found and v_share.status='active' and v_share.expires_at<=now() then
      update public.activity_public_shares set status='expired' where id=v_share.id;
    end if;
    return jsonb_build_object('ok',false);
  end if;

  select * into v_activity from public.activities where id=v_share.activity_id;
  if not found then return jsonb_build_object('ok',false); end if;

  update public.activity_public_shares
  set last_accessed_at=now(),access_count=access_count+1
  where id=v_share.id;

  v_policy:=jsonb_build_object(
    'seq',true,
    'name',coalesce((v_share.field_policy->>'name')::boolean,true),
    'status',coalesce((v_share.field_policy->>'status')::boolean,true),
    'party_size',coalesce((v_share.field_policy->>'party_size')::boolean,true)
  );

  return jsonb_build_object(
    'ok',true,
    'activity',jsonb_build_object(
      'activity_key',v_activity.activity_key,
      'title',v_activity.title,
      'starts_at',v_activity.starts_at,
      'ends_at',v_activity.ends_at,
      'venue',v_activity.venue
    ),
    'share',jsonb_build_object(
      'expires_at',v_share.expires_at,
      'field_policy',v_policy
    ),
    'participants',coalesce((
      select jsonb_agg(jsonb_build_object(
        'seq',q.seq,
        'name',case when coalesce((v_policy->>'name')::boolean,true) then q.name else null end,
        'status',case when coalesce((v_policy->>'status')::boolean,true) then q.status else null end,
        'party_size',case when coalesce((v_policy->>'party_size')::boolean,true) then q.party_size else null end
      ) order by q.seq)
      from (
        select row_number() over(order by p.submitted_at asc,p.id asc) as seq,
               pe.display_name as name,p.status,p.party_size
        from public.activity_participations p
        join public.people pe on pe.id=p.person_id
        where p.activity_id=v_activity.id
      ) q
    ),'[]'::jsonb)
  );
end;
$$;
revoke all on function public.activity_public_share_snapshot(text) from public, anon, authenticated;
grant execute on function public.activity_public_share_snapshot(text) to anon, authenticated, service_role;
comment on function public.activity_public_share_snapshot(text) is
  'Intentional public exception: validates a high-entropy expiring share token and returns only seq/name/status/party_size. Phone, email, submitted time, notes, roles, EKODI IDs and internal metadata are never projected.';

commit;
