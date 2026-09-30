-- Aggregate-only store administration snapshot. Extends Business OS without exposing order/customer rows.
create or replace function public.business_os_store_admin_snapshot(p_workspace_key text)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, auth
as $$
declare
  v_base jsonb;
  v_store_id uuid;
  v_today date := (now() at time zone 'Asia/Seoul')::date;
  v_order_count integer := 0;
  v_average_ticket numeric := 0;
  v_channels jsonb := '{}'::jsonb;
begin
  v_base := public.business_os_snapshot(p_workspace_key);
  v_store_id := nullif(v_base #>> '{workspace,storeId}', '')::uuid;
  if v_store_id is null then
    return v_base || jsonb_build_object('orders', jsonb_build_object('count',0,'averageTicket',0,'channels','{}'::jsonb));
  end if;
  select count(*)::integer,
         coalesce(round(avg(o.total)::numeric, 0), 0)
    into v_order_count, v_average_ticket
    from public.orders o
   where o.store_id = v_store_id
     and o.status::text = 'completed'
     and (o.created_at at time zone 'Asia/Seoul')::date = v_today;

  with channel_totals as (
    select coalesce(nullif(trim(o.source),''),'unknown') as channel,
           count(*)::integer as orders,
           coalesce(sum(o.total),0)::numeric as sales
      from public.orders o
     where o.store_id = v_store_id
       and o.status::text = 'completed'
       and (o.created_at at time zone 'Asia/Seoul')::date = v_today
     group by 1
  )
  select coalesce(jsonb_object_agg(channel, jsonb_build_object('orders',orders,'sales',sales)), '{}'::jsonb)
    into v_channels
    from channel_totals;
  return v_base || jsonb_build_object(
    'orders', jsonb_build_object(
      'count', v_order_count,
      'averageTicket', v_average_ticket,
      'channels', v_channels
    )
  );
end
$$;

revoke all on function public.business_os_store_admin_snapshot(text) from public, anon;
grant execute on function public.business_os_store_admin_snapshot(text) to authenticated;

comment on function public.business_os_store_admin_snapshot(text) is
  'Store-scoped aggregate admin snapshot. Reuses Business OS access checks and never returns customer/order row PII.';
