import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import { COOPERATIVES, cooperativeInitialState, cooperativePublicProjection } from '../cooperative-registry.js';
import { cooperativeGrantDecision, resolveCooperativeAccess } from '../cooperative-core-access.js';
import { normalizeCooperativeState, loadCooperativeProject, saveCooperativeProject } from '../cooperative-store.js';
import { routeCooperative, cooperativeRoute } from '../cooperative-control.js';
import { cooperativeCharter } from '../cooperative-charter.js';
import { sitePublicationAuthority, resolvePublicationSiteForRequest, sitePublicationGuard } from '../site-publication-runtime.js';
import sharedSiteWorker from '../platform-router-entry-worker.js';
import { COOPERATIVE_IMAGE_PATHS } from '../cooperative-media.js';

import { cooperativeLocatorAvailability } from '../cooperative-locator.js';
import { fixture, authFetch } from './helpers/cooperative-fixture.mjs';

const req = (coop, path, token = '', method = 'GET', body = undefined, origin = 'https://ekodi.kr') => new Request(`https://ekodi.kr/${coop.slug}/api${path}`, {
  method, headers: { ...(token ? { authorization: 'Bearer ' + token } : {}), ...(body ? { origin, 'content-type': 'application/json' } : {}) }, body: body ? JSON.stringify(body) : undefined,
});
const [jubilee, open] = COOPERATIVES;

test('public photos preserve binary bytes and HEAD semantics and fail closed on missing assets',async()=>{
  const calls=[];
  const env={ASSETS:{async fetch(request){
    const pathname=new URL(request.url).pathname;calls.push(pathname);
    for(const name of ['if-match','if-none-match','if-modified-since','if-unmodified-since','if-range','range'])assert.equal(request.headers.has(name),false,name);
    const file=new URL('../sites/business-cooperative/public'+pathname.slice('/business-coop'.length),import.meta.url);
    return new Response(fs.readFileSync(file),{headers:{'content-type':'image/webp'}});
  }}};
  for(const path of COOPERATIVE_IMAGE_PATHS){
    const expected=fs.readFileSync(new URL('../sites/business-cooperative/public'+path.slice('/business-coop'.length),import.meta.url));
    for(const method of ['GET','HEAD']){
      const response=await sharedSiteWorker.fetch(new Request('https://ekodi.kr'+path,{method,headers:{'if-match':'old','if-none-match':'cached','if-modified-since':'Wed, 14 Oct 2026 00:00:00 GMT','if-unmodified-since':'Wed, 14 Oct 2026 00:00:00 GMT','if-range':'old','range':'bytes=0-10'}}),env,{});
      assert.equal(response.status,200);assert.equal(response.headers.get('content-type'),'image/webp');
      assert.equal(response.headers.get('cache-control'),'public, max-age=31536000, immutable');
      assert.equal(response.headers.get('x-content-type-options'),'nosniff');
      assert.deepEqual(Buffer.from(await response.arrayBuffer()),method==='HEAD'?Buffer.alloc(0):expected);
    }
  }
  const path=[...COOPERATIVE_IMAGE_PATHS][0],url='https://ekodi.kr'+path;
  const before=calls.length;
  assert.equal((await routeCooperative(new Request(url,{method:'POST'}),env)).status,405);
  assert.equal((await routeCooperative(new Request('https://ekodi.kr/business-coop/images/unknown.webp'),env)).status,404);
  assert.equal(calls.length,before);
  assert.equal((await routeCooperative(new Request(url),{})).status,503);
  for(const asset of [new Response('missing',{status:404}),new Response('<html>fallback</html>',{headers:{'content-type':'text/html'}})]){
    const response=await routeCooperative(new Request(url),{ASSETS:{fetch:async()=>asset}});
    assert.equal(response.status,404);assert.equal(response.headers.get('cache-control'),'private, no-store');
  }
});

