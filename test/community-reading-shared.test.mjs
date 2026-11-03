import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {
  readingAccess, readingMemberDecision, readingVisible, readingInput, readingDate,
} from '../supabase/functions/community-api/reading-policy.js';

const root=new URL('../',import.meta.url);
const read=file=>readFileSync(new URL(file,root),'utf8');
const uuid='11111111-1111-4111-8111-111111111111';
const other='22222222-2222-4222-8222-222222222222';
const circle={id:uuid,workspace_tenant_id:null,status:'active',owner_user_id:uuid};
const member={circle_id:uuid,user_id:uuid,role:'owner',status:'active'};

test('active owner/leader rights need matching identity, record and workspace',()=>{
  assert.deepEqual(readingAccess(circle,member,{tenantId:null},uuid),{allowed:true,manager:true,error:null,status:200});
  assert.equal(readingAccess(circle,{...member,role:'member'},{},uuid).manager,false);
  assert.equal(readingAccess(circle,{...member,role:'leader'},{},uuid).manager,true);
  assert.equal(readingAccess(circle,member,{},other).allowed,false);
  assert.equal(readingAccess(circle,{...member,status:'pending'},{},uuid).allowed,false);
  assert.equal(readingAccess(circle,{...member,status:'blocked'},{},uuid).allowed,false);
  assert.equal(readingAccess({...circle,status:'paused'},member,{},uuid).status,404);
  const tenantCircle={...circle,workspace_tenant_id:other};
  assert.equal(readingAccess(tenantCircle,member,{tenantId:null,member:true},uuid).status,404);
  assert.equal(readingAccess(tenantCircle,member,{tenantId:other,member:false},uuid).status,403);
  assert.equal(readingAccess(tenantCircle,member,{tenantId:other,member:true},uuid).allowed,true);
});

test('approval requires active Circle manager, pending ordinary member and capacity',()=>{
  const manager=readingAccess(circle,member,{},uuid);
  assert.equal(readingMemberDecision(manager,{role:'member',status:'pending'},'approve',2,3),null);
  assert.equal(readingMemberDecision(manager,{role:'member',status:'pending'},'approve',3,3),'circle_full');
  assert.equal(readingMemberDecision(manager,{role:'member',status:'pending'},'decline',3,3),null);
  assert.equal(readingMemberDecision(manager,{role:'owner',status:'pending'},'approve',0,5),'not_pending');
  assert.equal(readingMemberDecision(manager,{role:'member',status:'blocked'},'approve',0,5),'not_pending');
  assert.equal(readingMemberDecision({...manager,manager:false},{role:'member',status:'pending'},'approve',0,5),'manager_required');
});

test('private notes are not visible to fellow members or leader; sharing is affirmative',()=>{
  const privateEntry={author_user_id:uuid,scope:'private',deleted_at:null};
  assert.equal(readingVisible(privateEntry,uuid),true);
  assert.equal(readingVisible(privateEntry,other),false);
  assert.equal(readingVisible({...privateEntry,scope:'circle'},other),true);
  assert.equal(readingVisible({...privateEntry,scope:'circle',deleted_at:new Date().toISOString()},other),false);
  assert.equal(readingInput({kind:'question',scope:'circle',content:'생각은 무엇인가?'}).error,'explicit_share_required');
  assert.equal(readingInput({kind:'question',scope:'circle',content:'생각은 무엇인가?',share_to_circle:true}).scope,'circle');
  assert.equal(readingInput({kind:'reply',scope:'private',content:'답글',parent_id:uuid}).kind,'reply');
  assert.equal(readingInput({kind:'reply',scope:'circle',content:'그룹 답글',parent_id:uuid}).error,'explicit_share_required');
  assert.equal(readingInput({kind:'reply',scope:'circle',content:'그룹 답글',parent_id:uuid,share_to_circle:true}).kind,'reply');
  assert.equal(readingInput({kind:'reply',scope:'private',content:'답글'}).error,'reply_requires_parent');
  assert.equal(readingInput({kind:'reflection',scope:'private',content:' '}).error,'content_length');
  assert.equal(readingInput({kind:'reflection',scope:'private',content:'a'.repeat(2501)}).error,'content_length');
  assert.equal(readingDate('bad'),undefined);
  assert.equal(readingDate(''),null);
});

test('schema enforces server-only RLS, nested tenant/circle keys and atomic member review',()=>{
  const sql=read('supabase/migrations/20261103142625_community_reading_shared_workspace.sql');
  for(const table of ['community_reading_meetings','community_reading_entries','community_reading_attendance','community_reading_audit']){
    assert.ok(sql.includes('public.'+table));
    assert.ok(sql.includes('enable row level security'));
  }
  assert.ok(sql.includes('revoke all on table public.community_reading_entries from public,anon,authenticated'));
  assert.ok(sql.includes('security invoker'));
  assert.ok(sql.includes('for update'));
  assert.ok(sql.includes('on delete cascade'));
  assert.ok(sql.includes('reading_entry_meeting_fk'));
  assert.ok(sql.includes('reading_entry_parent_fk'));
  assert.ok(sql.includes('reading_attendance_meeting_fk'));
  assert.ok(sql.includes('tenant_members'));
  assert.ok(sql.includes('grant execute on function public.community_reading_review_member'));
  assert.ok(!/drop\s+table|truncate\s+table/i.test(sql));
  const fixture=read('scripts/sql/community-reading-dev-core-fixture.sql');
  assert.ok(fixture.includes('Development-only'));
  assert.equal(sql.includes('community_reading_dev_core'),false);
});

test('API authorizes each reading request and renders the workspace without injecting user HTML',()=>{
  const index=read('supabase/functions/community-api/index.ts');
  const api=read('supabase/functions/community-api/reading.ts');
  const html=read('community/reading/index.html');
  const app=read('community/reading/app.js');
  assert.ok(index.includes('handleReading(req, path'));
  assert.ok(api.includes('readingAccess(circle, membership, workspace, userId)'));
  assert.ok(api.includes("eq('circle_id', circleId)"));
  assert.ok(api.includes("eq('author_user_id', userId)"));
  assert.ok(api.includes("scope.eq.circle,author_user_id.eq."));
  assert.ok(api.includes("community_reading_review_member"));
  assert.ok(api.includes("read_reply")===false);
  assert.ok(html.includes('id="sharedWorkspace"'));
  assert.ok(html.includes('name="share_to_circle"'));
  assert.ok(app.includes("document.createElement('article')"));
  assert.ok(app.includes('entry.content'));
  assert.ok(!app.includes('innerHTML'));
  assert.ok(app.includes('window.confirm'));
  assert.ok(read('community/app.js').includes('/community/reading/?'));
  const workflow=read('.github/workflows/deploy-community-api.yml');
  assert.ok(workflow.includes('community-api'));
});
