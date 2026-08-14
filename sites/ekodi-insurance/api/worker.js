const DEFAULT_ORIGINS = [
  'https://ins.ekodi.kr',
  'https://ekodi-insurance-staging.topmaster-joseph.workers.dev'
];
const VALID_STATUS = new Set(['new', 'reviewing', 'contacted', 'closed']);
const enc = new TextEncoder();
const dec = new TextDecoder();

function clean(value, max = 500) {
  return String(value ?? '').trim().slice(0, max);
}
function origins(env) {
  const configured = clean(env.ALLOWED_ORIGINS, 1200).split(',').map(v => v.trim()).filter(Boolean);
  return new Set(configured.length ? configured : DEFAULT_ORIGINS);
}
function responseHeaders(origin, env) {
  const headers = new Headers({
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
    'x-content-type-options': 'nosniff',
    'referrer-policy': 'no-referrer',
    'access-control-allow-headers': 'authorization, content-type, x-ekodi-insurance-internal-token, x-ekodi-actor',
    'access-control-allow-methods': 'GET, POST, PATCH, OPTIONS',
    'access-control-max-age': '86400',
    vary: 'Origin'
  });
  if (origin && origins(env).has(origin)) headers.set('access-control-allow-origin', origin);
  return headers;
}
function json(data, status, origin, env) {
  return new Response(JSON.stringify(data), { status, headers: responseHeaders(origin, env) });
}
async function readJson(request) {
  try { return await request.json(); } catch { return null; }
}
function bytesToB64(bytes) {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}
function b64ToBytes(value) {
  const binary = atob(value);
  return Uint8Array.from(binary, c => c.charCodeAt(0));
}
async function sha256(value) {
  return bytesToB64(new Uint8Array(await crypto.subtle.digest('SHA-256', enc.encode(String(value)))));
}
async function dataKey(env) {
  const raw = clean(env.INSURANCE_DATA_KEY, 200);
  if (!raw) return null;
  let bytes;
  try { bytes = b64ToBytes(raw); } catch { return null; }
  if (bytes.byteLength !== 32) return null;
  return crypto.subtle.importKey('raw', bytes, 'AES-GCM', false, ['encrypt', 'decrypt']);
}
async function encryptText(env, value) {
  const key = await dataKey(env);
  if (!key) throw new Error('ENCRYPTION_KEY_NOT_CONFIGURED');
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ciphertext = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, enc.encode(String(value))));
  return `v1.${bytesToB64(iv)}.${bytesToB64(ciphertext)}`;
}
async function decryptText(env, payload) {
  const key = await dataKey(env);
  if (!key) throw new Error('ENCRYPTION_KEY_NOT_CONFIGURED');
  const parts = String(payload || '').split('.');
  if (parts.length !== 3 || parts[0] !== 'v1') throw new Error('INVALID_CIPHERTEXT');
  const plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: b64ToBytes(parts[1]) }, key, b64ToBytes(parts[2]));
  return dec.decode(plain);
}
function safeEqual(a, b) {
  const aa = enc.encode(String(a || ''));
  const bb = enc.encode(String(b || ''));
  if (!aa.length || aa.length !== bb.length) return false;
  let diff = 0;
  for (let i = 0; i < aa.length; i += 1) diff |= aa[i] ^ bb[i];
  return diff === 0;
}
function redact(text) {
  return clean(text, 1600)
    .replace(/\b\d{6}-?[1-4]\d{6}\b/g, '[고유식별정보 가림]')
    .replace(/\b01[016789][-. ]?\d{3,4}[-. ]?\d{4}\b/g, '[연락처 가림]')
    .replace(/\b(?:\d[ -]*?){13,19}\b/g, '[번호정보 가림]');
}
function normalizeMessages(value) {
  if (!Array.isArray(value)) return [];
  return value.slice(-20).map(item => ({
    role: item?.role === 'assistant' ? 'assistant' : 'user',
    content: redact(item?.content || item?.text || '')
  })).filter(item => item.content);
}
function consultationSummary(messages, topic = '') {
  const text = `${topic} ${messages.map(m => m.content).join(' ')}`;
  if (/청구|병원비|진료|입원|수술/.test(text)) return '보험금 청구 준비 관련 상담';
  if (/보험료|부담|해지|유지/.test(text)) return '보험료 유지부담 및 기존계약 점검 상담';
  if (/보장|중복|갱신|보험.*점검/.test(text)) return '기존 보험 보장구조 점검 상담';
  if (/설계사|가입|상품/.test(text)) return '보험 가입·설계사 연결 전 확인 상담';
  return '일반 보험관리 상담';
}
function freeGuidanceReply(messages) {
  const last = messages.filter(m => m.role === 'user').at(-1)?.content || '';
  if (!last) return '보험에 대해 궁금한 내용을 적어 주세요. 주민번호, 상세 병명, 계좌번호 같은 불필요한 민감정보는 입력하지 않는 것이 좋습니다.';
  if (/청구|병원비|진료|입원|수술/.test(last)) return '먼저 어떤 보험에 가입되어 있는지와 사고·진료 유형을 확인하고, 해당 보험사의 공식 청구채널에서 필요서류를 다시 확인하는 순서가 좋습니다. 여기서는 보험금 지급 여부를 확정하지 않습니다. 원하시면 현재 상황에서 확인할 항목을 하나씩 정리해 드릴게요.';
  if (/보험료|부담|해지|유지/.test(last)) return '보험료가 부담될 때는 새 상품을 먼저 찾기보다 기존 계약의 보장, 갱신 여부, 중복 가능성, 해지 시 불이익을 차례로 확인하는 편이 안전합니다. 월 보험료와 보험 개수 정도만 알려주시면 민감정보 없이 점검 순서를 정리할 수 있습니다.';
  if (/보장|중복|점검|보험.*몇|가입.*보험/.test(last)) return '기존 보험 점검은 보험 개수보다 각 계약의 주요 보장, 갱신 조건, 월 유지비, 가족 상황을 함께 보는 것이 중요합니다. 특정 상품 추천 없이 현재 계약에서 먼저 확인할 항목을 정리해 드릴 수 있습니다.';
  if (/설계사|전화|연락|사람/.test(last)) return 'AI 상담으로 충분하지 않다면 실제 설계사 전화상담을 요청할 수 있습니다. 그때만 연락처와 공유에 동의한 상담내용을 암호화해 상담대기열에 저장합니다. 원하실 때 “설계사 연결 요청”을 선택해 주세요.';
  return '말씀하신 내용을 기준으로 먼저 현재 보험을 이해하고 확인할 항목을 정리하는 것이 좋습니다. 특정 상품을 바로 권하기보다 기존 계약, 보험료 부담, 가족 상황, 청구 필요 여부 중 무엇이 가장 궁금한지 알려주시면 그 부분부터 좁혀 보겠습니다.';
}
async function authenticate(request, env) {
  const authorization = request.headers.get('authorization') || '';
  if (!authorization.startsWith('Bearer ')) return null;
  if (!env.SUPABASE_URL || !env.SUPABASE_PUBLISHABLE_KEY) return null;
  const res = await fetch(`${String(env.SUPABASE_URL).replace(/\/$/, '')}/auth/v1/user`, {
    headers: { apikey: env.SUPABASE_PUBLISHABLE_KEY, authorization }
  });
  if (!res.ok) return null;
  const user = await res.json().catch(() => null);
  return user?.id ? user : null;
}
async function schemaReady(env) {
  if (!env.DB) return false;
  try {
    const rows = await env.DB.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name IN ('consultation_requests','consultation_audit_events','request_rate_limits')").all();
    return new Set((rows.results || []).map(r => r.name)).size === 3;
  } catch { return false; }
}
async function fingerprint(request, env) {
  const ip = request.headers.get('cf-connecting-ip') || 'unknown';
  const agent = request.headers.get('user-agent') || '';
  return sha256(`${env.RATE_LIMIT_SALT || 'ekodi-insurance'}|${ip}|${agent.slice(0,120)}`);
}
async function allowRequest(request, env, limit = 6) {
  const fp = await fingerprint(request, env);
  const bucket = new Date().toISOString().slice(0, 13);
  const now = new Date().toISOString();
  await env.DB.prepare(`INSERT INTO request_rate_limits(fingerprint,bucket,request_count,updated_at) VALUES (?,?,1,?)
    ON CONFLICT(fingerprint,bucket) DO UPDATE SET request_count=request_count+1,updated_at=excluded.updated_at`).bind(fp, bucket, now).run();
  const row = await env.DB.prepare('SELECT request_count FROM request_rate_limits WHERE fingerprint=? AND bucket=?').bind(fp, bucket).first();
  return Number(row?.request_count || 0) <= limit;
}
async function audit(env, consultationId, actorType, actorId, action, detail = '') {
  await env.DB.prepare(`INSERT INTO consultation_audit_events(id,consultation_id,actor_type,actor_id,action,detail,created_at)
    VALUES (?,?,?,?,?,?,?)`).bind(`aud_${crypto.randomUUID()}`, consultationId, actorType, clean(actorId, 240), clean(action, 80), clean(detail, 500), new Date().toISOString()).run();
}
function contactHint(value) {
  const text = clean(value, 160);
  if (text.includes('@')) {
    const [name, domain] = text.split('@');
    return `${name.slice(0,2)}***@${domain || ''}`;
  }
  const digits = text.replace(/\D/g, '');
  return digits.length >= 4 ? `***-***-${digits.slice(-4)}` : '연락처 등록됨';
}
async function createConsultation(request, env) {
  if (!(await allowRequest(request, env, 6))) return { status: 429, body: { error: '상담요청이 너무 많습니다. 잠시 후 다시 시도해 주세요.' } };
  const body = await readJson(request);
  if (!body || body.shareConsent !== true) return { status: 400, body: { error: '설계사 연결 및 상담내용 공유에 대한 명시적 동의가 필요합니다.' } };
  const name = clean(body.name, 80);
  const contact = clean(body.contact, 160);
  if (!name || contact.length < 4) return { status: 400, body: { error: '이름과 연락처를 확인해 주세요.' } };
  const authorization = request.headers.get('authorization') || '';
  const user = authorization ? await authenticate(request, env) : null;
  if (authorization && !user) return { status: 401, body: { error: '로그인 정보를 확인해 주세요.' } };
  const messages = normalizeMessages(body.messages);
  const id = `con_${crypto.randomUUID()}`;
  const accessToken = `ic_${crypto.randomUUID().replaceAll('-', '')}${crypto.randomUUID().replaceAll('-', '')}`;
  const now = new Date().toISOString();
  const transcriptShared = body.shareTranscript !== false && messages.length > 0;
  const transcriptCiphertext = transcriptShared ? await encryptText(env, JSON.stringify(messages)) : null;
  const contactCiphertext = await encryptText(env, contact);
  const summary = consultationSummary(messages, redact(body.topic || ''));
  await env.DB.prepare(`INSERT INTO consultation_requests
    (id,user_id,contact_name,contact_ciphertext,contact_hint,preferred_time,ai_summary,transcript_ciphertext,transcript_shared,status,access_token_hash,created_at,updated_at)
    VALUES (?,?,?,?,?,?,?,?,?,'new',?,?,?)`).bind(
      id, user?.id || null, name, contactCiphertext, contactHint(contact), clean(body.preferredTime, 120), summary,
      transcriptCiphertext, transcriptShared ? 1 : 0, await sha256(accessToken), now, now
    ).run();
  await audit(env, id, 'customer', user?.id || 'anonymous', 'consultation.created', transcriptShared ? 'transcript-shared' : 'summary-only');
  return { status: 201, body: { consultation: { id, status: 'new', summary, createdAt: now }, accessToken } };
}
async function revokeConsultation(id, request, env) {
  const body = await readJson(request);
  const token = clean(body?.accessToken, 240);
  if (!token) return { status: 400, body: { error: '상담요청 취소 토큰이 필요합니다.' } };
  const row = await env.DB.prepare('SELECT access_token_hash,status FROM consultation_requests WHERE id=?').bind(id).first();
  if (!row) return { status: 404, body: { error: '상담요청을 찾을 수 없습니다.' } };
  if (!safeEqual(row.access_token_hash, await sha256(token))) return { status: 403, body: { error: '상담요청 취소 권한이 없습니다.' } };
  const now = new Date().toISOString();
  await env.DB.prepare(`UPDATE consultation_requests SET status='revoked',contact_ciphertext='',transcript_ciphertext=NULL,transcript_shared=0,updated_at=?,revoked_at=? WHERE id=?`).bind(now, now, id).run();
  await audit(env, id, 'customer', 'token-holder', 'consultation.revoked', 'encrypted contact and transcript removed');
  return { status: 200, body: { consultation: { id, status: 'revoked', revokedAt: now } } };
}
function internalAuthorized(request, env) {
  return safeEqual(request.headers.get('x-ekodi-insurance-internal-token'), env.INSURANCE_INTERNAL_TOKEN);
}
async function listConsultations(url, env) {
  const status = clean(url.searchParams.get('status'), 20);
  const limit = Math.max(1, Math.min(100, Math.trunc(Number(url.searchParams.get('limit')) || 50)));
  const where = VALID_STATUS.has(status) ? 'WHERE status=?' : "WHERE status!='revoked'";
  const statement = env.DB.prepare(`SELECT id,contact_name AS name,contact_hint AS contactHint,preferred_time AS preferredTime,ai_summary AS summary,status,transcript_shared AS transcriptShared,created_at AS createdAt,updated_at AS updatedAt FROM consultation_requests ${where} ORDER BY created_at DESC LIMIT ?`);
  const rows = VALID_STATUS.has(status) ? await statement.bind(status, limit).all() : await statement.bind(limit).all();
  return { consultations: (rows.results || []).map(r => ({ ...r, transcriptShared: Boolean(r.transcriptShared) })) };
}
async function consultationDetail(id, request, env) {
  const row = await env.DB.prepare('SELECT * FROM consultation_requests WHERE id=?').bind(id).first();
  if (!row || row.status === 'revoked') return null;
  const actor = clean(request.headers.get('x-ekodi-actor'), 240) || 'central-admin';
  const contact = await decryptText(env, row.contact_ciphertext);
  let transcript = [];
  if (row.transcript_shared && row.transcript_ciphertext) {
    try { transcript = JSON.parse(await decryptText(env, row.transcript_ciphertext)); } catch { transcript = []; }
  }
  await audit(env, id, 'admin', actor, 'admin.consultation.viewed', row.transcript_shared ? 'contact+shared-transcript' : 'contact-only');
  return { id: row.id, name: row.contact_name, contact, preferredTime: row.preferred_time, summary: row.ai_summary, status: row.status, transcript, createdAt: row.created_at, updatedAt: row.updated_at };
}
async function updateStatus(id, request, env) {
  const body = await readJson(request);
  const status = clean(body?.status, 20);
  if (!VALID_STATUS.has(status)) return { status: 400, body: { error: '상담 상태를 확인해 주세요.' } };
  const existing = await env.DB.prepare("SELECT id FROM consultation_requests WHERE id=? AND status!='revoked'").bind(id).first();
  if (!existing) return { status: 404, body: { error: '상담요청을 찾을 수 없습니다.' } };
  const now = new Date().toISOString();
  await env.DB.prepare('UPDATE consultation_requests SET status=?,updated_at=? WHERE id=?').bind(status, now, id).run();
  await audit(env, id, 'admin', clean(request.headers.get('x-ekodi-actor'), 240) || 'central-admin', 'admin.consultation.status_changed', status);
  return { status: 200, body: { consultation: { id, status, updatedAt: now } } };
}

