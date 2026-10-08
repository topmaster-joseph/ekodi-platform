// The only unauthenticated /invest response is descriptive education.
const headers={'content-type':'text/html; charset=utf-8','cache-control':'private, no-store','x-content-type-options':'nosniff','referrer-policy':'no-referrer'};
const login='/auth/?site=invest&return_to='+encodeURIComponent('https://ekodi.kr/invest/analysis');
function page(name,inner,script=''){
 const style='body{font:15px/1.6 system-ui,sans-serif;background:white;color:#111;margin:0}main{max-width:950px;margin:auto;padding:20px}header{display:flex;justify-content:space-between;border-bottom:1px solid #ddd;padding:9px 0}a{color:#1d4330}h1{font-size:clamp(28px,5vw,44px);margin:42px 0 12px}p{color:#555}.cards{display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:12px;margin:25px 0}.card,.notice{border:1px solid #ddd;padding:16px;border-radius:9px}.button{display:inline-block;padding:12px 17px;color:white;background:#214a32;border-radius:7px;text-decoration:none}select{padding:10px;border:1px solid #bbb;background:#fff}.inputs{display:flex;flex-wrap:wrap;gap:12px;margin:18px 0}.inputs label{display:grid;gap:6px}table{border-collapse:collapse;width:100%}th,td{text-align:left;padding:10px;border-bottom:1px solid #ddd}[hidden]{display:none!important}footer{border-top:1px solid #ddd;margin-top:35px;padding-top:15px;color:#777;font-size:12px}';
 const doc='<!doctype html><html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>'+name+' · EKODI Invest</title><style>'+style+'</style></head><body><main><header><a href="/invest"><strong>EKODI INVEST</strong></a><a href="/my/invest">마이투자</a></header>'+inner+'<footer>본 서비스는 연구·정보 비교용입니다. 수익 보장, 매매 지시 및 실거래 실행을 제공하지 않습니다.</footer></main>'+script+'</body></html>';
 return new Response(doc,{headers});
}
export function investIntroPage(){
 return page('투자정보 안내','<h1>근거를 먼저 보는 투자분석</h1><p>국내·미국 주식과 ETF를 종목별·목표수익률별·투자기간별로 비교합니다. 로그인 전에는 설명만 제공합니다.</p><a class="button" href="'+login+'">로그인 후 공통 분석</a><div class="cards"><article class="card"><h2>종목별</h2><p>시장·기업·공시를 함께 비교</p></article><article class="card"><h2>수익률별</h2><p>목표수익률과 손실 위험 분리</p></article><article class="card"><h2>기간별</h2><p>1주부터 3년 이상까지 분석</p></article></div><div class="notice">현재 주가·공시 제공처 검증 전에는 가격과 예상 수익률을 표시하지 않습니다.</div>');
}
export function investAnalysisPage(){
 const body='<h1>회원 공통 분석</h1><div id="gate" class="notice" role="status">회원 인증을 확인합니다.</div><section id="analysis" hidden><p>공통 후보 목록은 모든 로그인 회원에게 동일하며 보유자산, 재산 및 위험성향을 반영하지 않습니다.</p><div class="inputs"><label>시장<select id="market"><option value="all">전체</option><option value="kr">한국</option><option value="us">미국</option><option value="etf">ETF</option></select></label><label>투자기간<select id="period"><option>1주</option><option>1개월</option><option selected>3개월</option><option>1년</option><option>3년 이상</option></select></label><label>목표수익률<select id="target"><option>5%</option><option selected>10%</option><option>20%</option><option>30% 이상</option></select></label></div><div id="result" aria-live="polite"></div><p class="notice">후보군은 매수·매도 추천이 아닙니다. 실시간 가격·예상 수익률·달성 확률은 검증된 데이터 연결 전까지 비표시합니다.</p></section>';
 return page('종목별 공통 분석',body,'<script src="/invest/analysis.js" defer></script>');
}
export function investAnalysisScript(){
 const lines=[
 "(()=>{'use strict';",
 "const el=id=>document.getElementById(id);",
 "const login='/auth/?site=invest&return_to='+encodeURIComponent('https://ekodi.kr/invest/analysis');",
 "let candidates=[];let token='';",
 "function render(){const market=el('market').value,period=el('period').value,target=el('target').value;const rows=candidates.filter(c=>market==='all'||c[2]===market);const table=document.createElement('table');const head=document.createElement('tr');['비교대상','종목코드','검토 요인'].forEach(label=>{const th=document.createElement('th');th.textContent=label;head.append(th)});table.append(head);rows.forEach(c=>{const tr=document.createElement('tr');[c[0],c[1],c[3]].forEach(val=>{const td=document.createElement('td');td.textContent=val;tr.append(td)});table.append(tr)});const root=el('result');root.replaceChildren();const title=document.createElement('h2');title.textContent=period+' · 목표 '+target+' 비교 후보';root.append(title,table)}",
 "async function verify(){token='';try{token=JSON.parse(localStorage.getItem('ekodi_platform_session_v1')||'null')?.access_token||''}catch{}",
 "if(!token){el('gate').textContent='로그인 후 분석을 볼 수 있습니다. ';const a=document.createElement('a');a.href=login;a.textContent='로그인';el('gate').append(a);return}",
 "try{const response=await fetch('/workspace-api/v1/invest/common-analysis?market=all&period=3m&target=10',{headers:{authorization:'Bearer '+token},cache:'no-store'});if(!response.ok)throw Error();const data=await response.json();if(!Array.isArray(data.candidates)||data.policy?.memberOnly!==true)throw Error();candidates=data.candidates.map(x=>[x.name,x.ticker,x.market,x.factors]);el('gate').hidden=true;el('analysis').hidden=false;render()}catch{el('analysis').hidden=true;el('gate').hidden=false;el('gate').textContent='회원 인증을 확인할 수 없습니다. 다시 로그인해 주세요. ';const a=document.createElement('a');a.href=login;a.textContent='로그인';el('gate').append(a)}}",
 "['market','period','target'].forEach(id=>el(id)?.addEventListener('change',render));",
 "window.addEventListener('storage',e=>{if(e.key==='ekodi_platform_session_v1')location.reload()});verify();",
 "})();"
 ];
 return new Response(lines.join('\n'),{headers:{'content-type':'application/javascript; charset=utf-8','cache-control':'no-store','x-content-type-options':'nosniff'}});
}
