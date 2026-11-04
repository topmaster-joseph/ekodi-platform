// The only unauthenticated /invest response is descriptive education.
const headers={'content-type':'text/html; charset=utf-8','cache-control':'private, no-store','x-content-type-options':'nosniff','referrer-policy':'no-referrer'};
const login='/auth/?site=invest&return_to='+encodeURIComponent('https://ekodi.kr/invest/my');
function page(name,inner,script=''){
 const style='body{font:15px/1.6 system-ui,sans-serif;background:white;color:#111;margin:0}main{max-width:950px;margin:auto;padding:20px}header{display:flex;justify-content:space-between;border-bottom:1px solid #ddd;padding:9px 0}a{color:#1d4330}h1{font-size:clamp(28px,5vw,44px);margin:42px 0 12px}p{color:#555}.cards{display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:12px;margin:25px 0}.card,.notice{border:1px solid #ddd;padding:16px;border-radius:9px}.button{display:inline-block;padding:12px 17px;color:white;background:#214a32;border-radius:7px;text-decoration:none}select{padding:10px;border:1px solid #bbb;background:#fff}.inputs{display:flex;flex-wrap:wrap;gap:12px;margin:18px 0}.inputs label{display:grid;gap:6px}table{border-collapse:collapse;width:100%}th,td{text-align:left;padding:10px;border-bottom:1px solid #ddd}[hidden]{display:none!important}footer{border-top:1px solid #ddd;margin-top:35px;padding-top:15px;color:#777;font-size:12px}';
 const doc='<!doctype html><html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>'+name+' · EKODI Invest</title><style>'+style+'</style></head><body><main data-ekodi-platform="invest"><header><a href="/invest"><strong>EKODI INVEST</strong></a><a href="/invest/my">마이투자</a></header>'+inner+'<footer>본 서비스는 연구·정보 비교용입니다. 수익 보장, 매매 지시 및 실거래 실행을 제공하지 않습니다.</footer></main>'+script+'</body></html>';
 return new Response(doc,{headers});
}
export function investIntroPage(){
 return page('투자정보 안내','<h1>근거를 먼저 보는 투자분석</h1><p>국내·미국 주식과 ETF의 주요 검토 요소를 살펴봅니다. 기간·목표수익률은 검토 조건이며, 검증된 시세를 바탕으로 한 조건별 예측은 아직 제공하지 않습니다. 로그인 전에는 설명만 제공합니다.</p><a class="button" href="'+login+'" >로그인 후 마이투자</a><p><a href="/invest/analysis">공개 분석 안내 보기</a></p><div class="cards"><article class="card"><h2>종목별</h2><p>시장·기업·공시를 함께 비교</p></article><article class="card"><h2>수익률별</h2><p>목표수익률과 손실 위험 분리</p></article><article class="card"><h2>기간별</h2><p>1주부터 3년 이상까지 분석</p></article></div><div class="notice">현재 주가·공시 제공처 검증 전에는 가격과 예상 수익률을 표시하지 않습니다.</div>');
}
export function investAnalysisPage(){
 return page('공개 투자분석 안내','<h1>투자분석 · 공개 안내</h1><p>국내·미국 주식과 ETF를 비교하기 위한 검토 기준을 누구나 살펴볼 수 있습니다. 계좌별 자산과 개인별 운용 정보는 로그인 후 마이투자에서만 제공됩니다.</p><div class="cards"><article class="card"><h2>종목별 분석</h2><p>공시·재무·시장 자료의 출처를 확인합니다.</p></article><article class="card"><h2>기간별 분석</h2><p>보유기간과 손실 위험을 비교합니다.</p></article><article class="card"><h2>전략별 검증</h2><p>검증되지 않은 수익률은 표시하지 않습니다.</p></article></div><a class="button" href="'+login+'">로그인 후 개인 투자관리</a><p><a href="/invest">투자 안내로 돌아가기</a></p>','<script src="/invest/analysis.js" defer></script>');
}
export function investAnalysisScript(){
 const js=`(()=>{'use strict';
 // Only the legacy one-time login callback is forwarded; the public analysis
 // page never reads private portfolios and never performs an authenticated API call.
 const params=new URLSearchParams(location.hash.replace(/^#/,''));
 const proof=params.get('ekodi_token')||'';
 const type=params.get('ekodi_type')||'';
 if(!proof)return;
 if(!/^[A-Za-z0-9_-]{15,256}$/.test(proof)||!['email','magiclink','recovery','signup','invite'].includes(type)){
   history.replaceState(null,'',location.pathname+location.search);
   return;
 }
 location.replace('/invest/my#ekodi_token='+encodeURIComponent(proof)+'&ekodi_type='+encodeURIComponent(type));
})();`;
 return new Response(js,{headers:{'content-type':'application/javascript; charset=utf-8',
  'cache-control':'no-store','x-content-type-options':'nosniff','referrer-policy':'no-referrer'}});
}
