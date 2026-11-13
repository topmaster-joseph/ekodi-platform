// JOURNAL-ESSAYS-20261113 — 에코디언 주간 에세이(무료 AI 집필 → 편집부 투고 → 48시간 검토 뒤 게재).
//
// 원칙
// - 매주 1편, 주제는 16개 분야를 돌아가며(같은 분야가 연달아 오지 않음).
// - 집필은 출판 공장과 같은 무료 AI 경로(writeText)만 쓴다. 유료 호출 없음.
// - 쓰면 바로 싣지 않고 '투고'한다: 편집부(joseph@ekodi.kr)에 원고 전문을 보내고 48시간 검토 기간을 둔다.
//   보류(hold)되지 않으면 48시간 뒤 저널에 게재된다. 게재 글에는 'AI 협업 초안'임을 밝힌다.
// - 지어낸 통계·인용·인물·후기는 쓰지 않는다(프롬프트 규칙 + 한자 정리).

export const ESSAY_POLICY = Object.freeze({ everyDays: 7, reviewHours: 48, minChars: 900 });
export const ESSAY_AUTHOR = Object.freeze({
  name: '에코디언',
  disclosure: '에코디언 이름으로 AI가 초안을 쓰고 편집부가 검토 기간을 거쳐 게재한 글입니다(AI 협업 초안 · 편집부 검토).',
});

// [key, category, 주제, 방향]
export const ESSAY_TOPICS = Object.freeze([
  ['sabbath', 'ekodi', '쉼과 안식', '바쁜 일상에서 멈춤과 안식을 회복하는 길'],
  ['ai-work', 'ai', 'AI와 일하는 법', 'AI를 일에 쓰되 판단과 책임은 사람이 지는 방식'],
  ['jubilee', 'principles', '희년과 나눔의 경제', '빚과 소유를 다시 생각하게 하는 희년의 원리와 오늘의 실천'],
  ['village', 'build', '작은 마을의 내일', '농촌 면 단위 공동체가 함께 살아갈 길과 해 볼 수 있는 일'],
  ['reading', 'books', '함께 읽는 즐거움', '책을 혼자가 아니라 함께 읽을 때 생기는 변화'],
  ['neighbor', 'ekodi', '이웃이 되는 연습', '이주민·어르신·청년 등 가까운 이웃과 관계를 맺는 작은 연습'],
  ['digital-habit', 'ai', '디지털 습관 돌아보기', '휴대폰과 알림에 끌려다니지 않는 하루의 리듬'],
  ['creation', 'principles', '창조세계 돌봄', '일상에서 땅과 자원을 돌보는 구체적인 습관'],
  ['coop', 'build', '협동조합으로 함께 일하기', '작은 사업자들이 협동해 서로를 살리는 방식'],
  ['prayer', 'ekodi', '말씀과 하루', '하루를 말씀으로 시작하고 마무리하는 단순한 방법'],
  ['ai-truth', 'ai', 'AI 시대의 정직', '사실 확인, 출처 밝히기, 모르는 것을 모른다고 말하기'],
  ['generations', 'ekodi', '세대를 잇는 대화', '어른과 다음 세대가 서로에게 배우는 자리 만들기'],
  ['local-shop', 'build', '동네 가게를 살리는 마음', '지역 상권과 소비자가 함께 사는 선택'],
  ['open-record', 'principles', '기록하는 공동체', '성공뿐 아니라 실패와 수정까지 남기는 기록의 힘'],
  ['learning', 'ai', '평생 배우는 사람', '나이와 상관없이 새 도구를 배우는 두려움 넘기기'],
  ['hope', 'ekodi', '작은 희망의 실천', '거창하지 않아도 오늘 할 수 있는 선한 일'],
]);

const clean = (v, n = 400) => String(v ?? '').replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, ' ').trim().slice(0, n);
const HAN = /[㐀-䶿一-鿿]/g;
const nowIso = (ms = Date.now()) => new Date(ms).toISOString();
function kstDate(ms = Date.now()) { return new Date(ms + 9 * 3600_000).toISOString().slice(0, 10); }

