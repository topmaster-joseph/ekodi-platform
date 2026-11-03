// PUBLISHING-AI-WEEKLY-001 — 주 1권 "AI 협업 초안 · 저자 감수" 원고 공장.
//
// 원칙
// - 무료만: Cloudflare Workers AI 무료 일일 한도 안에서만 쓰고(출판 몫 상한), 넘으면 다음 날로 미룬다. 유료 호출 없음.
// - 비공개: 원고는 출판 DB에만 둔다(공개 저장소·로그에 본문을 남기지 않는다).
// - 사람 감수: AI는 기획과 초안까지만. 저자(출판 관리자)가 읽고 고친 뒤 "감수 완료"를 눌러야 출판 원고 심사 단계로 넘어간다.
//   공개 판매·외부 노출은 기존 승인 절차(판권·판본 확정, 계약, 서점 출판 확정)를 그대로 거친다.
// - 표기: 모든 책에 "AI 협업 초안 · 저자 감수"를 판권 정보로 남긴다.
// - 스케줄: 출판 워커의 하나뿐인 일일 예약 작업에서 실행한다(별도 스케줄러 없음).

export const AI_FACTORY = Object.freeze({
  model: '@cf/meta/llama-3.3-70b-instruct-fp8-fast',
  dailyNeuronCap: 5000,              // 계정 무료 한도(일 10,000) 중 출판 몫. 나머지는 다른 서비스 몫.
  neuronsPerInputToken: 26668 / 1e6, // Workers AI 단가표 기준(확인필요: 모델 단가 변경 시 갱신)
  neuronsPerOutputToken: 204805 / 1e6,
  chapters: 8,
  chapterChars: 3800,
  disclosure: 'AI 협업 초안 · 저자 감수',
  author: '정찬균',
  publisher: 'EKODI BOOKS · 에코디비즈',
});

// 꾸준히 팔리는 국내 전자책 분야(장르 회전으로 같은 분야가 연달아 나오지 않게 한다).
// 실시간 판매 순위 데이터가 아니라 편집 기준이다(확인필요: 검색 트렌드 연동은 다음 단계).
export const GENRES = Object.freeze([
  { id: 'faith-devotion', label: '신앙·묵상', audience: '바쁜 일상 속 묵상이 필요한 그리스도인', style: '따뜻하고 차분한 묵상체' },
  { id: 'ai-practical', label: 'AI 활용 실용', audience: 'AI를 일과 생활에 처음 쓰는 40~60대', style: '쉽고 구체적인 안내체, 예시 중심' },
  { id: 'self-growth', label: '자기계발·습관', audience: '작은 변화를 원하는 직장인', style: '짧은 문단, 실천 과제 포함' },
  { id: 'family-relationship', label: '가정·관계', audience: '부모와 부부', style: '공감하는 대화체' },
  { id: 'community-local', label: '공동체·지역', audience: '마을과 교회 공동체 리더', style: '사례 중심 해설체' },
  { id: 'money-basics', label: '생활 경제 기초', audience: '사회초년생과 은퇴 준비자', style: '명료한 설명체, 과장·투자 권유 금지' },
]);

const now = () => new Date().toISOString();
const day = (d = new Date()) => d.toISOString().slice(0, 10);
const clean = (v, max = 4000) => String(v ?? '').replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, '').trim().slice(0, max);

async function usedToday(db) {
  const r = await db.prepare('SELECT neurons FROM publishing_ai_usage WHERE day=?').bind(day()).first();
  return Number(r?.neurons || 0);
}
async function addUsage(db, neurons) {
  await db.prepare('INSERT INTO publishing_ai_usage (day, neurons) VALUES (?, ?) ON CONFLICT(day) DO UPDATE SET neurons = neurons + excluded.neurons')
    .bind(day(), Math.ceil(neurons)).run();
}
function estimate(usage, prompt, text) {
  const inTok = Number(usage?.prompt_tokens) || Math.ceil(prompt.length / 1.5);
  const outTok = Number(usage?.completion_tokens) || Math.ceil(String(text || '').length / 1.5);
  return inTok * AI_FACTORY.neuronsPerInputToken + outTok * AI_FACTORY.neuronsPerOutputToken;
}

