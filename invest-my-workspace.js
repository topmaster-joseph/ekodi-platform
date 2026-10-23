// /my/invest: future paid service is disabled. Only the verified owner can use private research tools.
const HEAD={'cache-control':'private, no-store','x-content-type-options':'nosniff','x-robots-tag':'noindex, nofollow, noarchive','referrer-policy':'no-referrer','vary':'authorization'};
const SUPABASE='https://renzehysxirjilvdxacv.supabase.co';
const SUPABASE_KEY='sb_publishable_0QjB0WzZbjrd-FJ5D5cR7A_xUkXyOY_';
const DEFAULT_OWNER='topmaster.joseph@gmail.com';
const ownerEmail=env=>String(env.INVEST_OWNER_EMAIL||env.ADMIN_EMAIL||DEFAULT_OWNER).trim().toLowerCase();
const json=(data,status=200)=>new Response(JSON.stringify(data),{status,headers:{...HEAD,'content-type':'application/json; charset=utf-8'}});
function tokenFrom(request){
 const raw=String(request.headers.get('authorization')||'');
 const match=raw.match(/^Bearer ([A-Za-z0-9._~+/-]{12,8192})$/i);
 return match?match[1]:'';
}
async function ownerAuthority(request,env){
 const token=tokenFrom(request);
 if(!token)return {ok:false,status:401,error:'authentication_required'};
 // EKODI shared Google/Supabase member identity. Check a confirmed owner address.
 let memberResponse;
 try{memberResponse=await fetch(SUPABASE+'/auth/v1/user',{headers:{apikey:SUPABASE_KEY,authorization:'Bearer '+token},signal:AbortSignal.timeout(6000),cache:'no-store'})}catch{}
 if(memberResponse?.ok){
  const member=await memberResponse.json().catch(()=>null);
  if(member?.id&&member?.email_confirmed_at){
   return String(member.email||'').toLowerCase()===ownerEmail(env)
    ? {ok:true,subject:String(member.id),method:'verified-member'}
    : {ok:false,status:403,error:'subscription_not_active'};
  }
 }
 // Existing EKODI platform admin token is a separate, server-validated credential.
 let adminResponse;
 try{adminResponse=await fetch('https://ekodi.kr/api/session',{headers:{authorization:'Bearer '+token},signal:AbortSignal.timeout(6000),cache:'no-store'})}catch{}
 if(adminResponse?.ok){
  const admin=await adminResponse.json().catch(()=>null);
  if(admin?.authenticated===true&&admin.role==='super_admin'&&String(admin.email||'').toLowerCase()===ownerEmail(env)){
   return {ok:true,subject:'owner',method:'verified-admin'};
  }
 }
 return {ok:false,status:403,error:'subscription_not_active'};
}
export async function investMyRoute(request,env){
 const path=new URL(request.url).pathname.replace(/\/+$/,'')||'/';
 if(!['/invest','/invest/access','/invest/app.js','/invest/style.css'].includes(path))return null;
 if(!['GET','HEAD'].includes(request.method))return json({error:'method_not_allowed'},405);
 if(path==='/invest/access'){
  const decision=await ownerAuthority(request,env);
  return decision.ok?json({ok:true,scope:'self-research',paidSubscriptionActive:false,publicPaidAdvisoryActive:false,liveTradingEnabled:false,subject:'verified-owner'})
    :json({ok:false,error:decision.error},decision.status);
 }
 if(path==='/invest/style.css')return new Response(OWNER_STYLE,{headers:{...HEAD,'content-type':'text/css; charset=utf-8'}});
 if(path==='/invest/app.js')return new Response(ownerBrowserJs(),{headers:{...HEAD,'content-type':'application/javascript; charset=utf-8'}});
 return new Response(request.method==='HEAD'?null:ownerHtml(),{headers:{...HEAD,'content-type':'text/html; charset=utf-8'}});
}
const OWNER_STYLE="\n:root{--green:#164a3b;--dark:#102e27;--gold:#b79a53;--ink:#182b26;--muted:#72817a;--line:#e2eae5;--surface:#fff;--bg:#f3f6f4;font-family:system-ui,-apple-system,\"Noto Sans KR\",sans-serif;color:var(--ink);background:var(--bg)}\n*{box-sizing:border-box}body{margin:0}a{color:inherit;text-decoration:none}button,input,select{font:inherit}button{cursor:pointer}button:disabled{opacity:.55;cursor:not-allowed}[hidden]{display:none!important}\n.top{height:74px;background:#fff;border-bottom:1px solid var(--line);display:flex;align-items:center;justify-content:space-between;padding:0 30px;gap:20px;position:sticky;top:0;z-index:8}\n.brand{font-size:21px;font-weight:850;letter-spacing:-.06em;color:var(--dark);white-space:nowrap}.brand i{display:inline-grid;place-items:center;width:32px;height:32px;background:linear-gradient(145deg,#d5bc80,#1b6549);border-radius:50% 50% 50% 10%;color:#fff;font-style:normal;margin-right:10px}\n.toplinks{display:flex;align-items:center;gap:24px;font-size:13px;font-weight:650}.toplinks a:last-child{color:var(--green);border-bottom:3px solid var(--green);padding:27px 0}\n.topright{display:flex;align-items:center;gap:18px;font-size:13px}.avatar{width:32px;height:32px;border-radius:50%;display:grid;place-items:center;background:#e5ede7;color:var(--green);font-weight:800}\n.shell{display:grid;grid-template-columns:210px minmax(0,1fr);min-height:calc(100vh - 74px)}.sidebar{background:#fff;border-right:1px solid var(--line);padding:28px 12px;display:flex;flex-direction:column;gap:6px}.sidebar small{padding:0 14px;color:var(--muted);font-weight:700;margin-bottom:15px}\n.sidebar a{padding:12px 16px;border-radius:9px;font-size:13px;font-weight:640;color:#57675f}.sidebar a:hover{background:#edf4ef}.sidebar a.active{background:var(--green);color:#fff}.sidebar .aside-note{margin-top:auto;padding:17px;border-radius:14px;background:linear-gradient(135deg,#f8f2e5,#f0e5cd);color:#6d5831}.aside-note strong{display:block;font-size:14px}.aside-note p{font-size:12px;line-height:1.65}\n.main{min-width:0;padding:22px 24px 60px;max-width:1800px;width:100%;margin:auto}.crumb{font-size:12px;color:var(--muted);margin-bottom:10px}\n.hero{position:relative;border-radius:15px;overflow:hidden;min-height:180px;display:flex;align-items:center;padding:30px 32px;margin-bottom:17px;background:linear-gradient(90deg,#fbfcfa 0%,#fbfcfa 37%,rgba(248,250,246,.78) 55%,rgba(27,46,38,.05) 100%),url(\"https://images.unsplash.com/photo-1497366216548-37526070297c?auto=format&fit=crop&w=1600&q=82\") center 55%/cover}\n.hero h1{font-size:36px;line-height:1.15;margin:5px 0 12px;letter-spacing:-.06em}.hero p{font-size:14px;color:#53635a;max-width:570px;line-height:1.7;margin:0}.hero .eyebrow{color:var(--green);letter-spacing:.18em;font-size:10px;font-weight:800}.hero .watermark{position:absolute;bottom:14px;right:22px;background:#173e36cc;color:#fff;padding:8px 13px;border-radius:9px;font-size:11px}\n.notice{border:1px solid #e2e8e2;border-radius:10px;background:#f8faf8;padding:13px 15px;color:#53655a;font-size:12px;line-height:1.65;margin:12px 0 18px}.notice strong{color:var(--dark)}.auth{display:flex;justify-content:space-between;align-items:center;gap:10px}.auth a,.btn{display:inline-block;background:var(--green);color:#fff;border:0;padding:10px 16px;border-radius:9px;font-size:12px;font-weight:750}.auth a:hover,.btn:hover{background:#0e362b}\n.overview{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:12px;margin-bottom:13px}.tile,.panel{border:1px solid var(--line);border-radius:12px;background:var(--surface);box-shadow:0 8px 30px #173d2c08}.tile{min-height:126px;padding:20px}.tile .caption{font-size:12px;color:#738279}.tile strong{display:block;font-size:25px;margin:11px 0 3px;letter-spacing:-.035em}.tile small{font-size:11px;color:#8a978e}.tile .tag{float:right;background:#ecf6ef;color:#2e6d50;font-size:11px;border-radius:7px;padding:5px 9px}\n.layout{display:grid;grid-template-columns:minmax(0,1.6fr) minmax(290px,1fr);gap:13px}.panel{padding:20px;min-width:0}.panel h2{font-size:16px;letter-spacing:-.04em;margin:0}.panel header{display:flex;align-items:center;justify-content:space-between;gap:10px;margin-bottom:16px}.panel header small{color:var(--muted);font-size:11px}.graph-area{height:230px;background:linear-gradient(#eff5f0 1px,transparent 1px) 0 0/100% 25%;border-radius:8px;position:relative}.graph-area svg{width:100%;height:100%}.legend{display:flex;gap:16px;flex-wrap:wrap;font-size:11px;color:#63766c;margin-top:8px}.dot{display:inline-block;width:9px;height:9px;border-radius:50%;margin-right:5px;background:var(--green)}.dot.gold{background:#c5a259}.dot.gray{background:#a7b5b0}\n.pie-row{display:flex;align-items:center;gap:20px}.donut{width:175px;height:175px;border-radius:50%;flex:none;background:conic-gradient(#e3eae5 0 100%);display:grid;place-items:center}.donut div{display:grid;place-items:center;text-align:center;border-radius:50%;background:#fff;width:105px;height:105px;padding:8px}.donut b{font-size:17px}.donut small{font-size:10px;color:var(--muted)}.breakdown{flex:1}.breakdown p{font-size:12px;display:flex;justify-content:space-between;gap:12px;border-bottom:1px solid #edf0ed;padding-bottom:8px}.breakdown b{white-space:nowrap}.empty{color:#839188;text-align:center;padding:25px 10px;font-size:12px}.span2{grid-column:1/-1}\n.inputs{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:12px}.inputs label,.holding-form label{display:flex;flex-direction:column;gap:6px;font-size:11px;font-weight:750;color:#697b70}.inputs input,.inputs select,.holding-form input,.holding-form select{min-width:0;width:100%;border:1px solid #dce6df;border-radius:8px;background:#fcfdfc;padding:10px 11px;font-size:13px;color:var(--ink);outline-offset:3px}.inputs input:focus,.holding-form input:focus{outline:2px solid #bfdacc}\n.controls{display:flex;align-items:center;flex-wrap:wrap;gap:10px;margin-top:16px}.btn.secondary{background:#eef4ef;color:var(--green)}.btn.gold{background:#aa8846}.hint{font-size:11px;color:#8c9a91}.insights{display:grid;gap:9px}.insight{padding:11px 13px;background:#f6f9f6;border:1px solid #e9efea;border-radius:9px;font-size:12px;line-height:1.7}.insight b{color:var(--green);display:block;font-size:11px}\n.holding-form{display:grid;grid-template-columns:1.2fr 1.1fr .7fr 1fr 1fr auto;gap:10px;align-items:end}.scroll{overflow-x:auto}table{width:100%;border-collapse:collapse;text-align:left;min-width:570px}th{font-weight:750;color:#7b8e80;background:#f7f9f7;font-size:11px}th,td{padding:11px 9px;border-bottom:1px solid #eff2ef}td{font-size:12px}td.num{text-align:right;font-variant-numeric:tabular-nums}th.num{text-align:right}.remove{border:0;background:#faeeee;color:#985b58;border-radius:6px;padding:6px 9px}\n.scenarios{display:grid;grid-template-columns:repeat(3,1fr);gap:10px}.scenario{padding:17px;background:#f8faf8;border:1px solid #e7eee8;border-radius:11px}.scenario:nth-child(2){background:#eef5ef;border-color:#c8e0d2}.scenario small{color:#708479;font-size:11px}.scenario b{display:block;font-size:19px;margin:11px 0 4px}.scenario span{font-size:11px;color:#71857a}.footer{font-size:11px;color:#8d9b90;padding-top:15px;line-height:1.8}\n@media(max-width:1200px){.layout{grid-template-columns:1fr}.overview{grid-template-columns:repeat(2,minmax(0,1fr))}.toplinks{display:none}.holding-form{grid-template-columns:repeat(3,1fr)}}\n@media(max-width:700px){.top{height:64px;padding:0 16px}.shell{display:block}.sidebar{display:flex;flex-direction:row;overflow-x:auto;gap:5px;padding:10px;border-bottom:1px solid var(--line)}.sidebar small,.aside-note{display:none!important}.sidebar a{white-space:nowrap;padding:10px}.main{padding:14px}.hero{min-height:180px;padding:23px;background-position:center}.hero h1{font-size:28px}.overview{gap:8px}.tile{padding:14px;min-height:105px}.tile strong{font-size:20px}.inputs{grid-template-columns:repeat(2,1fr)}.holding-form{grid-template-columns:repeat(2,1fr)}.pie-row{flex-direction:column;align-items:stretch}.donut{margin:auto}.scenarios{grid-template-columns:1fr}.panel{padding:15px}}\n";
function ownerHtml(){return "<!doctype html><html lang=\"ko\"><head><meta charset=\"utf-8\"><meta name=\"viewport\" content=\"width=device-width,initial-scale=1\"><meta name=\"color-scheme\" content=\"light\"><title>마이투자 · EKODI</title><link rel=\"stylesheet\" href=\"/my/invest/style.css\"></head><body>\n<header class=\"top\"><a class=\"brand\" href=\"/invest\"><i>E</i>EKODI 투자</a><nav class=\"toplinks\" aria-label=\"투자 서비스\"><a href=\"/invest\">투자 안내</a><a href=\"/invest/analysis\">공통 투자분석</a><a href=\"#design\">시나리오</a><a href=\"#portfolio\">포트폴리오</a><a href=\"/my\">My EKODI</a><a href=\"/my/invest\">MY</a></nav><div class=\"topright\"><span id=\"accountLabel\">본인 인증 확인 중</span><span class=\"avatar\" aria-hidden=\"true\">MY</span></div></header>\n<div class=\"shell\"><nav class=\"sidebar\" aria-label=\"마이투자 메뉴\"><small>My EKODI</small><a class=\"active\" href=\"/my/invest\">마이투자</a><a href=\"#portfolio\">내 포트폴리오</a><a href=\"#design\">투자분석 설계</a><a href=\"#scenario\">시나리오 비교</a><a href=\"#insights\">리스크 인사이트</a><a href=\"#export\">보고서 내보내기</a><a href=\"/my\">내 계정</a><div class=\"aside-note\"><strong>EKODI Private Research</strong><p>한 사람의 자산을 보호하며, 근거와 위험을 함께 살피는 개인 연구 공간입니다.</p></div></nav>\n<main class=\"main\"><div class=\"crumb\">EKODI 투자 &nbsp;›&nbsp; My EKODI &nbsp;›&nbsp; 마이투자</div>\n<section class=\"hero\"><div><span class=\"eyebrow\">PRIVATE INVESTMENT STUDIO</span><h1>마이투자</h1><p>목표를 설계하고, 자산을 이해하고, 여러 미래를 비교하는<br>나만의 투자 분석 공간입니다.</p></div><span class=\"watermark\">PRIVATE · EKODI</span></section>\n<div class=\"notice\">일반회원용 유료 구독 및 개인별 투자자문은 비활성화되어 있습니다. <strong>검증된 최고관리자 본인의 개인 연구용 도구</strong>로만 제공됩니다. 입력한 금융정보는 서버로 전송하거나 저장하지 않습니다. 이 화면에는 실시간 시세가 연결되지 않습니다.</div>\n<div id=\"authMessage\" class=\"notice auth\" role=\"status\">본인 인증과 사용 권한을 확인하고 있습니다.</div>\n<section id=\"owner\" hidden>\n<div class=\"overview\" aria-live=\"polite\"><article class=\"tile\"><span class=\"tag\">LOCAL</span><div class=\"caption\">입력한 총 평가액</div><strong id=\"totalValue\">0원</strong><small>직접 입력한 자산만 합산</small></article><article class=\"tile\"><span class=\"tag\">LOCAL</span><div class=\"caption\">평가 손익</div><strong id=\"totalProfit\">0원</strong><small>입력한 매입단가 대비</small></article><article class=\"tile\"><span class=\"tag\">가정</span><div class=\"caption\">시나리오 연수익률</div><strong id=\"annualBadge\">8.0%</strong><small>수익률 예측이 아닌 입력한 가정</small></article><article class=\"tile\"><span class=\"tag\">가정</span><div class=\"caption\">설정한 손실 허용폭</div><strong id=\"riskBadge\">15%</strong><small>손실 한도 보장 아님</small></article></div>\n<div class=\"layout\">\n<section class=\"panel\"><header><h2>기간별 시나리오 변화</h2><small>연도별 가정값 · 실제 시장 차트 아님</small></header><div id=\"lineChart\" class=\"graph-area\" aria-label=\"가정한 투자금액의 연도별 선 그래프\"></div><div class=\"legend\"><span><i class=\"dot gray\"></i>보수적</span><span><i class=\"dot\"></i>기본</span><span><i class=\"dot gold\"></i>낙관적</span></div></section>\n<section class=\"panel\"><header><h2>내 자산 구성</h2><small>수동 입력 기준</small></header><div class=\"pie-row\"><div id=\"donut\" class=\"donut\"><div><b id=\"donutValue\">0원</b><small>입력 평가액</small></div></div><div id=\"breakdown\" class=\"breakdown\"><p>등록된 자산 없음</p></div></div></section>\n<section id=\"design\" class=\"panel\"><header><h2>나만의 투자분석 설계</h2><small>값을 바꾸면 즉시 계산합니다</small></header><div class=\"inputs\">\n<label>초기 투자금 (원)<input id=\"capital\" type=\"number\" min=\"0\" max=\"1000000000000\" step=\"100000\" value=\"10000000\"></label>\n<label>월 추가 투자금 (원)<input id=\"monthly\" type=\"number\" min=\"0\" max=\"1000000000\" step=\"10000\" value=\"300000\"></label>\n<label>투자 기간 (년)<input id=\"horizon\" type=\"number\" min=\"1\" max=\"30\" step=\"1\" value=\"5\"></label>\n<label>기본 연수익률 가정 (%)<input id=\"target\" type=\"number\" min=\"-50\" max=\"50\" step=\"0.5\" value=\"8\"></label>\n<label>허용 손실률 (%)<input id=\"loss\" type=\"number\" min=\"0\" max=\"100\" step=\"1\" value=\"15\"></label>\n<label>희망 현금 비중 (%)<input id=\"cash\" type=\"number\" min=\"0\" max=\"100\" step=\"1\" value=\"15\"></label>\n<label>종목별 최대 비중 (%)<input id=\"concentration\" type=\"number\" min=\"1\" max=\"100\" step=\"1\" value=\"25\"></label>\n<label>투자 목적<select id=\"goal\"><option value=\"장기자산\">장기 자산 형성</option><option value=\"노후자금\">노후 자금</option><option value=\"교육자금\">교육 자금</option><option value=\"주택자금\">주택 자금</option></select></label>\n<label>분석 모드<select id=\"mode\"><option value=\"balanced\">균형형</option><option value=\"conservative\">안정형</option><option value=\"aggressive\">성장형</option></select></label>\n</div><div class=\"controls\"><button id=\"calculate\" class=\"btn\" type=\"button\">시나리오 다시 계산</button><button id=\"reset\" class=\"btn secondary\" type=\"button\">입력 초기화</button><span id=\"validation\" class=\"hint\" role=\"status\">세금·수수료·물가상승률·변동성은 별도 검토가 필요합니다.</span></div></section>\n<section id=\"insights\" class=\"panel\"><header><h2>내 투자 리스크 점검</h2><small>규칙 기반 설명 · AI 매매 추천 아님</small></header><div id=\"insightList\" class=\"insights\"><div class=\"insight\">입력값을 검토 중입니다.</div></div></section>\n<section id=\"scenario\" class=\"panel span2\"><header><h2>세 가지 미래 비교</h2><small>가정에 따른 계산 · 수익 보장 아님</small></header><div id=\"scenarios\" class=\"scenarios\" aria-live=\"polite\"></div></section>\n<section id=\"portfolio\" class=\"panel span2\"><header><h2>내 자산 · 관심 종목 직접 입력</h2><small id=\"dataType\">실제 계좌 자동연동 없음 · 직접 입력한 가격 기준</small></header>\n<form id=\"holdingForm\" class=\"holding-form\">\n<label>종목 / 자산명<input name=\"name\" maxlength=\"55\" placeholder=\"예: 관심 ETF\" required></label>\n<label>자산 유형<select name=\"group\"><option>국내 주식</option><option>해외 주식</option><option>ETF</option><option>현금</option><option>기타</option></select></label>\n<label>수량<input name=\"qty\" type=\"number\" min=\"0.000001\" max=\"100000000\" step=\"any\" required></label>\n<label>매입단가 (원)<input name=\"cost\" type=\"number\" min=\"0\" max=\"1000000000000\" step=\"any\" required></label>\n<label>평가단가 (원)<input name=\"price\" type=\"number\" min=\"0\" max=\"1000000000000\" step=\"any\" required></label>\n<button class=\"btn\" type=\"submit\">자산 추가</button></form>\n<div class=\"controls\"><button id=\"demo\" class=\"btn secondary\" type=\"button\">가상 예시 불러오기</button><button id=\"clear\" class=\"btn secondary\" type=\"button\">입력 자산 모두 지우기</button><span class=\"hint\">가상 예시는 실제 계좌·종목 시세가 아닙니다.</span></div>\n<div class=\"scroll\"><table><thead><tr><th>종목 / 자산</th><th>유형</th><th class=\"num\">수량</th><th class=\"num\">입력 평가액</th><th class=\"num\">평가 손익</th><th>관리</th></tr></thead><tbody id=\"holdingRows\"><tr><td colspan=\"6\" class=\"empty\">직접 자산을 입력하거나 가상 예시를 불러와 시작하세요.</td></tr></tbody></table></div></section>\n<section id=\"export\" class=\"panel span2\"><header><h2>나만의 투자 연구 보고서</h2><small>이 브라우저에서만 생성 · 서버 업로드 없음</small></header><p class=\"hint\">분석 결과와 입력 자산을 CSV로 내려받아 직접 보관할 수 있습니다. 공용 PC에서는 저장 파일 관리에 유의하세요.</p><button id=\"download\" class=\"btn gold\" type=\"button\">보고서 CSV 내려받기</button></section></div></section>\n<footer class=\"footer\">본 기능은 최고관리자 본인 연구용입니다. 금융투자상품의 과거 수익과 가정 수익은 미래 성과를 보장하지 않습니다. 모든 실제 주문·유료 자문은 비활성화 상태입니다. · <a href=\"/my\">My EKODI</a> · <a href=\"/invest\">EKODI 투자</a></footer>\n</main></div><script src=\"/my/invest/app.js\" defer></script></body></html>";}

