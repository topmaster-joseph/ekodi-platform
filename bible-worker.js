import { injectEkodiShell } from './ekodi-shell-injector.js';
import { bibleCorePolicy, bibleProviderCatalog, readBiblePassage, readBibleReference, searchBible } from './bible-core.js';

const MAX_MESSAGE = 4000;
const MAX_HISTORY = 8;
const USER_AI_URL = 'https://api.ekodi.kr/api/user-ai/assist';
const CANONICAL_HOST = 'ekodi.kr';
const CANONICAL_PREFIX = '/bible';
const LEGACY_HOST = 'bible.ekodi.kr';

const TOPICS = {
  관계: ['골로새서 3:12-14', '지금 그 관계에서 가장 지키고 싶은 것은 무엇인가요?'],
  가족: ['에베소서 4:1-3', '가족에게 지금 가장 먼저 건넬 수 있는 작은 평화의 행동은 무엇인가요?'],
  돈: ['마태복음 6:25-34', '돈에 대한 염려 가운데 오늘 내가 통제할 수 있는 한 가지는 무엇인가요?'],
  일: ['골로새서 3:23-24', '오늘의 일을 사람의 평가보다 더 큰 의미와 연결한다면 무엇이 달라질까요?'],
  진로: ['잠언 3:5-6', '앞길 전체가 아니라 지금 분명히 걸을 수 있는 한 걸음은 무엇인가요?'],
  외로움: ['시편 139:1-12', '외로움 속에서 누군가에게 먼저 연결을 요청할 수 있다면 누구인가요?'],
  실패: ['고린도후서 4:7-9', '이번 실패가 끝이라고 말하지 않는다면 무엇을 다시 시작할 수 있을까요?'],
  분노: ['야고보서 1:19-20', '분노 아래에 숨은 상처나 두려움은 무엇인가요?'],
  감사: ['데살로니가전서 5:16-18', '오늘 받은 것 가운데 다른 사람에게 흘려보낼 수 있는 감사는 무엇인가요?'],
  믿음: ['마가복음 9:24', '믿음과 의심이 함께 있다면 지금 하나님께 가장 정직하게 말하고 싶은 것은 무엇인가요?'],
};

const SECURITY_HEADERS = {
  'x-content-type-options': 'nosniff',
  'referrer-policy': 'strict-origin-when-cross-origin',
  'permissions-policy': 'camera=(), microphone=(), geolocation=()',
  'content-security-policy': "default-src 'self'; script-src 'self' https://cdn.jsdelivr.net; style-src 'self'; img-src 'self' data: https:; connect-src 'self' https://renzehysxirjilvdxacv.supabase.co; frame-ancestors 'none'; base-uri 'self'; form-action 'self'; upgrade-insecure-requests",
};

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store',
      ...SECURITY_HEADERS,
    },
  });
}

function runtimeConfig(env) {
  const dataEnabled = env.DATA_ENABLED === 'true' && Boolean(env.SUPABASE_URL && env.SUPABASE_PUBLISHABLE_KEY);
  return {
    dataEnabled,
    dataMode: env.DATA_MODE || 'isolated-staging',
    supabaseUrl: dataEnabled ? env.SUPABASE_URL : '',
    supabasePublishableKey: dataEnabled ? env.SUPABASE_PUBLISHABLE_KEY : '',
    authUrl: env.AUTH_URL || 'https://auth.ekodi.kr/?site=bible',
    tenantSlug: env.TENANT_SLUG || 'ekodi-church',
    canonicalUrl: 'https://ekodi.kr/bible',
    legacyAlias: 'https://bible.ekodi.kr',
  };
}

function clean(value, max = MAX_MESSAGE) {
  return String(value ?? '').replace(/[<>]/g, '').trim().slice(0, max);
}

function normalizeBiblePath(pathname) {
  if (pathname === CANONICAL_PREFIX || pathname === CANONICAL_PREFIX + '/') return '/';
  if (pathname.startsWith(CANONICAL_PREFIX + '/')) return pathname.slice(CANONICAL_PREFIX.length) || '/';
  return pathname;
}

function legacyCanonicalRedirect(url) {
  if (url.hostname.toLowerCase() !== LEGACY_HOST) return null;
  const suffix = url.pathname === '/' ? '' : url.pathname;
  const target = new URL('https://' + CANONICAL_HOST + CANONICAL_PREFIX + suffix);
  target.search = url.search;
  return Response.redirect(target.toString(), 308);
}

function requestAtPath(request, pathname) {
  const url = new URL(request.url);
  url.pathname = pathname;
  return new Request(url, request);
}

function topicGuide(topic) {
  return TOPICS[topic] || ['요한복음 1:14', '지금 삶에서 말씀과 함께 천천히 바라보고 싶은 것은 무엇인가요?'];
}

