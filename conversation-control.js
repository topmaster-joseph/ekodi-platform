import authWorker, { isAllowedOrigin } from './auth-worker.js';
import { runAiEnhancedTask } from './ai-resilience-runtime.js';

const MAX_MESSAGE_LENGTH = 6000;
const MAX_SUBJECT_LENGTH = 120;
const MAX_SERVICE_LENGTH = 80;
const encoder = new TextEncoder();

export const CONVERSATION_STATES = Object.freeze({
  AI: 'ai_active',
  REVIEW: 'human_review',
  HUMAN: 'human_active',
  CLOSED: 'closed',
});

const HUMAN_PATTERNS = [
  /관리자|담당자|사람(?:이|과|에게)?\s*(?:답|연결|상담)|직접\s*(?:답|상담|통화)/i,
  /human|agent|operator|representative/i,
];
const HIGH_RISK_PATTERNS = [
  /결제|환불|계약|해지|개인정보|비밀번호|계정\s*(?:삭제|탈취)|회원\s*삭제|법적|분쟁|신고|보안/i,
  /payment|refund|contract|privacy|password|delete\s+account|legal|security/i,
];
const FAILURE_PATTERNS = [
  /오류|장애|실패|안\s*돼|안\s*되|접속\s*(?:불가|안)|로그인\s*(?:불가|안)|발행\s*실패/i,
  /error|failed|failure|down|unavailable|can't\s+login/i,
];

function json(data, status = 200, request = null, env = {}) {
  const origin = request?.headers?.get('origin') || '';
  const headers = {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
    'x-content-type-options': 'nosniff',
    vary: 'Origin',
  };
  if (origin && isAllowedOrigin(origin, env)) headers['access-control-allow-origin'] = origin;
  return new Response(JSON.stringify(data), { status, headers });
}

function cors(request, env) {
  const origin = request.headers.get('origin') || '';
  const headers = {
    'access-control-allow-headers': 'content-type, authorization',
    'access-control-allow-methods': 'GET, POST, OPTIONS',
    'access-control-max-age': '86400',
    vary: 'Origin',
  };
  if (origin && isAllowedOrigin(origin, env)) headers['access-control-allow-origin'] = origin;
  return headers;
}

async function readJson(request) {
  try { return await request.json(); } catch { return null; }
}

function id(prefix = 'c') {
  return `${prefix}_${crypto.randomUUID()}`;
}

async function sha256(value) {
  const digest = await crypto.subtle.digest('SHA-256', encoder.encode(String(value || '')));
  return [...new Uint8Array(digest)].map(byte => byte.toString(16).padStart(2, '0')).join('');
}

export function classifyConversationMessage(value = '') {
  const text = String(value || '').trim();
  const reasons = [];
  let score = 0;
  if (HUMAN_PATTERNS.some(pattern => pattern.test(text))) {
    score += 4;
    reasons.push('explicit_human_request');
  }
  if (HIGH_RISK_PATTERNS.some(pattern => pattern.test(text))) {
    score += 3;
    reasons.push('sensitive_or_high_risk');
  }
  if (FAILURE_PATTERNS.some(pattern => pattern.test(text))) {
    score += 2;
    reasons.push('service_failure');
  }
  const priority = score >= 5 ? 'urgent' : score >= 2 ? 'review' : 'normal';
  return Object.freeze({
    priority,
    requiresHuman: score >= 3,
    score,
    reasons: Object.freeze(reasons),
  });
}

export function buildFreeAssistReply({ triage, service = 'EKODI' } = {}) {
  if (triage?.requiresHuman) {
    return `${service}에서 요청을 접수했습니다. 중요한 내용으로 분류해 관리자 확인 대기열에 올렸습니다. 대화 내용은 그대로 이어집니다.`;
  }
  return `${service}에서 요청을 접수했습니다. 현재 AI 고급 응답을 사용할 수 없어 기본 도움말 모드로 처리 중이며, 필요한 경우 관리자에게 자동으로 연결합니다.`;
}

