import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import {
  ADMIN_ASSIST_RETENTION,
  ensureAdminAssistColumns,
  listOwnConversations,
  redactOwnConversation,
} from '../admin-assist-retention.js';

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
  const add = (type, who, q, a, when) => sqlite.prepare(`INSERT INTO ai_agent_actions
    (agent_id,agent_name,action_type,area,target,decision_tier,decision_reason,status,requested_by,
     created_at,rationale,reply_text,rationale_summary,reply_summary)
    VALUES ('chief','Chief',?,'read_only_audits','admin','assist','ok','verified',?,?,?,?,?,?)`)
    .run(type, who, when, q, a, q.slice(0, 40), a.slice(0, 40));
  add('admin.assist_chat', 'pastor@ekodi.kr', '성도 가정 상담 정리', '네 항목으로 정리했습니다', '2026-10-20T00:00:00.000Z');
  add('admin.assist_chat', 'pastor@ekodi.kr', '주보 초안 검토', '세 곳을 고쳤습니다', '2026-10-21T00:00:00.000Z');
  add('admin.assist_chat', 'other@ekodi.kr', '다른 관리자의 상담 기록', '다른 관리자에게 준 답변', '2026-10-21T00:00:00.000Z');
  add('service.health_check', 'pastor@ekodi.kr', '상태 점검', '정상', '2026-10-21T00:00:00.000Z');
  return { sqlite, db };
}

test('an administrator recalls their own conversations, newest first', async () => {
  const { db } = await seededDb();
  const result = await listOwnConversations(db, { email: 'pastor@ekodi.kr' });
  assert.equal(result.ownerScoped, true);
  assert.equal(result.conversations.length, 2);
  assert.equal(result.conversations[0].question, '주보 초안 검토', 'newest first');
  assert.equal(result.conversations[0].reply, '세 곳을 고쳤습니다');
  assert.equal(result.retentionDays, ADMIN_ASSIST_RETENTION.verbatimRetentionDays);
});

test("another administrator's conversations are never returned", async () => {
  const { db } = await seededDb();
  const mine = await listOwnConversations(db, { email: 'pastor@ekodi.kr' });
  const text = JSON.stringify(mine);
  assert.doesNotMatch(text, /다른 관리자/, 'no part of another administrator record may appear');
  assert.doesNotMatch(text, /other@ekodi\.kr/);

  // And the other direction, so the scoping is not accidentally one-sided.
  const theirs = await listOwnConversations(db, { email: 'other@ekodi.kr' });
  assert.equal(theirs.conversations.length, 1);
  assert.doesNotMatch(JSON.stringify(theirs), /성도 가정 상담/);
});

test('only assist conversations are recalled, not every logged action', async () => {
  const { db } = await seededDb();
  const result = await listOwnConversations(db, { email: 'pastor@ekodi.kr' });
  assert.doesNotMatch(JSON.stringify(result), /상태 점검/, 'health checks are not conversation');
});

test('an unresolved owner recalls nothing rather than everything', async () => {
  const { db } = await seededDb();
  for (const email of ['', '   ', undefined, null]) {
    const result = await listOwnConversations(db, { email });
    assert.equal(result.conversations.length, 0, `empty owner must not widen the query: ${String(email)}`);
    assert.equal(result.reason, 'owner_required');
  }
});

test('a redacted conversation returns its summary and says so, not a marker that reads like content', async () => {
  const { sqlite, db } = await seededDb();
  await redactOwnConversation(db, { email: 'pastor@ekodi.kr', id: 1 });
  const result = await listOwnConversations(db, { email: 'pastor@ekodi.kr' });
  const row = result.conversations.find(item => item.id === 1);
  assert.equal(row.redacted, true);
  assert.ok(row.redactedAt);
  assert.equal(row.question, '', 'the words are gone, not replaced by a marker');
  assert.equal(row.reply, '');
  assert.equal(row.questionSummary, '성도 가정 상담 정리');
  // The stored row does carry the marker; it is simply not served as content.
  assert.equal(sqlite.prepare('SELECT rationale FROM ai_agent_actions WHERE id=1').get().rationale,
    ADMIN_ASSIST_RETENTION.redactionMarker);
});