function fallbackReply(topic, message) {
  const [scriptureRef, question] = topicGuide(topic);
  const lead = message
    ? `“${clean(message, 180)}”라고 말씀하셨군요. 그 말을 서둘러 해석하지 않고 먼저 곁에 두겠습니다.`
    : '정답부터 말하기보다 지금의 이야기를 먼저 듣겠습니다.';
  return {
    reply: `${lead}\n\n${scriptureRef}을 함께 펼쳐볼 수 있습니다. ${question}`,
    scriptureRef,
  };
}

async function verifyUser(request, env) {
  const auth = request.headers.get('authorization') || '';
  if (!auth.startsWith('Bearer ') || !env.SUPABASE_URL || !env.SUPABASE_PUBLISHABLE_KEY) return null;
  try {
    const response = await fetch(`${env.SUPABASE_URL}/auth/v1/user`, {
      headers: { authorization: auth, apikey: env.SUPABASE_PUBLISHABLE_KEY },
    });
    if (!response.ok) return null;
    const user = await response.json();
    return user?.id ? user : null;
  } catch {
    return null;
  }
}

function buildBiblePrompt({ topic, scriptureRef, scriptureText, history, message }) {
  const recent = (Array.isArray(history) ? history : [])
    .slice(-MAX_HISTORY)
    .map(item => `${item?.role === 'assistant' ? '말씀대화' : '사용자'}: ${clean(item?.content || item?.text, 900)}`)
    .join('\n');
  const instructions = [
    '역할: EKODI 말씀대화의 성경 묵상 대화 도우미. 목회자나 교회를 대체하지 않는다.',
    '한국어로 따뜻하고 간결하게 답한다. 설교문처럼 길게 설명하지 말고 사용자의 말을 먼저 듣는다.',
    '성경 본문과 해석을 엄격히 구분한다. 제공된 본문은 KRV1961 원문이며 수정·교정·의역하거나 AI 문장을 성경본문처럼 제시하지 않는다.',
    '성경본문은 별도 scripture 필드로 표시되므로 답변에서는 본문 전체를 재출력하지 않는다. 필요한 경우 짧은 표현만 인용하고 반드시 해석임을 분명히 한다.',
    '하나님이 사용자에게 직접 특정 내용을 말씀하셨다고 선언하거나 예언하지 않는다.',
    '가능하면 연결된 본문을 근거로 3~7문장 안에서 답하고 마지막에는 사용자가 답할 수 있는 질문 하나를 둔다.',
    '개인정보 공개를 권하지 않는다. 공동체 공유는 사용자의 명시적 선택이 있을 때만 권한다.',
    '자해·타해·학대·폭력·즉각적 위험이 드러나면 영적 조언만 하지 말고 지역 응급지원, 신뢰할 수 있는 사람, 전문기관의 도움을 함께 권한다.',
  ].join('\n');
  return clean(`${instructions}\n\n주제: ${clean(topic, 60)}\n연결 본문: ${clean(scriptureRef, 120)}\n검증된 성경본문(KRV1961, 원문 그대로):\n${clean(scriptureText, 1600) || '(본문 조회 실패, 참조만 사용)'}\n최근 대화:\n${recent || '(없음)'}\n\n현재 사용자 이야기: ${clean(message, 1400)}`, 3900);
}

async function centralAiReply(request, context) {
  const auth = request.headers.get('authorization') || '';
  const response = await fetch(USER_AI_URL, {
    method: 'POST',
    headers: {
      authorization: auth,
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      site: 'bible',
      intent: 'interactive',
      aiRequired: true,
      dataClass: 'private',
      message: buildBiblePrompt(context),
    }),
  });
  let data = null;
  try { data = await response.json(); } catch {}
  if (!response.ok || data?.mode !== 'ai' || !String(data?.text || '').trim()) return null;
  return {
    text: String(data.text).trim(),
    provider: data.provider || null,
    funding: data.funding || null,
    model: data.model || null,
  };
}

