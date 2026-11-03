-- Development database only. Runs inside one transaction and rolls back all synthetic fixtures.
begin;
do $test$
declare
  owner_id uuid:=gen_random_uuid();
  pending_id uuid:=gen_random_uuid();
  other_id uuid:=gen_random_uuid();
  wait_id uuid:=gen_random_uuid();
  circle_id uuid:=gen_random_uuid();
  second_circle uuid:=gen_random_uuid();
  meeting_id uuid:=gen_random_uuid();
  other_meeting uuid:=gen_random_uuid();
  tenant_id uuid:=gen_random_uuid();
  decision jsonb;
  denied boolean:=false;
  count_record integer;
begin
  insert into auth.users(id,instance_id,aud,role,email,encrypted_password,email_confirmed_at,created_at,updated_at)
  select id,'00000000-0000-0000-0000-000000000000'::uuid,'authenticated','authenticated',
    'synthetic-reading-'||id||'@example.invalid','',now(),now(),now()
  from (values(owner_id),(pending_id),(other_id),(wait_id)) as v(id);
  insert into public.tenants(id,slug,name,status)
    values(tenant_id,'reading-synthetic-'||left(replace(tenant_id::text,'-',''),12),'Synthetic Reading Tenant','active');
  insert into public.tenant_members(tenant_id,user_id,role,status)
    values(tenant_id,owner_id,'tenant_admin','active'),
      (tenant_id,pending_id,'member','active'),
      (tenant_id,wait_id,'member','active');
  insert into public.community_circles(id,owner_user_id,slug,name,capacity,workspace_tenant_id)
    values(circle_id,owner_id,'reading-syn-'||left(replace(circle_id::text,'-',''),12),'Synthetic Reading',3,tenant_id);
  insert into public.community_circles(id,owner_user_id,slug,name,capacity)
    values(second_circle,other_id,'reading-syn-'||left(replace(second_circle::text,'-',''),12),'Separate Reading',3);
  insert into public.community_circle_members(circle_id,user_id,role,status)
    values(circle_id,owner_id,'owner','active'),
      (circle_id,other_id,'member','active'),
      (circle_id,pending_id,'member','pending'),
      (circle_id,wait_id,'member','pending'),
      (second_circle,other_id,'owner','active');
  insert into public.community_reading_meetings(id,circle_id,created_by,title)
    values(meeting_id,circle_id,owner_id,'Synthetic Meeting'),
      (other_meeting,second_circle,other_id,'Separate Meeting');
  insert into public.community_reading_entries(circle_id,meeting_id,author_user_id,kind,scope,content)
    values(circle_id,meeting_id,pending_id,'reflection','private','Synthetic private note'),
      (circle_id,meeting_id,other_id,'question','circle','Synthetic shared question');
  -- A row from another Circle cannot be attached to a meeting it does not own.
  begin
    insert into public.community_reading_entries(circle_id,meeting_id,author_user_id,kind,scope,content)
      values(second_circle,meeting_id,other_id,'question','circle','invalid linkage');
  exception when foreign_key_violation then denied:=true;
  end;
  if denied is not true then raise exception 'cross_circle_entry_fk_missing'; end if;
  denied:=false;
  begin
    insert into public.community_reading_attendance(circle_id,meeting_id,user_id,set_by,status)
      values(second_circle,meeting_id,other_id,owner_id,'present');
  exception when foreign_key_violation then denied:=true;
  end;
  if denied is not true then raise exception 'cross_circle_attendance_fk_missing'; end if;
  -- A tenant membership is required even when the person owns the Circle.
  decision:=public.community_reading_review_member(circle_id,other_id,pending_id,'approve');
  if decision->>'error' <> 'manager_required' then raise exception 'outsider_approved'; end if;
  decision:=public.community_reading_review_member(circle_id,owner_id,pending_id,'approve');
  if decision->>'status' <> 'active' then raise exception 'owner_approval_failed'; end if;
  decision:=public.community_reading_review_member(circle_id,owner_id,wait_id,'approve');
  if decision->>'error' <> 'circle_full' then raise exception 'capacity_not_enforced'; end if;
  select count(*) into count_record from public.community_reading_audit where actor_user_id=owner_id and action='membership.active';
  if count_record <> 1 then raise exception 'approval_not_audited'; end if;
  if has_table_privilege('anon','public.community_reading_entries','select')
    or has_table_privilege('authenticated','public.community_reading_entries','select')
    or has_function_privilege('anon','public.community_reading_review_member(uuid,uuid,uuid,text)','execute')
    then raise exception 'public_access_not_revoked'; end if;
end
$test$;
rollback;
