import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {routeSinglesSurface} from '../singles-surface.js';
const read=p=>readFile(new URL('../'+p,import.meta.url),'utf8');
const [sql,social,bank,index,app,css,worker]=await Promise.all([
 read('supabase/migrations/20261101010000_singles_events_invites.sql'),read('supabase/functions/singles-api/social.ts'),
 read('supabase/functions/singles-api/bank-transfer.ts'),read('supabase/functions/singles-api/index.ts'),
 read('sites/ekodi-singles/public/app.js'),read('sites/ekodi-singles/public/styles.css'),read('singles-surface.js')]);
const live={SINGLES_PUBLIC_PREVIEW_ENABLED:'true',ASSETS:{fetch:async()=>new Response('')},SINGLES_API_URL:'https://example.supabase.co/functions/v1/singles-api',
 SINGLES_M1_ENABLED:'true',SINGLES_SOCIAL_ENABLED:'true',SUPABASE_URL:'https://example.supabase.co',SUPABASE_PUBLISHABLE_KEY:'sb_publishable_x'};
const id='11111111-1111-4111-8111-111111111111';

test('invites: owner only, existing account only, capped per stage, original pilots locked',()=>{
 assert.match(sql,/function public\.singles_invite_add[\s\S]*can_configure=true[\s\S]*account_not_found[\s\S]*for update[\s\S]*invite_cap_reached/);
 assert.match(sql,/insert into public\.singles_launch_stage\(id,stage,invite_cap\) values\(1,2,10\)/);
 assert.match(sql,/if k<>'invite' then raise exception 'pilot_account_locked'/);
 assert.match(sql,/set kind='pilot'\s*where email in \('joseph@ekodi\.kr','topmaster\.joseph@gmail\.com','ekodibiz@gmail\.com'\)/);
 for(const f of ['singles_invite_add(uuid,text,text)','singles_invite_remove(uuid,uuid)','singles_event_rsvp(uuid,uuid)','singles_event_rsvp_cancel(uuid,uuid)']){
  assert.ok(sql.includes('revoke all on function public.'+f+' from authenticated;'),f);
  assert.ok(sql.includes('grant execute on function public.'+f+' to service_role;'),f);
 }
 const i=bank.indexOf("path==='/bank/admin/invites'||");
 assert.match(bank.slice(i,i+300),/role\.can_configure!==true\)return reply\(req,\{error:'owner_capability_required'\},403\)/);
});
test('pilot gate records a denied attempt at most daily and never changes the refusal',()=>{
 const i=index.indexOf('if (!pilot && op?.enabled !== true) {');
 const block=index.slice(i,i+700);
 assert.match(block,/eq\("action", "pilot_denied"\)\.gte\("created_at", since\)/);
 assert.match(block,/catch \(_\)/);
 assert.match(block,/return reply\(req, \{ error: "pilot_only" \}, 403\);/);
});
test('events and groups: capacity enforced under a row lock, free only, members cancel their own',()=>{
 const f=sql.slice(sql.indexOf('function public.singles_event_rsvp('));
 assert.match(f,/where id=p_event for update/);
 assert.match(f,/taken>=ev\.capacity then raise exception 'event_full'/);
 assert.match(f,/ev\.fee_krw>0 then raise exception 'event_fee_verification_not_configured'/);
 assert.match(social,/admin\.rpc\('singles_event_rsvp_cancel',\{p_user:userId,p_event:rsvpId\}\)/);
 const a=social.indexOf("if(p==='/admin/program'||");
 assert.match(social.slice(a,a+300),/role\?\.can_configure!==true\)return reply\(req,\{error:'owner_capability_required'\},403\)/);
 assert.match(social,/if\(v\.region!==undefined\)\{if\(typeof v\.region!=='string'\|\|\(v\.region&&!REGIONS\.includes\(v\.region\)\)\)/);
});
test('worker forwards only exact program/invite/rsvp-cancel routes and requires sign-in',async()=>{
 for(const [path,method,expect] of [['/singles/api/admin/program','GET',401],['/singles/api/admin/program/'+id,'PUT',401],['/singles/api/admin/program/'+id+'/rsvps','GET',401],
   ['/singles/api/bank/admin/invites','POST',401],['/singles/api/bank/admin/invites/'+id,'DELETE',401],['/singles/api/events/'+id+'/rsvp','DELETE',401],
   ['/singles/api/bank/admin/invites/x','DELETE',404],['/singles/api/admin/program/'+id,'DELETE',404]]){
  const r=await routeSinglesSurface(new Request('https://ekodi.kr'+path,{method,headers:{'content-type':'application/json'}}),live);
  assert.equal(r.status,expect,method+' '+path);
 }
 assert.match(worker,/sub\.startsWith\('\/api\/admin\/program'\)\?20480:4096/);
});
test('screens: friendly account names, pilot-only page, single operator gate, events and groups split, no overflow',()=>{
 assert.match(app,/function friendlyEmail\(email\)/);
 assert.equal(new Function(app.match(/function friendlyEmail\(email\)\{[^\n]+\}/)[0]+';return friendlyEmail')()('identity+kakao.3bedb7@ekodi.kr'),'카카오 로그인 계정');
 assert.match(app,/if\(state\.pilotOnly\)\{showPilotOnly\(h\);return\}/);
 assert.match(app,/if\(!await operatorGate\(h\)\)return;await showInvitesAdmin\(h\);await showProgramAdmin\(h\);/);
 assert.match(app,/await showEvents\(h,'group'\)/);
 assert.match(app,/특정 상대를 소개하거나 짝지어 주지 않습니다/);
 assert.match(css,/\.romantic-inner \.member-card p,\.romantic-inner \.mini-card p,\.romantic-inner \.invite-row span\{overflow-wrap:anywhere\}/);
});