/** One free model call within the daily cap. Returns null when today's budget is spent. */
export async function generate(env, system, prompt, maxTokens) {
  const db = env.PUBLISH_DB;
  const worst = prompt.length / 1.5 * AI_FACTORY.neuronsPerInputToken + maxTokens * AI_FACTORY.neuronsPerOutputToken;
  if ((await usedToday(db)) + worst > AI_FACTORY.dailyNeuronCap) return null;
  const out = await env.AI.run(AI_FACTORY.model, { messages: [{ role: 'system', content: system }, { role: 'user', content: prompt }], max_tokens: maxTokens, temperature: 0.7 });
  const text = String(out?.response ?? out?.result?.response ?? '').trim();
  await addUsage(db, estimate(out?.usage, system + prompt, text));
  return text;
}

const SYSTEM = `당신은 EKODI BOOKS의 한국어 원고 집필 보조자입니다. 저자 ${AI_FACTORY.author}의 감수를 받을 초안을 씁니다.
규칙: 사실이 확실하지 않은 수치·인용·인명·출처는 만들지 말고 [확인필요]로 표시합니다. 실존 인물의 말을 지어내지 않습니다.
성경 인용은 장절만 표기하고 본문은 저자가 확인하도록 [본문확인]을 붙입니다. 의료·법률·투자 조언은 일반 정보로만 씁니다.
과장 광고 문구, 혐오·차별 표현을 쓰지 않습니다. 결과는 요청한 형식만 출력합니다.`;

function parseJson(text) {
  const m = /\{[\s\S]*\}/.exec(String(text || ''));
  try { return m ? JSON.parse(m[0]) : null; } catch { return null; }
}

