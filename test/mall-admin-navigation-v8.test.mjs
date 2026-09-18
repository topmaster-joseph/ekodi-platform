import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const source = await readFile(new URL('../workspace-admin-page.js', import.meta.url), 'utf8');

test('Mall admin exposes an operator-first seven-surface navigation', () => {
  assert.match(source, /\['overview','홈'\]/);
  assert.match(source, /\['products','상품'\]/);
  assert.match(source, /\['sourcing','공급·제휴'\]/);
  assert.match(source, /\['channels','판매채널'\]/);
  assert.match(source, /adminBase=standaloneMall\?'\/ekodimall\/admin':service==='mall'\?`\$\{base\}\/ekodimall\/admin`/);
  assert.match(source, /\['growth','AI 영업'\]/);
  assert.match(source, /\['analytics','성과'\]/);
  assert.match(source, /\['design','설정'\]/);
  assert.match(source, /if\(service==='mall'\)\{for\(const \[key,label\] of mallDirectSections/);
  assert.match(source, /h\.hidden=true/);
  assert.doesNotMatch(source, /const nav=service==='mall'\?[^;]*\['sales','영업장부'\]/);
  assert.doesNotMatch(source, /const nav=service==='mall'\?[^;]*\['automation','자동화'\]/);
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