async function ensureSchema(db) {
  await db.batch([
    db.prepare(`CREATE TABLE IF NOT EXISTS conversations (
      id TEXT PRIMARY KEY,
      tenant_id INTEGER NOT NULL,
      tenant_slug TEXT NOT NULL DEFAULT '',
      user_id INTEGER NOT NULL,
      user_email TEXT NOT NULL DEFAULT '',
      user_name TEXT NOT NULL DEFAULT '',
      service_id TEXT NOT NULL DEFAULT 'ekodi',
      subject TEXT NOT NULL DEFAULT '',
      status TEXT NOT NULL DEFAULT 'ai_active',
      priority TEXT NOT NULL DEFAULT 'normal',
      assigned_admin_id INTEGER,
      summary TEXT NOT NULL DEFAULT '',
      last_channel TEXT NOT NULL DEFAULT 'web',
      last_message_at TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    )`),
    db.prepare(`CREATE TABLE IF NOT EXISTS conversation_messages (
      id TEXT PRIMARY KEY,
      conversation_id TEXT NOT NULL,
      sender_role TEXT NOT NULL,
      sender_id TEXT NOT NULL DEFAULT '',
      channel TEXT NOT NULL DEFAULT 'web',
      body TEXT NOT NULL,
      metadata_json TEXT NOT NULL DEFAULT '{}',
      created_at TEXT NOT NULL,
      FOREIGN KEY(conversation_id) REFERENCES conversations(id)
    )`),
    db.prepare(`CREATE TABLE IF NOT EXISTS conversation_events (
      id TEXT PRIMARY KEY,
      conversation_id TEXT NOT NULL,
      event_type TEXT NOT NULL,
      actor_role TEXT NOT NULL,
      actor_id TEXT NOT NULL DEFAULT '',
      detail_json TEXT NOT NULL DEFAULT '{}',
      created_at TEXT NOT NULL,
      FOREIGN KEY(conversation_id) REFERENCES conversations(id)
    )`),
    db.prepare(`CREATE TABLE IF NOT EXISTS conversation_channel_links (
      id TEXT PRIMARY KEY,
      conversation_id TEXT NOT NULL,
      channel TEXT NOT NULL,
      external_thread_id TEXT NOT NULL DEFAULT '',
      status TEXT NOT NULL DEFAULT 'pending',
      metadata_json TEXT NOT NULL DEFAULT '{}',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      UNIQUE(conversation_id, channel),
      FOREIGN KEY(conversation_id) REFERENCES conversations(id)
    )`),
    db.prepare('CREATE INDEX IF NOT EXISTS idx_conversations_user ON conversations(tenant_id, user_id, updated_at DESC)'),
    db.prepare('CREATE INDEX IF NOT EXISTS idx_conversations_inbox ON conversations(status, priority, updated_at DESC)'),
    db.prepare('CREATE INDEX IF NOT EXISTS idx_conversation_messages_thread ON conversation_messages(conversation_id, created_at ASC)'),
    db.prepare('CREATE INDEX IF NOT EXISTS idx_conversation_events_thread ON conversation_events(conversation_id, created_at DESC)'),
  ]);
}

async function customerPrincipal(request, db) {
  const authorization = request.headers.get('authorization') || '';
  if (!authorization.startsWith('Bearer ')) return null;
  const tokenHash = await sha256(authorization.slice(7));
  const now = new Date().toISOString();
  try {
    return await db.prepare(`SELECT
        u.id AS user_id, u.email, u.display_name,
        t.id AS tenant_id, t.slug AS tenant_slug, t.name AS tenant_name,
        m.role, s.expires_at
      FROM customer_sessions s
      JOIN customer_users u ON u.id = s.user_id
      JOIN customer_tenants t ON t.id = s.tenant_id
      JOIN customer_memberships m ON m.user_id = u.id AND m.tenant_id = t.id
      WHERE s.token_hash = ? AND s.expires_at > ?
        AND u.status = 'active' AND t.status = 'active' AND m.status = 'active'`)
      .bind(tokenHash, now).first();
  } catch {
    return null;
  }
}

async function adminPrincipal(request, env) {
  const url = new URL(request.url);
  url.pathname = '/api/session';
  url.search = '';
  const response = await authWorker.fetch(new Request(url.toString(), { method: 'GET', headers: request.headers }), env);
  if (!response.ok) return null;
  const data = await response.json();
  if (!data?.email) return null;
  return data;
}

async function adminId(db, admin) {
  if (admin?.id) return Number(admin.id) || null;
  if (!admin?.email) return null;
  const row = await db.prepare('SELECT id FROM admins WHERE email = ?').bind(admin.email).first();
  return row?.id || null;
}

