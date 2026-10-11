import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {routeSinglesSurface} from '../singles-surface.js';
const load=path=>readFile(new URL(path,import.meta.url),'utf8');
const [schema,rpc,edge,worker,ui]=await Promise.all([
 load('../supabase/migrations/20261011233000_singles_brokerage_readiness.sql'),
 load('../supabase/migrations/20261011233100_singles_brokerage_readiness_update_rpc.sql'),
 load('../supabase/functions/singles-api/bank-transfer.ts'),
 load('../singles-surface.js'),
 load('../sites/ekodi-singles/public/app.js'),
]);
test('registration preparation cannot publish marriage brokerage',()=>{
 assert.match(schema,/regime in \('domestic','international'\)/);
 assert.match(schema,/create table if not exists public.singles_brokerage_readiness_audit/);
 assert.match(schema,/revoke all on public.singles_brokerage_readiness/);
 assert.doesNotMatch(schema,/brokerage_enabled\s*=\s*true/i);
 assert.match(edge,/brokerage_mode:'disabled'/);
 assert.match(ui,/진행 상태 저장은 행정기관 신고 수리 또는 등록을 의미하지 않습니다/);
});
test('administrator must have scoped role and all updates have an atomic audit event',()=>{
 assert.match(edge,/role\.can_configure!==true/);
 assert.match(edge,/singles_brokerage_update_readiness/);
 assert.match(rpc,/for update/);
 assert.match(rpc,/insert into public\.singles_brokerage_readiness_audit/);
 assert.match(rpc,/where user_id=p_actor and enabled=true and can_configure=true/);
 assert.match(rpc,/revoke all on function public\.singles_brokerage_update_readiness/);
});
test('private route never permits anonymous checklist disclosure',async()=>{
 assert.match(worker,/\['\/api\/bank\/admin\/brokerage-readiness',\['GET','PUT'\]\]/);
 const r=await routeSinglesSurface(new Request('https://ekodi.kr/singles/api/bank/admin/brokerage-readiness'),{ASSETS:{fetch:async()=>new Response('asset')}});
 assert.equal(r.status,503);
 const j=await r.json();assert.ok(j.error);
 const config={ASSETS:{fetch:async()=>new Response('asset')},SINGLES_API_URL:'https://example.supabase.co/functions/v1/singles-api'};
 const ready=await routeSinglesSurface(new Request('https://ekodi.kr/singles/api/bank/admin/brokerage-readiness'),config);
 assert.equal(ready.status,401,'prelaunch admin may prepare only after authentication');
 const social=await routeSinglesSurface(new Request('https://ekodi.kr/singles/api/discover'),config);
 assert.equal(social.status,503,'public member discovery must remain closed');
});
test('official filing remains a user-confirmed government flow rather than a platform submission',()=>{
 assert.match(ui,/CappBizCD=13510000012/);
 assert.match(ui,/rel='noopener noreferrer'/);
 assert.doesNotMatch(edge,/application_submitted_by_platform:true/);
});
