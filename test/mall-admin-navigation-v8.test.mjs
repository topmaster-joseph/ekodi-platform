import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const source = await readFile(new URL('../workspace-admin-page.js', import.meta.url), 'utf8');

test('Mall admin exposes operator-first direct navigation', () => {
  const direct = "const mallDirectSections=[['overview','대시보드'],['products','상품'],['analytics','주문·매출'],['channels','판매채널'],['sourcing','공급·제휴'],['growth','마케팅·AI'],['confirmations','정산·확인'],['design','설정']]";
  assert.ok(source.includes(direct));
  assert.ok(source.includes("const mallDelegatedGroups=["));
  assert.ok(source.includes("const mallLocalGroups=["));
  assert.ok(source.includes("function groupsForRole(role=workspaceRole)"));
  assert.ok(source.includes("if(service==='mall')"));
  assert.ok(source.includes("adminBase=standaloneMall?'/ekodimall/admin':service==='mall'?'/ekodimall/admin'"));
  assert.equal(direct.includes("['sales','영업장부']"), false);
  assert.equal(direct.includes("['automation','자동화']"), false);
  assert.equal(direct.includes("['amazon','Amazon']"), false);
  assert.ok(source.includes("if(section==='amazon')return amazonAdmin()"));
  assert.ok(source.includes('@media(max-width:620px){.heading{display:grid}'));
  assert.ok(source.includes('.mall-decision{min-height:0}'));
  assert.ok(source.includes('.loading,.empty{min-height:0;margin:0;line-height:1.5}'));
});
test('Mall admin resolves URL aliases to the authorized tenant subject before service API calls', () => {
  assert.match(source, /function canonicalSubjectKey\(\)/);
  assert.match(source, /workspace==='ekodibiz'\?'ekodi-biz'/);
  assert.match(source, /subject_key',canonicalSubjectKey\(\)/);
  assert.match(source, /subject_key=\$\{encodeURIComponent\(canonicalSubjectKey\(\)\)\}/);
  assert.match(source, /subject_type=workspace&subject_key='\+encodeURIComponent\(canonicalSubjectKey\(\)\)/);
  assert.match(source, /if\(section==='sales'\)return location\.replace\(`\$\{adminBase\}\/analytics`\)/);
  assert.match(source, /if\(\['marketing','automation'\]\.includes\(section\)\)return location\.replace\(`\$\{adminBase\}\/channel-settings`\)/);
});
