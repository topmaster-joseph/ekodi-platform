import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import {
  ADMIN_ASSIST_COLUMNS,
  ADMIN_ASSIST_RETENTION,
  ensureAdminAssistColumns,
  pruneAdminAssistConversations,
  retentionCutoffIso,
  summarizeConversationText,
} from '../admin-assist-retention.js';

/** Minimal D1-shaped binding over node:sqlite. */
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

/** The table as it exists before this change — no conversation columns. */
function legacyDb() {
  const sqlite = new DatabaseSync(':memory:');
  sqlite.exec(`CREATE TABLE ai_agent_actions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    agent_id TEXT NOT NULL, agent_name TEXT NOT NULL, action_type TEXT NOT NULL,
    area TEXT NOT NULL, target TEXT NOT NULL DEFAULT '', rationale TEXT NOT NULL DEFAULT '',
    payload_json TEXT NOT NULL DEFAULT '{}', decision_tier TEXT NOT NULL, decision_reason TEXT NOT NULL,
    status TEXT NOT NULL, requested_by TEXT NOT NULL, created_at TEXT NOT NULL,
    decided_by TEXT, decided_at TEXT, decision_note TEXT NOT NULL DEFAULT '',
    result_json TEXT NOT NULL DEFAULT '{}', verified_at TEXT)`);
  return { sqlite, db: createD1(sqlite) };
}

function insert(sqlite, { rationale, reply, createdAt, type = 'admin.assist_chat' }) {
  sqlite.prepare(`INSERT INTO ai_agent_actions
    (agent_id, agent_name, action_type, area, decision_tier, decision_reason, status, requested_by,
     created_at, rationale, reply_text, rationale_summary, reply_summary)
    VALUES ('chief','Chief',?,'read_only_audits','assist','ok','verified','admin@ekodi.kr',?,?,?,'','')`)
    .run(type, createdAt, rationale, reply);
}

const daysAgo = n => new Date(Date.now() - n * 86_400_000).toISOString();

test('retention policy keeps the audit row and expires only the words', () => {
  assert.equal(ADMIN_ASSIST_RETENTION.verbatimRetentionDays, 90);
  assert.equal(ADMIN_ASSIST_RETENTION.auditRowRetained, true);
  assert.ok(ADMIN_ASSIST_RETENTION.redactionMarker.length > 0);
});

test('column migration is additive and idempotent on the legacy table', async () => {
  const { sqlite, db } = legacyDb();
  await ensureAdminAssistColumns(db);
  await ensureAdminAssistColumns(db);
  const columns = sqlite.prepare('PRAGMA table_info(ai_agent_actions)').all().map(row => row.name);
  for (const [name] of ADMIN_ASSIST_COLUMNS) assert.ok(columns.includes(name), `${name} must exist`);
  // Nothing pre-existing was dropped.
  for (const name of ['rationale', 'result_json', 'verified_at', 'decision_tier']) {
    assert.ok(columns.includes(name), `${name} must survive`);
  }
});

test('conversations inside the window are left verbatim', async () => {
  const { sqlite, db } = legacyDb();
  await ensureAdminAssistColumns(db);
  insert(sqlite, { rationale: '교인 심방 일정을 정리해줘', reply: '세 가지로 나눠 정리했습니다.', createdAt: daysAgo(10) });

  const result = await pruneAdminAssistConversations(db);
  assert.equal(result.redacted, 0);

  const row = sqlite.prepare('SELECT rationale, reply_text, redacted_at FROM ai_agent_actions').get();
  assert.equal(row.rationale, '교인 심방 일정을 정리해줘');
  assert.equal(row.reply_text, '세 가지로 나눠 정리했습니다.');
  assert.equal(row.redacted_at, null);
});

test('conversations past the window lose their text but keep row, summary and provenance', async () => {
  const { sqlite, db } = legacyDb();
  await ensureAdminAssistColumns(db);
  insert(sqlite, { rationale: '성도 가정 상담 내용 요약', reply: '상담 기록을 네 항목으로 정리했습니다.', createdAt: daysAgo(120) });

  const result = await pruneAdminAssistConversations(db);
  assert.equal(result.redacted, 1);
  assert.equal(result.retentionDays, 90);

  const row = sqlite.prepare(`SELECT rationale, reply_text, rationale_summary, reply_summary,
    redacted_at, status, decision_tier, requested_by, created_at FROM ai_agent_actions`).get();
  assert.equal(row.rationale, ADMIN_ASSIST_RETENTION.redactionMarker);
  assert.equal(row.reply_text, ADMIN_ASSIST_RETENTION.redactionMarker);
  assert.equal(row.rationale_summary, '성도 가정 상담 내용 요약');
  assert.equal(row.reply_summary, '상담 기록을 네 항목으로 정리했습니다.');
  assert.ok(row.redacted_at, 'redaction must be timestamped');
  // The audit trail itself is untouched.
  assert.equal(row.status, 'verified');
  assert.equal(row.decision_tier, 'assist');
  assert.equal(row.requested_by, 'admin@ekodi.kr');
  assert.ok(row.created_at);
});

