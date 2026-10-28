// /my/invest: future paid service is disabled. Only the verified owner can use private research tools.
import { investOwnerEmail as ownerEmail } from './invest-autopilot-core.js';
const HEAD={'cache-control':'private, no-store','x-content-type-options':'nosniff','x-robots-tag':'noindex, nofollow, noarchive','referrer-policy':'no-referrer','vary':'authorization'};
const SUPABASE='https://renzehysxirjilvdxacv.supabase.co';
const SUPABASE_KEY='sb_publishable_0QjB0WzZbjrd-FJ5D5cR7A_xUkXyOY_';
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
const OWNER_STYLE="\n:root{--green:#164a3b;--dark:#102e27;--gold:#b79a53;--ink:#182b26;--muted:#72817a;--line:#e2eae5;--surface:#fff;--bg:#f3f6f4;font-family:system-ui,-apple-system,\"Noto Sans KR\",sans-serif;color:var(--ink);background:var(--bg)}\n*{box-sizing:border-box}body{margin:0}a{color:inherit;text-decoration:none}button,input,select{font:inherit}button{cursor:pointer}button:disabled{opacity:.55;cursor:not-allowed}[hidden]{display:none!important}\n.top{height:74px;background:#fff;border-bottom:1px solid var(--line);display:flex;align-items:center;justify-content:space-between;padding:0 30px;gap:20px;position:sticky;top:0;z-index:8}\n.brand{font-size:21px;font-weight:850;letter-spacing:-.06em;color:var(--dark);white-space:nowrap}.brand i{display:inline-grid;place-items:center;width:32px;height:32px;background:linear-gradient(145deg,#d5bc80,#1b6549);border-radius:50% 50% 50% 10%;color:#fff;font-style:normal;margin-right:10px}\n.toplinks{display:flex;align-items:center;gap:24px;font-size:13px;font-weight:650}.toplinks a:last-child{color:var(--green);border-bottom:3px solid var(--green);padding:27px 0}\n.topright{display:flex;align-items:center;gap:18px;font-size:13px}.avatar{width:32px;height:32px;border-radius:50%;display:grid;place-items:center;background:#e5ede7;color:var(--green);font-weight:800}\n.shell{display:grid;grid-template-columns:210px minmax(0,1fr);min-height:calc(100vh - 74px)}.sidebar{background:#fff;border-right:1px solid var(--line);padding:28px 12px;display:flex;flex-direction:column;gap:6px}.sidebar small{padding:0 14px;color:var(--muted);font-weight:700;margin-bottom:15px}\n.sidebar a{padding:12px 16px;border-radius:9px;font-size:13px;font-weight:640;color:#57675f}.sidebar a:hover{background:#edf4ef}.sidebar a.active{background:var(--green);color:#fff}.sidebar .aside-note{margin-top:auto;padding:17px;border-radius:14px;background:linear-gradient(135deg,#f8f2e5,#f0e5cd);color:#6d5831}.aside-note strong{display:block;font-size:14px}.aside-note p{font-size:12px;line-height:1.65}\n.main{min-width:0;padding:22px 24px 60px;max-width:1800px;width:100%;margin:auto}.crumb{font-size:12px;color:var(--muted);margin-bottom:10px}\n.hero{position:relative;border-radius:15px;overflow:hidden;min-height:180px;display:flex;align-items:center;padding:30px 32px;margin-bottom:17px;background:linear-gradient(90deg,#fbfcfa 0%,#fbfcfa 37%,rgba(248,250,246,.78) 55%,rgba(27,46,38,.05) 100%),url(\"https://images.unsplash.com/photo-1497366216548-37526070297c?auto=format&fit=crop&w=1600&q=82\") center 55%/cover}\n.hero h1{font-size:36px;line-height:1.15;margin:5px 0 12px;letter-spacing:-.06em}.hero p{font-size:14px;color:#53635a;max-width:570px;line-height:1.7;margin:0}.hero .eyebrow{color:var(--green);letter-spacing:.18em;font-size:10px;font-weight:800}.hero .watermark{position:absolute;bottom:14px;right:22px;background:#173e36cc;color:#fff;padding:8px 13px;border-radius:9px;font-size:11px}\n.notice{border:1px solid #e2e8e2;border-radius:10px;background:#f8faf8;padding:13px 15px;color:#53655a;font-size:12px;line-height:1.65;margin:12px 0 18px}.notice strong{color:var(--dark)}.auth{display:flex;justify-content:space-between;align-items:center;gap:10px}.auth a,.btn{display:inline-block;background:var(--green);color:#fff;border:0;padding:10px 16px;border-radius:9px;font-size:12px;font-weight:750}.auth a:hover,.btn:hover{background:#0e362b}\n.overview{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:12px;margin-bottom:13px}.tile,.panel{border:1px solid var(--line);border-radius:12px;background:var(--surface);box-shadow:0 8px 30px #173d2c08}.tile{min-height:126px;padding:20px}.tile .caption{font-size:12px;color:#738279}.tile strong{display:block;font-size:25px;margin:11px 0 3px;letter-spacing:-.035em}.tile small{font-size:11px;color:#8a978e}.tile .tag{float:right;background:#ecf6ef;color:#2e6d50;font-size:11px;border-radius:7px;padding:5px 9px}\n.layout{display:grid;grid-template-columns:minmax(0,1.6fr) minmax(290px,1fr);gap:13px}.panel{padding:20px;min-width:0}.panel h2{font-size:16px;letter-spacing:-.04em;margin:0}.panel header{display:flex;align-items:center;justify-content:space-between;gap:10px;margin-bottom:16px}.panel header small{color:var(--muted);font-size:11px}.graph-area{height:230px;background:linear-gradient(#eff5f0 1px,transparent 1px) 0 0/100% 25%;border-radius:8px;position:relative}.graph-area svg{width:100%;height:100%}.legend{display:flex;gap:16px;flex-wrap:wrap;font-size:11px;color:#63766c;margin-top:8px}.dot{display:inline-block;width:9px;height:9px;border-radius:50%;margin-right:5px;background:var(--green)}.dot.gold{background:#c5a259}.dot.gray{background:#a7b5b0}\n.pie-row{display:flex;align-items:center;gap:20px}.donut{width:175px;height:175px;border-radius:50%;flex:none;background:conic-gradient(#e3eae5 0 100%);display:grid;place-items:center}.donut div{display:grid;place-items:center;text-align:center;border-radius:50%;background:#fff;width:105px;height:105px;padding:8px}.donut b{font-size:17px}.donut small{font-size:10px;color:var(--muted)}.breakdown{flex:1}.breakdown p{font-size:12px;display:flex;justify-content:space-between;gap:12px;border-bottom:1px solid #edf0ed;padding-bottom:8px}.breakdown b{white-space:nowrap}.empty{color:#839188;text-align:center;padding:25px 10px;font-size:12px}.span2{grid-column:1/-1}\n.inputs{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:12px}.inputs label,.holding-form label{display:flex;flex-direction:column;gap:6px;font-size:11px;font-weight:750;color:#697b70}.inputs input,.inputs select,.holding-form input,.holding-form select{min-width:0;width:100%;border:1px solid #dce6df;border-radius:8px;background:#fcfdfc;padding:10px 11px;font-size:13px;color:var(--ink);outline-offset:3px}.inputs input:focus,.holding-form input:focus{outline:2px solid #bfdacc}\n.controls{display:flex;align-items:center;flex-wrap:wrap;gap:10px;margin-top:16px}.btn.secondary{background:#eef4ef;color:var(--green)}.btn.gold{background:#aa8846}.hint{font-size:11px;color:#8c9a91}.insights{display:grid;gap:9px}.insight{padding:11px 13px;background:#f6f9f6;border:1px solid #e9efea;border-radius:9px;font-size:12px;line-height:1.7}.insight b{color:var(--green);display:block;font-size:11px}\n.holding-form{display:grid;grid-template-columns:1.2fr 1.1fr .7fr 1fr 1fr auto;gap:10px;align-items:end}.scroll{overflow-x:auto}table{width:100%;border-collapse:collapse;text-align:left;min-width:570px}th{font-weight:750;color:#7b8e80;background:#f7f9f7;font-size:11px}th,td{padding:11px 9px;border-bottom:1px solid #eff2ef}td{font-size:12px}td.num{text-align:right;font-variant-numeric:tabular-nums}th.num{text-align:right}.remove{border:0;background:#faeeee;color:#985b58;border-radius:6px;padding:6px 9px}\n.scenarios{display:grid;grid-template-columns:repeat(3,1fr);gap:10px}.scenario{padding:17px;background:#f8faf8;border:1px solid #e7eee8;border-radius:11px}.scenario:nth-child(2){background:#eef5ef;border-color:#c8e0d2}.scenario small{color:#708479;font-size:11px}.scenario b{display:block;font-size:19px;margin:11px 0 4px}.scenario span{font-size:11px;color:#71857a}.footer{font-size:11px;color:#8d9b90;padding-top:15px;line-height:1.8}\n@media(max-width:1200px){.layout{grid-template-columns:1fr}.overview{grid-template-columns:repeat(2,minmax(0,1fr))}.toplinks{display:none}.holding-form{grid-template-columns:repeat(3,1fr)}}\n@media(max-width:700px){.top{height:64px;padding:0 16px}.shell{display:block}.sidebar{display:flex;flex-direction:row;overflow-x:auto;gap:5px;padding:10px;border-bottom:1px solid var(--line)}.sidebar small,.aside-note{display:none!important}.sidebar a{white-space:nowrap;padding:10px}.main{padding:14px}.hero{min-height:180px;padding:23px;background-position:center}.hero h1{font-size:28px}.overview{gap:8px}.tile{padding:14px;min-height:105px}.tile strong{font-size:20px}.inputs{grid-template-columns:repeat(2,1fr)}.holding-form{grid-template-columns:repeat(2,1fr)}.pie-row{flex-direction:column;align-items:stretch}.donut{margin:auto}.scenarios{grid-template-columns:1fr}.panel{padding:15px}}\n\n.autopilot{border:1px solid #d9e5dd;border-radius:14px;background:linear-gradient(135deg,#ffffff 0%,#f6faf7 60%,#f3ecdc 100%);padding:20px;margin-bottom:13px;box-shadow:0 8px 30px #173d2c0d}.ap-head{display:flex;justify-content:space-between;align-items:flex-start;gap:16px;flex-wrap:wrap}.ap-head h2{margin:4px 0 6px;font-size:20px;letter-spacing:-.04em}.ap-head .eyebrow{color:var(--green);letter-spacing:.18em;font-size:10px;font-weight:800}.ap-actions{display:flex;gap:8px;flex-wrap:wrap}.btn.danger{background:#9b3b33}.btn.danger:hover{background:#7d2c25}\n.ap-tiles{display:grid;grid-template-columns:repeat(6,minmax(0,1fr));gap:10px;margin:14px 0 8px}.ap-tiles .tile{min-height:112px;padding:15px}.ap-tiles .tile strong{font-size:20px;overflow-wrap:anywhere}#apState[data-state=PAPER_TRADING]{color:#1d6b4c}#apState[data-state=PAUSED]{color:#a07a2c}#apState[data-state=EMERGENCY_STOPPED]{color:#9b3b33}#apState[data-state=LIVE_ACTIVE]{color:#0e4f8a}\n.policy-form{grid-template-columns:repeat(4,minmax(0,1fr))}.checks{border:1px solid #dce6df;border-radius:8px;padding:8px 10px;display:flex;flex-wrap:wrap;gap:10px;font-size:12px;margin:0}.checks legend{font-size:11px;font-weight:750;color:#697b70;padding:0 4px}.checks label{display:flex;flex-direction:row;align-items:center;gap:5px;font-weight:600;color:var(--ink)}.checks .muted{color:#9aa79f}.ap-grid{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1.6fr);gap:16px;margin:16px 0}.ap-grid h3,#autopilotPolicy h3{font-size:13px;margin:6px 0 10px}.gates{margin:0;padding-left:18px;font-size:12px;line-height:1.9;color:#5d6e64}.paper-form{grid-template-columns:repeat(4,minmax(0,1fr))}\n@media(max-width:1200px){.ap-tiles{grid-template-columns:repeat(3,minmax(0,1fr))}.policy-form,.paper-form{grid-template-columns:repeat(2,minmax(0,1fr))}.ap-grid{grid-template-columns:1fr}}\n@media(max-width:700px){.ap-tiles{grid-template-columns:repeat(2,minmax(0,1fr))}.ap-actions{width:100%}.ap-actions .btn{flex:1 1 auto}.policy-form,.paper-form{grid-template-columns:1fr}}\n\n.ap-notices{display:grid;grid-template-columns:minmax(0,1.6fr) minmax(0,1fr);gap:12px;margin:6px 0 10px}.ap-notices h3{font-size:13px;margin:4px 0 8px}.ap-summary,.ap-alerts{border:1px solid #e3ebe5;border-radius:11px;background:#fff;padding:13px 15px}.ap-alerts li.critical{color:#9b3b33;font-weight:700}.ap-summary .insights{grid-template-columns:repeat(2,minmax(0,1fr))}.ap-summary .insights>p{grid-column:1/-1;margin:0}\n@media(max-width:1200px){.ap-notices{grid-template-columns:1fr}}\n@media(max-width:700px){.ap-summary .insights{grid-template-columns:1fr}}\n.stepup{border:1px solid var(--gold);background:#fff8e6;color:#6b5418;padding:8px 14px;border-radius:999px;font-size:13px;font-weight:800;cursor:pointer;white-space:nowrap}.stepup[data-state=done]{background:var(--green);border-color:var(--green);color:#fff}.stepup:disabled{opacity:.6;cursor:wait}.stepup:focus-visible{outline:3px solid var(--gold);outline-offset:2px}.stepup-dialog{border:0;border-radius:14px;padding:0;max-width:min(440px,calc(100vw - 32px));width:100%}.stepup-dialog::backdrop{background:rgba(16,46,39,.55)}.stepup-dialog form{padding:22px;display:grid;gap:12px}.stepup-dialog h2{margin:0;font-size:20px}.stepup-dialog p{margin:0;color:var(--muted);font-size:14px}.stepup-dialog label{display:grid;gap:6px;font-weight:700;font-size:14px}.stepup-dialog input{font-size:17px;padding:12px;border:1px solid var(--line);border-radius:9px}\n";
function ownerHtml(){return "<!doctype html><html lang=\"ko\"><head><meta charset=\"utf-8\"><meta name=\"viewport\" content=\"width=device-width,initial-scale=1\"><meta name=\"color-scheme\" content=\"light\"><title>마이투자 · EKODI</title><link rel=\"stylesheet\" href=\"/my/invest/style.css\"></head><body>\n<header class=\"top\"><a class=\"brand\" href=\"/invest\"><i>E</i>EKODI 투자</a><nav class=\"toplinks\" aria-label=\"투자 서비스\"><a href=\"/invest\">투자 안내</a><a href=\"/invest/analysis\">공통 투자분석</a><a href=\"#design\">시나리오</a><a href=\"#portfolio\">포트폴리오</a><a href=\"/my\">My EKODI</a><a href=\"/my/invest\">MY</a></nav><div class=\"topright\"><button id=\"stepUpButton\" class=\"stepup\" type=\"button\" data-state=\"pending\" aria-haspopup=\"dialog\">본인인증 대기</button></div></header>\n<dialog id=\"stepUpDialog\" class=\"stepup-dialog\" aria-labelledby=\"stepUpTitle\"><form id=\"stepUpForm\" novalidate><h2 id=\"stepUpTitle\">본인인증 (2단계)</h2><p>Google 로그인에 더해, 등록된 <strong>휴대폰 번호</strong> 또는 <strong>주소의 일부</strong>(도로명과 건물번호)를 입력해 주세요. 입력값은 저장되지 않고 확인에만 쓰입니다.</p><label>휴대폰 번호 또는 주소 일부<input id=\"stepUpAnswer\" name=\"answer\" autocomplete=\"off\" autocapitalize=\"off\" spellcheck=\"false\" maxlength=\"200\" required></label><p id=\"stepUpMessage\" class=\"hint\" role=\"status\" aria-live=\"polite\"></p><div class=\"controls\"><button id=\"stepUpSubmit\" class=\"btn\" type=\"submit\">인증하기</button><button id=\"stepUpCancel\" class=\"btn secondary\" type=\"button\">취소</button></div></form></dialog>\n<div class=\"shell\"><nav class=\"sidebar\" aria-label=\"마이투자 메뉴\"><small>My EKODI</small><a class=\"active\" href=\"/my/invest\">마이투자</a><a href=\"#autopilot\">AI 자동투자 운용</a><a href=\"#autopilotPolicy\">자동투자 정책</a><a href=\"#portfolio\">내 포트폴리오</a><a href=\"#design\">투자분석 설계</a><a href=\"#scenario\">시나리오 비교</a><a href=\"#insights\">리스크 인사이트</a><a href=\"#export\">보고서 내보내기</a><a href=\"/my\">내 계정</a><div class=\"aside-note\"><strong>EKODI Private Research</strong><p>한 사람의 자산을 보호하며, 근거와 위험을 함께 살피는 개인 연구 공간입니다.</p></div></nav>\n<main class=\"main\"><div class=\"crumb\">EKODI 투자 &nbsp;›&nbsp; My EKODI &nbsp;›&nbsp; 마이투자</div>\n<section class=\"hero\"><div><span class=\"eyebrow\">PRIVATE INVESTMENT STUDIO</span><h1>마이투자</h1><p>목표를 설계하고, 자산을 이해하고, 여러 미래를 비교하는<br>나만의 투자 분석 공간입니다.</p></div><span class=\"watermark\">PRIVATE · EKODI</span></section>\n<div class=\"notice\">일반회원용 유료 구독 및 개인별 투자자문은 비활성화되어 있습니다. <strong>검증된 최고관리자 본인의 개인 연구용 도구</strong>로만 제공됩니다. 직접 입력한 보유자산은 이 브라우저에서만 계산합니다. AI 자동투자 정책과 모의투자 기록만 본인 전용 서버 영역에 저장되며 증권사 계좌번호·인증정보는 저장하지 않습니다. 이 화면에는 실시간 시세가 연결되지 않습니다.</div>\n<div id=\"authMessage\" class=\"notice auth\" role=\"status\">본인 인증과 사용 권한을 확인하고 있습니다.</div>\n<section id=\"owner\" hidden>\n<section id=\"autopilot\" class=\"autopilot\" aria-labelledby=\"apTitle\">\n<div class=\"ap-head\"><div><span class=\"eyebrow\">EKODI AI PRIVATE WEALTH</span><h2 id=\"apTitle\">AI 자동투자 운용 상태</h2><p id=\"apMessage\" class=\"hint\" role=\"status\">운용 상태를 불러오는 중입니다.</p></div>\n<div class=\"ap-actions\"><button id=\"apStart\" class=\"btn\" type=\"button\" disabled>모의투자 시작·재개</button><button id=\"apPause\" class=\"btn secondary\" type=\"button\" disabled>일시정지</button><button id=\"apStop\" class=\"btn danger\" type=\"button\">신규 주문 긴급정지</button></div></div>\n<div class=\"ap-tiles\" aria-live=\"polite\">\n<article class=\"tile\"><span class=\"tag\">상태</span><div class=\"caption\">AI 운용 상태</div><strong id=\"apState\" data-state=\"RESEARCH_ONLY\">확인 중</strong><small>준비 · 모의투자 · 실거래 · 중지</small></article>\n<article class=\"tile\"><span class=\"tag\">설정</span><div class=\"caption\">운용 허용금액</div><strong id=\"apBudget\">미설정</strong><small>직접 지정한 한도만 운용</small></article>\n<article class=\"tile\"><span class=\"tag\">모의</span><div class=\"caption\">현재 운용금액</div><strong id=\"apDeployed\">—</strong><small>모의 보유자산 평가액</small></article>\n<article class=\"tile\"><span class=\"tag\">모의</span><div class=\"caption\">모의 총 평가자산</div><strong id=\"apEquity\">모의투자 전</strong><small>입력 시세 기준 · 실제 계좌 아님</small></article>\n<article class=\"tile\"><span class=\"tag\">모의</span><div class=\"caption\">순수익률</div><strong id=\"apReturn\">—</strong><small>수수료·슬리피지 반영</small></article>\n<article class=\"tile\"><span class=\"tag\">감시</span><div class=\"caption\">현재 위험 상태</div><strong id=\"apRisk\">확인 중</strong><small>Sentinel 규칙 검사</small></article>\n</div>\n<div class=\"ap-notices\"><div class=\"ap-summary\"><h3>이번 주 핵심 요약</h3><div id=\"apSummary\" class=\"insights\"><p class=\"hint\">첫 정기 보고서는 모의투자 시작 후 다음 월요일 오전 8시(한국시간)에 생성됩니다.</p></div></div><div class=\"ap-alerts\"><h3>중요 위험 알림</h3><ul id=\"apAlerts\" class=\"gates\"><li>최근 긴급 알림 없음</li></ul><p id=\"apDelivery\" class=\"hint\">알림은 이 화면에 항상 표시됩니다.</p></div></div>\n<p class=\"hint\">긴급정지는 신규 주문만 멈추며 보유자산을 임의로 청산하지 않습니다. 중지 중에도 보유·체결·보고서는 계속 조회됩니다. 실거래는 별도의 명시적 승인과 검증 전까지 비활성화되어 있습니다.</p>\n</section>\n<div class=\"overview\" aria-live=\"polite\"><article class=\"tile\"><span class=\"tag\">LOCAL</span><div class=\"caption\">입력한 총 평가액</div><strong id=\"totalValue\">0원</strong><small>직접 입력한 자산만 합산</small></article><article class=\"tile\"><span class=\"tag\">LOCAL</span><div class=\"caption\">평가 손익</div><strong id=\"totalProfit\">0원</strong><small>입력한 매입단가 대비</small></article><article class=\"tile\"><span class=\"tag\">가정</span><div class=\"caption\">시나리오 연수익률</div><strong id=\"annualBadge\">8.0%</strong><small>수익률 예측이 아닌 입력한 가정</small></article><article class=\"tile\"><span class=\"tag\">가정</span><div class=\"caption\">설정한 손실 허용폭</div><strong id=\"riskBadge\">15%</strong><small>손실 한도 보장 아님</small></article></div>\n<div class=\"layout\">\n<section class=\"panel\"><header><h2>기간별 시나리오 변화</h2><small>연도별 가정값 · 실제 시장 차트 아님</small></header><div id=\"lineChart\" class=\"graph-area\" aria-label=\"가정한 투자금액의 연도별 선 그래프\"></div><div class=\"legend\"><span><i class=\"dot gray\"></i>보수적</span><span><i class=\"dot\"></i>기본</span><span><i class=\"dot gold\"></i>낙관적</span></div></section>\n<section class=\"panel\"><header><h2>내 자산 구성</h2><small>수동 입력 기준</small></header><div class=\"pie-row\"><div id=\"donut\" class=\"donut\"><div><b id=\"donutValue\">0원</b><small>입력 평가액</small></div></div><div id=\"breakdown\" class=\"breakdown\"><p>등록된 자산 없음</p></div></div></section>\n<section id=\"design\" class=\"panel\"><header><h2>나만의 투자분석 설계</h2><small>값을 바꾸면 즉시 계산합니다</small></header><div class=\"inputs\">\n<label>초기 투자금 (원)<input id=\"capital\" type=\"number\" min=\"0\" max=\"1000000000000\" step=\"100000\" value=\"10000000\"></label>\n<label>월 추가 투자금 (원)<input id=\"monthly\" type=\"number\" min=\"0\" max=\"1000000000\" step=\"10000\" value=\"300000\"></label>\n<label>투자 기간 (년)<input id=\"horizon\" type=\"number\" min=\"1\" max=\"30\" step=\"1\" value=\"5\"></label>\n<label>기본 연수익률 가정 (%)<input id=\"target\" type=\"number\" min=\"-50\" max=\"50\" step=\"0.5\" value=\"8\"></label>\n<label>허용 손실률 (%)<input id=\"loss\" type=\"number\" min=\"0\" max=\"100\" step=\"1\" value=\"15\"></label>\n<label>희망 현금 비중 (%)<input id=\"cash\" type=\"number\" min=\"0\" max=\"100\" step=\"1\" value=\"15\"></label>\n<label>종목별 최대 비중 (%)<input id=\"concentration\" type=\"number\" min=\"1\" max=\"100\" step=\"1\" value=\"25\"></label>\n<label>투자 목적<select id=\"goal\"><option value=\"장기자산\">장기 자산 형성</option><option value=\"노후자금\">노후 자금</option><option value=\"교육자금\">교육 자금</option><option value=\"주택자금\">주택 자금</option></select></label>\n<label>분석 모드<select id=\"mode\"><option value=\"balanced\">균형형</option><option value=\"conservative\">안정형</option><option value=\"aggressive\">성장형</option></select></label>\n</div><div class=\"controls\"><button id=\"calculate\" class=\"btn\" type=\"button\">시나리오 다시 계산</button><button id=\"reset\" class=\"btn secondary\" type=\"button\">입력 초기화</button><span id=\"validation\" class=\"hint\" role=\"status\">세금·수수료·물가상승률·변동성은 별도 검토가 필요합니다.</span></div></section>\n<section id=\"insights\" class=\"panel\"><header><h2>내 투자 리스크 점검</h2><small>규칙 기반 설명 · AI 매매 추천 아님</small></header><div id=\"insightList\" class=\"insights\"><div class=\"insight\">입력값을 검토 중입니다.</div></div></section>\n<section id=\"scenario\" class=\"panel span2\"><header><h2>세 가지 미래 비교</h2><small>가정에 따른 계산 · 수익 보장 아님</small></header><div id=\"scenarios\" class=\"scenarios\" aria-live=\"polite\"></div></section>\n<section id=\"portfolio\" class=\"panel span2\"><header><h2>내 자산 · 관심 종목 직접 입력</h2><small id=\"dataType\">실제 계좌 자동연동 없음 · 직접 입력한 가격 기준</small></header>\n<form id=\"holdingForm\" class=\"holding-form\">\n<label>종목 / 자산명<input name=\"name\" maxlength=\"55\" placeholder=\"예: 관심 ETF\" required></label>\n<label>자산 유형<select name=\"group\"><option>국내 주식</option><option>해외 주식</option><option>ETF</option><option>현금</option><option>기타</option></select></label>\n<label>수량<input name=\"qty\" type=\"number\" min=\"0.000001\" max=\"100000000\" step=\"any\" required></label>\n<label>매입단가 (원)<input name=\"cost\" type=\"number\" min=\"0\" max=\"1000000000000\" step=\"any\" required></label>\n<label>평가단가 (원)<input name=\"price\" type=\"number\" min=\"0\" max=\"1000000000000\" step=\"any\" required></label>\n<button class=\"btn\" type=\"submit\">자산 추가</button></form>\n<div class=\"controls\"><button id=\"demo\" class=\"btn secondary\" type=\"button\">가상 예시 불러오기</button><button id=\"clear\" class=\"btn secondary\" type=\"button\">입력 자산 모두 지우기</button><span class=\"hint\">가상 예시는 실제 계좌·종목 시세가 아닙니다.</span></div>\n<div class=\"scroll\"><table><thead><tr><th>종목 / 자산</th><th>유형</th><th class=\"num\">수량</th><th class=\"num\">입력 평가액</th><th class=\"num\">평가 손익</th><th>관리</th></tr></thead><tbody id=\"holdingRows\"><tr><td colspan=\"6\" class=\"empty\">직접 자산을 입력하거나 가상 예시를 불러와 시작하세요.</td></tr></tbody></table></div></section>\n<section id=\"autopilotPolicy\" class=\"panel span2\"><header><h2>AI 자동투자 정책</h2><small>금액·손실 한도는 직접 지정 · 기본값 없음</small></header>\n<p class=\"hint\" id=\"apAllocation\">예시 자산배분(자동 적용 안 함): 장기 성장 60% · 안정·유동성 25% · AI 전략 15%</p>\n<form id=\"policyForm\" class=\"inputs policy-form\">\n<label>AI 자동투자 허용 총자금 (원)<input id=\"pf_totalBudget\" type=\"number\" min=\"1\" step=\"10000\" placeholder=\"미설정\"></label>\n<label>1회 최대 주문금액 (원)<input id=\"pf_maxOrderAmount\" type=\"number\" min=\"1\" step=\"10000\" placeholder=\"미설정\"></label>\n<label>1일 최대 신규매수금액 (원)<input id=\"pf_maxDailyBuyAmount\" type=\"number\" min=\"1\" step=\"10000\" placeholder=\"미설정\"></label>\n<label>최대 보유종목 수<input id=\"pf_maxPositions\" type=\"number\" min=\"1\" max=\"50\" step=\"1\" placeholder=\"미설정\"></label>\n<label>종목당 최대 비중 (%)<input id=\"pf_maxPositionWeightPct\" type=\"number\" min=\"1\" max=\"100\" step=\"1\" placeholder=\"미설정\"></label>\n<label>최소 현금 비중 (%)<input id=\"pf_minCashPct\" type=\"number\" min=\"0\" max=\"100\" step=\"1\" placeholder=\"미설정\"></label>\n<label>하루 허용 평가손실 (%)<input id=\"pf_dailyLossLimitPct\" type=\"number\" min=\"0.1\" max=\"50\" step=\"0.1\" placeholder=\"미설정\"></label>\n<label>전체 누적 허용손실 (%)<input id=\"pf_totalLossLimitPct\" type=\"number\" min=\"0.1\" max=\"90\" step=\"0.1\" placeholder=\"미설정\"></label>\n<label>투자기간 (년)<input id=\"pf_horizonYears\" type=\"number\" min=\"1\" max=\"40\" step=\"1\" placeholder=\"미설정\"></label>\n<label>투자 성향<select id=\"pf_riskProfile\"><option value=\"\">미설정</option><option value=\"conservative\">안정형</option><option value=\"balanced\">균형형</option><option value=\"growth\">성장형</option></select></label>\n<label>자동매매 시작 시각<input id=\"pf_windowStart\" type=\"time\"></label>\n<label>자동매매 종료 시각<input id=\"pf_windowEnd\" type=\"time\"></label>\n<label>1일 최대 거래 횟수<input id=\"pf_maxTradesPerDay\" type=\"number\" min=\"1\" max=\"100\" step=\"1\" placeholder=\"미설정\"></label>\n<fieldset class=\"checks\"><legend>허용 주식시장</legend><label><input type=\"checkbox\" name=\"markets\" value=\"KR\">국내</label><label><input type=\"checkbox\" name=\"markets\" value=\"US\">미국</label></fieldset>\n<fieldset class=\"checks\"><legend>허용 자산 종류</legend><label><input type=\"checkbox\" name=\"assetTypes\" value=\"ETF\">ETF</label><label><input type=\"checkbox\" name=\"assetTypes\" value=\"STOCK\">주식</label><label><input type=\"checkbox\" name=\"assetTypes\" value=\"BOND_ETF\">채권 ETF</label><label><input type=\"checkbox\" name=\"assetTypes\" value=\"CASH_EQUIVALENT\">현금성</label></fieldset>\n<fieldset class=\"checks\"><legend>위험 알림 수단</legend><label><input type=\"checkbox\" name=\"alertChannels\" value=\"admin\">관리자 알림</label><label><input type=\"checkbox\" name=\"alertChannels\" value=\"email\">이메일</label><label class=\"muted\"><input type=\"checkbox\" disabled>문자 (비용 승인 후)</label></fieldset>\n</form>\n<div class=\"controls\"><button id=\"policySave\" class=\"btn\" type=\"button\">정책 저장</button><span id=\"apMissing\" class=\"hint\" role=\"status\"></span></div>\n<p class=\"hint\">신용·미수·레버리지·파생상품·공매도·시장가 주문은 정책과 무관하게 항상 차단됩니다. 손실 한도를 정해도 급락·거래정지·가격 급변 시 실제 손실이 한도를 넘을 수 있습니다.</p>\n<div class=\"ap-grid\">\n<div><h3>실거래 활성화 전 남은 조건</h3><ul id=\"apGates\" class=\"gates\"><li>확인 중</li></ul></div>\n<div><h3>모의 주문 (시세 직접 입력)</h3><form id=\"paperForm\" class=\"holding-form paper-form\">\n<label>종목코드<input name=\"symbol\" maxlength=\"20\" required placeholder=\"예: 069500\"></label>\n<label>시장<select name=\"market\"><option value=\"KR\">국내</option><option value=\"US\">미국</option></select></label>\n<label>자산<select name=\"assetType\"><option value=\"ETF\">ETF</option><option value=\"STOCK\">주식</option><option value=\"BOND_ETF\">채권 ETF</option></select></label>\n<label>매수/매도<select name=\"side\"><option value=\"BUY\">매수</option><option value=\"SELL\">매도</option></select></label>\n<label>수량<input name=\"qty\" type=\"number\" min=\"0.0001\" step=\"any\" required></label>\n<label>지정가<input name=\"limitPrice\" type=\"number\" min=\"0\" step=\"any\" required></label>\n<label>현재 시세 (직접 입력)<input name=\"quote\" type=\"number\" min=\"0\" step=\"any\" required></label>\n<button class=\"btn\" type=\"submit\">위험 검사 후 모의 주문</button></form><p id=\"paperResult\" class=\"hint\" role=\"status\">모든 모의 주문은 독립 Risk Engine을 먼저 통과해야 합니다.</p></div>\n</div>\n<h3>최근 주문·위험 판단 기록</h3>\n<div class=\"scroll\"><table><thead><tr><th>시각</th><th>종목</th><th>구분</th><th class=\"num\">수량</th><th class=\"num\">체결가</th><th>상태</th><th>판단 근거</th></tr></thead><tbody id=\"apOrders\"><tr><td colspan=\"7\" class=\"empty\">아직 주문 기록이 없습니다.</td></tr></tbody></table></div>\n<div class=\"controls\"><button id=\"apWeekly\" class=\"btn gold\" type=\"button\">주간 보고서 보기</button><button id=\"apMonthly\" class=\"btn secondary\" type=\"button\">월간 보고서 보기</button></div>\n<div id=\"apReport\" class=\"insights\" aria-live=\"polite\"></div>\n</section>\n<section id=\"export\" class=\"panel span2\"><header><h2>나만의 투자 연구 보고서</h2><small>이 브라우저에서만 생성 · 서버 업로드 없음</small></header><p class=\"hint\">분석 결과와 입력 자산을 CSV로 내려받아 직접 보관할 수 있습니다. 공용 PC에서는 저장 파일 관리에 유의하세요.</p><button id=\"download\" class=\"btn gold\" type=\"button\">보고서 CSV 내려받기</button></section></div></section>\n<footer class=\"footer\">본 기능은 최고관리자 본인 연구용입니다. 금융투자상품의 과거 수익과 가정 수익은 미래 성과를 보장하지 않습니다. 모든 실제 주문·유료 자문은 비활성화 상태이며, 자동투자는 모의투자로만 운용됩니다. · <a href=\"/my\">My EKODI</a> · <a href=\"/invest\">EKODI 투자</a></footer>\n</main></div><script src=\"/my/invest/app.js\" defer></script></body></html>";}

