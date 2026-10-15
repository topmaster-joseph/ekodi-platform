import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { COOPERATIVES, cooperativeInitialState, cooperativePublicProjection } from '../cooperative-registry.js';
import { cooperativeGrantDecision, resolveCooperativeAccess } from '../cooperative-core-access.js';
import { normalizeCooperativeState, loadCooperativeProject, saveCooperativeProject } from '../cooperative-store.js';
import { routeCooperative, cooperativeRoute } from '../cooperative-control.js';
import { cooperativeCharter } from '../cooperative-charter.js';
import { sitePublicationAuthority } from '../site-publication-runtime.js';

import { fixture, authFetch } from './helpers/cooperative-fixture.mjs';

const req = (coop, path, token = '', method = 'GET', body = undefined, origin = 'https://ekodi.kr') => new Request(`https://ekodi.kr/${coop.slug}/api${path}`, {
  method, headers: { ...(token ? { authorization: 'Bearer ' + token } : {}), ...(body ? { origin, 'content-type': 'application/json' } : {}) }, body: body ? JSON.stringify(body) : undefined,
});
const [jubilee, open] = COOPERATIVES;

test('two new workspaces contain exactly the requested representatives and no assumed business, consent, capital or account records', () => {
  assert.deepEqual(cooperativeInitialState(jubilee).founders.map(f => f.representative), ['정찬균','박은희','최병천','정양기','조인식']);
  assert.deepEqual(cooperativeInitialState(open).founders.map(f => f.representative), ['임동섭','이상호','이남현1','이남현2','이남현3']);
  assert.notEqual(jubilee.workspaceId, open.workspaceId);
  for (const coop of COOPERATIVES) {
    const state = cooperativeInitialState(coop);
    assert.equal(state.profile.shareUnit, 10000);
    assert.equal(state.profile.status, 'formation');
    assert.equal(state.profile.officeConfirmed, false);
    assert.equal(new Set(state.founders.map(f => f.id)).size, 5);
    for (const founder of state.founders) assert.deepEqual([founder.business, founder.shares, founder.accountEmail, founder.consent], [null,null,null,'pending']);
  }
});

test('public projection includes only published public content and excludes roster, accounts, private office and contribution information', () => {
  const state = cooperativeInitialState(jubilee);
  state.founders[1].accountEmail = 'private@example.test';
  state.notices = [{ id:'one',title:'Public',body:'Visible',visibility:'public',status:'published' },{ id:'two',title:'Private',body:'Secret',visibility:'members',status:'published' },{ id:'three',title:'Draft',visibility:'public',status:'draft' }];
  const result = cooperativePublicProjection(jubilee, state);
  assert.equal(result.notices.length, 1);
  assert.equal(result.office, '');
  const raw = JSON.stringify(result);
  for (const forbidden of ['private@example.test','박은희','founders','accountEmail','firstYearBudget','Secret','Draft']) assert.equal(raw.includes(forbidden), false);
});

test('exact slug routing distinguishes local and explicit platform context and rejects lookalike namespaces', () => {
  assert.equal(cooperativeRoute('/jubilee-distribution/admin/').platformContext, false);
  assert.equal(cooperativeRoute('/admin/workspaces/cooperatives/jubilee-distribution').platformContext, true);
  assert.equal(cooperativeRoute('/jubilee-distribution-other'), null);
  assert.equal(cooperativeRoute('/open-distribution/members').coop.workspaceId, open.workspaceId);
});

test('grant evaluation separates member read, administration, expiry, revocation and explicit denied capabilities', () => {
  const member = { enabled:1,role:'member' };
  assert.equal(cooperativeGrantDecision({enabled:1,role:'staff'},{administrative:true}).allowed,false);
  assert.equal(cooperativeGrantDecision(member).allowed, true);
  assert.equal(cooperativeGrantDecision(member,{administrative:true}).allowed, false);
  assert.equal(cooperativeGrantDecision({enabled:0,role:'owner'}).allowed, false);
  assert.equal(cooperativeGrantDecision({enabled:1,role:'owner',expires_at:'2000-01-01'}).allowed, false);
  assert.equal(cooperativeGrantDecision({enabled:1,role:'admin',denied_capabilities_json:'["tenant.operations.manage","tenant.site.manage"]'},{administrative:true}).allowed, false);
});

