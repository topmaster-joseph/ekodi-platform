import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const source = await readFile(new URL('../workspace-admin-page.js', import.meta.url), 'utf8');

test('Mall admin exposes an operator-first seven-surface navigation', () => {
  assert.match(source, /\['overview','대시보드'\]/);
  assert.match(source, /\['products','상품관리'\]/);
  assert.match(source, /\['sourcing','제휴·소싱'\]/);
  assert.match(source, /\['channels','채널·게시'\]/);
  assert.match(source, /\['growth','AI 자동영업'\]/);
  assert.match(source, /\['analytics','성과·학습'\]/);
  assert.match(source, /\['design','사이트 스타일'\]/);
  assert.doesNotMatch(source, /const nav=service==='mall'\?[^;]*\['sales','영업장부'\]/);
  assert.doesNotMatch(source, /const nav=service==='mall'\?[^;]*\['automation','자동화'\]/);
});

test('Mall admin resolves URL aliases to the authorized tenant subject before service API calls', () => {
  assert.match(source, /function canonicalSubjectKey\(\)/);
  assert.match(source, /workspace==='ekodibiz'\?'ekodi-biz':workspace/);
  assert.match(source, /subject_key',canonicalSubjectKey\(\)/);
  assert.match(source, /subject_key=\$\{encodeURIComponent\(canonicalSubjectKey\(\)\)\}/);
  assert.match(source, /subject_type=workspace&subject_key='\+encodeURIComponent\(canonicalSubjectKey\(\)\)/);
  assert.match(source, /if\(section==='sales'\)return location\.replace\(`\$\{adminBase\}\/analytics`\)/);
  assert.match(source, /if\(\['marketing','automation'\]\.includes\(section\)\)return location\.replace\(`\$\{adminBase\}\/channels`\)/);
});