function investBrowserClient(){
'use strict';
const el=(id)=>document.getElementById(id);
const login='/auth/?site=my&return_to='+encodeURIComponent('https://ekodi.kr/my/invest');
const supabaseUrl='https://renzehysxirjilvdxacv.supabase.co';
const supabaseKey='sb_publishable_0QjB0WzZbjrd-FJ5D5cR7A_xUkXyOY_';
const money=(v)=>new Intl.NumberFormat('ko-KR',{maximumFractionDigits:0}).format(Math.round(v))+'원';
const n=(id)=>Number(el(id).value);
let holdings=[],isDemo=false,sessionClient=null,verified=false;
const types=['국내 주식','해외 주식','ETF','현금','기타'];
const colors=['#155343','#b99b56','#7bc39a','#adbcb3','#dee4df'];
function status(message,needsLogin){
 const root=el('authMessage');root.replaceChildren(document.createTextNode(message));
 if(needsLogin){const a=document.createElement('a');a.href=login;a.textContent='안전하게 다시 로그인';root.append(a)}
}
function removeHandoffFromUrl(){
 const hash=new URLSearchParams(location.hash.slice(1));
 const token=hash.get('ekodi_token');const type=hash.get('ekodi_type')||'email';
 if(token)history.replaceState(null,document.title,location.pathname+location.search);
 return token?{token,type}:null;
}
function availableTokens(){
 const values=[];
 try{const s=JSON.parse(localStorage.getItem('ekodi_platform_session_v1')||'null');if(s&&s.access_token)values.push(s.access_token)}catch{}
 try{const s=sessionStorage.getItem('ekodi-auth-token');if(s)values.push(s)}catch{}
 return values;
}
async function authenticate(){
 const handoff=removeHandoffFromUrl();
 const tokens=[];
 try{
  const mod=await import('https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm');
  sessionClient=mod.createClient(supabaseUrl,supabaseKey,{auth:{detectSessionInUrl:false,persistSession:true,autoRefreshToken:true}});
  if(handoff){
   const result=await sessionClient.auth.verifyOtp({token_hash:handoff.token,type:handoff.type});
   if(result.error)status('일회용 로그인 링크가 만료되었거나 이미 사용되었습니다. 저장된 로그인도 확인합니다.',false);
  }
  const result=await sessionClient.auth.getSession();
  if(result.data&&result.data.session&&result.data.session.access_token)tokens.push(result.data.session.access_token);
 }catch{status('통합 로그인 연결을 확인하지 못했습니다. 기존 인증 정보를 다시 확인합니다.',false)}
 for(const token of availableTokens())if(!tokens.includes(token))tokens.push(token);
 if(!tokens.length){status('본인 확인이 필요합니다. EKODI 통합 로그인을 완료해 주세요. ',true);return}
 for(const token of tokens){
  try{
   const response=await fetch('/my/invest/access',{headers:{authorization:'Bearer '+token},cache:'no-store'});
   if(!response.ok)continue;
   const result=await response.json();
   if(result&&result.ok===true&&result.scope==='self-research'){
    verified=true;el('owner').hidden=false;el('authMessage').hidden=true;el('accountLabel').textContent='인증된 개인 연구자';
    render();return;
   }
  }catch{}
 }
 status('로그인 정보는 확인되었으나 본인 전용 연구 권한 검증에 통과하지 못했습니다. 최고관리자 계정으로 다시 로그인해 주세요. ',true);
}
function config(){
 const ids=['capital','monthly','horizon','target','loss','cash','concentration'];
 const v={};for(const id of ids)v[id]=n(id);
 if(ids.some(id=>!Number.isFinite(v[id])))return null;
 if(v.capital<0||v.capital>1e12||v.monthly<0||v.monthly>1e9||v.horizon<1||v.horizon>30||v.target< -50||v.target>50||v.loss<0||v.loss>100||v.cash<0||v.cash>100||v.concentration<1||v.concentration>100)return null;
 return v;
}
function forecast(initial,monthly,annualRate,years){
 const months=Math.round(years*12),monthlyRate=Math.pow(1+annualRate/100,1/12)-1;
 let value=initial;const values=[value];
 for(let k=1;k<=months;k++){
  value=value*(1+monthlyRate)+monthly;
  if(k%12===0)values.push(value);
 }
 return values;
}
function chart(points){
 const host=el('lineChart');host.replaceChildren();
 const svg=document.createElementNS('http://www.w3.org/2000/svg','svg');svg.setAttribute('viewBox','0 0 740 240');svg.setAttribute('role','img');svg.setAttribute('aria-label','세 가지 가정 수익률로 계산한 연도별 자산 증가 곡선');
 const max=Math.max(1,...points.flatMap(p=>p.values))*1.08;const min=0;
 for(let i=0;i<5;i++){
  const y=12+i*52;const line=document.createElementNS(svg.namespaceURI,'line');
  line.setAttribute('x1','5');line.setAttribute('x2','735');line.setAttribute('y1',String(y));line.setAttribute('y2',String(y));line.setAttribute('stroke','#e3ece5');svg.append(line);
 }
 for(const series of points){
  const path=document.createElementNS(svg.namespaceURI,'polyline');
  path.setAttribute('fill','none');path.setAttribute('stroke',series.color);path.setAttribute('stroke-width','3');
  const denom=Math.max(1,series.values.length-1);
  path.setAttribute('points',series.values.map((v,i)=>(12+715*i/denom).toFixed(2)+','+(225-205*(v-min)/max).toFixed(2)).join(' '));svg.append(path);
 }
 host.append(svg);
}
function render(){
 if(!verified)return;
 const v=config();if(!v){el('validation').textContent='입력값을 확인해 주세요. 투자금·비율·기간 범위를 벗어났습니다.';return}
 el('validation').textContent='연복리·월말 납입 가정. 세금·수수료·물가·환율·변동성 미반영.';
 el('annualBadge').textContent=v.target.toFixed(1)+'%';el('riskBadge').textContent=v.loss.toFixed(0)+'%';
 const total=holdings.reduce((s,h)=>s+h.qty*h.price,0),profit=holdings.reduce((s,h)=>s+h.qty*(h.price-h.cost),0);
 el('totalValue').textContent=money(total);el('totalProfit').textContent=(profit<0?'-':'')+money(Math.abs(profit));
 el('totalProfit').style.color=profit<0?'#a94f56':'#155343';
 const breakdown=el('breakdown');breakdown.replaceChildren();
 const buckets=types.map((type,i)=>({type,color:colors[i],sum:holdings.filter(h=>h.group===type).reduce((s,h)=>s+h.qty*h.price,0)})).filter(b=>b.sum>0);
 if(!buckets.length){const p=document.createElement('p');p.textContent='자산을 직접 입력하면 구성이 표시됩니다.';breakdown.append(p);el('donut').style.background='#e3eae5';}
 else{
  let offset=0;const stops=[];
  for(const b of buckets){const pct=b.sum/total*100;stops.push(b.color+' '+offset.toFixed(3)+'% '+(offset+pct).toFixed(3)+'%');offset+=pct}
  el('donut').style.background='conic-gradient('+stops.join(',')+')';
  for(const b of buckets){const p=document.createElement('p');const label=document.createElement('span');const dot=document.createElement('i');dot.className='dot';dot.style.background=b.color;label.append(dot,document.createTextNode(b.type));const value=document.createElement('b');value.textContent=(b.sum/total*100).toFixed(1)+'%';p.append(label,value);breakdown.append(p)}
 }
 el('donutValue').textContent=money(total);
 const mode=el('mode').value;
 const adjust=mode==='conservative'?-2:mode==='aggressive'?2:0;
 const base=Math.max(-50,Math.min(50,v.target+adjust));
 const rates=[Math.max(-50,base-8),base,Math.min(50,base+7)];
 const names=['보수적','기본','낙관적'];const lineColors=['#aab8ae','#164e3d','#b99b56'];
 const paths=rates.map((rate,i)=>({name:names[i],color:lineColors[i],rate,values:forecast(v.capital,v.monthly,rate,v.horizon)}));
 chart(paths);
 const holder=el('scenarios');holder.replaceChildren();
 paths.forEach((p,i)=>{
  const b=document.createElement('article');b.className='scenario';
  const small=document.createElement('small');small.textContent=p.name+' · 연 '+p.rate.toFixed(1)+'% 가정';
  const value=document.createElement('b');value.textContent=money(p.values[p.values.length-1]);
  const contributions=v.capital+v.monthly*12*v.horizon;
  const meta=document.createElement('span');meta.textContent='투입 원금 '+money(contributions)+' / 가정 손익 '+money(p.values[p.values.length-1]-contributions);
  b.append(small,value,meta);holder.append(b);
 });
 const insights=el('insightList');insights.replaceChildren();
 const rules=[];
 rules.push(['분석 범위','입력 자산은 실시간 시세와 연결되지 않습니다. 보유 수량과 가격은 사용자가 입력한 값입니다.']);
 if(v.target>15)rules.push(['목표 수익률','연 '+v.target+'% 가정은 높은 수익을 전제로 합니다. 손실 가능성과 변동성을 별도로 점검하세요.']);
 if(v.cash<10)rules.push(['유동성','현금 목표 비중이 10% 미만입니다. 생활비·비상자금과 투자금을 분리해 점검하세요.']);
 if(v.loss<10)rules.push(['위험 허용도','손실 허용폭은 작습니다. 변동성이 큰 자산의 비중을 점검하세요.']);
 if(holdings.length){
  const biggest=Math.max(...holdings.map(h=>h.qty*h.price));
  if(biggest/Math.max(total,1)*100>v.concentration)rules.push(['집중 위험','가장 큰 자산 비중이 설정한 종목별 최대 비중을 넘습니다.']);
  const cashValue=holdings.filter(h=>h.group==='현금').reduce((s,h)=>s+h.qty*h.price,0);
  if(cashValue/Math.max(total,1)*100<v.cash)rules.push(['현금 목표','입력한 자산의 현금 비중이 설정 목표보다 낮습니다.']);
 }else rules.push(['자산 등록','실제 자산 정보를 직접 입력하거나 가상 예시로 화면을 시험해 보세요.']);
 rules.slice(0,5).forEach(([heading,body])=>{const div=document.createElement('div');div.className='insight';const title=document.createElement('b');title.textContent=heading;div.append(title,document.createTextNode(body));insights.append(div)});
 const rows=el('holdingRows');rows.replaceChildren();
 if(!holdings.length){const tr=document.createElement('tr'),td=document.createElement('td');td.colSpan=6;td.className='empty';td.textContent='입력된 자산이 없습니다. 외부 계좌에서는 어떤 자료도 읽지 않습니다.';tr.append(td);rows.append(tr)}
 holdings.forEach((h,i)=>{
  const tr=document.createElement('tr');
  const fields=[h.name,h.group,new Intl.NumberFormat('ko-KR',{maximumFractionDigits:6}).format(h.qty),money(h.qty*h.price),money(h.qty*(h.price-h.cost))];
  fields.forEach((value,j)=>{const td=document.createElement('td');td.textContent=value;if(j>=2)td.className='num';tr.append(td)});
  const td=document.createElement('td'),btn=document.createElement('button');btn.className='remove';btn.type='button';btn.textContent='삭제';btn.setAttribute('aria-label',h.name+' 삭제');btn.addEventListener('click',()=>{holdings.splice(i,1);isDemo=false;render()});td.append(btn);tr.append(td);rows.append(tr);
 });
 el('dataType').textContent=isDemo?'가상 예시 데이터 · 실제 자산 아님':'입력 자산 · 실시간 시세 연결 없음';
}
function addHolding(event){
 event.preventDefault();
 const fd=new FormData(event.currentTarget);
 const h={name:String(fd.get('name')||'').trim(),group:String(fd.get('group')||''),qty:Number(fd.get('qty')),cost:Number(fd.get('cost')),price:Number(fd.get('price'))};
 if(!h.name||h.name.length>55||!types.includes(h.group)||!Number.isFinite(h.qty)||h.qty<=0||h.qty>1e8||![h.cost,h.price].every(z=>Number.isFinite(z)&&z>=0&&z<=1e12)||holdings.length>=100){
  el('validation').textContent='자산명, 수량, 가격 및 최대 100개 입력 범위를 확인해 주세요.';return;
 }
 holdings.push(h);event.currentTarget.reset();isDemo=false;render();
}
function demo(){
 holdings=[{name:'가상 국내 주식 A',group:'국내 주식',qty:100,cost:59000,price:62000},{name:'가상 해외 ETF B',group:'ETF',qty:75,cost:74000,price:77000},{name:'가상 현금',group:'현금',qty:1,cost:3000000,price:3000000}];
 isDemo=true;render();
}
function reset(){
 for(const [id,value] of Object.entries({capital:10000000,monthly:300000,horizon:5,target:8,loss:15,cash:15,concentration:25}))el(id).value=String(value);
 el('goal').value='장기자산';el('mode').value='balanced';render();
}
function csvCell(value){
 const raw=String(value??'');
 const safe=/^[\s]*[=+\-@\t\r]/.test(raw)?"'"+raw:raw;
 return '"'+safe.replace(/"/g,'""')+'"';
}
function download(){
 const v=config();if(!v)return;
 const rows=[['EKODI 마이투자 로컬 연구 보고서','실시간 시세·투자 자문 아님'],['생성 일시',new Date().toLocaleString('ko-KR')],['분석 구분',isDemo?'가상 예시 데이터':'직접 입력 데이터'],['초기 투자금(원)',v.capital],['월 추가 투자금(원)',v.monthly],['기간(년)',v.horizon],['기본 가정 연수익률(%)',v.target],['감내 손실률(%)',v.loss],[],['자산명','유형','수량','매입단가(원)','평가단가(원)','평가액(원)']];
 for(const h of holdings)rows.push([h.name,h.group,h.qty,h.cost,h.price,h.qty*h.price]);
 rows.push([],['주의','계산은 예시이며 실제 시세와 다릅니다.']);const csv='\ufeff'+rows.map(row=>row.map(csvCell).join(',')).join('\r\n');
 const blob=new Blob([csv],{type:'text/csv;charset=utf-8'}),url=URL.createObjectURL(blob),a=document.createElement('a');
 a.href=url;a.download='ekodi-invest-local-report.csv';document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);
}
function init(){
 for(const id of ['capital','monthly','horizon','target','loss','cash','concentration','goal','mode'])el(id).addEventListener('change',render);
 el('calculate').addEventListener('click',render);el('reset').addEventListener('click',reset);el('holdingForm').addEventListener('submit',addHolding);
 el('demo').addEventListener('click',demo);el('clear').addEventListener('click',()=>{holdings=[];isDemo=false;render()});el('download').addEventListener('click',download);
 authenticate();
}
init();
}
function ownerBrowserJs(){return '('+investBrowserClient.toString()+')();'}