test('source API denies unauthenticated requests and a member of the other cooperative; JWT user metadata never grants admin', async t => {
  const f = fixture();t.after(()=>f.sqlite.close());
  t.mock.method(globalThis,'fetch',authFetch({member:'member@example.test'}));
  f.grant(jubilee,'member@example.test');
  assert.equal((await routeCooperative(req(jubilee,'/me'),f.env)).status,401);
  assert.equal((await routeCooperative(req(open,'/me','member'),f.env)).status,403);
  assert.equal((await routeCooperative(req(jubilee,'/project','member'),f.env)).status,403);
  const response=await routeCooperative(req(jubilee,'/me','member'),f.env);
  assert.equal(response.status,200);
  const body=await response.json();assert.equal(body.authority.role,'member');assert.equal(body.authority.canAdmin,false);
  assert.equal(response.headers.get('cache-control'),'private, no-store');
});

test('platform admin without local grant cannot read the cooperative portal but can enter explicit platform control', async t => {
  const f=fixture();t.after(()=>f.sqlite.close());t.mock.method(globalThis,'fetch',authFetch({}));
  f.sqlite.prepare('INSERT INTO admins VALUES(1,?,?)').run('owner@example.test','super_admin');
  f.sqlite.prepare('INSERT INTO sessions VALUES(?,1,?,?)').run(crypto.createHash('sha256').update('admin-token').digest('hex'),'2099-01-01','2026-01-01');
  assert.equal((await resolveCooperativeAccess(req(jubilee,'/me','admin-token'),f.env,jubilee)).allowed,false);
  const response=await routeCooperative(new Request('https://ekodi.kr/api/control/cooperatives/jubilee-distribution/project',{headers:{authorization:'Bearer admin-token'}}),f.env);
  assert.equal(response.status,200);assert.equal((await response.json()).authority.scope,'platform');
});

test('disabled and expired cooperative grants stay denied at actual API boundary', async t => {
  const f=fixture();t.after(()=>f.sqlite.close());t.mock.method(globalThis,'fetch',authFetch({member:'member@example.test'}));
  for(const extra of [{enabled:0},{expiresAt:'2000-01-01'}]){
    f.grant(jubilee,'member@example.test','owner',extra);
    assert.equal((await routeCooperative(req(jubilee,'/me','member'),f.env)).status,403);
  }
});

test('publication uses the same active local capability and never falls back past an authoritative denial', async t => {
  const f=fixture();t.after(()=>f.sqlite.close());
  let legacyCalls=0;
  const identity=authFetch({admin:'admin@example.test'});
  t.mock.method(globalThis,'fetch',async(url,options)=>{
    if(String(url).includes('/functions/v1/access-api/')){
      legacyCalls++;
      return new Response(JSON.stringify({allowed:true,role:'tenant_admin'}));
    }
    return identity(url,options);
  });
  const env={...f.env,MY_SUPABASE_URL:'https://identity.example.test',MY_SUPABASE_PUBLISHABLE_KEY:'source-public-key'};
  const tenant=f.sqlite.prepare('SELECT id FROM customer_tenants WHERE slug=?').get(jubilee.slug);
  const site={id:jubilee.slug,tenantId:tenant.id,tenantSlug:jubilee.slug};
  for(const [role,extra] of [['owner',{enabled:0}],['owner',{expiresAt:'2000-01-01'}],['owner',{denied:['tenant.site.manage']}],['member',{}]]){
    f.grant(jubilee,'admin@example.test',role,extra);
    const result=await sitePublicationAuthority(req(jubilee,'/project','admin'),env,site);
    assert.equal(result.status,403);
  }
  f.grant(jubilee,'admin@example.test','owner');
  assert.equal((await sitePublicationAuthority(req(jubilee,'/project','admin'),env,site)).ok,true);
  const other=f.sqlite.prepare('SELECT id FROM customer_tenants WHERE slug=?').get(open.slug);
  assert.equal((await sitePublicationAuthority(req(open,'/project','admin'),env,{id:open.slug,tenantId:other.id,tenantSlug:open.slug})).status,403);
  assert.equal(legacyCalls,0);
});

