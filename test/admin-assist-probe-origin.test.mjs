// The monitoring probe signs in as a real administrator and drives the real
// bottom dock, so nothing on the server could tell it apart from the pastor
// typing. Every probe run was therefore recorded as conversation, and feedback
// fed the model three health checks instead of his actual work.
//
// The fix is a declared origin from a closed vocabulary. These tests pin what
// the declaration may and may not do: it moves a row out of the conversation
// category, and it does not buy escape from the audit row or the retention clock.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import {
  ADMIN_ASSIST_RETENTION,
  buildAssistRecall,
  ensureAdminAssistColumns,
  listOwnConversations,
  pruneAdminAssistConversations,
} from '../admin-assist-retention.js';

// The real function and the real mapping, imported rather than re-implemented:
// a copy of the rule in the test would pass while the shipped default was wrong.
import { ASSIST_ACTION_TYPES, normalizeAssistOrigin } from '../ai-agent-control.js';

const CONTROL = fs.readFileSync(new URL('../ai-agent-control.js', import.meta.url), 'utf8');
const PROBE = fs.readFileSync(new URL('../scripts/admin-assist-canonical-e2e.mjs', import.meta.url), 'utf8');

function createD1(sqlite) {
  const prepare = query => {
    let params = [];
    const statement = {
      bind(...values) { params = values; return statement; },
      async run() { sqlite.prepare(query).run(...params); return { success: true }; },
      async all() { return { results: sqlite.prepare(query).all(...params) }; },
      async first() { return sqlite.prepare(query).get(...params) ?? null; },
    };
    return statement;
  };
  return { prepare, async batch(statements) { return Promise.all(statements.map(item => item.run())); } };
}

async function seededDb() {
  const sqlite = new DatabaseSync(':memory:');
  sqlite.exec(`CREATE TABLE ai_agent_actions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    agent_id TEXT NOT NULL, agent_name TEXT NOT NULL, action_type TEXT NOT NULL,
    area TEXT NOT NULL, target TEXT NOT NULL DEFAULT '', rationale TEXT NOT NULL DEFAULT '',
    payload_json TEXT NOT NULL DEFAULT '{}', decision_tier TEXT NOT NULL, decision_reason TEXT NOT NULL,
    status TEXT NOT NULL, requested_by TEXT NOT NULL, created_at TEXT NOT NULL,
    decided_by TEXT, decided_at TEXT, decision_note TEXT NOT NULL DEFAULT '',
    result_json TEXT NOT NULL DEFAULT '{}', verified_at TEXT)`);
  const db = createD1(sqlite);
  await ensureAdminAssistColumns(db);
  const add = ({ type, q, a, when, who = 'pastor@ekodi.kr' }) => sqlite.prepare(`INSERT INTO ai_agent_actions
    (agent_id,agent_name,action_type,area,target,decision_tier,decision_reason,status,requested_by,
     created_at,rationale,reply_text,rationale_summary,reply_summary)
    VALUES ('chief','Chief',?,'read_only_audits','overview','observe','ok','verified',?,?,?,?,?,?)`)
    .run(type, who, when, q, a, q, a);
  return { sqlite, db, add };
}

test('the origin vocabulary is closed: anything unrecognized is treated as the dock', () => {
  assert.equal(normalizeAssistOrigin('automated_probe'), 'automated_probe');
  assert.equal(normalizeAssistOrigin('AUTOMATED_PROBE'), 'automated_probe', 'case must not matter');
  assert.equal(normalizeAssistOrigin('dock'), 'dock');
  for (const invented of ['probe', 'system', 'internal', 'admin-assist-dock', 'automated probe', '', null, undefined, 42, {}]) {
    assert.equal(normalizeAssistOrigin(invented), 'dock', `no caller may invent a category: ${String(invented)}`);
  }
});

test('a request that says nothing about origin behaves exactly as before', () => {
  // The dock does not send an origin, so the default decides whether this change
  // silently reclassified every existing conversation.
  assert.equal(normalizeAssistOrigin(undefined), 'dock');
  assert.equal(ASSIST_ACTION_TYPES[normalizeAssistOrigin(undefined)], 'admin.assist_chat',
    'a dock request with no origin must still be recorded as conversation');
  assert.equal(ASSIST_ACTION_TYPES[normalizeAssistOrigin('automated_probe')], 'admin.assist_probe');
  assert.match(CONTROL, /actionType: ASSIST_ACTION_TYPES\[origin\]/, 'the handler must use the mapping, not a literal');
});

