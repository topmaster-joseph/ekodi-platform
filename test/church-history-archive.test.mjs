import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { renderPublicHistory, renderAdminHistory } from '../church-history-worker.js';

const sample = {
  id: 'sample',
  start_date: '2018-03-14',
  end_date: '',
  date_label: '2018년 3월 14일',
  era: '선교 공동체의 형성',
  organization: '한국외국인선교회 무안지부 · 에코디선교회',
  relation_type: 'organizational-predecessor',
  kind: 'organization',
  title: '한국외국인선교회 무안지부와 에코디선교회',
  summary: '문서로 확인된 선교조직의 이정표입니다.',
  body_text: '서로 다른 날짜의 의미를 합치지 않고 보존합니다.',
  place: '무안군 청계면',
  people_text: '내부 인물',
  source_title: '비공개 근거자료 제목',
  source_type: 'document',
  source_ref: 'secret-internal-reference',
  verification_status: 'documented',
  verification_note: '내부 검증 메모',
  visibility: 'public',
  featured: 1,
  sort_order: 50,
};

test('public history renders verified timeline without private source metadata', () => {
  const html = renderPublicHistory([sample]);
  assert.match(html, /지나온 길/);
  assert.match(html, /2018년 3월 14일/);
  assert.match(html, /문서 확인/);
  assert.match(html, /한국외국인선교회 무안지부/);
  assert.doesNotMatch(html, /secret-internal-reference/);
  assert.doesNotMatch(html, /내부 검증 메모/);
  assert.doesNotMatch(html, /비공개 근거자료 제목/);
});

test('admin history defaults new records to private and distinguishes evidence states', () => {
  const html = renderAdminHistory();
  assert.match(html, /역사 아카이브/);
  assert.match(html, /value="private" selected/);
  assert.match(html, /value="documented"/);
  assert.match(html, /value="contextual"/);
  assert.match(html, /value="oral-history"/);
  assert.match(html, /value="needs-review" selected/);
  assert.match(html, /내부 자료참조/);
});

test('migration preserves distinct 2018 milestones and contextual early history', async () => {
  const sql = await readFile(new URL('../migrations/0093_church_history_archive.sql', import.meta.url), 'utf8');
  assert.match(sql, /2018-03-14/);
  assert.match(sql, /2018-08-13/);
  assert.match(sql, /needs-review/);
  assert.match(sql, /contextual/);
  assert.match(sql, /이 시점을 선교 시작일로 단정하지 않음/);
  assert.match(sql, /visibility TEXT NOT NULL DEFAULT 'private'/);
});

test('worker routes stay on canonical ekodi.kr path hierarchy', async () => {
  const config = await readFile(new URL('../wrangler.church-history.toml', import.meta.url), 'utf8');
  assert.match(config, /ekodi\.kr\/ekodichurch\/history\*/);
  assert.match(config, /ekodi\.kr\/ekodichurch\/admin\/history\*/);
  assert.match(config, /ekodi\.kr\/api\/church\/admin\/history\*/);
  assert.doesNotMatch(config, /history\.ekodi\.kr/);
});
