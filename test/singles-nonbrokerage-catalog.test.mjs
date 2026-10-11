import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
const sql=await readFile(new URL('../supabase/migrations/20261011170000_singles_nonbrokerage_catalog.sql',import.meta.url),'utf8');
test('all sale prices stay in configured bounds and all products launch disabled',()=>{
 assert.match(sql,/amount_krw between 4900 and 200000/);
 assert.match(sql,/active boolean not null default false/);
 assert.match(sql,/legal_reviewed boolean not null default false/);
 assert.match(sql,/not active or \(legal_reviewed and published_at is not null\)/);
});
test('message credits never expire and period grants have no message cap',()=>{
 assert.match(sql,/scope='per_message' and message_credits is not null and contact_credits is null and period_days is null/);
 assert.match(sql,/scope='per_period' and period_days is not null and message_credits is null and contact_credits is null/);
 assert.match(sql,/scope='per_contact' and contact_credits is not null and message_credits is null and period_days is null/);
});
test('no direct client grants, and purchase terms and prices are snapshotted',()=>{
 assert.match(sql,/enable row level security/);
 assert.match(sql,/revoke all on public.singles_product_catalog from public, anon, authenticated/);
 assert.match(sql,/revoke all on public.singles_product_price_snapshots from public, anon, authenticated/);
 assert.match(sql,/terms_version text not null/);
 assert.match(sql,/amount_krw integer not null/);
});

test('only receiver consent can authorize a charged contact request',()=>{
 assert.match(sql,/sender_id uuid not null/);
 assert.match(sql,/receiver_id uuid not null/);
 assert.match(sql,/request_id uuid not null unique/);
 assert.match(sql,/status='accepted'/);
 assert.match(sql,/charged_at is not null and accepted_at is not null/);
 assert.match(sql,/status not in \('declined','cancelled','expired'\) or charged_units=0/);
});
test('current release has no marriage brokerage workflow or checklist',()=>{
 assert.doesNotMatch(sql,/singles_brokerage_application_checklist|domestic_marriage_brokerage|international_marriage_brokerage/);
});
