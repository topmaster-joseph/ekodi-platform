import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
const files=await Promise.all(['../singles-surface.js','../sites/ekodi-singles/public/app.js','../supabase/functions/singles-api/bank-transfer.ts','../supabase/migrations/20261012010000_singles_brokerage_readiness_registry.sql'].map(x=>readFile(new URL(x,import.meta.url),'utf8')));
const [router,ui,bank,schema]=files;
test('registry preparation is accessible only through authenticated member-admin route',()=>{
 assert.match(router,/\/api\/bank\/admin\/brokerage-checklist/);
 assert.match(bank,/administrator_required/);
 assert.match(bank,/role\.can_configure!==true/);
 assert.match(ui,/showBrokerageReadiness/);
});
test('registry records are only checklist evidence, never activate matchmaking',()=>{
 assert.match(schema,/enable row level security/);
 assert.match(schema,/revoke all on public\.singles_brokerage_application_checklist/);
 assert.match(bank,/brokerage_enabled:false/);
 assert.match(ui,/인허가 완료와는 별개/);
});
