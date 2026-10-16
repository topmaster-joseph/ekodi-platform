import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
const sql=await readFile(new URL('../supabase/migrations/20261012011500_singles_atomic_receiver_consent.sql',import.meta.url),'utf8');
test('reserve only from confirmed prepaid wallet and atomically lock available balance',()=>{
 assert.match(sql,/where user_id=p_sender and scope=v_scope for update/);
 assert.match(sql,/if not found or v_credit\.available<1 then raise exception 'insufficient_prepaid_credit'/);
 assert.match(sql,/available=available-1,reserved=reserved\+1/);
 assert.match(sql,/request_id=p_request for update/);
 assert.match(sql,/raise exception 'request_already_used'/);
});
test('only selected receiver approval spends reserved credit; decline restores',()=>{
 assert.match(sql,/if v_charge\.receiver_id<>p_receiver then raise exception 'receiver_only'/);
 assert.match(sql,/if v_charge\.status in \('accepted','declined'\) then return v_charge\.status/);
 assert.match(sql,/available=available\+case when p_decision='declined' then v_charge\.reservation_units else 0 end/);
 assert.match(sql,/charged_units=case when p_decision='accepted' then reservation_units else 0 end/);
});
test('all functions deny direct member execution; service-only via authenticated origin',()=>{
 assert.match(sql,/revoke all on function public\.singles_reserve_message_credit\(uuid,uuid,uuid,text\) from public,anon,authenticated/);
 assert.match(sql,/revoke all on function public\.singles_decide_message_consent\(uuid,uuid,text\) from public,anon,authenticated/);
 assert.match(sql,/grant execute on function public\.singles_decide_message_consent\(uuid,uuid,text\) to service_role/);
});
