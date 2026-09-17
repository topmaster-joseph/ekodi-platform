const PUBLIC_PATH = '/ekodichurch/history';
const ADMIN_PATH = '/ekodichurch/admin/history';
const API_PATH = '/api/church/admin/history';

const SAMPLE = [
  ['2014년 9월 6일', '지역교회에서의 섬김', '지역교회에서 외국인 유학생을 섬기다'],
  ['2018년 3월 14일', '선교 공동체의 형성', '한국외국인선교회 무안지부와 에코디선교회'],
  ['2018년 8월 13일', '공동체의 전환점', '또 하나의 창립·개척 이정표'],
  ['2018년 10월 9일', '글로벌비전센터', '글로벌비전센터 설립예배'],
];

function html(body, status = 200, method = 'GET') {
  return new Response(method === 'HEAD' ? null : body, {
    status,
    headers: {
      'content-type': 'text/html; charset=utf-8',
      'cache-control': 'no-store',
      'x-content-type-options': 'nosniff',
      'x-ekodi-data-mode': 'isolated-staging',
    },
  });
}

function json(data, status = 200, method = 'GET') {
  return new Response(method === 'HEAD' ? null : JSON.stringify(data), {
    status,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store',
      'x-content-type-options': 'nosniff',
      'x-ekodi-data-mode': 'isolated-staging',
    },
  });
}

function publicPage() {
  const cards = SAMPLE.map(([date, era, title]) => `<article><time>${date}</time><small>${era}</small><h2>${title}</h2><p>Development 계정의 검증용 샘플입니다. 운영 교회 데이터와 연결되지 않습니다.</p></article>`).join('');
  return `<!doctype html><html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>지나온 길 · EKODI Church Staging</title><style>body{font-family:system-ui,sans-serif;margin:0;background:#f5f8f5;color:#17221d}.wrap{width:min(820px,calc(100% - 28px));margin:auto;padding:52px 0}h1{font-size:48px;letter-spacing:-.06em;margin:0 0 12px}.notice{background:#173e2e;color:#fff;padding:18px;border-radius:16px;margin:24px 0}article{background:#fff;border:1px solid #dfe7e2;border-radius:16px;padding:18px;margin:12px 0}time{font-weight:800}small{margin-left:10px;color:#637068}h2{font-size:20px;margin:8px 0}p{color:#637068;margin:0}</style></head><body><main class="wrap"><h1>지나온 길</h1><p>교회의 이름이 생긴 날보다 먼저 시작된 만남과 섬김을 기억합니다.</p><div class="notice"><strong>ISOLATED STAGING</strong><br>이 화면은 Development Cloudflare 계정의 UI·라우팅 검증 전용이며 운영 D1이나 실제 교회 개인정보를 읽지 않습니다.</div>${cards}</main></body></html>`;
}

function adminPage() {
  return `<!doctype html><html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>역사 아카이브 · Staging</title><style>body{font-family:system-ui,sans-serif;background:#f4f6f4;color:#17221d;margin:0}.wrap{max-width:760px;margin:60px auto;padding:24px}.card{background:white;border:1px solid #dde5df;border-radius:18px;padding:24px}.badge{display:inline-block;background:#eaf4ee;color:#1f6a4b;border-radius:999px;padding:6px 10px;font-size:12px}</style></head><body><main class="wrap"><section class="card"><span class="badge">Development · isolated-staging</span><h1>역사 아카이브</h1><h2>지나온 길 기록관리</h2><p>관리자 UI 라우팅과 인증 경계를 확인하는 스테이징 화면입니다. 운영 D1 데이터의 조회·수정·삭제는 이 환경에서 차단됩니다.</p></section></main></body></html>`;
}

export default {
  async fetch(request) {
    const url = new URL(request.url);
    const path = url.pathname.replace(/\/+$/, '') || '/';
    if (path === PUBLIC_PATH) return html(publicPage(), 200, request.method);
    if (path === ADMIN_PATH) return html(adminPage(), 200, request.method);
    if (path === API_PATH || path.startsWith(`${API_PATH}/`)) return json({ error: 'staging_auth_required', dataMode: 'isolated-staging' }, 401, request.method);
    return json({ error: 'not_found', dataMode: 'isolated-staging' }, 404, request.method);
  },
};