test('a probe is not conversation: it leaves recall and the conversation list', async () => {
  const { db, add } = await seededDb();
  add({ type: 'admin.assist_chat', q: '주보 초안 검토', a: '세 곳을 고쳤습니다', when: '2026-10-30T00:00:00.000Z' });
  for (let i = 1; i <= 5; i += 1) {
    add({ type: 'admin.assist_probe', q: 'EKODI E2E 확인: "정상"이라고 한 단어로 답해줘.', a: '정상', when: `2026-10-31T0${i}:00:00.000Z` });
  }

  const recall = await buildAssistRecall(db, { email: 'pastor@ekodi.kr' });
  assert.equal(recall.items.length, 1, 'only the real conversation is fed back');
  assert.equal(recall.items[0].asked, '주보 초안 검토');
  assert.doesNotMatch(JSON.stringify(recall), /E2E/, 'health checks must not reach the model as continuity');

  const listed = await listOwnConversations(db, { email: 'pastor@ekodi.kr' });
  assert.equal(listed.conversations.length, 1, "the pastor's own list is his conversations, not the watchman's log");
  assert.doesNotMatch(JSON.stringify(listed), /E2E/);
});

test('the declaration buys no escape from the audit row', async () => {
  const { sqlite, add } = await seededDb();
  add({ type: 'admin.assist_probe', q: 'EKODI E2E 확인', a: '정상', when: '2026-10-31T00:00:00.000Z' });
  const row = sqlite.prepare(`SELECT requested_by, created_at, decision_tier, status, rationale, reply_text, area
    FROM ai_agent_actions WHERE id=1`).get();
  // Every field that answers "who did what, when, under what authority" survives.
  assert.equal(row.requested_by, 'pastor@ekodi.kr');
  assert.ok(row.created_at);
  assert.equal(row.decision_tier, 'observe');
  assert.equal(row.status, 'verified');
  assert.equal(row.area, 'read_only_audits');
  assert.equal(row.rationale, 'EKODI E2E 확인');
  assert.equal(row.reply_text, '정상');
});

test('the declaration buys no escape from the retention clock', async () => {
  const { sqlite, db, add } = await seededDb();
  add({ type: 'admin.assist_probe', q: '오래된 프로브 원문', a: '정상', when: '2020-01-01T00:00:00.000Z' });
  add({ type: 'admin.assist_chat', q: '오래된 대화 원문', a: '오래된 답변', when: '2020-01-01T00:00:00.000Z' });
  const pruned = await pruneAdminAssistConversations(db, { now: new Date('2026-10-31T00:00:00.000Z') });
  assert.equal(pruned.redacted, 2, 'both the probe and the conversation are redacted on schedule');
  for (const id of [1, 2]) {
    const row = sqlite.prepare('SELECT rationale, reply_text, redacted_at FROM ai_agent_actions WHERE id=?').get(id);
    assert.equal(row.rationale, ADMIN_ASSIST_RETENTION.redactionMarker, `row ${id} verbatim must be gone`);
    assert.equal(row.reply_text, ADMIN_ASSIST_RETENTION.redactionMarker);
    assert.ok(row.redacted_at);
  }
});

test('the ledger records that the category was claimed, not observed', () => {
  assert.match(CONTROL, /origin,\n\s+originAsserted: true,/, 'the payload must mark the claim as a claim');
  assert.match(CONTROL, /source: isProbe \? 'admin-assist-probe' : 'admin-assist-dock'/);
});

test('a probe is given no feedback, since continuity means nothing to it', () => {
  assert.match(CONTROL, /const recallOwner = isProbe \? '' : String\(session\.email \|\| ''\)\.trim\(\);/);
});

test('the probe declares itself without a test hook in production code', () => {
  assert.match(PROBE, /origin: 'automated_probe'/, 'the probe must declare its origin');
  assert.match(PROBE, /page\.route\(assistApiUrl/, 'declared on its own request, in flight');
  // The UI path under test must be unchanged: same message, same dock submission.
  assert.match(PROBE, /\.\.\.body, origin: 'automated_probe'/, 'the declaration is additive, not a replacement body');
  assert.match(PROBE, /await input\.press\('Enter'\)/, 'the probe must still submit through the real dock');
  // And production code must not have grown a flag that exists only for the probe.
  for (const hook of ['__ekodiAssistProbe', 'isE2E', 'e2eMode', 'E2E_ADMIN_TOKEN']) {
    assert.ok(!CONTROL.includes(hook), `production handler must not carry a test hook: ${hook}`);
  }
  const dockFiles = ['admin-menu-runtime.js', 'control.js'];
  for (const file of dockFiles) {
    const source = fs.readFileSync(new URL(`../${file}`, import.meta.url), 'utf8');
    assert.ok(!source.includes('automated_probe'), `${file} must not learn about the probe`);
  }
});

test('a dropped declaration fails the probe loudly instead of silently becoming conversation', () => {
  assert.match(PROBE, /did not carry the automated_probe origin declaration/);
  assert.match(PROBE, /report\.probeOriginDeclared = true;/);
  assert.match(PROBE, /probeOriginDeclared: false,/, 'the report field must default to false');
});

test('the probe action type resolves to a capability deterministically', () => {
  const runtime = fs.readFileSync(new URL('../ekodian-8g-runtime.js', import.meta.url), 'utf8');
  assert.match(runtime, /'admin\.assist_probe': 'core\.navigator'/, 'an unmapped action type would fall through to an area default');
});
