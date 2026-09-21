import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const source = await readFile(new URL('../workspace-admin-page.js', import.meta.url), 'utf8');

test('Mall admin exposes operator-first direct navigation', () => {
  const direct = "const mallDirectSections=[['overview','대시보드'],['products','상품'],['sourcing','공급·제휴'],['channels','판매채널'],['growth','AI 영업'],['analytics','성과'],['confirmations','지급·수령'],['design','관리설정']]";
  assert.ok(source.includes(direct));
  assert.ok(source.includes("const mallGroups=mallDirectSections.map(([id,label])=>({id,label,sections:[[id,label]]}))"));
  assert.ok(source.includes("const navGroups=service==='mall'?mallGroups:rootGroups"));
  assert.ok(source.includes("adminBase=standaloneMall?'/ekodimall/admin':service==='mall'?'/ekodimall/admin'"));
  assert.equal(direct.includes("['sales','영업장부']"), false);
  assert.equal(direct.includes("['automation','자동화']"), false);
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
