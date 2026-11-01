import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { isWorkspaceAdminPathShape } from '../workspace-route-policy.js';
import { workspaceAdminCanAccess, workspaceAdminScript } from '../workspace-admin-page.js';
import { tenantRoleCanManageAccess } from '../tenant-access-authority.js';
import { signRequestText, DEFAULT_ROLES } from '../cgma-edoc-admin.js';

const read = path => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

test('전자문서 menu lives in the CGMA admin shell at /cgma/admin/edocs', async () => {
  assert.equal(isWorkspaceAdminPathShape('/cgma/admin/edocs'), true);
  const script = await (await workspaceAdminScript()).text();
  assert.match(script, /\['edocs','전자문서 · 서명'\]/);
  assert.match(script, /dedicated\.add\('edocs'\)/);
  assert.match(script, /workspace==='cgma'&&section==='edocs'\)return cgmaEdocAdmin\(\)/);
  assert.match(script, /edocs:POLICY\.capabilities\.access/);
  assert.match(script, /\/cgma\/admin\/assets\/cgma-edoc-admin\.js/);
  assert.match(script, /mountCgmaEdocAdmin\(\{root:\$\('mainPanel'\),summaryRoot:\$\('summaryCards'\),getToken:accessToken,state\}\)/);
});

test('menu visibility matches the server-side authority exactly', () => {
  for (const role of ['owner','tenant_admin','workspace_admin','admin','manager','member','viewer','marketing_manager']) {
    assert.equal(workspaceAdminCanAccess(role,'edocs'), tenantRoleCanManageAccess(role), role);
  }
  assert.equal(workspaceAdminCanAccess('member','edocs'), false);
});

test('module uses the shell token, same-origin API, safe DOM, no inline styles and published assets', async () => {
  const [module, css, site, build] = await Promise.all([read('cgma-edoc-admin.js'), read('cgma-edoc-admin.css'), read('site-worker.js'), read('scripts/build.mjs')]);
  assert.match(module, /const API='\/api\/cgma\/edocs'/);
  assert.match(module, /headers\.set\('authorization','Bearer '\+token\)/);
  assert.match(module, /headers\.set\('x-ekodi-edoc-request','1'\)/);
  assert.doesNotMatch(module, /innerHTML|insertAdjacentHTML|outerHTML|document\.write/);
  assert.doesNotMatch(module, /sessionStorage|localStorage/);
  assert.doesNotMatch(module, /style:|\.setAttribute\('style'|data:image/, 'admin CSP is style-src/img-src self');
  assert.match(css, /@media print/);
  assert.match(site, /\['\/cgma\/admin\/assets\/cgma-edoc-admin\.js','\/cgma-edoc-admin\.js'\]/);
  assert.match(site, /\['\/cgma\/admin\/assets\/cgma-edoc-admin\.css','\/cgma-edoc-admin\.css'\]/);
  assert.match(build, /'cgma-edoc-admin\.css','cgma-edoc-admin\.js'/);
});

test('default order is 총무 → 사무국장 → 상인회장 and the request text lists links left to right', () => {
  assert.deepEqual([...DEFAULT_ROLES], ['총무','사무국장','상인회장']);
  const text = signRequestText({doc_no:'CGMA-2026-0001',title:'홈페이지 제안서'},[
    {seq:1,role_title:'총무',signer_name:'김총무',status:'signed',signed_at:'2026-10-25T05:00:00Z'},
    {seq:2,role_title:'사무국장',signer_name:'이국장',status:'active',link:'https://ekodi.kr/cgma/sign/#a'},
    {seq:3,role_title:'상인회장',signer_name:'정찬균',status:'waiting',link:'https://ekodi.kr/cgma/sign/#b'}]);
  assert.match(text, /서명 순서: 총무 → 사무국장 → 상인회장/);
  assert.match(text, /1\. 총무 김총무: 서명 완료/);
  assert.ok(text.indexOf('#a') < text.indexOf('#b'));
});

test('admin module URL carries its content hash, so an immutable-cached old module is never served after a change', async () => {
  const { createHash } = await import('node:crypto');
  const [page, module] = await Promise.all([read('workspace-admin-page.js'), readFile(new URL('../cgma-edoc-admin.js', import.meta.url))]);
  const hash = createHash('sha256').update(module).digest('hex').slice(0, 10);
  assert.match(page, new RegExp(`/cgma/admin/assets/cgma-edoc-admin\\.js\\?v=edocs-${hash}'`),
    `cgma-edoc-admin.js changed: set the loader version in workspace-admin-page.js to ?v=edocs-${hash}`);
});

test('admin stylesheet URL carries the stylesheet content hash', async () => {
  const { createHash } = await import('node:crypto');
  const [module, css] = await Promise.all([read('cgma-edoc-admin.js'), readFile(new URL('../cgma-edoc-admin.css', import.meta.url))]);
  const hash = createHash('sha256').update(css).digest('hex').slice(0, 10);
  assert.match(module, new RegExp(`const STYLE='/cgma/admin/assets/cgma-edoc-admin\\.css\\?v=css-${hash}'`),
    `cgma-edoc-admin.css changed: set STYLE in cgma-edoc-admin.js to ?v=css-${hash}`);
});

test('CGMA left menu: 전용 메뉴 (전자문서 · 정회원 · 모터페스티벌) comes first for every admin profile; other sites keep their order', async () => {
  const s = await (await workspaceAdminScript()).text();
  const cut = (from, to) => { const i = s.indexOf(from), j = s.indexOf(to, i); assert.ok(i >= 0 && j > i, `missing ${from}`); return s.slice(i, j); };
  const block = cut('const isBizWorkspace=', 'const adminHubScopes=') + cut('function groupsForRole(', 'function renderSecondaryNav(') + cut('function dedicatedSections(', 'function renderNav(');
  const navFor = (workspace, profile) => new Function('workspace', 'service', 'workspaceRole', 'navigationProfile', 'canSection', 'mallLocalGroups', `${block}; return navBucketsForRole;`)(
    workspace, '', 'manager', () => profile, () => true, [])('manager').map(b => [b.label, b.items.map(([key]) => key)]);
  for (const profile of ['delegated-manager', 'local']) {
    const nav = navFor('cgma', profile);
    assert.equal(nav[0][0], '전용 메뉴', profile);
    assert.deepEqual(nav[0][1], ['edocs', 'member', 'festival'], profile);
  }
  assert.equal(navFor('ekodimission', 'delegated-manager')[0][0], '공통 메뉴');
});
