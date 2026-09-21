function esc(value){return String(value??'').replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]))}

const PUBLIC_LINKS=Object.freeze([
  ['우리동네','지역 소식과 생활정보'],
  ['상권·상점','지역 상점과 상권 정보'],
  ['청계패스','지역상품권·쿠폰·포인트·상권혜택'],
  ['목포대','대학과 지역의 연결'],
  ['기관·단체','지역 기관과 단체 찾기'],
  ['행사·프로그램','지역 행사와 신청'],
  ['구인구직','지역 일자리 연결'],
  ['나눔마켓','지역 나눔과 교환'],
  ['지역방송','라이브와 지역 콘텐츠'],
  ['참여·제안','주민 의견과 제안'],
]);

function baseStyle(){
  return `<style>
  :root{font-family:system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;color:#18212b;background:#f5f7f9}
  *{box-sizing:border-box}body{margin:0;background:#f5f7f9;color:#18212b}a{color:inherit}
  main{width:min(1120px,calc(100% - 28px));margin:0 auto;padding:26px 0 56px}
  .hero{padding:30px;border:1px solid #dce3e8;border-radius:24px;background:#fff}
  .eyebrow{font-size:13px;font-weight:800;letter-spacing:.08em;color:#476276}
  h1{font-size:clamp(30px,6vw,52px);margin:8px 0 10px;letter-spacing:-.045em}
  .lead{margin:0;max-width:760px;line-height:1.7;color:#52606d;word-break:keep-all}
  .grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(210px,1fr));gap:12px;margin-top:18px}
  .card{display:block;padding:18px;border:1px solid #dce3e8;border-radius:18px;background:#fff;text-decoration:none}
  .card strong{display:block;margin-bottom:7px}.card span,.muted{color:#667481;font-size:14px;line-height:1.55}
  .section{margin-top:28px}.section h2{margin:0 0 12px;font-size:20px}
  .org{display:flex;gap:14px;align-items:center;justify-content:space-between;padding:18px;border:1px solid #dce3e8;border-radius:18px;background:#fff}
  .button{display:inline-flex;padding:10px 14px;border-radius:12px;background:#172c3e;color:#fff;text-decoration:none;font-weight:750;white-space:nowrap}
  table{width:100%;border-collapse:collapse;background:#fff;border:1px solid #dce3e8;border-radius:16px;overflow:hidden}
  th,td{padding:12px;border-bottom:1px solid #e7ecef;text-align:left;vertical-align:top;font-size:14px}th{background:#f8fafb;color:#4c5b68}
  .status{display:inline-block;padding:4px 8px;border-radius:999px;background:#edf4ef;font-size:12px;font-weight:750}
  .policy{padding:16px 18px;border-radius:16px;background:#eef3f6;line-height:1.65;color:#475866}
  @media(max-width:680px){.hero{padding:22px}.org{align-items:flex-start;flex-direction:column}th:nth-child(3),td:nth-child(3){display:none}}
  </style>`;
}

function document(region,title,body,admin=false){
  const surface=admin?'admin':'public';
  return `<!doctype html><html lang="ko" data-ekodi-site-subject="${esc(region.siteSubject)}" data-ekodi-local-region="${esc(region.id)}" data-ekodi-region-surface="${surface}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(title)}</title>${baseStyle()}</head><body>${body}</body></html>`;
}

function publicBody(region){
  return `<main><section class="hero"><div class="eyebrow">LOCAL PLATFORM · ${esc(region.name)}</div><h1>${esc(region.brand)}</h1><p class="lead">주민·상인·대학·기관·단체가 함께 사용하는 청계 지역 공통 플랫폼입니다. 지역 공통서비스는 지역플랫폼이 소유하고 운영단체가 위임받아 관리합니다.</p></section>
  <section class="section"><h2>지역 서비스</h2><div class="grid">${PUBLIC_LINKS.map(([name,desc])=>`<div class="card"><strong>${esc(name)}</strong><span>${esc(desc)}</span></div>`).join('')}</div></section>
  <section class="section"><h2>연결된 지역 조직</h2><div class="org"><div><strong>청계면상인회</strong><div class="muted">현재 청계 지역 공통서비스의 초기 운영기관입니다. 상인회 정회원·회비·내부문서 등 고유 데이터는 지역플랫폼과 분리됩니다.</div></div><a class="button" href="/cgma">상인회 바로가기</a></div></section>
  </main>`;
}

function adminBody(region){
  const rows=region.modules.map(module=>{
    const lead=region.operators[module.leadOperatorId];
    const co=module.operatorIds.filter(id=>id!==module.leadOperatorId).map(id=>region.operators[id]?.name||id);
    return `<tr><td><strong>${esc(module.label)}</strong><div class="muted">${esc(module.id)}</div></td><td>${esc(lead?.name||module.leadOperatorId)}</td><td>${esc(co.length?co.join(', '):'없음')}</td><td><span class="status">운영중</span></td></tr>`;
  }).join('');
  return `<main><section class="hero"><div class="eyebrow">REGIONAL GOVERNANCE</div><h1>${esc(region.brand)} 운영관리</h1><p class="lead">지역플랫폼의 소유권과 서비스 운영권을 분리합니다. 현재는 청계면상인회가 초기 운영을 맡고, 추후 서비스별로 주 운영단체·공동운영단체를 지정하거나 운영권을 이양할 수 있는 구조입니다.</p></section>
  <section class="section"><h2>서비스별 운영주체</h2><table><thead><tr><th>지역서비스</th><th>주 운영단체</th><th>공동운영</th><th>상태</th></tr></thead><tbody>${rows}</tbody></table></section>
  <section class="section"><h2>권한 이양 원칙</h2><div class="policy">새 운영주체 등록 → 서비스별 공동운영 기간 → 책임권한 이양 → 기존 운영자 권한 축소의 순서로 처리합니다. 이양 시 지역 데이터는 이동·복사하지 않고 그대로 유지하며, 변경 전후 운영자와 감사이력을 보존합니다. 상인회 자체 데이터는 <strong>/cgma</strong> 소유로 남습니다.</div></section>
  <section class="section"><div class="org"><div><strong>청계면상인회 자체 운영</strong><div class="muted">회원·회비·회의·상인회 사업·문서·회계 등 조직 고유업무는 지역플랫폼 운영권 이양과 무관하게 유지됩니다.</div></div><a class="button" href="/cgma/admin">상인회 관리자</a></div></section>
  </main>`;
}

function headers(route){
  return {'content-type':'text/html; charset=utf-8','cache-control':'no-store','x-content-type-options':'nosniff','referrer-policy':'strict-origin-when-cross-origin','x-ekodi-route':route};
}

export function localRegionPublicPage(region){
  return new Response(document(region,`${region.brand} | ${region.name} 지역플랫폼`,publicBody(region),false),{status:200,headers:headers('local-region-public')});
}

export function localRegionAdminPage(region){
  return new Response(document(region,`${region.brand} 운영관리`,adminBody(region),true),{status:200,headers:headers('local-region-admin')});
}
