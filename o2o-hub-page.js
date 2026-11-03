import { O2O_SITES } from './o2o-link-core.js';
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[c]));
export function o2oHubPage(request) {
  if (!['GET', 'HEAD'].includes(request.method)) {
    return new Response(null, { status: 405, headers: { allow: 'GET, HEAD', 'cache-control': 'no-store' } });
  }
  const options = O2O_SITES.map((site) =>
    '<option value="' + esc(site.id) + '">' + esc(site.group) + ' · ' + esc(site.name) + '</option>'
  ).join('');
  const html = [
    '<!doctype html><html lang="ko"><head><meta charset="utf-8">',
    '<meta name="viewport" content="width=device-width,initial-scale=1">',
    '<meta name="robots" content="noindex,nofollow">',
    '<title>현장과 온라인 연결 | EKODI</title>',
    '<link rel="stylesheet" href="/o2o-hub.css"></head><body>',
    '<main id="o2o-hub" class="o2o-wrap">',
    '<section class="o2o-hero"><p class="o2o-eyebrow">EKODI O2O · 현장 연결</p>',
    '<h1>현장에서 시작해 온라인으로 이어지는 활동</h1>',
    '<p>모임, 상점, 교육과 책의 공개 페이지를 QR로 연결합니다. 같은 링크를 인쇄물이나 메시지로 공유할 수 있습니다.</p></section>',
    '<div class="o2o-grid"><section class="o2o-panel" aria-labelledby="o2o-form-heading">',
    '<h2 id="o2o-form-heading">현장 연결 QR 만들기</h2>',
    '<form id="o2o-form" novalidate>',
    '<label for="o2o-site">연결할 분야</label><select id="o2o-site" name="site">',
    options, '</select>',
    '<label for="o2o-name">활동·상품·모임 이름</label>',
    '<input id="o2o-name" name="activity" maxlength="90" value="토요모임" autocomplete="off">',
    '<label for="o2o-target">공개 페이지 주소</label>',
    '<input id="o2o-target" name="target" required maxlength="600" spellcheck="false" autocomplete="off" value="/ekodimission">',
    '<p class="o2o-help">선택한 사이트의 공개 주소만 사용합니다. 관리자 페이지, 비공개 링크, 개인정보가 담긴 주소는 사용할 수 없습니다.</p>',
    '<button type="submit" class="o2o-primary">QR 만들기</button>',
    '</form><p id="o2o-status" role="status" aria-live="polite"></p></section>',
    '<section class="o2o-panel o2o-preview" aria-labelledby="o2o-preview-heading">',
    '<h2 id="o2o-preview-heading">연결 미리보기</h2>',
    '<div id="o2o-qr" class="o2o-qr" aria-label="선택한 공개 페이지 QR 코드"></div>',
    '<p id="o2o-link" class="o2o-url"></p>',
    '<div class="o2o-actions"><a id="o2o-open" href="/ekodimission" rel="noopener">연결 페이지 열기</a>',
    '<button id="o2o-copy" type="button">공유 문구 복사</button>',
    '<button id="o2o-download" type="button">QR 이미지 저장</button>',
    '<button id="o2o-print" type="button">인쇄하기</button></div>',
    '</section></div>',
    '<section class="o2o-notice"><h2>참여 확인과 포인트는 별도로 처리합니다</h2>',
    '<p>QR을 스캔하거나 페이지를 열어도 신청·출석·구매·포인트 적립이 자동으로 확정되지 않습니다. 실제 활동은 각 사이트의 기존 신청 및 운영자 확인 절차를 사용합니다.</p>',
    '<p>현재는 공개 링크를 연결하는 시범 기능입니다. 별도 개인정보를 수집하거나 저장하지 않습니다. QR에 담긴 주소와 활동 이름에 개인정보가 포함되지 않았는지 확인하십시오. QR 이용통계·AI 상담·현장 체크인은 아직 연결하지 않았습니다.</p></section>',
    '</main><script src="/o2o-qr-vendor.js" defer></script>',
    '<script type="module" src="/o2o-hub-client.js"></script></body></html>'
  ].join('');
  return new Response(request.method === 'HEAD' ? null : html, {
    status: 200, headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' }
  });
}
