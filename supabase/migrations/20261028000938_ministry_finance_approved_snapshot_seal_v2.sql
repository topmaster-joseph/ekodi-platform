
create or replace function ministry_private.finance_publication_guard()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
 if tg_op='DELETE' then
   if old.status in ('approved','revoked') then
     raise exception 'sealed finance publication cannot be deleted' using errcode='42501';
   end if;
   return old;
 end if;
 if old.status in ('approved','revoked') then
   if old.status='revoked' or new.status<>'revoked'
      or new.tenant_id is distinct from old.tenant_id
      or new.period_start is distinct from old.period_start
      or new.period_end is distinct from old.period_end
      or new.audience is distinct from old.audience
      or new.allowed_sections is distinct from old.allowed_sections
      or new.source_revision is distinct from old.source_revision
      or new.approved_by is distinct from old.approved_by
      or new.approved_at is distinct from old.approved_at
      or new.created_at is distinct from old.created_at
   then
     raise exception 'sealed finance publication is immutable (revocation only)' using errcode='42501';
   end if;
 end if;
 return new;
end;
$$;

drop trigger if exists ministry_finance_publication_seal on ministry_private.finance_publications;
create trigger ministry_finance_publication_seal
before update or delete on ministry_private.finance_publications
for each row execute function ministry_private.finance_publication_guard();

create or replace function ministry_private.finance_publication_block_guard()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
declare v_publication uuid;
begin
 v_publication:=case when tg_op='INSERT' then new.publication_id else old.publication_id end;
 if tg_op='UPDATE' and new.publication_id is distinct from old.publication_id then
   raise exception 'finance publication block cannot be moved between publications' using errcode='42501';
 end if;
 if exists(
   select 1 from ministry_private.finance_publications p
   where p.id=v_publication and p.status in ('approved','revoked')
 ) then
   raise exception 'sealed finance publication blocks are immutable' using errcode='42501';
 end if;
 if tg_op='DELETE' then return old; end if;
 return new;
end;
$$;

drop trigger if exists ministry_finance_block_seal on ministry_private.finance_publication_blocks;
create trigger ministry_finance_block_seal
before insert or update or delete on ministry_private.finance_publication_blocks
for each row execute function ministry_private.finance_publication_block_guard();

revoke all on function ministry_private.finance_publication_guard() from public,anon,authenticated;
revoke all on function ministry_private.finance_publication_block_guard() from public,anon,authenticated;