/** Pick this week's genre (rotation, never the same as last week's) and plan a book. */
export async function planWeeklyBook(env, at = new Date()) {
  const db = env.PUBLISH_DB;
  const recent = (await db.prepare('SELECT genre, title FROM publishing_ai_books ORDER BY created_at DESC LIMIT 12').all()).results || [];
  const week = Math.floor(at.getTime() / (7 * 864e5));
  let genre = GENRES[week % GENRES.length];
  if (recent[0]?.genre === genre.id) genre = GENRES[(week + 1) % GENRES.length];
  const avoid = recent.map(r => r.title).filter(Boolean).slice(0, 12).join(' / ') || '없음';
  const prompt = `분야: ${genre.label}\n독자: ${genre.audience}\n문체: ${genre.style}\n분량: ${AI_FACTORY.chapters}장, 장당 약 ${AI_FACTORY.chapterChars}자(전자책 소책자)\n이미 낸 제목(겹치지 않게): ${avoid}\n
국내 전자책 독자가 검색해 찾을 만하고 오래 팔릴 주제를 하나 정해 아래 JSON 하나만 출력하세요.
{"title":"책 제목","subtitle":"부제","keywords":["검색어 5개"],"pitch":"소개 2문장","chapters":[{"title":"장 제목","summary":"장 요지 1~2문장"}]}
chapters는 정확히 ${AI_FACTORY.chapters}개.`;
  const text = await generate(env, SYSTEM, prompt, 1200);
  if (text === null) return { status: 'budget_wait' };
  const plan = parseJson(text);
  if (!plan?.title || !Array.isArray(plan.chapters) || plan.chapters.length < 3) return { status: 'plan_invalid' };
  const id = crypto.randomUUID(), t = now();
  const chapters = plan.chapters.slice(0, AI_FACTORY.chapters).map((c, i) => ({ number: i + 1, title: clean(c.title, 120) || `${i + 1}장`, summary: clean(c.summary, 400) }));
  const meta = { subtitle: clean(plan.subtitle, 160), keywords: (plan.keywords || []).map(k => clean(k, 40)).slice(0, 8), pitch: clean(plan.pitch, 600), genre: genre.label, audience: genre.audience, style: genre.style, disclosure: AI_FACTORY.disclosure, author: AI_FACTORY.author, publisher: AI_FACTORY.publisher };
  await db.batch([
    db.prepare('INSERT INTO publishing_ai_books (id, week, genre, title, plan_json, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
      .bind(id, week, genre.id, clean(plan.title, 160), JSON.stringify(meta), 'drafting', t, t),
    ...chapters.map(c => db.prepare('INSERT INTO publishing_ai_chapters (book_id, number, title, summary, body, status, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)')
      .bind(id, c.number, c.title, c.summary, '', 'pending', t)),
  ]);
  return { status: 'planned', id };
}

/** Draft the next pending chapter of the active book. */
export async function draftNextChapter(env) {
  const db = env.PUBLISH_DB;
  const book = await db.prepare("SELECT * FROM publishing_ai_books WHERE status='drafting' ORDER BY created_at LIMIT 1").first();
  if (!book) return { status: 'idle' };
  const ch = await db.prepare("SELECT * FROM publishing_ai_chapters WHERE book_id=? AND status='pending' ORDER BY number LIMIT 1").bind(book.id).first();
  if (!ch) {
    await db.prepare("UPDATE publishing_ai_books SET status='author_review', updated_at=? WHERE id=?").bind(now(), book.id).run();
    return { status: 'ready_for_review', id: book.id };
  }
  const meta = JSON.parse(book.plan_json || '{}');
  const toc = ((await db.prepare('SELECT number, title FROM publishing_ai_chapters WHERE book_id=? ORDER BY number').bind(book.id).all()).results || []).map(c => `${c.number}. ${c.title}`).join('\n');
  const prompt = `책: ${book.title} — ${meta.subtitle || ''}\n분야: ${meta.genre}\n독자: ${meta.audience}\n문체: ${meta.style}\n목차:\n${toc}\n
이번 장: ${ch.number}. ${ch.title}\n요지: ${ch.summary}\n
이 장의 본문을 약 ${AI_FACTORY.chapterChars}자로 쓰세요. 소제목 2~4개(### 로 시작), 짧은 문단, 장 끝에 "생각해 볼 질문" 2개. 제목 줄은 쓰지 마세요.`;
  const text = await generate(env, SYSTEM, prompt, 3800);
  if (text === null) return { status: 'budget_wait' };
  await db.prepare("UPDATE publishing_ai_chapters SET body=?, status='drafted', updated_at=? WHERE book_id=? AND number=?")
    .bind(clean(text, 20000), now(), book.id, ch.number).run();
  return { status: 'drafted', id: book.id, chapter: ch.number };
}

/** Daily tick from the publishing worker's single scheduled handler. */
export async function aiFactoryTick(env, at = new Date()) {
  if (env?.PUBLISHING_AI_FACTORY_ENABLED !== 'true' || !env?.AI || !env?.PUBLISH_DB) return { status: 'disabled' };
  const week = Math.floor(at.getTime() / (7 * 864e5));
  const thisWeek = await env.PUBLISH_DB.prepare('SELECT id FROM publishing_ai_books WHERE week=? LIMIT 1').bind(week).first();
  const steps = [];
  if (!thisWeek) steps.push(await planWeeklyBook(env, at));
  for (let i = 0; i < 4; i++) { // 하루 최대 4장, 무료 상한을 만나면 멈춤
    const r = await draftNextChapter(env); steps.push(r);
    if (r.status !== 'drafted') break;
  }
  return { status: 'ok', steps };
}

// ---- 감수 화면 API (출판 관리자·발행인만) --------------------------------------------
export async function aiFactoryAdmin(db, req, path, user, role, json) {
  if (!['publisher', 'admin'].includes(role)) return json(403, { ok: false, code: 'PUBLISHER_ONLY' });
  if (path === '/api/workflow/admin/ai-books' && req.method === 'GET') {
    const rows = (await db.prepare(`SELECT b.id, b.title, b.genre, b.status, b.created_at, b.plan_json,
      (SELECT COUNT(*) FROM publishing_ai_chapters c WHERE c.book_id=b.id AND c.status!='pending') AS done,
      (SELECT COUNT(*) FROM publishing_ai_chapters c WHERE c.book_id=b.id) AS total FROM publishing_ai_books b ORDER BY b.created_at DESC LIMIT 30`).all()).results || [];
    const usage = await db.prepare('SELECT neurons FROM publishing_ai_usage WHERE day=?').bind(day()).first();
    return json(200, { ok: true, books: rows.map(r => ({ id: r.id, title: r.title, genre: r.genre, status: r.status, createdAt: r.created_at, done: r.done, total: r.total, meta: JSON.parse(r.plan_json || '{}') })),
      budget: { usedToday: Number(usage?.neurons || 0), dailyCap: AI_FACTORY.dailyNeuronCap, paid: false } });
  }
  const m = /^\/api\/workflow\/admin\/ai-books\/([0-9a-f-]{36})(?:\/(chapters\/(\d{1,2})|approve))?$/.exec(path);
  if (!m) return null;
  const book = await db.prepare('SELECT * FROM publishing_ai_books WHERE id=?').bind(m[1]).first();
  if (!book) return json(404, { ok: false, code: 'NOT_FOUND' });
  if (!m[2] && req.method === 'GET') {
    const chapters = (await db.prepare('SELECT number, title, summary, body, status, updated_at FROM publishing_ai_chapters WHERE book_id=? ORDER BY number').bind(book.id).all()).results || [];
    return json(200, { ok: true, book: { id: book.id, title: book.title, status: book.status, meta: JSON.parse(book.plan_json || '{}') }, chapters });
  }
  if (m[3] && req.method === 'PUT') {
    if (book.status === 'approved') return json(409, { ok: false, code: 'ALREADY_APPROVED' });
    const body = await req.json().catch(() => null);
    if (!body || typeof body.body !== 'string') return json(400, { ok: false, code: 'INVALID_INPUT' });
    await db.batch([
      db.prepare("UPDATE publishing_ai_chapters SET title=COALESCE(?, title), body=?, status='edited', updated_at=? WHERE book_id=? AND number=?")
        .bind(body.title ? clean(body.title, 120) : null, clean(body.body, 30000), now(), book.id, Number(m[3])),
      db.prepare("INSERT INTO publishing_workflow_audit (id,project_id,actor_user_id,action,from_stage,to_stage,revision,details_json,created_at) VALUES (?, ?, ?, 'ai_chapter_edited', NULL, NULL, 0, ?, ?)")
        .bind(crypto.randomUUID(), 'ai:' + book.id, user.userId, JSON.stringify({ chapter: Number(m[3]) }), now()),
    ]);
    return json(200, { ok: true });
  }
  if (m[2] === 'approve' && req.method === 'POST') {
    const pending = await db.prepare("SELECT COUNT(*) AS n FROM publishing_ai_chapters WHERE book_id=? AND (status='pending' OR length(body) < 200)").bind(book.id).first();
    if (Number(pending?.n) > 0) return json(409, { ok: false, code: 'CHAPTERS_INCOMPLETE' });
    const unresolved = await db.prepare("SELECT COUNT(*) AS n FROM publishing_ai_chapters WHERE book_id=? AND (body LIKE '%[확인필요]%' OR body LIKE '%[본문확인]%')").bind(book.id).first();
    if (Number(unresolved?.n) > 0) return json(409, { ok: false, code: 'UNRESOLVED_MARKERS', count: Number(unresolved.n) });
    const t = now();
    await db.batch([
      db.prepare("UPDATE publishing_ai_books SET status='approved', approved_by=?, approved_at=?, updated_at=? WHERE id=? AND status!='approved'").bind(user.userId, t, t, book.id),
      db.prepare("INSERT INTO publishing_workflow_audit (id,project_id,actor_user_id,action,from_stage,to_stage,revision,details_json,created_at) VALUES (?, ?, ?, 'ai_book_author_reviewed', ?, 'approved', 0, ?, ?)")
        .bind(crypto.randomUUID(), 'ai:' + book.id, user.userId, book.status, JSON.stringify({ disclosure: AI_FACTORY.disclosure }), t),
    ]);
    return json(200, { ok: true, status: 'approved', next: '전자책 제작(EPUB)·판권 확정·서점 출판 확정은 다음 단계에서 진행합니다.' });
  }
  return json(405, { ok: false, code: 'METHOD_NOT_ALLOWED' });
}
