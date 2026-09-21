import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { legacyAdminAliasTarget } from '../admin-address-policy.js';
import { isWorkspaceAdminPath, workspaceAdminScript } from '../workspace-admin-page.js';

test('site admins use each managed site canonical path plus /admin', async () => {
  assert.equal(isWorkspaceAdminPath('/ekodibiz/admin/'), true);
  assert.equal(isWorkspaceAdminPath('/ekodimall/admin/'), true);
  assert.equal(isWorkspaceAdminPath('/ekodimall/admin/channel-settings'), true);
  assert.equal(isWorkspaceAdminPath('/ekodimall/admin/'), true);
  assert.equal(isWorkspaceAdminPath('/ekodimall/admin/channel-settings'), true);
  assert.equal(isWorkspaceAdminPath('/admin/ekodimall/'), false);
  assert.equal(isWorkspaceAdminPath('/ekodibiz/admin/ekodimall'), false);
  assert.equal(isWorkspaceAdminPath('/ekodibiz/mall/admin/'), false);
  assert.equal(isWorkspaceAdminPath('/jadam/admin/'), true);
  assert.equal(isWorkspaceAdminPath('/admin/'), false);
  const js = await workspaceAdminScript().text();
  assert.match(js, /const standaloneMall=clean\.match/);
  assert.match(js, /const base=`\/\$\{workspace\}`/);
  assert.match(js, /adminBase=standaloneMall\?'\/ekodimall\/admin':service==='mall'\?`\$\{base\}\/ekodimall\/admin`/);
  assert.match(js,/service\?`\$\{base\}\/\$\{service\}\/admin`/);
  assert.ok(js.includes('channelAccountForm'));
  assert.ok(js.includes('data-account-auth'));
  assert.ok(js.includes('registryConnectionId'));
  assert.ok(js.includes("key==='channels'?'channel-settings':key"));
});

test('canonical Mall admin renders Workspace Admin while aggregate aliases only hand off', async () => {
  const page=await (await import('../workspace-admin-page.js')).workspaceAdminPage().text();
  assert.match(page,/EKODI Workspace Admin/);
  assert.equal(legacyAdminAliasTarget('/admin/ekodimall/'),'/ekodimall/admin');
  assert.equal(legacyAdminAliasTarget('/ekodibiz/admin/ekodimall'),'/ekodimall/admin');
  assert.equal(legacyAdminAliasTarget('/mall/admin/publishing'),'/ekodimall/admin/publishing');
});
test('guarded release probes the unique Mall admin and redirect-only aliases', async () => {
  const manifest=JSON.parse(await fs.readFile(new URL('../deploy/manifests/shared-site.worker.json',import.meta.url),'utf8'));
  const byUrl=new Map(manifest.worker.requests.map(row=>[row.url,row]));
  const canonical=byUrl.get('https://ekodi.kr/ekodimall/admin/');
  assert.deepEqual(canonical?.statuses,[200]);
  assert.ok(canonical?.headerExpect.includes('x-ekodi-route: workspace-admin'));
  const deepLink=byUrl.get('https://ekodi.kr/ekodimall/admin/channel-settings');
  assert.deepEqual(deepLink?.statuses,[200]);
  assert.ok(deepLink?.headerExpect.includes('x-ekodi-route: workspace-admin'));
  const centralAlias=byUrl.get('https://ekodi.kr/admin/ekodimall/');
  assert.deepEqual(centralAlias?.statuses,[308]);
  assert.ok(centralAlias?.headerExpect.includes('location: https://ekodi.kr/ekodimall/admin'));
  const legacy=byUrl.get('https://ekodi.kr/mall/admin/');
  assert.deepEqual(legacy?.statuses,[308]);
  assert.ok(legacy?.headerExpect.includes('location: https://ekodi.kr/ekodimall/admin'));
});


test('top-level EKODIMALL admin is parsed as the Mall service surface', async () => {
  const js = await workspaceAdminScript().text();
  assert.match(js, /standaloneMall=clean\.match/);
  assert.match(js, /mall=Boolean\(canonicalMall\|\|standaloneMall\)/);
  assert.match(js, /standaloneMall\?'ekodibiz'/);
  assert.match(js, /rawSection=canonicalMall\?\.\[2\]\|\|standaloneMall\?\.\[1\]/);
  assert.match(js, /adminBase=standaloneMall\?'\/ekodimall\/admin'/);
  assert.ok(js.includes('에코디몰 관리자 로그인'));
  assert.ok(js.includes('관리자 로그인'));
  assert.ok(js.includes('판매채널'));
  assert.ok(js.includes('AI 영업'));
  assert.ok(!js.includes('Google 계정으로 관리자 확인'));
  assert.ok(!js.includes('상품 · 공급'));
  assert.match(js,/mallDirectSections/);
});