async function handleAssist(request, env) {
  let body = null;
  try { body = await request.json(); } catch { return json({ error: 'INVALID_JSON' }, 400); }
  const message = clean(body?.message);
  const topic = clean(body?.topic, 60) || '믿음';
  if (!message) return json({ error: 'MESSAGE_REQUIRED' }, 400);

  const user = await verifyUser(request, env);
  if (!user) {
    return json({
      ok: false,
      error: 'authentication_required',
      authenticated: false,
      notice: 'Google 로그인 후 말씀대화를 이용할 수 있습니다.',
    }, 401);
  }

  const [scriptureRef] = topicGuide(topic);
  const fallback = fallbackReply(topic, message);
  const scripture = await readBibleReference(request, env, scriptureRef, 'KRV1961').catch(() => null);
  const scriptureText = scripture?.ok ? scripture.verses.map(verse => `${verse.verse} ${verse.text}`).join('\n') : '';
  try {
    const ai = await centralAiReply(request, {
      message,
      topic,
      scriptureRef,
      scriptureText,
      history: Array.isArray(body?.history) ? body.history : [],
    });
    if (ai) {
      return json({
        ok: true,
        mode: 'ai',
        degraded: false,
        authenticated: true,
        reply: ai.text,
        scriptureRef,
        scripture: scripture?.ok ? scripture : null,
        provider: ai.provider,
        funding: ai.funding,
        model: ai.model,
        notice: '',
      });
    }
  } catch (error) {
    console.error('Bible central AI gateway error', error);
  }

  return json({
    ok: true,
    mode: 'free_assist',
    degraded: true,
    authenticated: true,
    ...fallback,
    scripture: scripture?.ok ? scripture : null,
    notice: 'AI 고급 연결이 준비되지 않았거나 사용 한도에 도달해 기본 말씀대화 모드로 이어갑니다.',
  });
}

async function handleBibleApi(request, env, url) {
  if (request.method !== 'GET') return json({ ok:false, error:'method_not_allowed' }, 405);
  if (url.pathname === '/api/bible/providers') {
    return json({ ok:true, policy:bibleCorePolicy(), providers:bibleProviderCatalog() });
  }
  if (url.pathname === '/api/bible/passage') {
    const reference = clean(url.searchParams.get('reference'), 120);
    const provider = clean(url.searchParams.get('provider') || url.searchParams.get('translation'), 30) || 'KRV1961';
    const result = reference
      ? await readBibleReference(request, env, reference, provider)
      : await readBiblePassage(request, env, {
          provider,
          bookId:clean(url.searchParams.get('book'), 40),
          chapter:Number(url.searchParams.get('chapter')),
          verseStart:Number(url.searchParams.get('verseStart') || url.searchParams.get('verse')) || null,
          verseEnd:Number(url.searchParams.get('verseEnd')) || null,
        });
    return json(result, result.ok ? 200 : 400);
  }
  if (url.pathname === '/api/bible/search') {
    const result = await searchBible(request, env, url.searchParams.get('q'), url.searchParams.get('limit'));
    return json(result, result.ok ? 200 : 400);
  }
  return json({ ok:false, error:'not_found' }, 404);
}

function withHeaders(response) {
  const headers = new Headers(response.headers);
  for (const [key, value] of Object.entries(SECURITY_HEADERS)) headers.set(key, value);
  if (!headers.has('cache-control')) {
    headers.set('cache-control', response.headers.get('content-type')?.includes('text/html') ? 'no-cache' : 'public, max-age=300');
  }
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
}

async function assetFor(request, env, path) {
  const url = new URL(request.url);
  url.pathname = path;
  return env.ASSETS.fetch(new Request(url, request));
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const legacyRedirect = legacyCanonicalRedirect(url);
    if (legacyRedirect) return legacyRedirect;
    const internalUrl = new URL(url);
    internalUrl.pathname = normalizeBiblePath(url.pathname);
    if (internalUrl.pathname === '/health') {
      return json({
        ok: true,
        service: 'ekodi-bible-conversation',
        surface: 'scripture-conversation',
        areas: ['today', 'reader', 'search', 'conversation', 'journey', 'together'],
        privacyDefault: 'private',
        explicitSharing: true,
        providerIndependent: true,
        centralUserAi: true,
        bibleCore: bibleCorePolicy(),
        bibleProviders: bibleProviderCatalog().map(provider => ({ id:provider.id, mode:provider.mode })),
        dataMode: runtimeConfig(env).dataMode,
        canonicalPath: CANONICAL_PREFIX,
        legacyAlias: LEGACY_HOST,
        ekodiShell: true,
      });
    }
    if (internalUrl.pathname === '/config.js') {
      return new Response(`window.EKODI_BIBLE_CONFIG=${JSON.stringify(runtimeConfig(env))};`, {
        headers: { 'content-type': 'application/javascript; charset=utf-8', 'cache-control': 'no-store', ...SECURITY_HEADERS },
      });
    }
    if (internalUrl.pathname.startsWith('/api/bible/')) return handleBibleApi(request, env, internalUrl);
    if (internalUrl.pathname === '/api/assist' && request.method === 'POST') return handleAssist(request, env);
    if (internalUrl.pathname === '/admin' || internalUrl.pathname === '/admin/') return Response.redirect('https://admin.ekodi.kr/#ai-services', 307);

    let response;
    const route = internalUrl.pathname.replace(/\/$/, '');
    if (['/today', '/reader', '/search', '/conversation', '/journey', '/together'].includes(route)) response = await assetFor(request, env, '/');
    else response = await env.ASSETS.fetch(requestAtPath(request, internalUrl.pathname));
    return injectEkodiShell(withHeaders(response), 'bible');
  },
};
