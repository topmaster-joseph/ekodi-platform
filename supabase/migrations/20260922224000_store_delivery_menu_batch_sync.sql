-- Batch menu synchronization across delivery platforms.
-- One canonical store menu item can fan out a human-approved change to every mapped platform listing.
-- External completion is never claimed here; execution still requires an approved official write adapter.

create or replace function public.store_platform_menu_batch_queue(
  p_slug text,
  p_menu_item_id uuid,
  p_action text,
  p_value text default null,
  p_providers text[] default null
) returns jsonb
language plpgsql
security definer
set search_path=public,auth
as $$
declare
  v_store_id uuid;
  v_action text:=lower(trim(coalesce(p_action,'')));
  v_type text;
  v_payload jsonb;
  v_row record;
  v_status text;
  v_action_id uuid;
  v_results jsonb:='[]'::jsonb;
  v_total integer:=0;
  v_queued integer:=0;
  v_needs_connection integer:=0;
  v_requested text[]:=coalesce(p_providers,'{}'::text[]);
begin
  if auth.uid() is null then
    raise exception 'authentication_required' using errcode='42501';
  end if;

  if v_action not in ('price','available','sold_out','hidden') then
    raise exception 'unsupported_menu_action' using errcode='22023';
  end if;

  select id into v_store_id
    from public.stores
   where lower(operating_space_slug)=lower(trim(coalesce(p_slug,'')))
   limit 1;

  if v_store_id is null or not public.can_manage_store_user_site(v_store_id) then
    raise exception 'workspace_admin_required' using errcode='42501';
  end if;

  if not exists(
    select 1 from public.store_menu_items
     where id=p_menu_item_id and store_id=v_store_id
  ) then
    raise exception 'canonical_menu_item_not_found' using errcode='22023';
  end if;

  if v_action='price' then
    if trim(coalesce(p_value,'')) !~ '^[0-9]+$' or p_value::integer<0 then
      raise exception 'invalid_menu_price' using errcode='22023';
    end if;
    v_type:='menu_price_update';
    v_payload:=jsonb_build_object('menu_item_id',p_menu_item_id,'listed_price',p_value::integer,'scope','canonical_menu_batch');
  else
    v_type:='menu_availability_update';
    v_payload:=jsonb_build_object('menu_item_id',p_menu_item_id,'availability',v_action,'scope','canonical_menu_batch');
  end if;

  for v_row in
    select l.provider,l.external_item_ref,c.connection_status,c.source_kind
      from public.store_channel_menu_listings l
      left join public.store_channel_profiles c
        on c.store_id=l.store_id and c.provider=l.provider
     where l.store_id=v_store_id
       and l.menu_item_id=p_menu_item_id
       and l.external_item_ref is not null
       and l.provider in ('baemin','coupang_eats','yogiyo','ddangyo','mukkebi','daangn','naver_order')
       and (
         cardinality(v_requested)=0
         or l.provider=any(v_requested)
       )
     order by l.provider,l.external_item_ref
  loop
    v_status:=case
      when v_row.connection_status in ('ready','active') and v_row.source_kind='official_api' then 'queued'
      else 'needs_connection'
    end;

    insert into public.store_platform_actions(
      store_id,provider,action_type,target_ref,payload,status,approval_state,requested_by
    ) values(
      v_store_id,v_row.provider,v_type,v_row.external_item_ref,
      v_payload || jsonb_build_object('provider',v_row.provider),
      v_status,'user_approved',auth.uid()
    ) returning id into v_action_id;

    v_total:=v_total+1;
    if v_status='queued' then v_queued:=v_queued+1; else v_needs_connection:=v_needs_connection+1; end if;
    v_results:=v_results || jsonb_build_array(jsonb_build_object(
      'provider',v_row.provider,
      'action_id',v_action_id,
      'status',v_status,
      'external_item_ref',v_row.external_item_ref
    ));
  end loop;

  if v_total=0 then
    raise exception 'mapped_platform_menu_listing_not_found' using errcode='22023';
  end if;

  return jsonb_build_object(
    'ok',true,
    'menu_item_id',p_menu_item_id,
    'action',v_action,
    'total',v_total,
    'queued',v_queued,
    'needs_connection',v_needs_connection,
    'results',v_results
  );
end
$$;

revoke all on function public.store_platform_menu_batch_queue(text,uuid,text,text,text[]) from public,anon;
grant execute on function public.store_platform_menu_batch_queue(text,uuid,text,text,text[]) to authenticated;

comment on function public.store_platform_menu_batch_queue(text,uuid,text,text,text[]) is
  'Fans one human-approved canonical menu change out to selected mapped delivery-platform listings; external completion still requires an official write adapter.';