test('the owner delete removes the words and keeps the audit row', async () => {
  const { sqlite, db } = await seededDb();
  const result = await redactOwnConversation(db, { email: 'pastor@ekodi.kr', id: 2 });
  assert.equal(result.redacted, true);
  assert.equal(result.auditRowRetained, true);

  const row = sqlite.prepare(`SELECT rationale, reply_text, rationale_summary, status,
    decision_tier, requested_by, created_at, redacted_at FROM ai_agent_actions WHERE id=2`).get();
  assert.equal(row.rationale, ADMIN_ASSIST_RETENTION.redactionMarker);
  assert.equal(row.reply_text, ADMIN_ASSIST_RETENTION.redactionMarker);
  assert.equal(row.rationale_summary, '주보 초안 검토');
  // Accountability survives the delete.
  assert.equal(row.status, 'verified');
  assert.equal(row.decision_tier, 'assist');
  assert.equal(row.requested_by, 'pastor@ekodi.kr');
  assert.ok(row.created_at);
  assert.ok(row.redacted_at);
});

test("one administrator cannot delete another's conversation", async () => {
  const { sqlite, db } = await seededDb();
  const result = await redactOwnConversation(db, { email: 'pastor@ekodi.kr', id: 3 });
  assert.equal(result.redacted, false);
  assert.equal(result.reason, 'not_found_or_not_owned');
  assert.equal(
    sqlite.prepare('SELECT rationale FROM ai_agent_actions WHERE id=3').get().rationale,
    '다른 관리자의 상담 기록',
    'the other record must be untouched',
  );
});

test('deleting twice is reported, not repeated', async () => {
  const { sqlite, db } = await seededDb();
  await redactOwnConversation(db, { email: 'pastor@ekodi.kr', id: 1 });
  const summaryAfterFirst = sqlite.prepare('SELECT rationale_summary FROM ai_agent_actions WHERE id=1').get().rationale_summary;
  const second = await redactOwnConversation(db, { email: 'pastor@ekodi.kr', id: 1 });
  assert.equal(second.redacted, false);
  assert.equal(second.reason, 'already_redacted');
  assert.equal(
    sqlite.prepare('SELECT rationale_summary FROM ai_agent_actions WHERE id=1').get().rationale_summary,
    summaryAfterFirst,
    'the summary must not be overwritten with the marker',
  );
});

test('a malformed id is refused rather than guessed', async () => {
  const { db } = await seededDb();
  for (const id of ['abc', '', '0', '-3', undefined]) {
    const result = await redactOwnConversation(db, { email: 'pastor@ekodi.kr', id });
    assert.equal(result.redacted, false, `id ${String(id)} must be refused`);
  }
});

test('recall is capped so one request cannot drain the ledger', async () => {
  const { db } = await seededDb();
  const asked = await listOwnConversations(db, { email: 'pastor@ekodi.kr', limit: 10_000 });
  assert.ok(asked.conversations.length <= 50);
  const source = fs.readFileSync(new URL('../admin-assist-retention.js', import.meta.url), 'utf8');
  assert.match(source, /const MAX_RECALL = 50;/);
});

test('the routes scope to the session owner and are not widened by superadmin standing', () => {
  const control = fs.readFileSync(new URL('../ai-agent-control.js', import.meta.url), 'utf8');
  assert.match(control, /\$\{PREFIX\}\/conversations/);
  assert.match(control, /listOwnConversations\(env\.DB, \{\s*email: owner/);
  assert.match(control, /redactOwnConversation\(env\.DB, \{ email: owner/);
  assert.match(control, /OWNER_UNRESOLVED/, 'an unresolved owner must be refused, not defaulted');
  // Owner scoping lives in SQL, so a route bug cannot widen it.
  const retention = fs.readFileSync(new URL('../admin-assist-retention.js', import.meta.url), 'utf8');
  assert.match(retention, /WHERE action_type = 'admin\.assist_chat' AND requested_by = \?/);
  assert.match(retention, /WHERE id = \? AND action_type = 'admin\.assist_chat' AND requested_by = \?/);
});
