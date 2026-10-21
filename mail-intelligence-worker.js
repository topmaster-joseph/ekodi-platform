import { mailSummary, runMailIntelligence } from './mail-intelligence-core.js';

const ADMIN_ORIGIN = 'https://admin.ekodi.kr';
const CONTROL_SESSION_URL = 'https://api.ekodi.kr/api/session';

function json(data, status = 200, origin = '') {
  const headers = new Headers({
    'content-type':'application/json; charset=utf-8',
    'cache-control':'no-store',
    'x-content-type-options':'nosniff',
    'referrer-policy':'no-referrer',
    'x-frame-options':'DENY',
  });
  if (origin === ADMIN_ORIGIN) {
    headers.set('access-control-allow-origin', origin);
    headers.set('access-control-allow-headers', 'authorization, content-type, x-ekodi-confirm-impact');
    headers.set('access-control-allow-methods', 'GET, POST, OPTIONS');
    headers.set('vary', 'Origin');
  }
  return new Response(JSON.stringify(data), { status, headers });
}

function originOf(request) {
  const origin = String(request.headers.get('origin') || '').trim();
  return origin === ADMIN_ORIGIN ? origin : '';
}

async function adminSession(request) {
  const headers = new Headers();
  const auth = request.headers.get('authorization');
  if (auth) headers.set('authorization', auth);
  const response = await fetch(CONTROL_SESSION_URL, { method:'GET', headers });
  if (!response.ok) return null;
  const session = await response.json().catch(() => null);
  return session?.ok === false ? null : session;
}

async function handleApi(request, env) {
  const url = new URL(request.url);
  const origin = originOf(request);
  if (request.method === 'OPTIONS') {
    if (!origin) return json({ error:'허용되지 않은 Origin입니다.' }, 403);
    return new Response(null, { status:204, headers:{
      'access-control-allow-origin':origin,
      'access-control-allow-headers':'authorization, content-type, x-ekodi-confirm-impact',
      'access-control-allow-methods':'GET, POST, OPTIONS',
      'access-control-max-age':'86400',
      'vary':'Origin',
    }});
  }
  if (!origin) return json({ error:'관리자 Origin에서만 접근할 수 있습니다.', code:'ORIGIN_FORBIDDEN' }, 403);
  if (!await adminSession(request)) return json({ error:'관리자 로그인이 필요합니다.', code:'UNAUTHORIZED' }, 401, origin);

  if (request.method === 'GET' && url.pathname === '/api/mail/status') {
    return json(await mailSummary(env, 25), 200, origin);
  }
  if (request.method === 'GET' && url.pathname === '/api/mail/messages') {
    return json(await mailSummary(env, url.searchParams.get('limit') || 50), 200, origin);
  }
  if (request.method === 'POST' && url.pathname === '/api/mail/run') {
    if (request.headers.get('x-ekodi-confirm-impact') !== 'RUN') {
      return json({ error:'수동 수집 실행 확인 헤더가 필요합니다.', code:'CONFIRMATION_REQUIRED' }, 409, origin);
    }
    return json(await runMailIntelligence(env, { force:false }), 200, origin);
  }
  return json({ error:'경로를 찾을 수 없습니다.', code:'NOT_FOUND' }, 404, origin);
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname === '/health') {
      return json({ ok:true, service:'ekodi-mail-intelligence', gmailConfigured:Boolean(env.GMAIL_REFRESH_TOKEN), databaseConfigured:Boolean(env.DB) });
    }
    if (url.pathname.startsWith('/api/mail/')) return handleApi(request, env);
    return json({
      service:'EKODI Mail Intelligence',
      status:Boolean(env.GMAIL_REFRESH_TOKEN) ? 'configured' : 'waiting_connection',
      privacy:'메일 원문 전체를 장기 저장하지 않고 분석 요약과 운영 메타데이터만 D1에 저장합니다.',
      schedule:'10 minutes',
    });
  },
  async scheduled(_controller, env, ctx) {
    const task = runMailIntelligence(env).catch(error => {
      console.error('EKODI Mail Intelligence scheduled run failed', error);
      return { ok:false, status:'error', message:String(error?.message || error) };
    });
    if (ctx?.waitUntil) ctx.waitUntil(task);
    return task;
  },
};