test('a revoked historical account does not block unrelated preparation saves or regain access',async t=>{
  const f=fixture();t.after(()=>f.sqlite.close());
  t.mock.method(globalThis,'fetch',authFetch({admin:'admin@example.test',former:'former@example.test'}));
  f.grant(jubilee,'admin@example.test','owner');f.grant(jubilee,'former@example.test','member',{enabled:0});
  const project=await loadCooperativeProject(f.db,jubilee);project.state.founders[1].accountEmail='former@example.test';
  await saveCooperativeProject(f.db,jubilee,project.state,1,{identity:{id:'fixture'},scope:'tenant'});
  const response=await routeCooperative(req(jubilee,'/project','admin','PUT',{revision:2,state:{profile:{purpose:'계정 회수 후에도 설립 준비 계속'}}}),f.env);
  assert.equal(response.status,200);
  assert.equal((await routeCooperative(req(jubilee,'/me','former'),f.env)).status,403);
  const current=await loadCooperativeProject(f.db,jubilee);
  assert.equal(current.state.founders[1].accountEmail,'former@example.test');
  current.state.founders[2].accountEmail='former@example.test';current.state.founders[1].accountEmail=null;
  assert.equal((await routeCooperative(req(jubilee,'/project','admin','PUT',{revision:3,state:{founders:current.state.founders}}),f.env)).status,400);
});

test('same-origin versioned admin save persists across reads, stays isolated and records one scoped audit', async t => {
  const f=fixture();t.after(()=>f.sqlite.close());t.mock.method(globalThis,'fetch',authFetch({admin:'admin@example.test'}));f.grant(jubilee,'admin@example.test','owner');
  const original=await loadCooperativeProject(f.db,jubilee);
  const founders=structuredClone(original.state.founders);founders[1].business='박은희 사업체';
  const response=await routeCooperative(req(jubilee,'/project','admin','PUT',{revision:original.revision,state:{founders}}),f.env);
  assert.equal(response.status,200);assert.equal((await response.json()).revision,2);
  assert.equal((await loadCooperativeProject(f.db,jubilee)).state.founders[1].business,'박은희 사업체');
  assert.equal((await loadCooperativeProject(f.db,open)).state.founders[1].business,null);
  assert.equal(f.sqlite.prepare('SELECT COUNT(*) AS n FROM cooperative_audit WHERE workspace_id=?').get(jubilee.workspaceId).n,1);
  const conflict=await routeCooperative(req(jubilee,'/project','admin','PUT',{revision:1,state:{profile:{chair:'stale'}}}),f.env);
  assert.equal(conflict.status,409);
  assert.equal(f.sqlite.prepare('SELECT COUNT(*) AS n FROM cooperative_audit').get().n,1);
});

test('mutation rejects foreign origin, forged workspace identity, founder ID reassignment and unregistered account linkage', async t => {
  const f=fixture();t.after(()=>f.sqlite.close());t.mock.method(globalThis,'fetch',authFetch({admin:'admin@example.test'}));f.grant(jubilee,'admin@example.test','owner');
  const body={revision:1,state:{profile:{chair:'valid'}}};
  assert.equal((await routeCooperative(req(jubilee,'/project','admin','PUT',body,'https://evil.test'),f.env)).status,403);
  assert.equal((await routeCooperative(req(jubilee,'/project','admin','PUT',{...body,workspaceId:open.workspaceId}),f.env)).status,400);
  assert.throws(()=>normalizeCooperativeState({workspaceId:open.workspaceId},jubilee));
  const founders=cooperativeInitialState(jubilee).founders;founders[0].accountEmail='unregistered@example.test';
  assert.equal((await routeCooperative(req(jubilee,'/project','admin','PUT',{revision:1,state:{founders}}),f.env)).status,400);
  founders[0].id=open.workspaceId+':founder:1';
  assert.throws(()=>normalizeCooperativeState({founders},jubilee));
  assert.equal((await loadCooperativeProject(f.db,jubilee)).revision,1);
});