async function event(db, conversationId, eventType, actorRole, actorId = '', detail = {}) {
  await db.prepare(`INSERT INTO conversation_events
    (id, conversation_id, event_type, actor_role, actor_id, detail_json, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)`)
    .bind(id('e'), conversationId, eventType, actorRole, String(actorId || ''), JSON.stringify(detail || {}), new Date().toISOString()).run();
}

async function insertMessage(db, conversationId, role, senderId, channel, body, metadata = {}) {
  const messageId = id('m');
  const createdAt = new Date().toISOString();
  await db.prepare(`INSERT INTO conversation_messages
    (id, conversation_id, sender_role, sender_id, channel, body, metadata_json, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)`)
    .bind(messageId, conversationId, role, String(senderId || ''), channel, body, JSON.stringify(metadata || {}), createdAt).run();
  return { id: messageId, role, channel, body, createdAt, metadata };
}

function normalizeInput(body) {
  const message = String(body?.message || '').trim().slice(0, MAX_MESSAGE_LENGTH);
  const serviceId = String(body?.serviceId || 'ekodi').trim().slice(0, MAX_SERVICE_LENGTH) || 'ekodi';
  const subject = String(body?.subject || '').trim().slice(0, MAX_SUBJECT_LENGTH);
  const requestedChannel = String(body?.channel || 'web').toLowerCase();
  const channel = ['web', 'kakao', 'whatsapp', 'telegram', 'email', 'sms'].includes(requestedChannel) ? requestedChannel : 'web';
  return { message, serviceId, subject, channel };
}

function providerAdapters(env, context) {
  const providers = [];
  if (env.CONVERSATION_AI && typeof env.CONVERSATION_AI.fetch === 'function') {
    providers.push({
      id: 'conversation_ai_binding',
      invoke: async () => {
        const response = await env.CONVERSATION_AI.fetch('https://ekodi.internal/respond', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(context),
        });
        if (!response.ok) throw new Error('CONVERSATION_AI_BINDING_FAILED');
        const data = await response.json();
        const text = String(data?.reply || data?.message || '').trim();
        if (!text) throw new Error('CONVERSATION_AI_EMPTY_REPLY');
        return { reply: text.slice(0, MAX_MESSAGE_LENGTH) };
      },
    });
  }
  if (env.CONVERSATION_AI_URL) {
    providers.push({
      id: 'conversation_ai_http',
      invoke: async () => {
        const response = await fetch(String(env.CONVERSATION_AI_URL), {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            ...(env.CONVERSATION_AI_TOKEN ? { authorization: `Bearer ${env.CONVERSATION_AI_TOKEN}` } : {}),
          },
          body: JSON.stringify(context),
        });
        if (!response.ok) throw new Error('CONVERSATION_AI_HTTP_FAILED');
        const data = await response.json();
        const text = String(data?.reply || data?.message || '').trim();
        if (!text) throw new Error('CONVERSATION_AI_EMPTY_REPLY');
        return { reply: text.slice(0, MAX_MESSAGE_LENGTH) };
      },
    });
  }
  return providers;
}

async function generateReply(env, context, triage) {
  return runAiEnhancedTask({
    env,
    providers: providerAdapters(env, context),
    taskName: 'conversation_reply',
    timeoutMs: 4000,
    fallback: async () => ({ reply: buildFreeAssistReply({ triage, service: context.serviceId }) }),
  });
}

function conversationView(row) {
  return {
    id: row.id,
    serviceId: row.service_id,
    subject: row.subject || '',
    status: row.status,
    priority: row.priority,
    lastChannel: row.last_channel || 'web',
    lastMessageAt: row.last_message_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    ...(row.user_email !== undefined ? { user: { email: row.user_email || '', name: row.user_name || '', tenant: row.tenant_slug || '' } } : {}),
    ...(row.assigned_admin_id !== undefined ? { assignedAdminId: row.assigned_admin_id || null } : {}),
  };
}

function messageView(row) {
  let metadata = {};
  try { metadata = JSON.parse(row.metadata_json || '{}'); } catch {}
  return { id: row.id, role: row.sender_role, channel: row.channel, body: row.body, createdAt: row.created_at, metadata };
}

