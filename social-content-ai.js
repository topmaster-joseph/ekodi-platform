import authWorker from './auth-worker.js';
import { runAiEnhancedTask } from './ai-resilience-runtime.js';

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store',
      'x-content-type-options': 'nosniff',
    },
  });
}

function clean(value, max = 2000) {
  return String(value ?? '').trim().slice(0, max);
}

async function readJson(request) {
  try { return await request.json(); } catch { return null; }
}

async function requireAdmin(request, env) {
  const url = new URL(request.url);
  url.pathname = '/api/session';
  url.search = '';
  const response = await authWorker.fetch(new Request(url, { method: 'GET', headers: request.headers }), env);
  if (!response.ok) return { response };
  return { response, session: await response.clone().json() };
}

async function readLearnings(env, tenantId) {
  if (!env.DB) return [];
  try {
    const rows = await env.DB.prepare(`SELECT provider, pattern_key, summary, confidence, updated_at
      FROM social_learnings WHERE tenant_id=? ORDER BY confidence DESC, updated_at DESC LIMIT 12`).bind(tenantId).all();
    return rows.results || [];
  } catch {
    return [];
  }
}

function providerGuidance(provider) {
  if (provider === 'instagram') return '첫 문장을 짧게 후킹하고 이미지·릴스와 자연스럽게 이어지며, 해시태그는 꼭 필요한 것만 사용한다.';
  if (provider === 'youtube') return '제목은 짧고 검색·호기심을 함께 고려하며, 설명 첫 두 문장에 핵심 가치와 다음 행동을 둔다.';
  return '광고 문구처럼 과장하지 않고 발견 이유와 사용자 효익을 먼저 보여주며 링크 클릭 이유를 명확히 한다.';
}

function fallbackDrafts(body, learnings) {
  const product = clean(body.product || body.offer || body.topic || '추천 상품', 160);
  const benefit = clean(body.benefit || body.valueProposition || '필요에 맞는 선택을 더 쉽게 찾을 수 있습니다.', 220);
  const audience = clean(body.audience || '필요한 상품을 빠르게 비교하고 싶은 사람', 160);
  const cta = clean(body.cta || '에코디몰에서 확인해 보세요.', 120);
  const providers = Array.isArray(body.providers) && body.providers.length
    ? body.providers.filter(value => ['facebook', 'instagram', 'youtube'].includes(value))
    : ['facebook', 'instagram', 'youtube'];
  const evidence = learnings.slice(0, 3).map(item => item.summary);
  return providers.map(provider => {
    const title = provider === 'youtube' ? `${product}, 무엇을 기준으로 고를까?` : '';
    const message = provider === 'instagram'
      ? `${product}, 복잡하게 찾지 마세요.\n${benefit}\n${cta}`
      : provider === 'youtube'
        ? `${audience}을 위한 핵심 선택 기준을 짧게 정리했습니다. ${benefit}\n\n${cta}`
        : `${product}을 찾고 계신가요? ${benefit}\n\n${cta}`;
    return { provider, title, message, guidance: providerGuidance(provider), evidence };
  });
}

function normalizeAiDrafts(value, fallback) {
  const raw = value?.response ?? value?.result ?? value?.text ?? value;
  let parsed = raw;
  if (typeof raw === 'string') {
    const cleaned = raw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '');
    try { parsed = JSON.parse(cleaned); } catch { return fallback; }
  }
  const drafts = Array.isArray(parsed) ? parsed : parsed?.drafts;
  if (!Array.isArray(drafts) || !drafts.length) return fallback;
  return drafts
    .filter(item => ['facebook', 'instagram', 'youtube'].includes(item?.provider))
    .slice(0, 6)
    .map(item => ({
      provider: item.provider,
      title: clean(item.title, 160),
      message: clean(item.message, 5000),
      guidance: clean(item.guidance, 300),
      evidence: Array.isArray(item.evidence) ? item.evidence.map(value => clean(value, 300)).slice(0, 4) : [],
    }));
}

function promptFor(body, learnings, fallback) {
  return [
    '당신은 EKODI의 소셜 영업 콘텐츠 생성 모듈이다.',
    '목표는 과장 없는 유용한 콘텐츠로 실제 클릭과 전환을 돕는 것이다.',
    'Facebook, Instagram, YouTube별 특성에 맞게 서로 다른 문안을 만든다.',
    '사용자에게 보이지 않는 내부 분석 문장은 출력하지 않는다.',
    '반드시 JSON만 출력한다. 형식: {"drafts":[{"provider":"facebook|instagram|youtube","title":"","message":"","guidance":"","evidence":[]}]}',
    `캠페인 입력: ${JSON.stringify({
      topic: clean(body.topic, 300),
      product: clean(body.product, 300),
      benefit: clean(body.benefit || body.valueProposition, 500),
      audience: clean(body.audience, 300),
      cta: clean(body.cta, 200),
      destinationUrl: clean(body.destinationUrl, 1000),
      providers: body.providers,
    })}`,
    `최근 성과 학습: ${JSON.stringify(learnings)}`,
    `규칙 기반 안전 초안 참고: ${JSON.stringify(fallback)}`,
    '성과 학습이 충분하지 않으면 추측하지 말고 기본 원칙을 사용한다.',
  ].join('\n');
}

export async function handleSocialContentAi(request, env) {
  const url = new URL(request.url);
  if (url.pathname !== '/api/control/social/content/generate') return null;
  if (request.method !== 'POST') return json({ error: 'method_not_allowed' }, 405);

  const auth = await requireAdmin(request, env);
  if (!auth.session) return auth.response;
  const body = await readJson(request);
  if (!body || typeof body !== 'object') return json({ error: 'invalid_body' }, 400);
  const tenantId = clean(body.tenantId, 80);
  if (!tenantId) return json({ error: 'tenantId_required' }, 400);

  const learnings = await readLearnings(env, tenantId);
  const fallback = fallbackDrafts(body, learnings);
  const providers = [];
  if (env.AI && env.SOCIAL_AI_MODEL && typeof env.AI.run === 'function') {
    providers.push({
      id: 'cloudflare-workers-ai',
      invoke: () => env.AI.run(env.SOCIAL_AI_MODEL, {
        messages: [
          { role: 'system', content: 'Return valid JSON only.' },
          { role: 'user', content: promptFor(body, learnings, fallback) },
        ],
        temperature: 0.45,
        max_tokens: 1400,
      }),
    });
  }

  const result = await runAiEnhancedTask({
    env,
    providers,
    taskName: 'social_content_generation',
    timeoutMs: 8000,
    fallback: async () => ({ drafts: fallback }),
  });

  const drafts = result.mode === 'ai'
    ? normalizeAiDrafts(result.value, fallback)
    : normalizeAiDrafts(result.value, fallback);

  return json({
    ok: result.ok,
    mode: result.mode,
    provider: result.provider,
    degraded: result.degraded,
    notice: result.notice || '',
    tenantId,
    learningsUsed: learnings.length,
    drafts,
  });
}