test('validated business self-edit changes only the linked person in the correct cooperative', async t => {
  const f=fixture();t.after(()=>f.sqlite.close());t.mock.method(globalThis,'fetch',authFetch({member:'member@example.test'}));f.grant(jubilee,'member@example.test');
  const project=await loadCooperativeProject(f.db,jubilee);project.state.founders[1].accountEmail='member@example.test';
  await saveCooperativeProject(f.db,jubilee,project.state,1,{identity:{id:'fixture'},scope:'tenant'});
  const response=await routeCooperative(req(jubilee,'/my-business','member','PUT',{business:'나의 사업체',industry:'농산물 도소매',revision:2}),f.env);
  assert.equal(response.status,200);
  const body=await response.json();assert.equal(body.me.founder.business,'나의 사업체');
  assert.equal(body.founders.some(row=>'accountEmail' in row),false);
  assert.equal((await routeCooperative(req(jubilee,'/my-business','member','PUT',{business:'bad',role:'owner',revision:3}),f.env)).status,400);
  assert.equal((await loadCooperativeProject(f.db,open)).revision,1);
});

test('participation application captures consent and identity without granting membership or crossing workspaces', async t => {
  const f=fixture();t.after(()=>f.sqlite.close());t.mock.method(globalThis,'fetch',authFetch({applicant:'applicant@example.test'}));
  const response=await routeCooperative(req(open,'/application','applicant','POST',{representative:'참여자',business:'',message:'온라인 판매 참여',consent:true}),f.env);
  assert.equal(response.status,202);assert.equal((await response.json()).grantsCreated,false);
  assert.equal(f.sqlite.prepare('SELECT COUNT(*) AS n FROM customer_access_grants').get().n,0);
  assert.equal((await routeCooperative(req(open,'/me','applicant'),f.env)).status,403);
  assert.equal((await (await routeCooperative(req(jubilee,'/application','applicant'),f.env)).json()).application,null);
});

test('charter drafts update the correct name, individual founders and modern nonmember sales clause without claiming signatures', () => {
  for(const coop of COOPERATIVES){
    const charter=cooperativeCharter(coop,cooperativeInitialState(coop));
    assert.ok(charter.includes(coop.legalName));assert.ok(charter.includes('검토용'));assert.ok(charter.includes('서명·날인 전'));
    assert.ok(charter.includes('제73조'));
    assert.ok(charter.includes('조합원이 아닌 자에게 농수산물 유통'));
    for(const name of coop.representatives)assert.ok(charter.includes(`발기인 ${name}`));
    assert.equal(charter.includes('발기인    박 애 순'),false);
  }
});

test('input validates legal names, real calendar dates and the 30 percent capital limit', () => {
  assert.throws(()=>normalizeCooperativeState({profile:{legalName:'단순조합'}},jubilee));
  assert.throws(()=>normalizeCooperativeState({dates:{filingDate:'2026-02-30'}},jubilee));
  assert.throws(()=>normalizeCooperativeState({dates:{filingDate:'2026-99-99'}},jubilee));
  const founders=cooperativeInitialState(jubilee).founders;founders.forEach(f=>{f.shares=1;});founders[0].shares=100;
  assert.throws(()=>normalizeCooperativeState({founders},jubilee));
});

test('all six page entries serve individual branding and private skeletons contain no roster data', async () => {
  for(const coop of COOPERATIVES)for(const suffix of ['/', '/members', '/admin']){
    const response=await routeCooperative(new Request('https://ekodi.kr/'+coop.slug+suffix),{});
    assert.equal(response.status,200);assert.ok((await response.text()).includes(coop.name));
    if(suffix!=='/')assert.equal(response.headers.get('x-robots-tag'),'noindex, nofollow, noarchive');
  }
});


test('canonical cooperative roots use a method-preserving trailing-slash redirect with functional queries intact', async () => {
  for(const method of ['GET','HEAD','POST']){
    const response=await routeCooperative(new Request('https://ekodi.kr/jubilee-distribution?campaign=source',{method}),{});
    assert.equal(response.status,308);assert.equal(response.headers.get('location'),'https://ekodi.kr/jubilee-distribution/?campaign=source');
  }
});

test('charter reflects edited purpose, industries, business scope and jurisdiction',()=>{
  const state=cooperativeInitialState(jubilee);Object.assign(state.profile,{purpose:'검토 목적',industries:'검토 업종',businesses:'검토 사업',jurisdiction:'전라남도'});
  const text=cooperativeCharter(jubilee,state);
  for(const value of ['검토 목적','검토 업종','검토 사업','전라남도'])assert.ok(text.includes(value),value);
});