test('redaction never runs twice on the same row', async () => {
  const { sqlite, db } = legacyDb();
  await ensureAdminAssistColumns(db);
  insert(sqlite, { rationale: '원문', reply: '답변', createdAt: daysAgo(200) });

  const first = await pruneAdminAssistConversations(db);
  const summaryAfterFirst = sqlite.prepare('SELECT rationale_summary FROM ai_agent_actions').get().rationale_summary;
  const second = await pruneAdminAssistConversations(db);

  assert.equal(first.redacted, 1);
  assert.equal(second.redacted, 0, 'an already-redacted row must not be reprocessed');
  assert.equal(
    sqlite.prepare('SELECT rationale_summary FROM ai_agent_actions').get().rationale_summary,
    summaryAfterFirst,
    'the summary must not be overwritten with the redaction marker',
  );
});

test('a long reply is summarized rather than stored whole in the summary column', async () => {
  const { sqlite, db } = legacyDb();
  await ensureAdminAssistColumns(db);
  const long = '가'.repeat(600);
  insert(sqlite, { rationale: long, reply: long, createdAt: daysAgo(100) });

  await pruneAdminAssistConversations(db);
  const row = sqlite.prepare('SELECT rationale_summary, reply_summary FROM ai_agent_actions').get();
  assert.equal(row.rationale_summary.length, ADMIN_ASSIST_RETENTION.summaryChars);
  assert.ok(row.reply_summary.endsWith('…'));
});

test('a custom retention window is honoured', async () => {
  const { sqlite, db } = legacyDb();
  await ensureAdminAssistColumns(db);
  insert(sqlite, { rationale: '질문', reply: '답', createdAt: daysAgo(20) });

  assert.equal((await pruneAdminAssistConversations(db, { retentionDays: 30 })).redacted, 0);
  assert.equal((await pruneAdminAssistConversations(db, { retentionDays: 7 })).redacted, 1);
});

test('pruning is batched so one cron tick cannot run away', async () => {
  const { sqlite, db } = legacyDb();
  await ensureAdminAssistColumns(db);
  for (let i = 0; i < 5; i += 1) insert(sqlite, { rationale: `질문 ${i}`, reply: `답 ${i}`, createdAt: daysAgo(100 + i) });

  const result = await pruneAdminAssistConversations(db, { limit: 2 });
  assert.equal(result.redacted, 2);
  assert.equal(sqlite.prepare('SELECT COUNT(*) AS n FROM ai_agent_actions WHERE redacted_at IS NULL').get().n, 3);
});

test('a missing database binding is reported, not thrown', async () => {
  const result = await pruneAdminAssistConversations(null);
  assert.equal(result.redacted, 0);
  assert.equal(result.reason, 'no_database_binding');
});

test('summarize and cutoff helpers are well behaved', () => {
  assert.equal(summarizeConversationText('  여러   공백\n정리  '), '여러 공백 정리');
  assert.equal(summarizeConversationText(''), '');
  assert.equal(summarizeConversationText(null), '');
  const cutoff = retentionCutoffIso(new Date('2026-10-22T00:00:00.000Z'), 90);
  assert.equal(cutoff, '2026-07-24T00:00:00.000Z');
  // An invalid window falls back to the policy default rather than disabling expiry.
  assert.equal(retentionCutoffIso(new Date('2026-10-22T00:00:00.000Z'), 'nonsense'), '2026-07-24T00:00:00.000Z');
});

test('the scheduled worker prunes conversations on the existing cron', () => {
  const worker = fs.readFileSync(new URL('../api-worker.js', import.meta.url), 'utf8');
  assert.match(worker, /import \{ pruneAdminAssistConversations \} from '\.\/admin-assist-retention\.js';/);
  const scheduled = worker.slice(worker.indexOf('async scheduled('));
  assert.match(scheduled, /pruneAdminAssistConversations\(env\.DB\)/);
});

test('the control plane stores the reply and a summary of the question', () => {
  const control = fs.readFileSync(new URL('../ai-agent-control.js', import.meta.url), 'utf8');
  assert.match(control, /reply_text = \?, reply_summary = \?/);
  assert.match(control, /rationale, rationale_summary,/);
  assert.match(control, /ADMIN_ASSIST_RETENTION\.maxReplyChars/);
  // No circular import: retention lives in its own module.
  assert.match(control, /from '\.\/admin-assist-retention\.js'/);
});