export default {
  async fetch(request, env) {
    const origin = request.headers.get('origin') || '';
    if (origin && !origins(env).has(origin)) return json({ error: '허용되지 않은 요청입니다.' }, 403, origin, env);
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: responseHeaders(origin, env) });
    const url = new URL(request.url);

    if (request.method === 'GET' && url.pathname === '/health') {
      const dbReady = await schemaReady(env);
      const encryptionReady = Boolean(await dataKey(env));
      return json({
        ok: dbReady,
        service: 'ekodi-insurance-api',
        environment: env.ENVIRONMENT || 'unknown',
        architecture: 'cloudflare-worker-d1',
        dbReady,
        encryptionReady,
        externalAiProvider: false,
        aiMode: 'free-guidance-engine',
        persistentPolicyLedger: false,
        persistentClaimLedger: false,
        consultationQueue: true
      }, dbReady ? 200 : 503, origin, env);
    }
    if (!env.DB) return json({ error: 'Insurance D1 데이터베이스 연결이 없습니다.' }, 503, origin, env);

    if (request.method === 'POST' && url.pathname === '/api/chat') {
      if (!(await allowRequest(request, env, 40))) return json({ error: '질문 요청이 너무 많습니다. 잠시 후 다시 시도해 주세요.' }, 429, origin, env);
      const body = await readJson(request);
      const messages = normalizeMessages(body?.messages);
      return json({ reply: freeGuidanceReply(messages), mode: 'free-guidance-engine', persisted: false }, 200, origin, env);
    }
    if (request.method === 'POST' && url.pathname === '/api/consultations') {
      try {
        const result = await createConsultation(request, env);
        return json(result.body, result.status, origin, env);
      } catch (error) {
        console.error('insurance consultation create', error);
        const keyMissing = error?.message === 'ENCRYPTION_KEY_NOT_CONFIGURED';
        return json({ error: keyMissing ? '상담 연락처 암호화 설정이 준비되지 않았습니다.' : '상담요청 저장에 실패했습니다.' }, keyMissing ? 503 : 500, origin, env);
      }
    }
    const revoke = url.pathname.match(/^\/api\/consultations\/(con_[a-f0-9-]+)\/revoke$/i);
    if (request.method === 'POST' && revoke) {
      const result = await revokeConsultation(revoke[1], request, env);
      return json(result.body, result.status, origin, env);
    }

    if (url.pathname.startsWith('/api/internal/')) {
      if (!internalAuthorized(request, env)) return json({ error: 'Internal admin authorization required.' }, 401, origin, env);
      if (request.method === 'GET' && url.pathname === '/api/internal/consultations') return json(await listConsultations(url, env), 200, origin, env);
      const detail = url.pathname.match(/^\/api\/internal\/consultations\/(con_[a-f0-9-]+)$/i);
      if (request.method === 'GET' && detail) {
        try {
          const item = await consultationDetail(detail[1], request, env);
          return item ? json({ consultation: item }, 200, origin, env) : json({ error: '상담요청을 찾을 수 없습니다.' }, 404, origin, env);
        } catch (error) {
          console.error('insurance consultation detail', error);
          return json({ error: '상담정보 복호화에 실패했습니다.' }, 500, origin, env);
        }
      }
      const status = url.pathname.match(/^\/api\/internal\/consultations\/(con_[a-f0-9-]+)\/status$/i);
      if (request.method === 'PATCH' && status) {
        const result = await updateStatus(status[1], request, env);
        return json(result.body, result.status, origin, env);
      }
    }
    return json({ error: 'Not found' }, 404, origin, env);
  }
};
