// EKODIBIZ refund policy — canonical public page at https://ekodi.kr/ekodibiz/refund
// Served by the Shared Site router ("/ekodibiz*" is already Worker-first), so it needs
// no extra run_worker_first entry (that list is at the Cloudflare 100-entry limit).
export const EKODIBIZ_REFUND_POLICY_PATH = '/ekodibiz/refund';
export const EKODIBIZ_REFUND_POLICY_URL = 'https://ekodi.kr/ekodibiz/refund';
export const EKODIBIZ_REFUND_POLICY_VERSION = 'v1.0';
export const EKODIBIZ_REFUND_POLICY_EFFECTIVE = '2026-10-22';

const OPERATOR = Object.freeze({
  name: '에코디비즈',
  representative: '정찬균',
  businessRegistrationNumber: '213-13-01959',
  commerceRegistrationNumber: '2023-전남무안-0153',
  address: '전남광주통합특별시 무안군 청계면 백련동1길 17-4, 건물 1층',
  email: 'joseph@ekodibiz.kr',
  phone: '010-3501-8542',
});

export function isEkodiBizRefundPolicyPath(pathname = '') {
  return /^\/ekodibiz\/refund(?:-policy)?\/?$/i.test(String(pathname || ''));
}

export function ekodiBizRefundPolicyHtml() {
  const o = OPERATOR;
  return `<!doctype html>
<html lang="ko">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
  <title>환불정책 | 에코디비즈 EKODIBIZ</title>
  <meta name="description" content="에코디비즈가 판매·제공하는 상품, 디지털콘텐츠, 용역의 청약철회·환불 기준과 절차를 안내합니다.">
  <link rel="canonical" href="${EKODIBIZ_REFUND_POLICY_URL}">
  <meta name="robots" content="index,follow">
  <style>
    :root{color-scheme:light dark;--bg:#f7f7f3;--card:#fff;--text:#17211c;--muted:#59635d;--line:#dfe4df;--accent:#1f6b4f;--soft:#eef5f0}
    @media(prefers-color-scheme:dark){:root{--bg:#101512;--card:#18201b;--text:#edf4ef;--muted:#b0bbb4;--line:#344038;--accent:#8fd2ad;--soft:#202c25}}
    *{box-sizing:border-box}html{scroll-behavior:smooth}body{margin:0;background:var(--bg);color:var(--text);font-family:system-ui,-apple-system,"Noto Sans KR",sans-serif;line-height:1.72}
    main{max-width:920px;margin:0 auto;padding:40px 16px 72px}article{background:var(--card);border:1px solid var(--line);border-radius:20px;padding:clamp(22px,5vw,42px);box-shadow:0 18px 48px rgba(22,36,28,.06)}
    h1{margin:.2rem 0 .4rem;font-size:clamp(1.8rem,5vw,2.45rem);letter-spacing:-.035em}h2{margin:2.25rem 0 .7rem;font-size:1.18rem;letter-spacing:-.02em}
    p,li,td{color:var(--muted)}a{color:var(--accent);text-underline-offset:3px}.brand{font-weight:800;letter-spacing:.08em;color:var(--text);text-decoration:none}
    .meta{font-size:.9rem}.lead{font-size:1.03rem}.summary{margin:1.4rem 0;padding:16px 18px;background:var(--soft);border:1px solid var(--line);border-radius:14px}.summary strong{color:var(--text)}
    ul,ol{padding-left:1.25rem}.table-wrap{overflow-x:auto;margin:.6rem 0}table{width:100%;border-collapse:collapse;font-size:.94rem;min-width:560px}
    th,td{border:1px solid var(--line);padding:9px 11px;text-align:left;vertical-align:top}th{background:var(--soft);color:var(--text);font-weight:700}
    .operator{display:grid;grid-template-columns:150px 1fr;gap:7px 14px;margin-top:.8rem;font-size:.94rem}.operator dt{font-weight:700;color:var(--text)}.operator dd{margin:0;color:var(--muted)}
    .links{display:flex;flex-wrap:wrap;gap:12px;margin-top:2rem;padding-top:1.25rem;border-top:1px solid var(--line)}
    @media(max-width:640px){.operator{grid-template-columns:1fr;gap:2px}.operator dd{margin-bottom:8px}}
    /* EKODIBIZ service-local chrome: mirrors the public home without loading browser scripts. */
    body{min-height:100vh;display:flex;flex-direction:column}
    .topbar{min-height:68px;width:100%;display:flex;align-items:center;justify-content:space-between;gap:12px;padding:10px max(22px,calc((100vw - 1160px)/2));border-bottom:1px solid var(--line);background:var(--card)}
    .topbar .brand{font-size:15px;font-weight:950;letter-spacing:.08em;white-space:nowrap}
    .topbar nav{display:flex;align-items:center;flex-wrap:wrap;gap:4px}
    .topbar nav a{display:inline-flex;min-height:44px;align-items:center;padding:9px 11px;border-radius:9px;font-size:13px;color:var(--text);text-decoration:none}
    .topbar nav a:hover,.topbar nav a:focus-visible,.topbar nav a[aria-current="page"]{background:var(--soft);color:var(--accent)}
    main{flex:1;width:100%}.back-link{display:inline-flex;align-items:center;min-height:44px;font-size:13px;font-weight:750;text-decoration:none}
    .footer{width:min(1120px,calc(100% - 40px));margin:0 auto 28px;padding:28px 0;border-top:1px solid var(--line);display:grid;gap:10px;justify-items:center;text-align:center;color:var(--muted)}
    .footer strong{display:block;color:var(--text);font-size:13px;letter-spacing:.08em}.footer span{font-size:11px}
    .footer p{font-size:12px;line-height:1.75;margin:0}.footer nav{display:flex;gap:8px 12px;flex-wrap:wrap;justify-content:center}
    .footer nav a{display:inline-flex;align-items:center;min-height:44px;font-size:12px;text-decoration:none}
    .footer nav a[aria-current="page"]{font-weight:800;text-decoration:underline}
    :focus-visible{outline:2px solid var(--accent);outline-offset:3px}
    @media(max-width:640px){.topbar{padding:8px 12px;align-items:flex-start;flex-wrap:wrap}.topbar nav{width:100%}.topbar nav a{padding:8px 10px}.footer{width:calc(100% - 28px)}main{padding-top:20px}}
  </style>
</head>
<body>
<header class="topbar" data-site-shell="header" role="banner">
  <a class="brand" href="/ekodibiz" aria-label="에코디비즈 홈">EKODIBIZ</a>
  <nav aria-label="에코디비즈 주요 메뉴">
    <a href="/ekodibiz/#business">사업분야</a>
    <a href="/terms">이용약관</a>
    <a href="/ekodibiz/refund" aria-current="page">환불정책</a>
  </nav>
</header>
<main><article data-ekodibiz-refund-policy="${EKODIBIZ_REFUND_POLICY_VERSION}">
  <a class="back-link" href="/ekodibiz">← 에코디비즈 홈</a>
  <h1>환불정책</h1>
  <p class="meta">시행일: 2026년 10월 22일 · 에코디비즈 환불정책 ${EKODIBIZ_REFUND_POLICY_VERSION}</p>
  <p class="lead">에코디비즈(이하 “회사”)는 「전자상거래 등에서의 소비자보호에 관한 법률」(이하 “전자상거래법”) 등 관계 법령에 따라 고객이 안심하고 거래할 수 있도록 청약철회와 환불의 기준·절차를 다음과 같이 정합니다.</p>

  <div class="summary">
    <strong>한눈에 보기</strong>
    <ul>
      <li>상품을 받은 날(계약서를 받은 날이 더 늦으면 그날)부터 <strong>7일 이내</strong> 청약철회를 신청할 수 있습니다.</li>
      <li>상품이 표시·광고나 계약 내용과 다르면 받은 날부터 <strong>3개월 이내</strong>, 그 사실을 안 날부터 <strong>30일 이내</strong>에 청약철회할 수 있으며 반환비용은 회사가 부담합니다.</li>
      <li>회사는 상품을 돌려받은 날(용역·디지털콘텐츠는 청약철회를 한 날)부터 <strong>3영업일 이내</strong>에 대금을 환급합니다.</li>
      <li>견적서·계약서로 진행하는 용역, 주문제작, 사업자 간(B2B) 무역 거래는 아래 유형별 기준과 개별 계약을 함께 적용합니다.</li>
    </ul>
  </div>

  <h2>1. 적용 범위</h2>
  <p>본 정책은 회사가 <code>ekodi.kr/ekodibiz</code> 및 회사가 직접 판매자로 표시된 EKODI 서비스(에코디몰 직접판매, 도서출판, 프로그램 개발·컨설팅·마케팅·AI 운영 서비스 등)에서 판매하거나 제공하는 재화, 디지털콘텐츠, 용역(이하 “상품등”)에 적용됩니다.</p>
  <ul>
    <li>입점·제휴 판매자, 외부 쇼핑몰·오픈마켓, 제휴 링크를 통해 구매한 상품은 해당 판매자 또는 플랫폼의 환불정책이 적용됩니다.</li>
    <li>개별 견적서·계약서에 별도 조건이 있는 경우 그 조건을 우선 적용합니다. 다만 소비자에게 불리하여 법령상 효력이 없는 약정은 적용하지 않습니다.</li>
    <li>투자·협력 사업 등 상품등의 판매가 아닌 거래는 해당 계약에 따릅니다.</li>
  </ul>

  <h2>2. 청약철회 기간</h2>
  <ol>
    <li>고객은 계약 내용에 관한 서면(전자문서 포함)을 받은 날부터 7일 이내에 청약철회를 할 수 있습니다. 서면을 받은 때보다 상품등의 공급이 늦게 이루어진 경우에는 공급받거나 공급이 시작된 날부터 7일 이내입니다.</li>
    <li>상품등의 내용이 표시·광고 또는 계약 내용과 다르거나 계약과 다르게 이행된 경우에는 공급받은 날부터 3개월 이내, 그 사실을 안 날 또는 알 수 있었던 날부터 30일 이내에 청약철회를 할 수 있습니다.</li>
  </ol>

  <h2>3. 청약철회가 제한되는 경우</h2>
  <p>다음의 경우에는 관계 법령에 따라 청약철회가 제한될 수 있습니다. 회사는 제한 사유가 있는 상품등에 대하여 구매 전 그 사실을 상품 화면이나 포장 등에 명확히 표시하고, 가능한 경우 시험 사용 상품이나 일부 체험 등을 제공합니다. 이러한 조치를 하지 않은 경우에는 제한 사유를 들어 청약철회를 거절하지 않습니다.</p>
  <ul>
    <li>고객의 책임 있는 사유로 상품등이 멸실되거나 훼손된 경우(내용 확인을 위해 포장을 훼손한 경우는 제외)</li>
    <li>고객의 사용 또는 일부 소비로 상품등의 가치가 현저히 감소한 경우</li>
    <li>시간이 지나 다시 판매하기 곤란할 정도로 상품등의 가치가 현저히 감소한 경우</li>
    <li>복제가 가능한 상품등의 포장을 훼손한 경우</li>
    <li>디지털콘텐츠의 제공이 개시된 경우(가분적 콘텐츠의 경우 제공이 개시되지 않은 부분은 제외)</li>
    <li>고객의 주문에 따라 개별적으로 생산·조달되는 상품등으로서 청약철회 시 회사에 회복할 수 없는 중대한 피해가 예상되어, 그 사실을 사전에 따로 알리고 고객의 서면(전자문서 포함) 동의를 받은 경우</li>
  </ul>

  <h2>4. 상품 유형별 환불 기준</h2>
  <div class="table-wrap"><table>
    <thead><tr><th scope="col">구분</th><th scope="col">환불 기준</th></tr></thead>
    <tbody>
      <tr><td>일반 상품·도서(실물)</td><td>수령 후 7일 이내 청약철회 가능. 단순 변심에 따른 반환 배송비는 고객 부담이며, 하자·오배송·표시광고 상이의 경우 왕복 배송비를 포함한 반환비용은 회사가 부담합니다.</td></tr>
      <tr><td>전자책 등 디지털콘텐츠</td><td>다운로드·열람 등 제공이 개시되기 전에는 전액 환불합니다. 제공 개시 후에는 제3항에 따라 제한될 수 있으나, 콘텐츠 하자나 제공 불가 시에는 전액 환불합니다.</td></tr>
      <tr><td>용역<br>(프로그램 개발, 컨설팅, 마케팅, AI·디지털 운영 대행 등)</td><td>착수 전 해지: 결제금액 전액 환불.<br>착수 후 해지: 이미 제공한 용역의 대가와 그 공급에 든 비용(외부 구매·라이선스·광고 집행비 등 실비)을 공제한 금액을 환불하며, 공제 내역은 산출 근거와 함께 안내합니다.<br>완료·인도 후: 계약 내용과 다른 경우 보완 또는 환불을 협의합니다.</td></tr>
      <tr><td>정기결제·구독형 서비스</td><td>다음 결제일 전에 해지하면 다음 회차부터 청구하지 않습니다. 이용기간 중 해지 시 이용하지 않은 기간에 해당하는 금액을 일할 계산하여 환불하며, 첫 결제 후 7일 이내이고 이용 이력이 없으면 전액 환불합니다.</td></tr>
      <tr><td>주문제작·해외 구매대행·특수 조달 상품</td><td>발주·제작 착수 전에는 전액 환불합니다. 착수 후에는 제3항의 사전 고지와 서면 동의가 있는 경우에 한해 청약철회가 제한되며, 이 경우에도 하자나 계약과 다른 이행은 회사가 책임집니다. 해외 반송비·관부가세 등 실비 처리는 견적서에 미리 표시한 기준을 따릅니다.</td></tr>
      <tr><td>사업자 간(B2B) 무역·도매 거래</td><td>사업자가 영업 목적으로 구매하는 거래는 견적서·발주서·계약서(인코텀즈, 검수 기준, 취소 수수료 등)에서 정한 조건에 따릅니다. 수입·수출 통관 후의 반품은 해당 국가 법령과 운송 조건을 함께 고려하여 협의합니다.</td></tr>
    </tbody>
  </table></div>

  <h2>5. 환불 신청 방법</h2>
  <ol>
    <li>이메일(<a href="mailto:${o.email}">${o.email}</a>) 또는 전화(${o.phone})로 신청합니다.</li>
    <li>주문번호(또는 견적번호), 주문자 성명·연락처, 환불 사유, 하자가 있는 경우 사진 등 확인 자료를 함께 보내 주세요.</li>
    <li>회사는 접수 후 지체 없이 접수 사실과 반품 방법(회수지, 운송 방법 등)을 안내합니다.</li>
  </ol>

  <h2>6. 환급 기한과 방법</h2>
  <ul>
    <li>회사는 상품을 반환받은 날부터 3영업일 이내에 결제대금을 환급합니다. 용역·디지털콘텐츠이거나 상품을 아직 공급하지 않은 경우에는 청약철회를 한 날부터 3영업일 이내에 환급합니다.</li>
    <li>회사가 환급을 지연하면 그 지연기간에 대하여 관계 법령이 정한 지연배상금을 함께 지급합니다.</li>
    <li>신용카드 결제는 결제를 취소하는 방식으로 환급하며, 카드사 처리 일정에 따라 실제 청구 취소 반영 시점이 달라질 수 있습니다. 계좌이체·가상계좌 결제는 고객이 지정한 본인 명의 계좌로 송금합니다. 간편결제 등 결제수단은 해당 결제대행사의 절차를 따릅니다.</li>
    <li>회사는 단순 변심에 의한 청약철회를 이유로 위약금이나 손해배상을 청구하지 않습니다. 다만 상품등의 일부를 사용·소비한 경우 관계 법령이 허용하는 범위에서 그로 인해 얻은 이익 또는 공급에 든 비용을 공제할 수 있습니다.</li>
  </ul>

  <h2>7. 교환·보증</h2>
  <p>상품 하자나 오배송은 고객의 선택에 따라 교환 또는 환불합니다. 제조사 보증이 있는 하드웨어 등은 제조사 보증 조건을 함께 안내하며, 회사는 보증 처리 접수를 돕습니다. 품질보증·교환 기준은 공정거래위원회 「소비자분쟁해결기준」을 참고합니다.</p>

  <h2>8. 분쟁 해결</h2>
  <p>회사는 고객의 불만과 피해 구제 요청을 성실히 처리합니다. 원만히 해결되지 않는 경우 고객은 한국소비자원(국번 없이 1372, <a href="https://www.kca.go.kr" rel="noopener">kca.go.kr</a>) 또는 전자거래분쟁조정위원회(<a href="https://www.ecmc.or.kr" rel="noopener">ecmc.or.kr</a>)에 피해구제나 분쟁조정을 신청할 수 있습니다.</p>

  <h2>9. 정책의 변경</h2>
  <p>회사는 관계 법령이나 서비스 변경에 따라 본 정책을 개정할 수 있으며, 개정 시 시행일 7일 전부터 이 페이지에 공지합니다. 고객에게 불리한 변경은 변경 전에 체결된 거래에는 적용하지 않습니다.</p>

  <h2>10. 사업자 정보</h2>
  <dl class="operator">
    <dt>상호</dt><dd>${o.name} (EKODIBIZ)</dd>
    <dt>대표</dt><dd>${o.representative}</dd>
    <dt>사업자등록번호</dt><dd>${o.businessRegistrationNumber}</dd>
    <dt>통신판매업신고번호</dt><dd>${o.commerceRegistrationNumber}</dd>
    <dt>주소</dt><dd>${o.address}</dd>
    <dt>환불·고객문의</dt><dd><a href="mailto:${o.email}">${o.email}</a> · ${o.phone}</dd>
  </dl>

  <div class="links"><a href="/ekodibiz">에코디비즈 홈</a><a href="/terms">이용약관</a><a href="/privacy">개인정보처리방침</a><a href="mailto:${o.email}">환불 문의</a></div>
</article></main>
<footer class="footer" data-site-shell="footer" aria-label="에코디비즈 사업자 정보 및 정책">
  <div><strong>EKODIBIZ</strong><span>Turn value into a business.</span></div>
  <p>${o.name} · 대표 ${o.representative} · 사업자등록번호 ${o.businessRegistrationNumber}<br>${o.address} · <a href="mailto:${o.email}">${o.email}</a></p>
  <nav aria-label="에코디비즈 푸터 메뉴">
    <a href="/privacy">개인정보처리방침</a>
    <a href="/terms">이용약관</a>
    <a href="/ekodibiz/refund" aria-current="page">환불정책</a>
    <a href="/">EKODI</a>
  </nav>
</footer>
</body>
</html>`;
}

export function ekodiBizRefundPolicyResponse({ head = false } = {}) {
  return new Response(head ? null : ekodiBizRefundPolicyHtml(), {
    status: 200,
    headers: {
      'content-type': 'text/html; charset=utf-8',
      'cache-control': 'public, max-age=300, s-maxage=3600',
      'x-content-type-options': 'nosniff',
      'referrer-policy': 'strict-origin-when-cross-origin',
      'x-ekodi-route': 'ekodibiz-refund-policy',
    },
  });
}
