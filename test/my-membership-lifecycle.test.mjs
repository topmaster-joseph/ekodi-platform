import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const mySummary = await readFile(new URL('../my/membership-summary.js', import.meta.url), 'utf8');
const universalMembership = await readFile(new URL('../universal-membership.js', import.meta.url), 'utf8');
const userServices = await readFile(new URL('../my/user-services.js', import.meta.url), 'utf8');

function section(source, startMarker, endMarker) {
  const start = source.indexOf(startMarker);
  const end = source.indexOf(endMarker, start + startMarker.length);
  assert.notEqual(start, -1, `missing start marker: ${startMarker}`);
  assert.notEqual(end, -1, `missing end marker: ${endMarker}`);
  return source.slice(start, end);
}

test('My EKODI keeps portfolio reads side-effect free and materializes FREE only on service use', () => {
  const portfolio = section(universalMembership, 'async function portfolio', 'async function genericCatalog');
  const genericMe = section(universalMembership, 'async function genericMe', 'async function genericSelect');
  assert.doesNotMatch(portfolio, /materializeFree\s*\(/);
  assert.match(genericMe, /materializeFree\s*\(/);
  assert.doesNotMatch(mySummary, /\/api\/membership\/me/);
});

test('My EKODI distinguishes eligibility, active FREE use and paid membership', () => {
  assert.match(mySummary, /label: '이용 가능'/);
  assert.match(mySummary, /label: '사용 중'/);
  assert.match(mySummary, /label: '구독 중'/);
  assert.match(mySummary, /status === 'eligible'/);
  assert.match(mySummary, /subscription\?\.inherited !== false/);
});

test('membership API failure is visibly degraded instead of pretending every service is FREE', () => {
  assert.match(mySummary, /상태 확인 지연/);
  assert.match(mySummary, /renderPortfolio\(null, \{ degraded: true \}\)/);
  assert.match(mySummary, /유료·활성화 상태는 연결 복구 후 자동 갱신됩니다/);
});

test('My registry reconciliation keeps newly registered user services visible', () => {
  assert.match(mySummary, /function portfolioRows\(data\)/);
  assert.match(mySummary, /USER_SERVICES\.map/);
  assert.match(userServices, /"id": "support"/);
});
