import { buildEpub } from './publishing-ai-epub.js';
// PUBLISHING-AI-WEEKLY-001 — 주 1권 "AI 협업 초안 · 저자 감수" 원고 공장.
//
// 원칙
// - 무료만: Cloudflare Workers AI 무료 일일 한도 안에서만 쓰고(출판 몫 상한), 넘으면 다음 날로 미룬다. 유료 호출 없음.
// - 비공개: 원고는 출판 DB에만 둔다(공개 저장소·로그에 본문을 남기지 않는다).
// - 사람 감수: AI는 기획과 초안까지만. 저자(출판 관리자)가 읽고 고친 뒤 "감수 완료"를 눌러야 출판 원고 심사 단계로 넘어간다.
//   공개 판매·외부 노출은 기존 승인 절차(판권·판본 확정, 계약, 서점 출판 확정)를 그대로 거친다.
// - 표기: 모든 책에 "AI 협업 초안 · 저자 감수"를 판권 정보로 남긴다.
// - 스케줄: 출판 워커의 하나뿐인 일일 예약 작업에서 실행한다(별도 스케줄러 없음).

// 단계별 무료 모델(Workers AI). 단가는 뉴런/토큰(Workers AI 단가표 기준, 확인필요: 단가 변경 시 갱신).
export const MODELS = Object.freeze({
  draft: { id: '@cf/meta/llama-3.3-70b-instruct-fp8-fast', in: 26668 / 1e6, out: 204805 / 1e6 },
  // 2026-11-04 운영 확인: 이 계정은 Gemma 3 사용 불가(5018) → 편집도 Llama 3.3 70B로(편집 지시문으로 역할 분리)
  edit: { id: '@cf/meta/llama-3.3-70b-instruct-fp8-fast', in: 26668 / 1e6, out: 204805 / 1e6 },
  image: { id: '@cf/black-forest-labs/flux-1-schnell', perImage: 60 },
});
export const AI_FACTORY = Object.freeze({
  model: MODELS.draft.id,
  // 계정 무료 한도는 일 10,000(00:00 UTC 초기화). 다른 서비스(AI 관리 장치의 Llama 3.1 8B)가 최근 30일 하루 약 1,800을 쓴다
  // (ai_provider_calls 토큰 기준 추정, 2026-11-05). 여유 700을 남기고 출판이 나머지를 쓴다.
  dailyNeuronCap: 7500,
  neuronsPerInputToken: MODELS.draft.in,
  neuronsPerOutputToken: MODELS.draft.out,
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
function estimate(m, usage, prompt, text) {
  const inTok = Number(usage?.prompt_tokens) || Math.ceil(prompt.length / 1.5);
  const outTok = Number(usage?.completion_tokens) || Math.ceil(String(text || '').length / 1.5);
  return inTok * m.in + outTok * m.out;
}

/** One free model call within the daily cap. Returns null when today's budget is spent. */
export async function generate(env, system, prompt, maxTokens, stage = 'draft') {
  const db = env.PUBLISH_DB, m = MODELS[stage] || MODELS.draft;
  const worst = (system.length + prompt.length) / 1.5 * m.in + maxTokens * m.out;
  if ((await usedToday(db)) + worst > AI_FACTORY.dailyNeuronCap) return null;
  const out = await env.AI.run(m.id, { messages: [{ role: 'system', content: system }, { role: 'user', content: prompt }], max_tokens: maxTokens, temperature: stage === 'edit' ? 0.5 : 0.8 });
  // Workers AI는 모델이 JSON을 내면 response를 이미 객체로 돌려줄 때가 있다 → 문자열로 되돌린다.
  const raw = out?.response ?? out?.result?.response ?? '';
  const text = (typeof raw === 'string' ? raw : JSON.stringify(raw)).trim();
  await addUsage(db, estimate(m, out?.usage, system + prompt, text));
  return text;
}

/** One free illustration (no text in image). Returns base64 JPEG or null when today's budget is spent. */
export async function illustrate(env, prompt) {
  const db = env.PUBLISH_DB;
  if ((await usedToday(db)) + MODELS.image.perImage > AI_FACTORY.dailyNeuronCap) return null;
  const out = await env.AI.run(MODELS.image.id, { prompt: String(prompt).slice(0, 1800), steps: 4 });
  await addUsage(db, MODELS.image.perImage);
  return typeof out?.image === 'string' ? out.image : null;
}

const SYSTEM = `당신은 EKODI BOOKS의 한국어 원고 집필 보조자입니다. 저자 ${AI_FACTORY.author}의 감수를 받을 초안을 씁니다.
규칙: 사실이 확실하지 않은 수치·인용·인명·출처는 만들지 말고 [확인필요]로 표시합니다. 실존 인물의 말을 지어내지 않습니다.
성경 인용은 장절만 표기하고 본문은 저자가 확인하도록 [본문확인]을 붙입니다. 의료·법률·투자 조언은 일반 정보로만 씁니다.
과장 광고 문구, 혐오·차별 표현을 쓰지 않습니다. 결과는 요청한 형식만 출력합니다.`;

// 베스트셀러 문장 기준(편집 단계에서 적용). 국내 실용·에세이 베스트셀러의 공통 문법을 정리한 편집 지침이다.
export const CRAFT = `편집 기준(반드시 지킬 것):
1) 첫 문단은 독자의 일상 장면이나 질문 하나로 시작해 3문장 안에 마음을 붙잡는다.
2) 한 문장은 짧게(평균 25자 안팎), 한 문단은 2~4문장. 어려운 말은 쉬운 말로 바꾼다.
3) 소제목마다 구체적 장면·사례·대화 중 하나를 넣는다(지어낸 실존 인물·통계 금지, 가상 사례는 "예를 들어"로 밝힌다).
4) 핵심 문장은 한 줄로 따로 떼어 강조한다(> 로 시작).
5) 각 소제목 끝에 독자가 오늘 해 볼 작은 실천 한 가지.
6) 장 마지막은 다음 장을 궁금하게 만드는 한두 문장으로 닫는다.
7) 같은 표현 반복·설교조·과장 금지. [확인필요]·[본문확인] 표시는 지우지 말고 그대로 둔다.`;

function parseJson(text) {
  const t = String(text || '').replace(/```(?:json)?/gi, '');
  const start = t.indexOf('{'), end = t.lastIndexOf('}');
  if (start < 0 || end <= start) return null;
  try { return JSON.parse(t.slice(start, end + 1)); } catch { return null; }
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
  let plan = null;
  for (const stage of ['draft', 'edit']) { // 형식이 틀리면 다른 무료 모델로 한 번 더
    const text = await generate(env, SYSTEM, prompt, 1600, stage);
    if (text === null) return { status: 'budget_wait' };
    plan = parseJson(text);
    if (plan?.title && Array.isArray(plan.chapters) && plan.chapters.length >= 3) break;
    plan = null;
  }
  if (!plan) return { status: 'plan_invalid' };
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
  // 목표 분량까지 나눠 쓴다: 부분마다 초안 → 베스트셀러 편집. 진행은 저장해 두고 한도에 걸리면 다음 날 이어 쓴다(최대 4부분).
  const saved = (await db.prepare('SELECT body FROM publishing_ai_drafts WHERE book_id=? AND number=?').bind(book.id, ch.number).first())?.body || '';
  let state = { parts: [] };
  try { state = saved.startsWith('{') ? JSON.parse(saved) : { parts: saved ? [saved] : [] }; } catch {}
  const target = AI_FACTORY.chapterChars;
  const length = () => state.parts.join('\n\n').length;
  while (length() < target * 0.9 && state.parts.length < 4) {
    const done = state.parts.join('\n\n');
    const ask = state.parts.length === 0
      ? `${prompt}\n이번에는 앞부분(소제목 1~2개)만 약 1,200자로 쓰세요. 장 끝 질문은 아직 쓰지 마세요.`
      : `${prompt}\n지금까지 쓴 본문의 끝부분:\n${done.slice(-1500)}\n\n바로 이어서 다음 소제목부터 약 1,200자를 더 쓰세요. 앞 내용을 되풀이하지 마세요.${length() + 1300 >= target * 0.9 ? ' 이번이 마지막이니 장 끝에 "생각해 볼 질문" 2개로 마무리하세요.' : ''}`;
    const part = await generate(env, SYSTEM + '\n' + CRAFT, ask, 2000, 'draft');
    if (part === null) return { status: 'budget_wait', chapter: ch.number };
    const edited = await generate(env, SYSTEM + '\n' + CRAFT, `다음은 「${book.title}」 ${ch.number}장 「${ch.title}」의 한 부분입니다. 문체: ${meta.style}. 독자: ${meta.audience}.\n편집 기준에 맞게 다듬어 본문만 출력하세요(분량 유지, 소제목은 ### 로).\n\n${part}`, 2200, 'edit');
    state.parts.push(clean(edited !== null && edited.length > part.length * 0.6 ? edited : part, 8000));
    await db.prepare('INSERT OR REPLACE INTO publishing_ai_drafts (book_id, number, body, created_at) VALUES (?, ?, ?, ?)').bind(book.id, ch.number, JSON.stringify(state), now()).run();
    if (edited === null) return { status: 'budget_wait', chapter: ch.number };
  }
  const finalText = state.parts.join('\n\n');
  await db.prepare("UPDATE publishing_ai_chapters SET body=?, status='drafted', updated_at=? WHERE book_id=? AND number=?")
    .bind(clean(finalText, 30000), now(), book.id, ch.number).run();
  await chapterIllustration(env, book, meta, ch).catch(() => null);
  return { status: 'drafted', id: book.id, chapter: ch.number };
}

// 장마다 삽화 한 장(분야별 화풍, 글자 없는 그림). 실존 캐릭터·상표·실존 인물 묘사 금지.
const ART = Object.freeze({
  'faith-devotion': 'soft watercolor illustration, warm morning light, quiet and hopeful',
  'ai-practical': 'friendly flat vector illustration, clean shapes, pastel palette',
  'self-growth': 'minimal line-art with one accent color, airy composition',
  'family-relationship': 'gentle Korean webtoon-style illustration, soft colors, warm expressions',
  'community-local': 'cozy hand-drawn illustration of a small Korean village street, warm tones',
  'money-basics': 'clean isometric illustration, calm blue and green palette',
});
async function chapterIllustration(env, book, meta, ch) {
  const db = env.PUBLISH_DB;
  const have = await db.prepare("SELECT 1 FROM publishing_ai_images WHERE book_id=? AND number=?").bind(book.id, ch.number).first();
  if (have) return;
  const scene = await generate(env, 'You write one-sentence English image prompts. Output only the sentence.', `Describe one simple, symbolic scene (no text, no letters, no logos, no real people, no famous characters) for a Korean book chapter titled "${ch.title}" about: ${ch.summary}`, 80, 'edit');
  if (!scene) return;
  const image = await illustrate(env, `${scene}. ${ART[book.genre] || ART['self-growth']}. no text, no watermark.`);
  if (!image) return;
  await db.prepare('INSERT OR REPLACE INTO publishing_ai_images (book_id, number, mime, data_b64, prompt, created_at) VALUES (?, ?, ?, ?, ?, ?)')
    .bind(book.id, ch.number, 'image/jpeg', image, clean(scene, 400), now()).run();
}

/** Daily tick from the publishing worker's single scheduled handler. */
export async function aiFactoryTick(env, at = new Date()) {
  if (env?.PUBLISHING_AI_FACTORY_ENABLED !== 'true' || !env?.AI || !env?.PUBLISH_DB) return { status: 'disabled' };
  const week = Math.floor(at.getTime() / (7 * 864e5));
  const thisWeek = await env.PUBLISH_DB.prepare('SELECT id FROM publishing_ai_books WHERE week=? LIMIT 1').bind(week).first();
  const steps = [];
  try {
    if (!thisWeek) steps.push(await planWeeklyBook(env, at));
    for (let i = 0; i < 8; i++) { // 무료 상한을 만나면 멈춤(보통 하루 3~4장)
      const r = await draftNextChapter(env); steps.push(r);
      if (r.status !== 'drafted') break;
    }
  } catch (e) { steps.push({ status: 'error', message: String(e?.message || e).slice(0, 300) }); } // 실패 원인을 실행 기록에 남긴다
  await env.PUBLISH_DB.prepare('INSERT INTO publishing_ai_runs (at, result_json) VALUES (?, ?)').bind(now(), JSON.stringify(steps).slice(0, 2000)).run().catch(() => null);
  return { status: 'ok', steps };
}

async function epubFor(db, book) {
  const meta = JSON.parse(book.plan_json || '{}');
  const chapters = (await db.prepare('SELECT number, title, body FROM publishing_ai_chapters WHERE book_id=? ORDER BY number').bind(book.id).all()).results || [];
  const images = new Map(((await db.prepare('SELECT number, mime, data_b64 FROM publishing_ai_images WHERE book_id=?').bind(book.id).all()).results || []).map(r => [r.number, { mime: r.mime, b64: r.data_b64 }]));
  const bytes = buildEpub({ id: book.id, title: book.title, subtitle: meta.subtitle, author: meta.author || AI_FACTORY.author, publisher: meta.publisher || AI_FACTORY.publisher, disclosure: meta.disclosure || AI_FACTORY.disclosure, keywords: meta.keywords, pitch: meta.pitch },
    chapters, images, new Date(book.approved_at || book.updated_at));
  const digest = [...new Uint8Array(await crypto.subtle.digest('SHA-256', bytes))].map(b => b.toString(16).padStart(2, '0')).join('');
  return { bytes, digest, meta };
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
  const m = /^\/api\/workflow\/admin\/ai-books\/([0-9a-f-]{36})(?:\/(chapters\/(\d{1,2})|approve|epub|publish|images\/(\d{1,2})))?$/.exec(path);
  if (!m) return null;
  const book = await db.prepare('SELECT * FROM publishing_ai_books WHERE id=?').bind(m[1]).first();
  if (!book) return json(404, { ok: false, code: 'NOT_FOUND' });
  if (!m[2] && req.method === 'GET') {
    const chapters = (await db.prepare('SELECT number, title, summary, body, status, updated_at FROM publishing_ai_chapters WHERE book_id=? ORDER BY number').bind(book.id).all()).results || [];
    return json(200, { ok: true, book: { id: book.id, title: book.title, status: book.status, meta: JSON.parse(book.plan_json || '{}') }, chapters });
  }
  if (m[4] && req.method === 'GET') {
    const img = await db.prepare('SELECT mime, data_b64 FROM publishing_ai_images WHERE book_id=? AND number=?').bind(book.id, Number(m[4])).first();
    return img ? json(200, { ok: true, mime: img.mime, data: img.data_b64 }) : json(404, { ok: false, code: 'NO_IMAGE' });
  }
  if ((m[2] === 'epub' && req.method === 'GET') || (m[2] === 'publish' && req.method === 'POST')) {
    if (book.status !== 'approved') return json(409, { ok: false, code: 'AUTHOR_REVIEW_REQUIRED' });
    const { bytes, digest, meta } = await epubFor(db, book);
    if (m[2] === 'epub') return new Response(bytes, { headers: { 'content-type': 'application/epub+zip', 'cache-control': 'private, no-store',
      'content-disposition': `attachment; filename="ekodi-ai-book.epub"; filename*=UTF-8''${encodeURIComponent(book.title)}.epub`, 'x-epub-sha256': digest } });
    // 서점 출판 인계: 판매 개시는 하지 않는다. 서점 등록·판권·판본 확정은 서점 쪽 승인 절차가 맡는다.
    const t = now(), key = `ai-book:${book.id}:${digest}`;
    await db.prepare(`INSERT OR IGNORE INTO publishing_workflow_handoff_outbox (id, project_id, edition_id, release_digest, idempotency_key, payload_json, status, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, 'pending', ?, ?)`).bind(crypto.randomUUID(), 'ai:' + book.id, 'ai-ebook-v1', digest, key,
      JSON.stringify({ kind: 'ai_collab_ebook', title: book.title, subtitle: meta.subtitle, author: meta.author, publisher: meta.publisher, disclosure: meta.disclosure, keywords: meta.keywords, pitch: meta.pitch, genre: meta.genre, bytes: bytes.length, saleActivation: false }), t, t).run();
    await db.prepare("INSERT INTO publishing_workflow_audit (id,project_id,actor_user_id,action,from_stage,to_stage,revision,details_json,created_at) VALUES (?, ?, ?, 'ai_book_handoff_requested', 'approved', 'handoff_ready', 0, ?, ?)")
      .bind(crypto.randomUUID(), 'ai:' + book.id, user.userId, JSON.stringify({ digest }), t).run();
    return json(200, { ok: true, status: 'handoff_ready', digest, next: '서점 등록 → 판매 파일 확인 → 판권·판본 확정 순서로 진행합니다. 판매는 확정 전까지 열리지 않습니다.' });
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