function investBrowserClient(){
'use strict';
const el=(id)=>document.getElementById(id);
const login='/auth/?site=my&return_to='+encodeURIComponent('https://ekodi.kr/my/invest');
const supabaseUrl='https://renzehysxirjilvdxacv.supabase.co';
const supabaseKey='sb_publishable_0QjB0WzZbjrd-FJ5D5cR7A_xUkXyOY_';
const money=(v)=>new Intl.NumberFormat('ko-KR',{maximumFractionDigits:0}).format(Math.round(v))+'원';
const n=(id)=>Number(el(id).value);
let holdings=[],isDemo=false,sessionClient=null,verified=false,ownerToken='',autopilot=null;
// Second-factor token lives in memory only: a reload or a new tab asks again.
let stepUpToken='';
const autopilotApi='/workspace-api/v1/invest/autopilot';
const STATE_LABEL={RESEARCH_ONLY:'준비 (연구 전용)',PAPER_TRADING:'모의투자 운용 중',LIVE_PENDING_APPROVAL:'실거래 승인 대기',LIVE_ACTIVE:'실거래 운용 중',PAUSED:'일시정지',EMERGENCY_STOPPED:'긴급정지'};
const RISK_LABEL={daily_loss_limit_reached:'하루 손실 한도 도달',daily_loss_limit_near:'하루 손실 한도 근접',total_loss_limit_reached:'누적 손실 한도 도달',total_loss_limit_near:'누적 손실 한도 근접',budget_breach:'운용 한도 초과',broker_unavailable:'증권사 연결 장애',ledger_mismatch:'계좌·주문장부 불일치',market_data_delayed:'시세 지연',risk_engine_unhealthy:'위험관리 엔진 이상',broker_auth_expiring:'증권사 인증 만료 임박'};
const GATE_LABEL={accountOwnershipVerified:'본인 명의 증권계좌 인증',brokerAutomationTermsVerified:'증권사 자동매매 이용조건 확인',brokerOrderApiVerified:'증권사 주문 API 실검증',policyComplete:'투자금·손실 한도 등 정책 설정',paperValidationPassed:'모의투자 검증 통과',costAndRiskDisclosureAcknowledged:'거래비용·위험 고지 확인',explicitLiveApproval:'실거래 실행에 대한 별도 명시적 승인',serverApprovalRecordMatches:'서버 승인 기록 확인',riskEngineHealthy:'위험관리 엔진 정상',platformLiveSwitch:'플랫폼 실거래 잠금 해제 (별도 거버넌스 릴리스)'};
const REASON_LABEL={state_not_trading:'운용 상태 아님',policy_incomplete:'정책 미설정',order_amount_limit:'1회 주문한도 초과',daily_buy_limit:'일일 매수한도 초과',budget_exceeded:'운용 허용금액 초과',min_cash_breach:'최소 현금비중 미달',insufficient_cash:'현금 부족',position_weight_limit:'종목 비중 초과',max_positions:'보유종목 수 초과',duplicate_order:'중복 주문',idempotency_key_required:'주문 식별자 없음',leverage_or_derivative_blocked:'레버리지·파생 차단',order_type_blocked:'지정가만 허용',market_not_allowed:'허용 시장 아님',asset_type_not_allowed:'허용 자산 아님',market_data_stale:'시세 지연',abnormal_price:'비정상 가격',invalid_quote:'시세 오류',outside_trading_window:'허용 시간 외',trade_frequency_limit:'거래 빈도 초과',daily_loss_limit:'하루 손실 한도',total_loss_limit:'누적 손실 한도',short_sale_blocked:'보유수량 초과 매도',broker_unavailable:'증권사 장애',ledger_mismatch:'장부 불일치',unresolved_order_status:'미확인 주문 존재',trading_halted:'거래정지'};
const POLICY_KEYS=['totalBudget','maxOrderAmount','maxDailyBuyAmount','maxPositions','maxPositionWeightPct','minCashPct','dailyLossLimitPct','totalLossLimitPct','horizonYears','maxTradesPerDay'];
function setText(id,value){const node=el(id);if(node)node.textContent=value}
function kstTime(iso){const t=Date.parse(iso||'');return Number.isFinite(t)?new Date(t).toLocaleString('ko-KR',{timeZone:'Asia/Seoul',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hour12:false}):'—'}
async function apiCall(method,path,payload){
 const response=await fetch(autopilotApi+path,{method,headers:{authorization:'Bearer '+ownerToken,'content-type':'application/json','x-ekodi-invest-step-up':stepUpToken},body:payload?JSON.stringify(payload):undefined,cache:'no-store'});
 const data=await response.json().catch(()=>({}));
 if(response.status===403&&data.error==='STEP_UP_REQUIRED')lockOwner('본인인증 시간이 지났습니다. 오른쪽 위 「본인인증 대기」 버튼을 눌러 다시 인증해 주세요.');
 return {ok:response.ok,status:response.status,data};
}
async function loadAutopilot(){
 let result;
 try{result=await apiCall('GET','/status')}catch{setText('apMessage','자동투자 서버에 연결하지 못했습니다. 잠시 후 다시 확인합니다.');return}
 if(!result.ok){
  setText('apMessage',result.status===401?'자동투자 운용은 EKODI 통합(Google) 로그인 세션이 필요합니다. 다시 로그인해 주세요.':result.data.error==='OWNER_ONLY'?'본인 전용 운용 권한이 확인되지 않았습니다.':'운용 상태를 불러오지 못했습니다 ('+(result.data.error||result.status)+').');
  return;
 }
 autopilot=result.data;renderAutopilot();
}
function fillPolicy(policy){
 for(const key of POLICY_KEYS){const input=el('pf_'+key);if(input&&document.activeElement!==input)input.value=policy[key]==null?'':String(policy[key])}
 el('pf_riskProfile').value=policy.riskProfile||'';
 el('pf_windowStart').value=policy.tradingWindow?policy.tradingWindow.start:'';
 el('pf_windowEnd').value=policy.tradingWindow?policy.tradingWindow.end:'';
 for(const name of ['markets','assetTypes','alertChannels'])for(const box of document.querySelectorAll('input[name="'+name+'"]'))box.checked=(policy[name]||[]).includes(box.value);
}
function readPolicy(){
 const policy={};
 for(const key of POLICY_KEYS){const raw=el('pf_'+key).value.trim();policy[key]=raw===''?null:Number(raw)}
 policy.riskProfile=el('pf_riskProfile').value||null;
 const start=el('pf_windowStart').value,end=el('pf_windowEnd').value;
 policy.tradingWindow=start&&end?{start,end,tz:'Asia/Seoul'}:null;
 for(const name of ['markets','assetTypes','alertChannels'])policy[name]=[...document.querySelectorAll('input[name="'+name+'"]:checked')].map(box=>box.value);
 return policy;
}
function cell(text,className){const td=document.createElement('td');td.textContent=text;if(className)td.className=className;return td}
function renderAutopilot(){
 const a=autopilot,p=a.policy,paper=a.paper;
 setText('apMessage','기준: '+(paper.startedAt?'모의투자 (직접 입력한 시세)':'모의투자 시작 전')+' · 실거래 비활성화');
 setText('apState',STATE_LABEL[a.state]||a.state);el('apState').dataset.state=a.state;
 setText('apBudget',p.totalBudget?money(p.totalBudget):'미설정');
 setText('apDeployed',paper.startedAt?money(paper.marketValue):'—');
 setText('apEquity',paper.startedAt?money(paper.equity):'모의투자 전');
 setText('apReturn',paper.returnPct==null?'—':(paper.returnPct*100).toFixed(2)+'%');
 const stopped=['PAUSED','EMERGENCY_STOPPED'].includes(a.state);
 setText('apRisk',a.sentinel.alerts.length?a.sentinel.alerts.map(x=>RISK_LABEL[x.code]||x.code).join(', '):stopped?(a.alerts&&a.alerts[0]?'중지됨 · '+a.alerts[0].title:'중지됨 · 재개 전 확인 필요'):'정상');
 const ex=a.allocationExample;
 setText('apAllocation','예시 자산배분(자동 적용 안 함): 장기 성장 '+ex.core.pct+'% · 안정·유동성 '+ex.stable.pct+'% · AI 전략 '+ex.satellite.pct+'%. 실제 비율은 투자기간·유동성·손실 감내능력에 맞게 직접 정합니다.');
 fillPolicy(p);
 setText('apMissing',a.policyMissing.length?'미설정 항목: '+a.policyMissing.map(k=>a.policyFields[k].label).join(', '):'모든 정책 항목이 설정되었습니다.');
 el('apGates').replaceChildren(...(a.liveActivation.blockers.length?a.liveActivation.blockers:['none']).map(code=>{const li=document.createElement('li');li.textContent=code==='none'?'모든 조건 충족':(GATE_LABEL[code]||code);return li}));
 const rows=a.orders.map(o=>{const tr=document.createElement('tr');tr.append(cell(kstTime(o.created_at)),cell(o.symbol),cell(o.side==='BUY'?'매수':'매도'),cell(String(o.filled_qty||o.qty),'num'),cell(o.avg_price?money(o.avg_price):'—','num'),cell(o.status),cell((o.risk_reasons||[]).map(r=>REASON_LABEL[r]||r).join(', ')||'위험 검사 통과'));return tr});
 if(rows.length)el('apOrders').replaceChildren(...rows);
 renderNotices(a);
 el('apStart').disabled=a.policyMissing.length>0||!['RESEARCH_ONLY','PAUSED','EMERGENCY_STOPPED'].includes(a.state);
 el('apPause').disabled=a.state!=='PAPER_TRADING';
 el('apStop').disabled=a.state==='EMERGENCY_STOPPED';
}
function reportItems(report){
 const items=(report.lines||[]).map(line=>{const div=document.createElement('div');div.className='insight';const b=document.createElement('b');b.textContent=line.label;div.append(b,document.createTextNode(line.value));return div});
 for(const decision of report.ownerDecisionsNeeded||[]){const div=document.createElement('div');div.className='insight';const b=document.createElement('b');b.textContent='확인이 필요한 결정';div.append(b,document.createTextNode(decision));items.push(div)}
 return items;
}
const DELIVERY_LABEL={delivered:'이메일로도 발송됨',in_app:'이 화면에 표시됨',pending:'발송 준비 중'};
function renderNotices(a){
 if(a.latestReport){
  const head=document.createElement('p');head.className='hint';head.textContent=a.latestReport.title+' · '+(DELIVERY_LABEL[a.latestReport.delivery_status]||a.latestReport.delivery_status);
  el('apSummary').replaceChildren(head,...reportItems(a.latestReport.report||{}));
 }
 if(a.alerts&&a.alerts.length){
  el('apAlerts').replaceChildren(...a.alerts.map(n=>{const li=document.createElement('li');li.className=n.severity;li.textContent=kstTime(n.created_at)+' · '+n.title;return li}));
 }
 const channels=a.policy.alertChannels||[];
 setText('apDelivery',channels.includes('email')?'긴급 알림과 정기 보고서는 이 화면에 항상 표시되며, 이메일 채널이 연결된 경우 이메일로도 발송됩니다.':'알림은 이 화면에 항상 표시됩니다. 이메일을 원하면 정책의 위험 알림 수단에서 이메일을 선택하세요.');
}
async function savePolicy(){
 const result=await apiCall('PUT','/policy',{policy:readPolicy()});
 if(!result.ok){
  const labels=autopilot?autopilot.policyFields:{};
  const errors=result.data.errors||{};
  setText('apMissing','저장하지 못했습니다: '+(Object.keys(errors).map(k=>(labels[k]?labels[k].label:k)).join(', ')||result.data.error||result.status));
  return;
 }
 await loadAutopilot();
}
async function changeState(target){
 const payload={target};
 if(autopilot&&autopilot.state==='EMERGENCY_STOPPED'){
  if(!window.confirm('긴급정지 원인을 확인했고 모의투자를 다시 시작합니다. 계속할까요?'))return;
  payload.confirm='RESUME_AFTER_REVIEW';
 }
 const result=await apiCall('POST','/state',payload);
 if(!result.ok)setText('apMessage','상태를 변경하지 못했습니다: '+(result.data.reason||result.data.error||result.status));
 await loadAutopilot();
}
async function emergencyStop(){
 if(!window.confirm('신규 주문을 즉시 중지합니다. 보유자산은 청산하지 않습니다. 계속할까요?'))return;
 const result=await apiCall('POST','/emergency-stop');
 setText('apMessage',result.ok?'긴급정지되었습니다. 미체결 모의 주문 '+result.data.cancelledOpenOrders+'건을 취소했습니다.':'긴급정지 요청이 실패했습니다. 다시 눌러 주세요.');
 await loadAutopilot();
}
async function paperOrder(event){
 event.preventDefault();
 const form=new FormData(event.target);
 const key='paper-'+Date.now()+'-'+(crypto.randomUUID?crypto.randomUUID().slice(0,8):Math.random().toString(36).slice(2,10));
 const payload={idempotencyKey:key,symbol:String(form.get('symbol')||''),market:form.get('market'),assetType:form.get('assetType'),side:form.get('side'),qty:Number(form.get('qty')),limitPrice:Number(form.get('limitPrice')),quote:{price:Number(form.get('quote')),at:new Date().toISOString()},strategyId:'owner_manual'};
 const result=await apiCall('POST','/paper/orders',payload);
 setText('paperResult',result.ok?'모의 체결 결과: '+result.data.order.status+' · 체결 '+result.data.order.filledQty+'주':'위험 검사 차단: '+((result.data.reasons||[]).map(r=>REASON_LABEL[r]||r).join(', ')||result.data.error||result.status));
 await loadAutopilot();
}
async function showReport(kind){
 const result=await apiCall('GET','/report?kind='+kind);
 const root=el('apReport');
 if(!result.ok){root.replaceChildren(document.createTextNode('보고서를 불러오지 못했습니다.'));return}
 const items=reportItems(result.data);
 const note=document.createElement('p');note.className='hint';note.textContent=result.data.disclaimer;items.push(note);
 root.replaceChildren(...items);
}
const types=['국내 주식','해외 주식','ETF','현금','기타'];
const colors=['#155343','#b99b56','#7bc39a','#adbcb3','#dee4df'];
function status(message,needsLogin){
 const root=el('authMessage');root.replaceChildren(document.createTextNode(message));
 if(needsLogin){const a=document.createElement('a');a.href=login;a.textContent='안전하게 다시 로그인';root.append(a)}
}
function setStepUp(state){const b=el('stepUpButton');b.dataset.state=state;b.disabled=false;b.textContent=state==='done'?'본인인증 완료':'본인인증 대기';b.setAttribute('aria-pressed',state==='done'?'true':'false')}
function unlockOwner(){el('owner').hidden=false;el('authMessage').hidden=true;setStepUp('done');render();loadAutopilot()}
function lockOwner(message){
 stepUpToken='';
 el('owner').hidden=true;el('authMessage').hidden=false;setStepUp('pending');
 status(message||'Google 로그인은 확인되었습니다. 안전을 위해 오른쪽 위 「본인인증 대기」 버튼을 눌러 추가 인증을 완료해 주세요.',false);
}
async function stepUpCall(method,payload){
 const response=await withTimeout(fetch(autopilotApi+'/step-up',{method,headers:{authorization:'Bearer '+ownerToken,'content-type':'application/json','x-ekodi-invest-step-up':stepUpToken},body:payload?JSON.stringify(payload):undefined,cache:'no-store'}),15000);
 return {ok:response.ok,status:response.status,data:await response.json().catch(()=>({}))};
}
async function checkStepUp(){
 if(stepUpToken){try{const r=await stepUpCall('GET');if(r.ok&&r.data.verified){unlockOwner();return}}catch{}}
 lockOwner();
}
function openStepUp(){
 const button=el('stepUpButton');
 if(!verified){location.href=login;return}
 if(button.dataset.state==='done'){
  if(confirm('본인인증을 해제할까요? 다시 이용하려면 추가 인증이 필요합니다.')){stepUpCall('DELETE').catch(()=>{});lockOwner('본인인증을 해제했습니다. 다시 이용하려면 「본인인증 대기」 버튼을 눌러 주세요.')}
  return;
 }
 el('stepUpMessage').textContent='';el('stepUpAnswer').value='';el('stepUpDialog').showModal();el('stepUpAnswer').focus();
}
const STEP_UP_ERRORS={STEP_UP_LOCKED:'시도 횟수를 넘었습니다. 잠시 후 다시 시도해 주세요.',STEP_UP_NOT_CONFIGURED:'추가 인증 정보가 아직 등록되지 않았습니다. 관리자에게 문의해 주세요.',STEP_UP_UNAVAILABLE:'인증 서버를 확인하지 못했습니다. 잠시 후 다시 시도해 주세요.'};
async function submitStepUp(event){
 event.preventDefault();
 const answer=el('stepUpAnswer').value.trim(),message=el('stepUpMessage');
 if(answer.length<4){message.textContent='4자 이상 입력해 주세요.';return}
 el('stepUpSubmit').disabled=true;message.textContent='확인 중입니다…';
 try{
  const r=await stepUpCall('POST',{answer});
  if(r.ok&&r.data.verified&&r.data.token){
   stepUpToken=r.data.token;
   el('stepUpAnswer').value='';el('stepUpDialog').close();unlockOwner();return;
  }
  const code=r.data&&r.data.error;
  if(code==='STEP_UP_MISMATCH')message.textContent='입력하신 정보가 등록 정보와 일치하지 않습니다.'+(Number.isFinite(r.data.remaining)?' (남은 시도 '+r.data.remaining+'회)':'');
  else if(code==='STEP_UP_LOCKED')message.textContent='시도 횟수를 넘었습니다. 약 '+Math.max(1,Math.ceil((Number(r.data.retryAfterSec)||900)/60))+'분 후 다시 시도해 주세요.';
  else if(STEP_UP_ERRORS[code])message.textContent=STEP_UP_ERRORS[code];
  else if(r.status===401)message.textContent='로그인이 만료되었습니다. 다시 로그인해 주세요.';
  else message.textContent='인증하지 못했습니다. 잠시 후 다시 시도해 주세요.';
 }catch{message.textContent='인증 서버에 연결하지 못했습니다. 잠시 후 다시 시도해 주세요.'}
 finally{el('stepUpSubmit').disabled=false}
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
// Every login step is time-boxed: an in-app browser that never resolves the module import,
// the session lock or the network must fall back to a visible login prompt, not hang forever.
function withTimeout(promise,ms){return Promise.race([promise,new Promise((_,reject)=>setTimeout(()=>reject(new Error('timeout')),ms))])}
async function authenticate(){
 const handoff=removeHandoffFromUrl();
 const tokens=[];
 try{
  const mod=await withTimeout(import('https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm'),10000);
  sessionClient=mod.createClient(supabaseUrl,supabaseKey,{auth:{detectSessionInUrl:false,persistSession:true,autoRefreshToken:true}});
  if(handoff){
   const result=await withTimeout(sessionClient.auth.verifyOtp({token_hash:handoff.token,type:handoff.type}),8000);
   if(result.error)status('일회용 로그인 링크가 만료되었거나 이미 사용되었습니다. 저장된 로그인도 확인합니다.',false);
  }
  const result=await withTimeout(sessionClient.auth.getSession(),8000);
  if(result.data&&result.data.session&&result.data.session.access_token)tokens.push(result.data.session.access_token);
 }catch{status('통합 로그인 연결을 확인하지 못했습니다. 기존 인증 정보를 다시 확인합니다.',false)}
 for(const token of availableTokens())if(!tokens.includes(token))tokens.push(token);
 if(!tokens.length){status('본인 확인이 필요합니다. EKODI 통합 로그인을 완료해 주세요. ',true);return}
 for(const token of tokens){
  try{
   const response=await withTimeout(fetch('/my/invest/access',{headers:{authorization:'Bearer '+token},cache:'no-store'}),15000);
   if(!response.ok)continue;
   const result=await response.json();
   if(result&&result.ok===true&&result.scope==='self-research'){
    verified=true;ownerToken=token;await checkStepUp();return;
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
 el('policySave').addEventListener('click',savePolicy);el('apStart').addEventListener('click',()=>changeState('PAPER_TRADING'));el('apPause').addEventListener('click',()=>changeState('PAUSED'));
 el('apStop').addEventListener('click',emergencyStop);el('paperForm').addEventListener('submit',paperOrder);
 el('apWeekly').addEventListener('click',()=>showReport('weekly'));el('apMonthly').addEventListener('click',()=>showReport('monthly'));
 el('stepUpButton').addEventListener('click',openStepUp);el('stepUpForm').addEventListener('submit',submitStepUp);el('stepUpCancel').addEventListener('click',()=>el('stepUpDialog').close());
 authenticate();
}
init();
}
// Wrangler bundles with esbuild keepNames, which inserts __name(fn,"name") calls into the
// serialized client. The browser has no __name, so ship the same prelude other EKODI pages use;
// without it the script dies on its first line and the page stays on "확인하고 있습니다".
function ownerBrowserJs(){return '(()=>{const __name=(target,value)=>Object.defineProperty(target,"name",{value,configurable:true});\n('+investBrowserClient.toString()+')();})();'}