export async function ensureEssayTable(db) {
  await db.prepare(`CREATE TABLE IF NOT EXISTS publishing_journal_essays (id TEXT PRIMARY KEY, slug TEXT NOT NULL UNIQUE, topic_key TEXT NOT NULL,
    category TEXT NOT NULL, title TEXT NOT NULL, summary TEXT, body TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'submitted',
    created_at TEXT NOT NULL, publish_at TEXT NOT NULL, published_at TEXT, notified_at TEXT, note TEXT)`).run();
}

export function nextTopic(count) {
  return ESSAY_TOPICS[Math.abs(Number(count) || 0) % ESSAY_TOPICS.length];
}

export function essayPrompt(topic) {
  const [, , label, brief] = topic;
  return `에코디저널에 실을 에세이를 한국어로 1,800~2,600자 쓰세요.
필자: 에코디언(말씀과 삶, 기술과 공동체 사이에서 살아가는 에코디 공동체의 한 사람).
주제: ${label} — ${brief}.
형식: 첫 줄 제목(30자 이내), 둘째 줄 한 문장 요약(80자 이내), 빈 줄 뒤 본문. 본문은 소제목 2~3개를 "## "로 시작하는 줄로 두세요.
규칙: 따뜻하고 분명한 문장. 독자가 이번 주에 해 볼 수 있는 작은 실천 하나로 맺기. 지어낸 통계·인용·실존 인물·후기 쓰지 않기. 성경을 인용하면 장절만 밝히고 길게 옮기지 않기. 한자·영어 단어 남발하지 않기. 광고·판매 문구 쓰지 않기.`;
}

