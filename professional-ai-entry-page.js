const PROFESSIONAL_AIS = Object.freeze({
  marketing:{name:'에코디 마케팅AI',description:'홍보 콘텐츠, 채널 운영, 캠페인과 고객 접점을 돕는 전문AI',runtime:'https://marketing.ekodi.kr/',my:'https://my.ekodi.kr/',authSite:'marketing'},
  creator:{name:'에코디 크리에이터 AI',description:'글, 출판, 콘텐츠와 창작 작업을 돕는 전문AI',runtime:'https://author.ekodi.kr/',my:'https://my.ekodi.kr/',authSite:'author'},
  life:{name:'오늘의 질문 · 인생AI',description:'일상과 삶의 질문에서 생각과 실천을 이어주는 전문AI',runtime:'https://life.ekodi.kr/',my:'https://my.ekodi.kr/',authSite:'life'},
  energy:{name:'에코디 에너지 AI',description:'전기와 에너지 사용을 읽고 절감과 운영 개선을 돕는 전문AI',runtime:'https://energy.ekodi.kr/',my:'https://my.ekodi.kr/',authSite:'energy'},
  support:{name:'에코디 지원사업 AI',description:'정부지원사업과 외부 기회를 찾고 준비 과정을 돕는 전문AI',runtime:'https://support.ekodi.kr/',my:'https://my.ekodi.kr/',authSite:'support'},
});
const MARKETING_SPACES=Object.freeze({
  church:{name:'에코디교회',runtime:'https://marketing.ekodi.kr/church/',my:'https://my.ekodi.kr/church/'},
  biz:{name:'에코디비즈',runtime:'https://marketing.ekodi.kr/biz/',my:'https://my.ekodi.kr/biz/'},
  jadam:{name:'자담치킨 목포대점',runtime:'https://marketing.ekodi.kr/jadam/',my:'https://my.ekodi.kr/jadam/'},
  pizzamaru:{name:'피자마루 목포대점',runtime:'https://marketing.ekodi.kr/pizzamaru/',my:'https://my.ekodi.kr/pizzamaru/'},
  yogurt:{name:'요거트퍼플 목포대점',runtime:'https://marketing.ekodi.kr/yogurt/',my:'https://my.ekodi.kr/yogurt/'},
  cgma:{name:'청계면상인회',runtime:'https://marketing.ekodi.kr/cgma/',my:'https://my.ekodi.kr/cgma/'},
});
const AI_ALIASES=Object.freeze({author:'creator'});
const MARKETING_SPACE_ALIASES=Object.freeze({yogurtpurple:'yogurt'});
const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

export function resolveProfessionalAiPath(pathname){
  const raw=String(pathname||'');
  if(raw==='/ai'||raw==='/ai/')return {kind:'index',canonicalPath:'/ai/'};
  const parts=raw.split('/').filter(Boolean);
  if(parts[0]!=='ai'||parts.length<2||parts.length>3)return null;
  const requestedAi=String(parts[1]||'').toLowerCase();
  const aiId=AI_ALIASES[requestedAi]||requestedAi;
  const ai=PROFESSIONAL_AIS[aiId];
  if(!ai)return null;
  if(parts.length===2){
    return {kind:'ai',aiId,ai,canonicalPath:`/ai/${aiId}/`,redirect:requestedAi!==aiId};
  }
  if(aiId!=='marketing')return null;
  const requestedSpace=String(parts[2]||'').toLowerCase();
  const spaceId=MARKETING_SPACE_ALIASES[requestedSpace]||requestedSpace;
  const space=MARKETING_SPACES[spaceId];
  if(!space)return null;
  return {kind:'space',aiId,ai,spaceId,space,canonicalPath:`/ai/marketing/${spaceId}/`,redirect:requestedAi!==aiId||requestedSpace!==spaceId};
}

function responseHtml(title,canonicalPath,body,route='professional-ai'){
  return new Response(`<!doctype html><html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="index,follow"><title>${esc(title)} | EKODI</title><link rel="canonical" href="https://ekodi.kr${esc(canonicalPath)}"><style>:root{font-family:system-ui,-apple-system,"Noto Sans KR",sans-serif;color:#172033;background:#f6f8fb}*{box-sizing:border-box}body{margin:0}main{width:min(860px,100%);margin:auto;padding:56px 20px 72px}.brand{font-size:12px;font-weight:900;letter-spacing:.12em}.card{margin-top:20px;padding:30px;border:1px solid #dfe5ec;border-radius:24px;background:#fff;box-shadow:0 14px 40px #1720330d}h1{margin:0 0 12px;font-size:clamp(30px,6vw,48px);letter-spacing:-.045em}p{color:#5c6675;line-height:1.7}.actions{display:flex;gap:10px;flex-wrap:wrap;margin-top:24px}a.btn{display:inline-flex;align-items:center;justify-content:center;min-height:44px;padding:0 16px;border:1px solid #d5dce5;border-radius:12px;color:#172033;text-decoration:none;font-weight:800}.primary{background:#172033;color:#fff!important;border-color:#172033!important}.grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px;margin-top:20px}.item{display:block;padding:16px;border:1px solid #e1e6ed;border-radius:14px;text-decoration:none;color:inherit}.item small{display:block;color:#6b7280;margin-top:5px}@media(max-width:640px){.grid{grid-template-columns:1fr}.card{padding:22px}}</style></head><body><main><div class="brand">EKODI · PROFESSIONAL AI</div>${body}</main></body></html>`,{status:200,headers:{'content-type':'text/html; charset=utf-8','cache-control':'public, max-age=300','x-ekodi-route':route,'x-content-type-options':'nosniff'}});
}

export function professionalAiPage(route){
  if(route.kind==='index'){
    const rows=Object.entries(PROFESSIONAL_AIS).map(([id,ai])=>`<a class="item" href="/ai/${id}/"><strong>${esc(ai.name)}</strong><small>${esc(ai.description)}</small></a>`).join('');
    return responseHtml('에코디 전문AI','/ai/',`<section class="card"><h1>에코디 전문AI</h1><p>전문AI는 하나의 도메인 아래에서 분야별 경로로 운영합니다. 모든 AI 실행은 EKODI AI Gateway 정책과 권한 경계를 따릅니다.</p><div class="grid">${rows}</div></section>`);
  }
  if(route.kind==='space'){
    return responseHtml(`${route.space.name} · ${route.ai.name}`,route.canonicalPath,`<section class="card"><h1>${esc(route.space.name)}<br>${esc(route.ai.name)}</h1><p>이 주소가 공식 전문AI 진입점입니다. 실제 작업은 권한이 확인된 My EKODI 공간과 기존 검증된 실행 런타임을 사용합니다.</p><div class="actions"><a class="btn primary" href="${esc(route.space.my)}">My EKODI에서 열기</a><a class="btn" href="${esc(route.space.runtime)}">전문AI 실행</a></div></section>`,'professional-ai-space');
  }
  return responseHtml(route.ai.name,route.canonicalPath,`<section class="card"><h1>${esc(route.ai.name)}</h1><p>${esc(route.ai.description)}</p><p>이 경로가 공식 주소입니다. 기존 서브도메인은 현재 기능 안정성을 위해 호환 실행 주소로 유지하며, 경로형 실행이 완전히 동등해진 뒤 영구 리디렉션으로 전환합니다.</p><div class="actions"><a class="btn primary" href="${esc(route.ai.my)}">My EKODI</a><a class="btn" href="${esc(route.ai.runtime)}">서비스 시작</a></div></section>`);
}

export const PROFESSIONAL_AI_IDS=Object.freeze(Object.keys(PROFESSIONAL_AIS));