async function createConversation(request, env, principal) {
  const input = normalizeInput(await readJson(request));
  if (!input.message) return json({ error: '메시지를 입력해 주세요.' }, 400, request, env);
  const now = new Date().toISOString();
  const conversationId = id('c');
  const triage = classifyConversationMessage(input.message);
  const status = triage.requiresHuman ? CONVERSATION_STATES.REVIEW : CONVERSATION_STATES.AI;
  await env.DB.prepare(`INSERT INTO conversations
    (id, tenant_id, tenant_slug, user_id, user_email, user_name, service_id, subject, status, priority,
      last_channel, last_message_at, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
    .bind(conversationId, principal.tenant_id, principal.tenant_slug || '', principal.user_id, principal.email || '',
      principal.display_name || '', input.serviceId, input.subject, status, triage.priority,
      input.channel, now, now, now).run();
  const userMessage = await insertMessage(env.DB, conversationId, 'user', principal.user_id, input.channel, input.message, { triage });
  await event(env.DB, conversationId, 'conversation.created', 'user', principal.user_id, { serviceId: input.serviceId, triage });
  if (triage.requiresHuman) await event(env.DB, conversationId, 'human.review_requested', 'system', '', { reasons: triage.reasons });
  const ai = await generateReply(env, { conversationId, serviceId: input.serviceId, message: input.message, triage }, triage);
  const aiText = String(ai.value?.reply || buildFreeAssistReply({ triage, service: input.serviceId })).slice(0, MAX_MESSAGE_LENGTH);
  const aiMessage = await insertMessage(env.DB, conversationId, 'ai', ai.provider || ai.mode, 'web', aiText, {
    mode: ai.mode, degraded: Boolean(ai.degraded), provider: ai.provider || null, notice: ai.notice || '',
  });
  await env.DB.prepare('UPDATE conversations SET last_message_at = ?, updated_at = ? WHERE id = ?').bind(aiMessage.createdAt, aiMessage.createdAt, conversationId).run();
  return json({ conversation: { id: conversationId, status, priority: triage.priority, serviceId: input.serviceId }, messages: [userMessage, aiMessage], ai: { mode: ai.mode, degraded: Boolean(ai.degraded), notice: ai.notice || '' } }, 201, request, env);
}

async function appendCustomerMessage(request, env, principal, conversationId) {
  const conversation = await env.DB.prepare('SELECT * FROM conversations WHERE id = ? AND tenant_id = ? AND user_id = ?').bind(conversationId, principal.tenant_id, principal.user_id).first();
  if (!conversation) return json({ error: '대화를 찾을 수 없습니다.' }, 404, request, env);
  if (conversation.status === CONVERSATION_STATES.CLOSED) return json({ error: '종료된 대화입니다.' }, 409, request, env);
  const input = normalizeInput(await readJson(request));
  if (!input.message) return json({ error: '메시지를 입력해 주세요.' }, 400, request, env);
  const triage = classifyConversationMessage(input.message);
  const nextStatus = conversation.status === CONVERSATION_STATES.HUMAN
    ? CONVERSATION_STATES.HUMAN
    : triage.requiresHuman ? CONVERSATION_STATES.REVIEW : conversation.status;
  const nextPriority = conversation.priority === 'urgent' || triage.priority === 'urgent'
    ? 'urgent' : conversation.priority === 'review' || triage.priority === 'review' ? 'review' : 'normal';
  const userMessage = await insertMessage(env.DB, conversationId, 'user', principal.user_id, input.channel, input.message, { triage });
  await env.DB.prepare('UPDATE conversations SET status = ?, priority = ?, last_channel = ?, last_message_at = ?, updated_at = ? WHERE id = ?')
    .bind(nextStatus, nextPriority, input.channel, userMessage.createdAt, userMessage.createdAt, conversationId).run();
  if (triage.requiresHuman && conversation.status !== CONVERSATION_STATES.HUMAN) await event(env.DB, conversationId, 'human.review_requested', 'system', '', { reasons: triage.reasons });
  if (nextStatus === CONVERSATION_STATES.HUMAN) return json({ conversation: { id: conversationId, status: nextStatus, priority: nextPriority }, messages: [userMessage], humanActive: true }, 200, request, env);
  const ai = await generateReply(env, { conversationId, serviceId: conversation.service_id, message: input.message, triage }, triage);
  const aiText = String(ai.value?.reply || buildFreeAssistReply({ triage, service: conversation.service_id })).slice(0, MAX_MESSAGE_LENGTH);
  const aiMessage = await insertMessage(env.DB, conversationId, 'ai', ai.provider || ai.mode, 'web', aiText, { mode: ai.mode, degraded: Boolean(ai.degraded), provider: ai.provider || null, notice: ai.notice || '' });
  await env.DB.prepare('UPDATE conversations SET last_message_at = ?, updated_at = ? WHERE id = ?').bind(aiMessage.createdAt, aiMessage.createdAt, conversationId).run();
  return json({ conversation: { id: conversationId, status: nextStatus, priority: nextPriority }, messages: [userMessage, aiMessage], ai: { mode: ai.mode, degraded: Boolean(ai.degraded), notice: ai.notice || '' } }, 200, request, env);
}

async function customerThread(request, env, principal, conversationId) {
  const conversation = await env.DB.prepare(`SELECT id, service_id, subject, status, priority, last_channel, last_message_at, created_at, updated_at
    FROM conversations WHERE id = ? AND tenant_id = ? AND user_id = ?`).bind(conversationId, principal.tenant_id, principal.user_id).first();
  if (!conversation) return json({ error: '대화를 찾을 수 없습니다.' }, 404, request, env);
  const rows = await env.DB.prepare(`SELECT id, sender_role, channel, body, metadata_json, created_at
    FROM conversation_messages WHERE conversation_id = ? ORDER BY created_at ASC LIMIT 300`).bind(conversationId).all();
  return json({ conversation: conversationView(conversation), messages: rows.results.map(messageView) }, 200, request, env);
}

async function listCustomer(request, env, principal) {
  const rows = await env.DB.prepare(`SELECT id, service_id, subject, status, priority, last_channel, last_message_at, created_at, updated_at
    FROM conversations WHERE tenant_id = ? AND user_id = ? ORDER BY updated_at DESC LIMIT 50`).bind(principal.tenant_id, principal.user_id).all();
  return json({ conversations: rows.results.map(conversationView) }, 200, request, env);
}

async function adminInbox(request, env) {
  const includeAll = new URL(request.url).searchParams.get('all') === '1';
  const where = includeAll ? '' : `WHERE status IN ('human_review','human_active') OR priority IN ('review','urgent')`;
  const rows = await env.DB.prepare(`SELECT id, tenant_slug, user_email, user_name, service_id, subject, status, priority,
      assigned_admin_id, last_channel, last_message_at, created_at, updated_at
    FROM conversations ${where}
    ORDER BY CASE priority WHEN 'urgent' THEN 0 WHEN 'review' THEN 1 ELSE 2 END, updated_at DESC LIMIT 100`).all();
  return json({ inbox: rows.results.map(conversationView), filtered: !includeAll }, 200, request, env);
}

async function adminThread(request, env, conversationId) {
  const conversation = await env.DB.prepare('SELECT * FROM conversations WHERE id = ?').bind(conversationId).first();
  if (!conversation) return json({ error: '대화를 찾을 수 없습니다.' }, 404, request, env);
  const messages = await env.DB.prepare(`SELECT id, sender_role, channel, body, metadata_json, created_at FROM conversation_messages
    WHERE conversation_id = ? ORDER BY created_at ASC LIMIT 500`).bind(conversationId).all();
  const events = await env.DB.prepare(`SELECT event_type, actor_role, actor_id, detail_json, created_at FROM conversation_events
    WHERE conversation_id = ? ORDER BY created_at DESC LIMIT 100`).bind(conversationId).all();
  return json({ conversation: conversationView(conversation), messages: messages.results.map(messageView), events: events.results.map(row => {
    let detail = {}; try { detail = JSON.parse(row.detail_json || '{}'); } catch {}
    return { type: row.event_type, actorRole: row.actor_role, actorId: row.actor_id, detail, createdAt: row.created_at };
  }) }, 200, request, env);
}

async function takeover(request, env, admin, conversationId) {
  const conversation = await env.DB.prepare('SELECT id, status FROM conversations WHERE id = ?').bind(conversationId).first();
  if (!conversation) return json({ error: '대화를 찾을 수 없습니다.' }, 404, request, env);
  if (conversation.status === CONVERSATION_STATES.CLOSED) return json({ error: '종료된 대화입니다.' }, 409, request, env);
  const actorId = await adminId(env.DB, admin);
  const now = new Date().toISOString();
  await env.DB.prepare('UPDATE conversations SET status = ?, assigned_admin_id = ?, updated_at = ? WHERE id = ?').bind(CONVERSATION_STATES.HUMAN, actorId, now, conversationId).run();
  await event(env.DB, conversationId, 'human.takeover', 'admin', actorId, { email: admin.email || '' });
  return json({ ok: true, conversation: { id: conversationId, status: CONVERSATION_STATES.HUMAN, assignedAdminId: actorId } }, 200, request, env);
}

async function adminReply(request, env, admin, conversationId) {
  const conversation = await env.DB.prepare('SELECT id, status, last_channel FROM conversations WHERE id = ?').bind(conversationId).first();
  if (!conversation) return json({ error: '대화를 찾을 수 없습니다.' }, 404, request, env);
  if (conversation.status === CONVERSATION_STATES.CLOSED) return json({ error: '종료된 대화입니다.' }, 409, request, env);
  const body = await readJson(request);
  const text = String(body?.message || '').trim().slice(0, MAX_MESSAGE_LENGTH);
  if (!text) return json({ error: '메시지를 입력해 주세요.' }, 400, request, env);
  const actorId = await adminId(env.DB, admin);
  if (conversation.status !== CONVERSATION_STATES.HUMAN) {
    await env.DB.prepare('UPDATE conversations SET status = ?, assigned_admin_id = ? WHERE id = ?').bind(CONVERSATION_STATES.HUMAN, actorId, conversationId).run();
    await event(env.DB, conversationId, 'human.takeover', 'admin', actorId, { implicit: true, email: admin.email || '' });
  }
  const channel = ['web', 'kakao', 'whatsapp', 'telegram', 'email', 'sms'].includes(String(body?.channel || '').toLowerCase())
    ? String(body.channel).toLowerCase() : conversation.last_channel || 'web';
  const message = await insertMessage(env.DB, conversationId, 'admin', actorId, channel, text, {});
  await env.DB.prepare('UPDATE conversations SET last_message_at = ?, updated_at = ? WHERE id = ?').bind(message.createdAt, message.createdAt, conversationId).run();
  await event(env.DB, conversationId, 'admin.reply', 'admin', actorId, { channel: message.channel });
  return json({ ok: true, message, conversation: { id: conversationId, status: CONVERSATION_STATES.HUMAN } }, 200, request, env);
}

async function releaseToAi(request, env, admin, conversationId) {
  const conversation = await env.DB.prepare('SELECT id FROM conversations WHERE id = ?').bind(conversationId).first();
  if (!conversation) return json({ error: '대화를 찾을 수 없습니다.' }, 404, request, env);
  const actorId = await adminId(env.DB, admin);
  const now = new Date().toISOString();
  await env.DB.prepare("UPDATE conversations SET status = ?, priority = 'normal', assigned_admin_id = NULL, updated_at = ? WHERE id = ?")
    .bind(CONVERSATION_STATES.AI, now, conversationId).run();
  await event(env.DB, conversationId, 'human.release_to_ai', 'admin', actorId, { email: admin.email || '' });
  return json({ ok: true, conversation: { id: conversationId, status: CONVERSATION_STATES.AI, priority: 'normal' } }, 200, request, env);
}

async function closeConversation(request, env, admin, conversationId) {
  const conversation = await env.DB.prepare('SELECT id FROM conversations WHERE id = ?').bind(conversationId).first();
  if (!conversation) return json({ error: '대화를 찾을 수 없습니다.' }, 404, request, env);
  const actorId = await adminId(env.DB, admin);
  const now = new Date().toISOString();
  await env.DB.prepare('UPDATE conversations SET status = ?, updated_at = ? WHERE id = ?').bind(CONVERSATION_STATES.CLOSED, now, conversationId).run();
  await event(env.DB, conversationId, 'conversation.closed', 'admin', actorId, {});
  return json({ ok: true, conversation: { id: conversationId, status: CONVERSATION_STATES.CLOSED } }, 200, request, env);
}

async function channelLink(request, env, admin, conversationId) {
  const conversation = await env.DB.prepare('SELECT id FROM conversations WHERE id = ?').bind(conversationId).first();
  if (!conversation) return json({ error: '대화를 찾을 수 없습니다.' }, 404, request, env);
  const body = await readJson(request);
  const channel = String(body?.channel || '').trim().toLowerCase();
  if (!['kakao', 'whatsapp', 'telegram', 'email', 'sms'].includes(channel)) return json({ error: '지원하지 않는 외부 채널입니다.' }, 400, request, env);
  const now = new Date().toISOString();
  const externalThreadId = String(body?.externalThreadId || '').trim().slice(0, 200);
  await env.DB.prepare(`INSERT INTO conversation_channel_links
    (id, conversation_id, channel, external_thread_id, status, metadata_json, created_at, updated_at)
    VALUES (?, ?, ?, ?, 'pending', ?, ?, ?)
    ON CONFLICT(conversation_id, channel) DO UPDATE SET external_thread_id=excluded.external_thread_id,
      status='pending', metadata_json=excluded.metadata_json, updated_at=excluded.updated_at`)
    .bind(id('link'), conversationId, channel, externalThreadId, JSON.stringify(body?.metadata || {}), now, now).run();
  const actorId = await adminId(env.DB, admin);
  await event(env.DB, conversationId, 'channel.link_requested', 'admin', actorId, { channel, externalThreadId });
  return json({ ok: true, adapter: { channel, status: 'pending', externalThreadId } }, 202, request, env);
}

export async function handleConversationControl(request, env) {
  const path = new URL(request.url).pathname;
  if (!path.startsWith('/api/conversations') && !path.startsWith('/api/control/conversations')) return null;
  if (!env.DB) return json({ error: '데이터베이스 연결이 설정되지 않았습니다.' }, 503, request, env);
  const origin = request.headers.get('origin') || '';
  if (origin && !isAllowedOrigin(origin, env)) return json({ error: '허용되지 않은 요청입니다.' }, 403, request, env);
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors(request, env) });
  await ensureSchema(env.DB);

  if (path.startsWith('/api/control/conversations')) {
    const admin = await adminPrincipal(request, env);
    if (!admin) return json({ error: 'EKODI 관리자 인증이 필요합니다.' }, 401, request, env);
    if (request.method === 'GET' && path === '/api/control/conversations/inbox') return adminInbox(request, env);
    const match = path.match(/^\/api\/control\/conversations\/([^/]+)(?:\/(takeover|reply|release|close|channel-link))?$/);
    if (!match) return json({ error: 'Conversation Control endpoint not found' }, 404, request, env);
    const conversationId = decodeURIComponent(match[1]);
    const action = match[2] || '';
    if (request.method === 'GET' && !action) return adminThread(request, env, conversationId);
    if (request.method === 'POST' && action === 'takeover') return takeover(request, env, admin, conversationId);
    if (request.method === 'POST' && action === 'reply') return adminReply(request, env, admin, conversationId);
    if (request.method === 'POST' && action === 'release') return releaseToAi(request, env, admin, conversationId);
    if (request.method === 'POST' && action === 'close') return closeConversation(request, env, admin, conversationId);
    if (request.method === 'POST' && action === 'channel-link') return channelLink(request, env, admin, conversationId);
    return json({ error: 'Conversation Control endpoint not found' }, 404, request, env);
  }

  const principal = await customerPrincipal(request, env.DB);
  if (!principal) return json({ error: '인증된 EKODI 사용자만 대화를 사용할 수 있습니다.' }, 401, request, env);
  if (request.method === 'GET' && path === '/api/conversations') return listCustomer(request, env, principal);
  if (request.method === 'POST' && path === '/api/conversations') return createConversation(request, env, principal);
  const match = path.match(/^\/api\/conversations\/([^/]+)(?:\/messages)?$/);
  if (!match) return json({ error: 'Conversation endpoint not found' }, 404, request, env);
  const conversationId = decodeURIComponent(match[1]);
  if (request.method === 'GET') return customerThread(request, env, principal, conversationId);
  if (request.method === 'POST') return appendCustomerMessage(request, env, principal, conversationId);
  return json({ error: 'Conversation endpoint not found' }, 404, request, env);
}
