import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const sql=readFileSync(new URL('../supabase/migrations/20261103170000_singles_contact_share_atomic_receipts.sql',import.meta.url),'utf8');
const edge=readFileSync(new URL('../supabase/functions/singles-api/social.ts',import.meta.url),'utf8');
const ui=readFileSync(new URL('../sites/ekodi-singles/public/app.js',import.meta.url),'utf8');
const contract=JSON.parse(readFileSync(new URL('../config/singles-api-db-contract.json',import.meta.url),'utf8'));

test('consent evidence is an independent, private, minimal-data table',()=>{
 assert.match(sql,/create table if not exists public\.singles_contact_share_receipts\(/);
 assert.match(sql,/message_id uuid not null unique references public\.singles_messages\(id\)/);
 assert.match(sql,/sender_id uuid not null/);
 assert.match(sql,/recipient_id uuid not null/);
 assert.match(sql,/consent_version text not null/);
 assert.match(sql,/consented_at timestamptz not null/);
 assert.doesNotMatch(sql,/\n\s*(?:phone|email|contact_value|contact_text|ip_address)\s+text\b/i);
 assert.match(sql,/alter table public\.singles_contact_share_receipts enable row level security/);
 assert.match(sql,/revoke all on table public\.singles_contact_share_receipts from public,anon,authenticated,service_role/);
 assert.match(sql,/grant select,insert on table public\.singles_contact_share_receipts to service_role/);
 assert.doesNotMatch(sql,/grant (?:update|delete|all) on table public\.singles_contact_share_receipts to service_role/);
});
test('atomic service-only RPC revalidates explicit consent and both paid unrefunded invoices',()=>{
 assert.match(sql,/create or replace function public\.singles_contact_share_record\(/);
 assert.match(sql,/p_consent_version is distinct from 'singles-contact-v1-20261103'/);
 assert.match(sql,/from public\.singles_interests where id=p_interest for update/);
 assert.match(sql,/v_interest\.status<>'accepted'/);
 assert.match(sql,/adult_verified_at is not null/);
 assert.match(sql,/from public\.singles_blocks/);
 assert.match(sql,/from public\.singles_contact_unlocks/);
 assert.match(sql,/v_request\.status<>'connected'/);
 assert.match(sql,/v_request\.kind<>'contact'/);
 assert.match(sql,/v_request\.interest_id is distinct from p_interest/);
 assert.match(sql,/from public\.singles_request_invoices[\s\S]*?for update loop/);
 assert.match(sql,/v_invoice\.status<>'paid'/);
 assert.match(sql,/v_invoice\.refund_due_at is not null/);
 assert.match(sql,/v_invoice\.refunded_at is not null/);
 assert.match(sql,/count_invoices<>2 or not seen_requester or not seen_responder/);
 assert.match(sql,/insert into public\.singles_messages\([\s\S]*?returning id into v_message_id;[\s\S]*?insert into public\.singles_contact_share_receipts\(/);
 assert.match(sql,/revoke all on function public\.singles_contact_share_record\(uuid,uuid,text,text\)[\s\S]*?from public,anon,authenticated/);
 assert.match(sql,/grant execute on function public\.singles_contact_share_record\(uuid,uuid,text,text\) to service_role/);
});
test('Edge requires recorded consent for read and uses atomic RPC for write',()=>{
 assert.match(edge,/admin\.rpc\('singles_contact_share_record'/);
 assert.match(edge,/admin\.from\('singles_contact_share_receipts'\)/);
 assert.match(edge,/receipt\.sender_id===m\.sender_id/);
 assert.match(edge,/receipt\.recipient_id===recipient/);
 assert.match(edge,/receipt\.request_id===currentRequest/);
 assert.match(edge,/\[내 연락처\] \[연락처 가림\]/);
 assert.doesNotMatch(edge,/admin\.from\('singles_messages'\)\.insert\(\{interest_id:interestId,sender_id:userId,body:'\[내 연락처\]'/);
 assert.match(ui,/consent_version:'singles-contact-v1-20261103'/);
 assert.ok(contract.required_functions.includes('public.singles_contact_share_record(uuid,uuid,text,text)'));
 assert.ok(contract.required_columns.includes('public.singles_contact_share_receipts.message_id'));
});