export function parseEssay(text, topic) {
  const lines = String(text || '').replace(HAN, '').trim().split('\n');
  const title = clean(String(lines[0] || '').replace(/^#+\s*/, '').replace(/^제목\s*[:：]\s*/, ''), 80);
  const summary = clean(String(lines[1] || '').replace(/^요약\s*[:：]\s*/, ''), 200);
  const body = clean(lines.slice(2).join('\n'), 9000);
  if (!title || !summary || body.replace(/\s/g, '').length < ESSAY_POLICY.minChars) return null;
  return { title, summary, body, topic_key: topic[0], category: topic[1] };
}

export function essaySlug(createdMs, topicKey) {
  return `ekodian-${kstDate(createdMs).replace(/-/g, '')}-${topicKey}`.slice(0, 90);
}

export function deskMessage(essay) {
  return [
    '에코디언 주간 에세이 투고입니다(AI 협업 초안).',
    `게재 예정: ${essay.publish_at} (48시간 검토 기간 뒤 자동 게재)`,
    '게재를 미루거나 내리려면 에코디 관리자 또는 Claude에게 "이 글 보류"라고 요청해 주세요.',
    '',
    `제목: ${essay.title}`,
    `요약: ${essay.summary}`,
    `분야: ${essay.category} · ${essay.topic_key}`,
    `주소(게재 후): https://ekodi.kr/journal/p/${essay.slug}`,
    '',
    '본문', '--------------------', essay.body,
  ].join('\n').slice(0, 11800);
}

/** 매일 예약 실행에서 호출. ① 검토 기간이 지난 투고를 게재 ② 7일이 지났으면 새 에세이를 쓰고 투고. */
export async function essayTick(db, writeText, { notify = null, now = Date.now() } = {}) {
  await ensureEssayTable(db);
  const out = { published: [], submitted: null, skipped: '' };
  const due = (await db.prepare("SELECT id, slug FROM publishing_journal_essays WHERE status='submitted' AND publish_at<=?").bind(nowIso(now)).all()).results || [];
  for (const row of due) {
    await db.prepare("UPDATE publishing_journal_essays SET status='published', published_at=? WHERE id=? AND status='submitted'").bind(nowIso(now), row.id).run();
    out.published.push(row.slug);
  }
  const last = await db.prepare('SELECT MAX(created_at) AS last, COUNT(*) AS n FROM publishing_journal_essays').first();
  if (last?.last && now - Date.parse(last.last) < ESSAY_POLICY.everyDays * 864e5 - 3600_000) { out.skipped = 'not_due'; return out; }
  const topic = nextTopic(Number(last?.n || 0));
  let text = null;
  try { text = typeof writeText === 'function' ? await writeText('너는 에코디저널의 필자 에코디언이다. 한국어로만 쓴다.', essayPrompt(topic), 2600, 'journal-essay') : null; } catch { text = null; }
  const parsed = parseEssay(text, topic);
  if (!parsed) { out.skipped = 'draft_unusable'; return out; }   // 다음 날 다시 시도(무료 AI가 비었거나 너무 짧음)
  const essay = { id: crypto.randomUUID(), slug: essaySlug(now, topic[0]), ...parsed, created_at: nowIso(now), publish_at: nowIso(now + ESSAY_POLICY.reviewHours * 3600_000) };
  await db.prepare(`INSERT OR IGNORE INTO publishing_journal_essays (id,slug,topic_key,category,title,summary,body,status,created_at,publish_at)
    VALUES (?,?,?,?,?,?,?,'submitted',?,?)`).bind(essay.id, essay.slug, essay.topic_key, essay.category, essay.title, essay.summary, essay.body, essay.created_at, essay.publish_at).run();
  out.submitted = essay.slug;
  if (typeof notify === 'function') {
    try { if (await notify(essay)) await db.prepare('UPDATE publishing_journal_essays SET notified_at=? WHERE id=?').bind(nowIso(now), essay.id).run(); }
    catch { /* 알림 실패는 게재를 막지 않는다 — 관리 목록에서 확인 가능 */ }
  }
  return out;
}

/** 편집부 투고 메일: 사람이 쓰는 공개 투고 경로(/api/mail/contact)를 그대로 쓴다. */
export function deskNotifier(fetchImpl = globalThis.fetch) {
  return async (essay) => {
    const response = await fetchImpl('https://ekodi.kr/api/mail/contact', {
      method: 'POST',
      headers: { 'content-type': 'application/json', origin: 'https://ekodi.kr' },
      body: JSON.stringify({ name: '에코디언(AI 협업 초안)', email: 'joseph@ekodi.kr', subject: `에코디저널 투고 · ${essay.title}`,
        message: deskMessage(essay), site: 'EKODI Journal', source: 'journal-essay-weekly', sourceUrl: `https://ekodi.kr/journal/p/${essay.slug}` }),
    });
    return response.ok;
  };
}

export async function publishedEssays(db, limit = 100) {
  await ensureEssayTable(db);
  return (await db.prepare("SELECT slug, topic_key, category, title, summary, body, published_at FROM publishing_journal_essays WHERE status='published' ORDER BY published_at DESC LIMIT ?").bind(limit).all()).results || [];
}

/** 관리자: 목록 보기·보류·즉시 게재. */
export async function essayAdmin(db, req, path, role, respond) {
  if (!path.startsWith('/api/workflow/admin/journal-essays')) return null;
  if (role !== 'admin') return respond(403, { ok: false, error: 'ADMIN_ONLY' });
  await ensureEssayTable(db);
  if (req.method === 'GET') {
    const rows = (await db.prepare('SELECT slug, topic_key, category, title, summary, status, created_at, publish_at, published_at, notified_at FROM publishing_journal_essays ORDER BY created_at DESC LIMIT 60').all()).results || [];
    return respond(200, { ok: true, essays: rows, policy: ESSAY_POLICY });
  }
  const m = path.match(/^\/api\/workflow\/admin\/journal-essays\/([a-z0-9-]{3,90})\/(hold|publish|resume)$/);
  if (!m || req.method !== 'POST') return respond(404, { ok: false, error: 'NOT_FOUND' });
  const [, slug, action] = m;
  const at = nowIso();
  const sql = action === 'hold' ? "UPDATE publishing_journal_essays SET status='held' WHERE slug=? AND status IN ('submitted','published')"
    : action === 'publish' ? "UPDATE publishing_journal_essays SET status='published', published_at=COALESCE(published_at, ?1) WHERE slug=?2 AND status IN ('submitted','held')"
    : "UPDATE publishing_journal_essays SET status='submitted', publish_at=?1 WHERE slug=?2 AND status='held'";
  const stmt = action === 'hold' ? db.prepare(sql).bind(slug) : db.prepare(sql).bind(at, slug);
  const res = await stmt.run();
  return respond(200, { ok: true, slug, action, changed: Number(res?.meta?.changes || 0) });
}
