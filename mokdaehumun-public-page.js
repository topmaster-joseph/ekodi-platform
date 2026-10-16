export function isMokdaehumunPath(path) { return path === '/mokdaehumun' || path === '/mokdaehumun/'; }
export function mokdaehumunPage() {
  const html = `<!doctype html><html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>목대후문 자율상권조합</title></head><body><main><h1>목대후문 자율상권조합</h1><p>지역 상권과 조합원의 협력을 위한 공간입니다.</p><nav><a href="#intro">조합 소개</a> <a href="#notice">공지</a> <a href="#events">행사</a></nav><section id="intro"><h2>조합 소개</h2></section><section id="notice"><h2>공지</h2><p>등록된 공지가 없습니다.</p></section><section id="events"><h2>행사</h2><p>등록된 행사가 없습니다.</p></section></main></body></html>`;
  return new Response(html, {headers:{'content-type':'text/html; charset=utf-8','x-content-type-options':'nosniff'}});
}
