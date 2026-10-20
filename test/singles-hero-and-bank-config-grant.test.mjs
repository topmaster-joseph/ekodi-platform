import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

test('home hero copy stacks above the photo overlay so text and CTAs stay legible',async()=>{
  const css=await readFile(new URL('../sites/ekodi-singles/public/styles.css',import.meta.url),'utf8');
  // .romantic-photo:before is z-index:1 and follows the copy in DOM order; equal z-index paints the overlay on top.
  assert.match(css,/\.romantic-photo:before\{[^}]*z-index:1/);
  const rule=css.match(/\.romantic-home \.romantic-copy\{[^}]*max-width:min\(610px,60%\)[^}]*\}/);
  assert.ok(rule,'home hero copy rule missing');
  const z=Number(rule[0].match(/z-index:(\d+)/)?.[1]||0);
  assert.ok(z>1,'home hero copy must sit above the overlay (z-index > 1)');
});

test('service role can write bank config tables while browser roles stay revoked',async()=>{
  const sql=await readFile(new URL('../supabase/migrations/20261021020000_singles_bank_config_service_write.sql',import.meta.url),'utf8');
  assert.match(sql,/grant select,insert,update on table public\.singles_bank_settings,public\.singles_bank_plans to service_role;/);
  assert.doesNotMatch(sql,/to (?:anon|authenticated|public)\b/i);
  const handler=await readFile(new URL('../supabase/functions/singles-api/bank-transfer.ts',import.meta.url),'utf8');
  assert.match(handler,/from\('singles_bank_settings'\)\s*\.upsert/);
  assert.match(handler,/from\('singles_bank_plans'\)\s*\.upsert/);
});
