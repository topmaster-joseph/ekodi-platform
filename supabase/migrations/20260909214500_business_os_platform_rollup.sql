create or replace function public.business_os_store_admin_snapshot(p_workspace_key text)
returns jsonb language plpgsql stable security definer set search_path=public,auth as $$
declare v_base jsonb;v_store_id uuid;v_today date:=(now() at time zone 'Asia/Seoul')::date;v_order_count integer:=0;v_average_ticket numeric:=0;v_channels jsonb:='{}'::jsonb;v_sales numeric:=0;v_unanswered integer:=0;v_external_reviews integer:=0;
begin
 v_base:=public.business_os_snapshot(p_workspace_key);v_store_id:=nullif(v_base#>>'{workspace,storeId}','')::uuid;
 if v_store_id is null then return v_base||jsonb_build_object('orders',jsonb_build_object('count',0,'averageTicket',0,'channels','{}'::jsonb));end if;
 with platform_present as(select distinct provider from public.store_platform_orders where store_id=v_store_id and (ordered_at at time zone 'Asia/Seoul')::date=v_today),chosen as(
  select coalesce(nullif(trim(o.source),''),'ekodi') channel,count(*)::integer orders,coalesce(sum(o.total),0)::numeric sales from public.orders o where o.store_id=v_store_id and o.status::text='completed' and (o.created_at at time zone 'Asia/Seoul')::date=v_today and not exists(select 1 from platform_present p where p.provider=lower(coalesce(nullif(trim(o.source),''),'ekodi'))) group by 1
  union all select p.provider,count(*)::integer,coalesce(sum(p.total),0)::numeric from public.store_platform_orders p where p.store_id=v_store_id and p.status='completed' and (p.ordered_at at time zone 'Asia/Seoul')::date=v_today group by p.provider
 ),rolled as(select channel,sum(orders)::integer orders,sum(sales)::numeric sales from chosen group by channel)
 select coalesce(sum(orders),0)::integer,coalesce(round(sum(sales)/nullif(sum(orders),0),0),0),coalesce(sum(sales),0),coalesce(jsonb_object_agg(channel,jsonb_build_object('orders',orders,'sales',sales)),'{}'::jsonb) into v_order_count,v_average_ticket,v_sales,v_channels from rolled;
 select count(*)::integer,count(*) filter(where reply_status in('unanswered','draft','failed'))::integer into v_external_reviews,v_unanswered from public.store_platform_reviews where store_id=v_store_id;
 v_base:=jsonb_set(v_base,'{metrics,sales}',to_jsonb(v_sales),true);
 v_base:=jsonb_set(v_base,'{marketing,unansweredReviews}',to_jsonb(case when v_external_reviews>0 then v_unanswered else coalesce((v_base#>>'{marketing,unansweredReviews}')::integer,0) end),true);
 v_base:=jsonb_set(v_base,'{marketing,connected}',to_jsonb(coalesce((v_base#>>'{marketing,connected}')::boolean,false) or v_external_reviews>0),true);
 v_base:=jsonb_set(v_base,'{sources,deliveryPlatformsConnected}',to_jsonb(exists(select 1 from public.store_platform_orders where store_id=v_store_id) or exists(select 1 from public.store_platform_reviews where store_id=v_store_id)),true);
 return v_base||jsonb_build_object('orders',jsonb_build_object('count',v_order_count,'averageTicket',v_average_ticket,'channels',v_channels),'platformOps',jsonb_build_object('orders',(select count(*) from public.store_platform_orders where store_id=v_store_id),'reviews',v_external_reviews,'unansweredReviews',v_unanswered,'queuedActions',(select count(*) from public.store_platform_actions where store_id=v_store_id and status in('queued','running','needs_connection'))));
end $$;
revoke all on function public.business_os_store_admin_snapshot(text) from public,anon;grant execute on function public.business_os_store_admin_snapshot(text) to authenticated;
