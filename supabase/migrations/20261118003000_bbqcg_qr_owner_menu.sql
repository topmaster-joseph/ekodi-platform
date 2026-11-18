-- EKODI BBQCG QR menu intake. User-directed catalog management, NOT a payment activation.
-- Exact store boundary, owner/admin approval and immutable audit evidence.
-- No existing published catalog or POS/order/payment rows are migrated or overwritten.

begin;

create table if not exists public.bbqcg_qr_menu_approvals (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references public.stores(id) on delete restrict,
  menu_item_id uuid not null references public.store_menu_items(id) on delete restrict,
  actor_id uuid not null,
  action text not null check (action in ('draft_saved','owner_approved')),
  approved_price integer,
  evidence_url text,
  created_at timestamptz not null default now()
);

alter table public.bbqcg_qr_menu_approvals enable row level security;
revoke all on public.bbqcg_qr_menu_approvals from public, anon, authenticated, service_role;

create or replace function public.bbqcg_qr_menu_owner_submit(
  p_slug text,
  p_name text,
  p_category text default null,
  p_description text default null,
  p_price integer default null,
  p_source_url text default null,
  p_approve boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path = public, auth
as $bbq_menu_submit$
declare
  v_store_id uuid;
  v_item_id uuid;
  v_existing public.store_menu_items%rowtype;
  v_name text := trim(coalesce(p_name,''));
  v_category text := nullif(trim(coalesce(p_category,'')),'');
  v_desc text := nullif(trim(coalesce(p_description,'')),'');
  v_source text := nullif(trim(coalesce(p_source_url,'')),'');
  v_action text;
begin
  if auth.uid() is null then raise exception 'authentication_required' using errcode='42501'; end if;
  if lower(trim(coalesce(p_slug,''))) <> 'bbqcg' then raise exception 'bbqcg_scope_required' using errcode='42501'; end if;
  select s.id into v_store_id
    from public.stores s
    join public.store_user_sites us on us.store_id=s.id
   where s.operating_space_slug='bbqcg' and us.status='active'
   limit 1;
  if v_store_id is null or not public.can_manage_store_user_site(v_store_id)
    then raise exception 'store_owner_or_admin_required' using errcode='42501'; end if;

  if length(v_name) not between 2 and 100 or length(coalesce(v_category,''))>60 or length(coalesce(v_desc,''))>300
    then raise exception 'invalid_menu_description' using errcode='22023'; end if;
  if p_price is not null and (p_price<1 or p_price>500000)
    then raise exception 'invalid_menu_price' using errcode='22023'; end if;
  if v_source is not null and (length(v_source)>1000 or v_source !~ '^https://[^[:space:]]+')
    then raise exception 'invalid_evidence_url' using errcode='22023'; end if;
  if coalesce(p_approve,false) and (p_price is null or v_source is null)
    then raise exception 'owner_approval_requires_price_and_source' using errcode='22023'; end if;

  -- Prevent concurrent duplicates for one store and human-readable menu name.
  perform pg_advisory_xact_lock(hashtextextended(v_store_id::text || ':' || lower(v_name),0));
  select * into v_existing from public.store_menu_items m
   where m.store_id=v_store_id and lower(trim(m.canonical_name))=lower(v_name)
   order by m.created_at limit 1 for update;

  if v_existing.id is not null and v_existing.source_basis<>'pending'
    then raise exception 'published_menu_change_requires_separate_review' using errcode='23505'; end if;

  if v_existing.id is null then
    insert into public.store_menu_items (
      store_id,canonical_name,category,description,base_price,source_url,
      availability,source_basis,verified_at
    ) values (
      v_store_id,v_name,v_category,v_desc,p_price,v_source,
      case when coalesce(p_approve,false) then 'available' else 'hidden' end,
      case when coalesce(p_approve,false) then 'operator_verified' else 'pending' end,
      case when coalesce(p_approve,false) then now() else null end
    ) returning id into v_item_id;
  else
    update public.store_menu_items m set
      category=v_category,description=v_desc,base_price=p_price,source_url=v_source,
      availability=case when coalesce(p_approve,false) then 'available' else 'hidden' end,
      source_basis=case when coalesce(p_approve,false) then 'operator_verified' else 'pending' end,
      verified_at=case when coalesce(p_approve,false) then now() else null end,
      updated_at=now()
    where m.id=v_existing.id and m.store_id=v_store_id
    returning m.id into v_item_id;
  end if;

  v_action:=case when coalesce(p_approve,false) then 'owner_approved' else 'draft_saved' end;
  insert into public.bbqcg_qr_menu_approvals(
    store_id,menu_item_id,actor_id,action,approved_price,evidence_url
  ) values (v_store_id,v_item_id,auth.uid(),v_action,p_price,v_source);

  return jsonb_build_object('ok',true,'menu_item_id',v_item_id,'state',
    case when coalesce(p_approve,false) then 'owner_approved' else 'draft_hidden' end,
    'checkout_activated',false);
end
$bbq_menu_submit$;

revoke all on function public.bbqcg_qr_menu_owner_submit(text,text,text,text,integer,text,boolean) from public,anon;
grant execute on function public.bbqcg_qr_menu_owner_submit(text,text,text,text,integer,text,boolean) to authenticated;

-- Customer-safe, exact-tenant projection. Never returns pending/sold-out/hidden items
-- or order/PG/customer/staff data. Displaying approved products is NOT checkout permission.
create or replace function public.bbqcg_qr_public_catalog(p_slug text)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $bbq_menu_public$
declare
  v_store record;
begin
  if lower(trim(coalesce(p_slug,''))) <> 'bbqcg' then return null; end if;
  select s.id,s.public_phone into v_store
    from public.stores s
    join public.store_user_sites us on us.store_id=s.id
   where s.operating_space_slug='bbqcg' and us.status='active'
   limit 1;
  if v_store.id is null then return null; end if;

  return jsonb_build_object(
    'store',jsonb_build_object('phone',v_store.public_phone),
    'menu',coalesce((
      select jsonb_agg(jsonb_build_object(
        'id',m.id,'name',m.canonical_name,'category',m.category,
        'description',m.description,'base_price',m.base_price,
        'source_basis',m.source_basis,'verified_at',m.verified_at,
        'availability',m.availability
      ) order by coalesce(m.category,''),m.canonical_name)
      from public.store_menu_items m
      where m.store_id=v_store.id and m.availability='available'
        and m.source_basis in ('brand_official','platform_verified','operator_verified','pos_verified')
        and m.verified_at is not null
        and m.base_price between 1 and 500000
    ),'[]'::jsonb)
  );
end
$bbq_menu_public$;

revoke all on function public.bbqcg_qr_public_catalog(text) from public;
grant execute on function public.bbqcg_qr_public_catalog(text) to anon,authenticated;

commit;
