-- EKODI points P2 member UI support (#6739). Read-only, self-scoped RPCs for
-- the /my/points evidence claim form. Members see only adapters a site made
-- claimable and only their own claims; no other member data is returned.
create or replace function public.ekodi_points_claimable_adapters(p_site text)
returns jsonb language plpgsql stable security definer
set search_path = pg_catalog, public
as $$
declare v_person uuid;
begin
  if auth.uid() is null then raise exception 'POINTS_AUTH_REQUIRED'; end if;
  if p_site is null or p_site !~ '^[a-z0-9_-]{2,64}$' then raise exception 'INVALID_POINT_SITE'; end if;
  v_person := ekodi_points_private.resolve_person_for_auth(auth.uid());
  if v_person is null then raise exception 'POINT_IDENTITY_NOT_LINKED'; end if;
  return (select coalesce(jsonb_agg(jsonb_build_object(
      'rule_id',a.rule_id,'adapter',a.adapter,'trust',a.trust,'points',r.points) order by a.rule_id,a.adapter),'[]'::jsonb)
    from public.ekodi_point_evidence_adapters a
    join public.ekodi_point_sites s on s.site_id=a.site_id and s.enabled
    join public.ekodi_point_rules r on r.site_id=a.site_id and r.rule_id=a.rule_id and r.enabled
    where a.site_id=p_site and a.enabled and a.member_claimable);
end;
$$;

create or replace function public.ekodi_points_my_claims(p_site text)
returns jsonb language plpgsql stable security definer
set search_path = pg_catalog, public
as $$
declare v_person uuid;
begin
  if auth.uid() is null then raise exception 'POINTS_AUTH_REQUIRED'; end if;
  if p_site is null or p_site !~ '^[a-z0-9_-]{2,64}$' then raise exception 'INVALID_POINT_SITE'; end if;
  v_person := ekodi_points_private.resolve_person_for_auth(auth.uid());
  if v_person is null then raise exception 'POINT_IDENTITY_NOT_LINKED'; end if;
  -- Decision notes and reviewer identities stay internal.
  return (select coalesce(jsonb_agg(jsonb_build_object('claim_id',c.claim_id,'rule_id',c.rule_id,'adapter',c.adapter,
      'source_ref',c.source_ref,'status',c.status,'submitted_at',c.submitted_at,'decided_at',c.decided_at)
      order by c.submitted_at desc),'[]'::jsonb)
    from (select * from public.ekodi_point_evidence_claims
          where site_id=p_site and person_id=v_person order by submitted_at desc limit 30) c);
end;
$$;

revoke all on function public.ekodi_points_claimable_adapters(text), public.ekodi_points_my_claims(text)
  from public, anon, authenticated;
grant execute on function public.ekodi_points_claimable_adapters(text), public.ekodi_points_my_claims(text)
  to authenticated;