test('cooperative hub pages and generated assets reach the Worker within its routing budget',()=>{
  const config=fs.readFileSync(new URL('../wrangler.site.toml',import.meta.url),'utf8');
  const patterns=JSON.parse(config.match(/run_worker_first\s*=\s*(\[[^\]]*\])/s)[1]);
  const matches=(pattern,path)=>new RegExp('^'+pattern.split('*').map(part=>part.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')).join('.*')+'$').test(path);
  const workerFirst=path=>patterns.some(pattern=>!pattern.startsWith('!')&&matches(pattern,path))&&!patterns.some(pattern=>pattern.startsWith('!')&&matches(pattern.slice(1),path));
  assert.ok(patterns.length<=100,'Cloudflare Worker-first pattern limit');
  for(const path of ['/business-coop','/business-coop/','/business-coop/admin/','/business-coop/assets/app.css','/business-coop/assets/app.js','/business-coop/drafts/','/admin-menu-layout.js','/admin-menu-registry.js','/admin-menu-runtime.js'])assert.equal(workerFirst(path),true,path);
  assert.equal(workerFirst('/admin/unrelated.css'),false,'ordinary static admin modules stay asset-first');
});

test('cooperative release probes match final Shared Site headers and keep every page non-storable',async t=>{
  const f=fixture();t.after(()=>f.sqlite.close());
  const manifest=JSON.parse(fs.readFileSync(new URL('../deploy/manifests/shared-site.worker.json',import.meta.url),'utf8'));
  const paths=COOPERATIVES.flatMap(coop=>['/','/members','/admin'].map(suffix=>'/'+coop.publicSlug+suffix));
  paths.push('/business-coop/','/business-coop/admin/','/admin/workspaces/cooperatives','/business-coop/assets/app.css','/business-coop/assets/app.js');
  for(const path of paths){
    const url='https://ekodi.kr'+path;
    const probe=manifest.worker.requests.find(probe=>probe.url===url);
    assert.ok(probe,'guarded release probe exists for '+path);
    const response=await sharedSiteWorker.fetch(new Request(url),f.env,{});
    assert.equal(response.status,200,path);
    assert.ok(response.headers.get('cache-control').split(',').map(value=>value.trim()).includes('no-store'),path);
    const finalHeaders=[...response.headers].map(([key,value])=>key+': '+value).join('\n').toLowerCase();
    for(const marker of probe.headerExpect||[])assert.ok(finalHeaders.includes(marker.toLowerCase()),path+': '+marker);
    if(response.headers.get('content-type').includes('text/html')&&(path.includes('/admin')||path.includes('business-coop')))assert.match(response.headers.get('x-robots-tag'),/noindex/,path);
    await response.body?.cancel();
  }
});

test('Worker-first hub preserves archived drafts and original modules instead of delegating them to SPACE',async()=>{
  const files={'/business-coop/drafts/':'drafts/index.html','/business-coop/drafts/index.html':'drafts/index.html','/business-coop/app.css':'app.css','/business-coop/legal-data.js':'legal-data.js','/business-coop/admin/admin.js':'admin/admin.js'};
  const calls=[];
  const env={SPACE:{fetch(){throw new Error('Retained drafts must never enter SPACE');}},ASSETS:{async fetch(request){
    const path=new URL(request.url).pathname;calls.push(path);const file=files[path];assert.ok(file,path);
    const type=file.endsWith('.html')?'text/html':file.endsWith('.css')?'text/css':'text/javascript';
    return new Response(fs.readFileSync(new URL('../sites/business-cooperative/public/'+file,import.meta.url),'utf8'),{headers:{'content-type':type+'; charset=utf-8'}});
  }}};
  for(const [path,file] of Object.entries(files)){
    const response=await sharedSiteWorker.fetch(new Request('https://ekodi.kr'+path),env,{});
    assert.equal(response.status,200,path);assert.equal(response.headers.get('cache-control'),'no-store',path);assert.match(response.headers.get('x-robots-tag'),/noindex/,path);
    assert.equal(await response.text(),fs.readFileSync(new URL('../sites/business-cooperative/public/'+file,import.meta.url),'utf8'),path);
  }
  assert.deepEqual(calls,Object.keys(files));
  assert.equal((await sharedSiteWorker.fetch(new Request('https://ekodi.kr/business-coop/unknown'),env,{})).status,404);
  assert.equal((await sharedSiteWorker.fetch(new Request('https://ekodi.kr/business-coop/drafts/',{method:'POST'}),env,{})).status,405);
  assert.equal(calls.length,Object.keys(files).length,'unknown paths and mutations never reach assets');
});

test('operations hub lists only locally manageable workspaces and separates explicit platform authority', async t => {
  const f=fixture();t.after(()=>f.sqlite.close());t.mock.method(globalThis,'fetch',authFetch({owner:'owner@example.test',member:'member@example.test'}));
  f.grant(jubilee,'owner@example.test','owner');f.grant(open,'owner@example.test','member');f.grant(jubilee,'member@example.test','member');
  const hub=token=>new Request('https://ekodi.kr/api/cooperatives/overview',{headers:token?{authorization:'Bearer '+token}:{}});
  assert.equal((await routeCooperative(hub(),f.env)).status,401);
  assert.equal((await routeCooperative(hub('member'),f.env)).status,403);
  const response=await routeCooperative(hub('owner'),f.env);assert.equal(response.status,200);
  const body=await response.json();assert.deepEqual(body.cooperatives.map(c=>c.workspaceId),[jubilee.workspaceId]);
  assert.equal(body.cooperatives[0].name,'희년세상협동조합');assert.equal(JSON.stringify(body).includes('accountEmail'),false);
  f.grant(jubilee,'owner@example.test','owner',{denied:['tenant.site.manage']});assert.equal((await routeCooperative(hub('owner'),f.env)).status,403);
  f.sqlite.prepare('INSERT INTO admins(id,email,role) VALUES(1,?,?)').run('platform@example.test','super_admin');
  f.sqlite.prepare('INSERT INTO sessions(token_hash,admin_id,expires_at,created_at) VALUES(?,1,?,?)').run(crypto.createHash('sha256').update('platform-token').digest('hex'),'2099-01-01','2026-01-01');
  assert.equal((await routeCooperative(hub('platform-token'),f.env)).status,403);
  const platform=await routeCooperative(new Request('https://ekodi.kr/api/control/cooperatives/overview',{headers:{authorization:'Bearer platform-token'}}),f.env);
  assert.equal(platform.status,200);assert.equal((await platform.json()).cooperatives.length,2);
});

test('renaming preserves existing cooperative data, identity and the other cooperative and is idempotent',async t=>{
  const f=fixture();t.after(()=>f.sqlite.close());
  const before=await loadCooperativeProject(f.db,jubilee);before.state.profile.name='희년세상유통조합';before.state.profile.legalName='희년세상유통협동조합';before.state.founders[1].business='보존할 기존 사업체';
  f.sqlite.prepare('UPDATE cooperative_projects SET snapshot_json=? WHERE workspace_id=?').run(JSON.stringify(before.state),jubilee.workspaceId);
  const other=await loadCooperativeProject(f.db,open);
  const sql=fs.readFileSync(new URL('../migrations/0134_cooperative_jubilee_name.sql',import.meta.url),'utf8');f.sqlite.exec(sql);
  const after=await loadCooperativeProject(f.db,jubilee);
  assert.equal(after.state.profile.name,'희년세상협동조합');assert.equal(after.state.profile.legalName,'희년세상협동조합');assert.equal(after.state.founders[1].business,'보존할 기존 사업체');assert.equal(after.revision,before.revision+1);
  assert.deepEqual(await loadCooperativeProject(f.db,open),other);
  f.sqlite.exec(sql);assert.equal((await loadCooperativeProject(f.db,jubilee)).revision,after.revision);
  assert.equal(f.sqlite.prepare("SELECT COUNT(*) AS n FROM cooperative_audit WHERE action='profile.rename'").get().n,1);
});

test('former preparation entries are private operations hubs with access to retained browser drafts',async()=>{
  for(const path of ['/business-coop/','/business-coop/admin/','/admin/workspaces/cooperatives']){
    const response=await routeCooperative(new Request('https://ekodi.kr'+path),{});
    const html=await response.text();assert.equal(response.status,200);assert.ok(html.includes('협동조합 운영관리자 공간'));assert.ok(html.includes('/business-coop/drafts/'));assert.ok(html.includes('data-coop-surface="hub"'));assert.equal(html.includes('박은희'),false);assert.match(response.headers.get('x-robots-tag'),/noindex/);
  }
});

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
  const unavailable={...env,DB:{prepare(){throw new Error('source DB unavailable')}}};
  assert.equal((await sitePublicationAuthority(req(jubilee,'/project','admin'),unavailable,{id:jubilee.slug,canonicalPath:'/jubilee-distribution'})).status,403);
  assert.equal(legacyCalls,0);
  assert.equal((await sitePublicationAuthority(req(jubilee,'/project','admin'),env,{id:'legacy-source',canonicalPath:'/legacy-source',tenantSlug:'legacy-source'})).ok,true);
  assert.equal(legacyCalls,1);
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

test('all six page entries serve individual branding and private skeletons contain no roster data', async t => {
  const f=fixture();t.after(()=>f.sqlite.close());
  for(const coop of COOPERATIVES)for(const suffix of ['/', '/members', '/admin']){
    const response=await routeCooperative(new Request('https://ekodi.kr/'+coop.publicSlug+suffix),f.env);
    assert.equal(response.status,200);assert.ok((await response.text()).includes(coop.name));
    if(suffix!=='/')assert.equal(response.headers.get('x-robots-tag'),'noindex, nofollow, noarchive');
  }
});


test('short roots and all old human links canonicalize with queries and HEAD intact; APIs keep their request bodies', async t => {
  const f=fixture();t.after(()=>f.sqlite.close());
  t.mock.method(globalThis,'fetch',authFetch({admin:'admin@example.test'}));f.grant(jubilee,'admin@example.test','owner');
  for(const coop of COOPERATIVES){
    for(const method of ['GET','HEAD'])for(const suffix of ['', '/', '/members', '/members/', '/admin', '/admin/']){
      const response=await routeCooperative(new Request('https://ekodi.kr/'+coop.slug+suffix+'?campaign=source',{method}),f.env);
      assert.equal(response.status,308);assert.equal(response.headers.get('location'),'https://ekodi.kr/'+coop.publicSlug+(suffix.replace(/\/$/,'')||'/')+'?campaign=source');
      assert.equal(await response.text(),'');
    }
    for(const method of ['GET','HEAD','POST']){
      const response=await routeCooperative(new Request('https://ekodi.kr/'+coop.publicSlug+'?campaign=source',{method}),f.env);
      assert.equal(response.status,308);assert.equal(response.headers.get('location'),'https://ekodi.kr/'+coop.publicSlug+'/?campaign=source');
    }
    const old=await (await routeCooperative(req(coop,'/public'),f.env)).json();
    const short=await (await routeCooperative(new Request('https://ekodi.kr/'+coop.publicSlug+'/api/public'),f.env)).json();
    assert.deepEqual(short,old);assert.equal(short.workspaceId,coop.workspaceId);
    const platform=await routeCooperative(new Request('https://ekodi.kr/admin/workspaces/cooperatives/'+coop.slug),f.env);
    assert.equal(platform.status,200);assert.equal(platform.headers.has('location'),false);
    assert.match(await platform.text(),/data-coop-platform="true"/);
  }
  // Existing PUT integrations are never redirected or assigned a new identity.
  assert.equal((await routeCooperative(req(jubilee,'/project','admin','PUT',{revision:1,state:{profile:{purpose:'기존 주소 저장'}}}),f.env)).status,200);
  const read=await routeCooperative(new Request('https://ekodi.kr/jubilee/api/project',{headers:{authorization:'Bearer admin'}}),f.env);
  const current=await read.json();assert.equal(current.workspaceId,jubilee.workspaceId);assert.equal(current.revision,2);assert.equal(current.state.profile.purpose,'기존 주소 저장');
  assert.equal((await loadCooperativeProject(f.db,open)).revision,1);
});

test('charter reflects edited purpose, industries, business scope and jurisdiction',()=>{
  const state=cooperativeInitialState(jubilee);Object.assign(state.profile,{purpose:'검토 목적',industries:'검토 업종',businesses:'검토 사업',jurisdiction:'전라남도'});
  const text=cooperativeCharter(jubilee,state);
  for(const value of ['검토 목적','검토 업종','검토 사업','전라남도'])assert.ok(text.includes(value),value);
});

test('short locators reject private, inactive, domain and SPACE alias occupants and fail closed on unavailable reads',async t=>{
  const f=fixture();t.after(()=>f.sqlite.close());
  for(const coop of COOPERATIVES){
    assert.equal((await cooperativeLocatorAvailability(f.env,coop)).ok,true);
    for(const status of ['active','inactive','paused']){
      f.sqlite.prepare('INSERT INTO customer_tenants(slug,name,domain,status) VALUES(?,?,?,?)').run(coop.publicSlug,'다른 공간','elsewhere.test',status);
      assert.equal((await cooperativeLocatorAvailability(f.env,coop)).code,'COOP_LOCATOR_CONFLICT');
      assert.equal((await routeCooperative(new Request('https://ekodi.kr/'+coop.publicSlug+'/'),f.env)).status,503);
      f.sqlite.prepare('DELETE FROM customer_tenants WHERE slug=?').run(coop.publicSlug);
    }
    f.sqlite.prepare('INSERT INTO customer_tenants(slug,domain,status) VALUES(?,?,?)').run('other','https://EKODI.KR/'+coop.publicSlug+'/nested/','inactive');
    assert.equal((await cooperativeLocatorAvailability(f.env,coop)).ok,false);
    f.sqlite.prepare('DELETE FROM customer_tenants WHERE slug=?').run('other');
    f.sqlite.prepare('INSERT INTO public_site_controls(site_id,workspace_id,domain,public_status) VALUES(?,?,?,?)').run('other','different-uuid','ekodi.kr/'+coop.publicSlug+'/','private');
    assert.equal((await cooperativeLocatorAvailability(f.env,coop)).ok,false);
    f.sqlite.prepare('DELETE FROM public_site_controls WHERE site_id=?').run('other');
  }
  // A longer first segment is distinct from /open.
  f.sqlite.prepare('INSERT INTO customer_tenants(slug,domain,status) VALUES(?,?,?)').run('openai-customer','ekodi.kr/openai-customer','inactive');
  assert.equal((await cooperativeLocatorAvailability(f.env,open)).ok,true);
  const env={...f.env,ENVIRONMENT:'production',SUPABASE_URL:'https://source.invalid',SUPABASE_PUBLISHABLE_KEY:'public-source-key'};
  for(const [payload,code] of [[null,undefined],[{canonical_slug:'other',status:'paused',aliases:['open']},'COOP_LOCATOR_CONFLICT'],[[],'COOP_LOCATOR_UNAVAILABLE'],['invalid','COOP_LOCATOR_UNAVAILABLE']]){
    const mock=t.mock.method(globalThis,'fetch',async(url,options)=>{
      assert.equal(url,'https://source.invalid/rest/v1/rpc/store_user_site_public_profile');assert.equal(JSON.parse(options.body).p_slug,'open');
      return Response.json(payload);
    });
    const result=await cooperativeLocatorAvailability(env,open);assert.equal(result.code,code);assert.equal(result.ok,code===undefined);mock.mock.restore();
  }
  const bad=t.mock.method(globalThis,'fetch',async()=>new Response('unavailable',{status:503}));
  assert.equal((await cooperativeLocatorAvailability(env,open)).ok,false);bad.mock.restore();
  assert.equal((await cooperativeLocatorAvailability({ENVIRONMENT:'production',...f.env},open)).ok,false);
  assert.equal((await cooperativeLocatorAvailability({DB:{prepare(){throw new Error('offline')}}},open)).ok,false);
});

test('short and legacy URLs retain exactly the same private publication state and immutable authority',async t=>{
  const f=fixture();t.after(()=>f.sqlite.close());
  for(const coop of COOPERATIVES){
    f.sqlite.prepare('UPDATE public_site_controls SET public_status=? WHERE site_id=?').run('private',coop.slug);
    for(const locator of [coop.publicSlug,coop.slug]){
      const request=new Request('https://ekodi.kr/'+locator+'/');
      const site=await resolvePublicationSiteForRequest(request,f.env);
      assert.equal(site.id,coop.slug);
      if(locator===coop.publicSlug)assert.equal(site.workspaceId,coop.workspaceId);
      const response=await sitePublicationGuard(request,f.env);assert.equal(response.status,404);assert.equal(response.headers.get('x-ekodi-site-publication'),'private');
      assert.equal(await sitePublicationGuard(new Request('https://ekodi.kr/'+locator+'/admin'),f.env),null);
    }
  }
});

test('broader Worker-first short prefixes preserve existing OpenAI admin modules as static files',async()=>{
  for(const path of ['/openai-workspace-admin.js','/openai-workspace-admin.css']){
    assert.equal(cooperativeRoute(path),null);
    const response=await sharedSiteWorker.fetch(new Request('https://ekodi.kr'+path),{ASSETS:{fetch:async()=>new Response('existing module',{headers:{'content-type':path.endsWith('.js')?'text/javascript':'text/css'}})}},{});
    assert.equal(response.status,200);assert.equal(await response.text(),'existing module');
  }
});

test('an intermittent locator failure never bypasses private publication and one request shares exactly one decision',async t=>{
  const f=fixture();t.after(()=>f.sqlite.close());
  const env={...f.env,ENVIRONMENT:'production',SUPABASE_URL:'https://source.invalid',SUPABASE_PUBLISHABLE_KEY:'public-source-key'};
  f.sqlite.prepare('UPDATE public_site_controls SET public_status=? WHERE site_id=?').run('private',open.slug);
  let calls=0;t.mock.method(globalThis,'fetch',async()=>++calls===1?new Response('unavailable',{status:503}):Response.json(null));
  const failed=await sharedSiteWorker.fetch(new Request('https://ekodi.kr/open/'),env,{});
  assert.equal(failed.status,503);assert.equal(calls,1);assert.equal((await failed.json()).code,'COOP_LOCATOR_UNAVAILABLE');
  const recovered=await sharedSiteWorker.fetch(new Request('https://ekodi.kr/open/'),env,{});
  assert.equal(recovered.status,404);assert.equal(recovered.headers.get('x-ekodi-site-publication'),'private');assert.equal(calls,2);
  f.sqlite.prepare('UPDATE public_site_controls SET public_status=? WHERE site_id=?').run('public',open.slug);
  const published=await sharedSiteWorker.fetch(new Request('https://ekodi.kr/open/'),env,{});
  assert.equal(published.status,200);assert.equal(calls,3);assert.match(await published.text(),/열린유통협동조합/);
});
