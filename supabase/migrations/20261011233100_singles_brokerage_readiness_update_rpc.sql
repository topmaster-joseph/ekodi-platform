-- Atomic, server-only operator update + append-only audit; never authorizes brokerage launch.
create or replace function public.singles_brokerage_update_readiness(
 p_regime text, p_code text, p_progress text, p_evidence_ref text, p_actor uuid
) returns public.singles_brokerage_readiness
language plpgsql security definer set search_path = pg_catalog, public
as $$
declare
 previous public.singles_brokerage_readiness%rowtype;
 current_row public.singles_brokerage_readiness%rowtype;
begin
 if p_regime not in ('domestic','international')
    or p_progress not in ('not_started','collecting','ready_for_review','submitted')
    or p_code is null or length(p_code)>49
    or p_evidence_ref is not null and length(p_evidence_ref)>240 then
  raise exception 'invalid_readiness_input';
 end if;
 if not exists(
   select 1 from public.singles_bank_operators
   where user_id=p_actor and enabled=true and can_configure=true
 ) then
  raise exception 'readiness_operator_capability_required';
 end if;
 select * into previous from public.singles_brokerage_readiness
 where regime=p_regime and code=p_code for update;
 if not found then raise exception 'readiness_item_not_found'; end if;
 update public.singles_brokerage_readiness
 set progress=p_progress,evidence_ref=nullif(trim(p_evidence_ref),''),
     updated_by=p_actor,updated_at=now()
 where regime=p_regime and code=p_code returning * into current_row;
 insert into public.singles_brokerage_readiness_audit(
   regime,code,actor_id,previous_progress,new_progress,
   previous_evidence_ref,new_evidence_ref
 ) values(
   p_regime,p_code,p_actor,previous.progress,current_row.progress,
   previous.evidence_ref,current_row.evidence_ref
 );
 return current_row;
end;
$$;
revoke all on function public.singles_brokerage_update_readiness(text,text,text,text,uuid)
 from public, anon, authenticated;
grant execute on function public.singles_brokerage_update_readiness(text,text,text,text,uuid)
 to service_role;
