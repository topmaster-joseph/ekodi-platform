const SPACES = Object.freeze({
  church:{name:'에코디교회',legacy:'https://church.ekodi.kr/',services:[['마이 에코디','https://my.ekodi.kr/church/'],['마케팅AI','https://marketing.ekodi.kr/church/']]},
  biz:{name:'에코디비즈',legacy:'https://biz.ekodi.kr/',services:[['마이 에코디','https://my.ekodi.kr/biz/'],['마케팅AI','https://marketing.ekodi.kr/biz/']]},
  lab:{name:'에코디연구소',legacy:'https://lab.ekodi.kr/',services:[['마이 에코디','https://my.ekodi.kr/lab/']]},
  jadam:{name:'자담치킨 목포대점',legacy:'https://jadam.ekodi.kr/',services:[['마이 에코디','https://my.ekodi.kr/jadam/'],['마케팅AI','https://marketing.ekodi.kr/jadam/']]},
  pizzamaru:{name:'피자마루 목포대점',legacy:'https://pizzamaru.ekodi.kr/',services:[['마이 에코디','https://my.ekodi.kr/pizzamaru/'],['마케팅AI','https://marketing.ekodi.kr/pizzamaru/']]},
  yogurt:{name:'요거트퍼플 목포대점',legacy:'https://yogurt.ekodi.kr/',services:[['마이 에코디','https://my.ekodi.kr/yogurt/'],['마케팅AI','https://marketing.ekodi.kr/yogurt/']]},
  cgma:{name:'청계면상인회',legacy:'https://cgma.ekodi.kr/',services:[['마이 에코디','https://my.ekodi.kr/cgma/'],['마케팅AI','https://marketing.ekodi.kr/cgma/']]},
});

const esc=(value)=>String(value).replace(/[&<>"']/g,(c)=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

export function resolvePublicSpace(pathname){
  const match=String(pathname||'').match(/^\/([a-z0-9-]+)\/?$/);
  if(!match)return null;
  const space=SPACES[match[1]];
  return space?{slug:match[1],...space}:null;
}

export function publicSpacePage(space){
  const links=space.services.map(([label,url])=>`<a class="service" href="${esc(url)}"><strong>${esc(label)}</strong><span>열기</span></a>`).join('');
  return new Response(`<!doctype html><html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(space.name)} | EKODI</title><link rel="canonical" href="https://ekodi.kr/${esc(space.slug)}/"><style>body{margin:0;font-family:system-ui,-apple-system,sans-serif;background:#f7f8fa;color:#15171a}main{max-width:760px;margin:auto;padding:64px 22px}a{color:inherit}.brand{font-size:13px;font-weight:800;letter-spacing:.08em}.card{margin-top:24px;background:#fff;border:1px solid #e5e7eb;border-radius:22px;padding:28px;box-shadow:0 12px 35px #0000000a}h1{margin:0 0 10px;font-size:clamp(28px,5vw,44px)}p{line-height:1.65;color:#555}.services{display:grid;gap:10px;margin-top:24px}.service{display:flex;justify-content:space-between;text-decoration:none;padding:16px 18px;border:1px solid #e7e9ed;border-radius:14px}.legacy{display:inline-block;margin-top:22px;font-size:13px;color:#666}</style></head><body><main><div class="brand">EKODI · PUBLIC SPACE</div><section class="card"><h1>${esc(space.name)}</h1><p>이 주소는 EKODI의 공식 공개 공간 진입점입니다. 실제 업무와 전문서비스는 권한에 따라 My EKODI와 공통서비스에서 연결됩니다.</p><div class="services">${links}</div><a class="legacy" href="${esc(space.legacy)}">기존 사이트 보기</a></section></main></body></html>`,{status:200,headers:{'content-type':'text/html; charset=utf-8','cache-control':'public, max-age=300','x-ekodi-route':'public-space'}});
}
