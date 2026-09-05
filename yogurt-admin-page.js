const YOGURT_STORE_ID='43ef7c9c-5932-46b9-b31e-4ab4ee6a60ce';

const CSS=`
:root{font-family:Inter,Pretendard,"Noto Sans KR",system-ui,sans-serif;color:#172018;background:#f5f7f4;word-break:keep-all;overflow-wrap:normal}*{box-sizing:border-box}body{margin:0;min-height:100vh}button,input,select{font:inherit}.tech{overflow-wrap:anywhere;word-break:break-all}
.topbar{height:62px;display:flex;align-items:center;gap:14px;padding:0 22px;background:#fff;border-bottom:1px solid #e1e7df;position:sticky;top:0;z-index:20}.brand{display:flex;align-items:center;gap:10px;text-decoration:none;color:#111}.mark{width:30px;height:30px;border-radius:10px;background:#1f5b36;color:#fff;display:grid;place-items:center;font-size:11px;font-weight:900}.brand-copy strong{display:block;font-size:13px}.brand-copy small{display:block;color:#7b867e;font-size:10px;letter-spacing:.08em}.top-actions{margin-left:auto;display:flex;gap:8px}.top-actions a,.top-actions button{border:1px solid #dce4da;background:#fff;color:#3c493f;border-radius:9px;padding:8px 11px;text-decoration:none;font-size:12px;cursor:pointer}
.layout{display:grid;grid-template-columns:226px minmax(0,1fr);min-height:calc(100vh - 62px)}.sidebar{background:#fff;border-right:1px solid #e1e7df;padding:18px 14px}.scope{padding:7px 10px 14px;border-bottom:1px solid #edf1ec;margin-bottom:12px}.scope small{display:block;color:#87928a;font-size:10px;letter-spacing:.1em}.scope strong{display:block;margin-top:5px;font-size:14px}.scope span{display:block;margin-top:3px;color:#68746c;font-size:11px}.sidebar nav{display:grid;gap:2px}.sidebar a{padding:9px 10px;border-radius:8px;color:#4c5a50;text-decoration:none;font-size:12px}.sidebar a:hover,.sidebar a.active{background:#eef5ef;color:#174e2d;font-weight:800}.boundary{margin:18px 8px 0;padding-top:13px;border-top:1px solid #edf1ec;color:#8b958d;font-size:10px;line-height:1.6}
main{width:100%;max-width:1320px;padding:22px 24px 42px}.heading{display:flex;align-items:flex-start;justify-content:space-between;gap:18px;margin-bottom:14px}.eyebrow{margin:0 0 5px;color:#738078;font-size:10px;letter-spacing:.13em}.heading h1{margin:0 0 5px;font-size:25px;letter-spacing:-.035em}.heading p:not(.eyebrow){margin:0;color:#69756c;font-size:12px}.state{border:1px solid #d9e2d8;background:#fff;border-radius:999px;padding:7px 10px;color:#59675d;font-size:11px;white-space:nowrap}.state.live{background:#edf8f0;color:#23703d;border-color:#cfe8d6}.state.warn{background:#fff7ea;color:#9a641b;border-color:#f2dfbf}
.cards{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:10px;margin-bottom:12px}.card,.panel{background:#fff;border:1px solid #e1e7df;border-radius:13px}.card{padding:14px}.card small{display:block;color:#7c897f;font-size:10px}.card strong{display:block;font-size:21px;margin-top:5px;letter-spacing:-.03em}.card span{display:block;color:#919a93;font-size:10px;margin-top:4px}.panel{padding:15px;min-height:280px}.panel h2{font-size:15px;margin:0 0 7px}.panel-lead{margin:0 0 13px;color:#77827a;font-size:11px;line-height:1.6}
.service-list{display:grid;gap:8px}.service-row{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:11px;border:1px solid #e9eee8;border-radius:10px}.service-row strong{font-size:12px}.service-row p{margin:3px 0 0;color:#7d8880;font-size:10px;line-height:1.5}.tag{display:inline-flex;border-radius:999px;padding:3px 7px;background:#f0f3ef;color:#68736b;font-size:9px;white-space:nowrap}.tag.live{background:#eaf7ee;color:#25703e}.tag.warn{background:#fff4e5;color:#9b651c}.tag.bad{background:#fff0ef;color:#aa413a}.actions{display:flex;gap:8px;flex-wrap:wrap;margin-top:12px}.button{border:1px solid #d9e2d8;background:#fff;color:#344339;border-radius:8px;padding:8px 10px;text-decoration:none;font-size:11px;cursor:pointer}.button.primary{background:#1f5b36;color:#fff;border-color:#1f5b36}.button:disabled{opacity:.5;cursor:not-allowed}
.table-wrap{overflow:auto;border:1px solid #e9eee8;border-radius:10px}table{width:100%;border-collapse:collapse;font-size:11px}th,td{text-align:left;padding:9px 10px;border-bottom:1px solid #edf1ec;white-space:nowrap}th{background:#fafbfa;color:#69766d;font-size:10px}td{color:#354139}.empty{padding:22px;border:1px dashed #dce4da;border-radius:10px;color:#78847b;font-size:11px;line-height:1.7}.empty strong{display:block;color:#49564c;margin-bottom:3px}.split{display:grid;grid-template-columns:1.2fr .8fr;gap:10px}.mini-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px}.mini{padding:12px;border:1px solid #e9eee8;border-radius:10px}.mini small{display:block;color:#7f8b82;font-size:9px}.mini strong{display:block;margin-top:4px;font-size:14px}.note{margin-top:12px;padding:11px;border-radius:10px;background:#f7f9f7;color:#6a766d;font-size:10px;line-height:1.7}
@media(max-width:900px){.layout{grid-template-columns:1fr}.sidebar{border-right:0;border-bottom:1px solid #e1e7df;padding:9px 12px}.scope,.boundary{display:none}.sidebar nav{display:flex;overflow:auto}.sidebar a{white-space:nowrap}.cards{grid-template-columns:repeat(2,minmax(0,1fr))}.split{grid-template-columns:1fr}main{padding:16px}.topbar{padding:0 14px}}@media(max-width:520px){.cards{grid-template-columns:1fr 1fr}.card strong{font-size:18px}.heading h1{font-size:22px}.topbar{gap:8px}.brand-copy small{display:none}}
`;

function clientMain(){
  const STORE_ID='43ef7c9c-5932-46b9-b31e-4ab4ee6a60ce';
  const SUPABASE_URL='https://renzehysxirjilvdxacv.supabase.co';
  const SUPABASE_KEY='sb_publishable_0QjB0WzZbjrd-FJ5D5cR7A_xUkXyOY_';
  const API='https://api.ekodi.kr';
  const SESSION_KEY='ekodi-yogurt-admin-session';
  const NAV=[['overview','운영 홈'],['menu','메뉴 · 가격'],['orders','주문 · 채널'],['customers','고객'],['reviews','리뷰'],['sales','매출'],['inventory','재고'],['marketing','마케팅'],['work','매장업무'],['finance','비용 · 정산'],['connections','연결관리']];
  const META={
    overview:['운영 홈','오늘 매장의 핵심 신호와 다음 행동을 한눈에 봅니다.'],
    menu:['메뉴 · 가격','배달앱·POS에서 들어온 실제 메뉴와 가격 차이를 비교합니다.'],
    orders:['주문 · 채널','오늘 주문과 채널별 매출 흐름을 집계값으로 확인합니다.'],
    customers:['고객','개인정보 원문 없이 신규·재방문 흐름만 확인합니다.'],
    reviews:['리뷰','연결된 마케팅 원장에서 미응답 리뷰와 대응 상태를 확인합니다.'],
    sales:['매출','오늘 매출·객단가·비교 신호를 확인합니다.'],
    inventory:['재고','메뉴 품절 신호와 향후 재고 연동 상태를 확인합니다.'],
    marketing:['마케팅','요거트퍼플 전용 Marketing AI 운영공간으로 연결합니다.'],
    work:['매장업무','점포 운영업무와 승인 필요 행동을 관리합니다.'],
    finance:['비용 · 정산','비용·광고비·마진 집계 연결 상태를 확인합니다.'],
    connections:['연결관리','POS·배달플랫폼·EKODI Orders 연결 상태를 관리합니다.']
  };
  const $=id=>document.getElementById(id);
  const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const won=v=>v==null?'—':new Intl.NumberFormat('ko-KR',{style:'currency',currency:'KRW',maximumFractionDigits:0}).format(Number(v||0));
  const num=v=>v==null?'—':new Intl.NumberFormat('ko-KR').format(Number(v||0));
  const section=location.pathname.replace(/\/+$/,'').split('/')[3]||'overview';
  const page=META[section]||META.overview;
  const state={session:null,snapshot:null,menu:null,connector:null};

  function card(label,value,small=''){return `<article class="card"><small>${esc(label)}</small><strong>${esc(value)}</strong><span>${esc(small)}</span></article>`}
  function setState(text,kind=''){const el=$('pageState');el.textContent=text;el.className=`state ${kind}`.trim()}
  function authUrl(){const u=new URL('https://auth.ekodi.kr/');u.searchParams.set('site','space');u.searchParams.set('return_to',location.origin+location.pathname+location.search);return u.href}
  function setup(){
    $('pageTitle').textContent=page[0];$('pageCopy').textContent=page[1];document.title=`${page[0]} · 요거트퍼플 목포대점`;
    for(const [key,label] of NAV){const a=document.createElement('a');a.href=key==='overview'?'/yogurt/admin':`/yogurt/admin/${key}`;a.textContent=label;if(key===section)a.classList.add('active');$('adminNav').append(a)}
  }
  function storedSession(){try{const v=JSON.parse(sessionStorage.getItem(SESSION_KEY)||'null');return v?.accessToken?v:null}catch{return null}}
  function saveSession(v){state.session=v;sessionStorage.setItem(SESSION_KEY,JSON.stringify(v))}
  function clearSession(){state.session=null;sessionStorage.removeItem(SESSION_KEY)}
  async function supabaseAuth(path,body){const r=await fetch(SUPABASE_URL+path,{method:'POST',headers:{apikey:SUPABASE_KEY,'content-type':'application/json'},body:JSON.stringify(body)});const d=await r.json().catch(()=>({}));if(!r.ok)throw Object.assign(new Error(d.msg||d.error_description||d.error||`auth_${r.status}`),{status:r.status});return d}
  function normalizeSession(d,current={}){return{accessToken:d.access_token||'',refreshToken:d.refresh_token||current.refreshToken||'',expiresAt:Number(d.expires_at||0)||Math.floor(Date.now()/1000)+Number(d.expires_in||3600),user:{id:d.user?.id||current.user?.id||'',email:d.user?.email||current.user?.email||''}}}
  async function exchangeCentralToken(){const p=new URLSearchParams(location.hash.slice(1));const tokenHash=p.get('ekodi_token');if(!tokenHash)return;const d=await supabaseAuth('/auth/v1/verify',{token_hash:tokenHash,type:p.get('ekodi_type')||'email'});const session=normalizeSession(d);if(!session.accessToken)throw new Error('로그인 연결에 실패했습니다.');saveSession(session);history.replaceState(null,'',location.pathname+location.search)}
  async function accessToken(){let s=state.session||storedSession();state.session=s;if(!s?.accessToken)return'';const now=Math.floor(Date.now()/1000);if(Number(s.expiresAt||0)>now+60)return s.accessToken;if(!s.refreshToken){clearSession();return''}try{const d=await supabaseAuth('/auth/v1/token?grant_type=refresh_token',{refresh_token:s.refreshToken});const next=normalizeSession(d,s);saveSession(next);return next.accessToken}catch{clearSession();return''}}
  async function rpc(name,body){const token=await accessToken();if(!token)throw Object.assign(new Error('AUTH_REQUIRED'),{status:401});const r=await fetch(`${SUPABASE_URL}/rest/v1/rpc/${name}`,{method:'POST',headers:{apikey:SUPABASE_KEY,authorization:`Bearer ${token}`,'content-type':'application/json'},body:JSON.stringify(body),cache:'no-store'});const d=await r.json().catch(()=>({}));if(!r.ok)throw Object.assign(new Error(d.message||d.error||`rpc_${r.status}`),{status:r.status});return d}
  async function control(path,options={}){const token=await accessToken();if(!token)throw Object.assign(new Error('AUTH_REQUIRED'),{status:401});const r=await fetch(API+path,{...options,headers:{authorization:`Bearer ${token}`,'content-type':'application/json',...(options.headers||{})},cache:'no-store'});const d=await r.json().catch(()=>({}));if(!r.ok)throw Object.assign(new Error(d.error||`api_${r.status}`),{status:r.status,data:d});return d}
  function loginPanel(message='요거트퍼플 목포대점 운영 권한으로 로그인해야 합니다.'){
    $('summaryCards').innerHTML=[card('운영공간','요거트퍼플 목포대점','store-scoped'),card('데이터 경계','점포 전용','다른 매장과 분리')].join('');
    $('mainPanel').innerHTML=`<div class="empty"><strong>운영공간 로그인</strong>${esc(message)}<div class="actions"><a class="button primary" href="${esc(authUrl())}">Google 계정으로 계속</a></div></div>`;setState('로그인 필요','warn');
  }
  function connectorStatus(provider){
    const row=(state.connector?.connectors||[]).find(x=>x.provider===provider);return row||{provider,status:'setup_required',displayName:provider};
  }
  function statusTag(status){const live=status==='active'||status==='ready';const warn=['setup_required','partner_required','credentials_required'].includes(status);return `<span class="tag ${live?'live':warn?'warn':'bad'}">${esc(status||'unknown')}</span>`}
  function connectedCount(){return (state.connector?.connectors||[]).filter(x=>x.status==='active'||x.status==='ready').length}
  function summary(){
    const s=state.snapshot||{},m=s.metrics||{},o=s.orders||{},menu=state.menu?.summary||{};
    $('summaryCards').innerHTML=[card('오늘 매출',won(m.sales),'완료 주문 집계'),card('오늘 주문',num(o.count),'개인정보 미노출'),card('재방문율',m.repeatRate==null?'—':`${m.repeatRate}%`,'목표 '+(m.targetRepeatRate??45)+'%'),card('메뉴 원장',num(menu.canonical_menu_count||0),`연결 ${connectedCount()}개`)].join('');
  }
  function overview(){
    const s=state.snapshot||{},m=s.metrics||{},o=s.orders||{},mk=s.marketing||{};
    const channels=Object.entries(o.channels||{}).map(([name,v])=>`<div class="service-row"><div><strong>${esc(name)}</strong><p>주문 ${num(v.orders)}건 · 매출 ${won(v.sales)}</p></div><span class="tag live">집계</span></div>`).join('');
    $('mainPanel').innerHTML=`<div class="split"><section><h2>오늘 운영 신호</h2><p class="panel-lead">실제 원장에서 집계한 값만 표시합니다. 없는 값은 만들어내지 않습니다.</p><div class="mini-grid"><div class="mini"><small>신규 고객</small><strong>${num(m.newCustomers)}</strong></div><div class="mini"><small>평균 주문금액</small><strong>${won(o.averageTicket)}</strong></div><div class="mini"><small>미응답 리뷰</small><strong>${num(mk.unansweredReviews)}</strong></div><div class="mini"><small>승인 필요</small><strong>${num(m.pendingApprovals)}</strong></div></div><div class="note">고객 이름·전화번호·주문 상세 원문은 이 화면에 노출하지 않습니다.</div></section><section><h2>오늘 주문 채널</h2><div class="service-list">${channels||'<div class="empty"><strong>채널 주문 없음</strong>오늘 완료 주문이 없거나 주문 원장이 아직 연결되지 않았습니다.</div>'}</div></section></div>`;
  }
  function menuPanel(){
    const data=state.menu||{},items=data.items||[],mismatch=data.summary?.mismatches||[];
    const rows=items.map(item=>`<tr><td>${esc(item.name)}</td><td>${esc(item.category||'—')}</td><td>${esc(item.provider)}</td><td>${won(item.salePriceKrw??item.priceKrw)}</td><td>${statusTag(item.availability==='available'?'active':item.availability)}</td><td>${esc(item.optionSummary||'—')}</td></tr>`).join('');
    const warning=mismatch.length?`<div class="note"><strong>채널 불일치 ${mismatch.length}건</strong><br>${mismatch.slice(0,8).map(x=>esc(x.name)+(x.priceMismatch?' · 가격':'')+(x.availabilityMismatch?' · 판매상태':'')).join('<br>')}</div>`:'<div class="note">현재 수집된 메뉴 안에서는 가격·판매상태 불일치가 확인되지 않았습니다.</div>';
    $('mainPanel').innerHTML=`<h2>실제 메뉴 · 가격 원장</h2><p class="panel-lead">배달앱·POS의 공식 또는 승인된 Bridge 스냅샷만 표시합니다. 직접 입력한 가상 메뉴는 사용하지 않습니다.</p>${rows?`<div class="table-wrap"><table><thead><tr><th>메뉴</th><th>분류</th><th>채널</th><th>가격</th><th>상태</th><th>옵션</th></tr></thead><tbody>${rows}</tbody></table></div>`:'<div class="empty"><strong>아직 가져온 메뉴가 없습니다.</strong>연결관리에서 POS 또는 배달플랫폼 Bridge가 승인·연결되면 실제 등록 메뉴와 가격이 이곳에 나타납니다.</div>'}${warning}`;
  }
  function ordersPanel(){
    const channels=Object.entries(state.snapshot?.orders?.channels||{});const rows=channels.map(([name,v])=>`<tr><td>${esc(name)}</td><td>${num(v.orders)}</td><td>${won(v.sales)}</td><td>${v.orders?won(Number(v.sales||0)/Number(v.orders)):won(0)}</td></tr>`).join('');
    $('mainPanel').innerHTML=`<h2>주문 · 채널 집계</h2><p class="panel-lead">주문 상세가 아니라 오늘 완료 주문의 채널별 집계만 제공합니다.</p>${rows?`<div class="table-wrap"><table><thead><tr><th>채널</th><th>주문</th><th>매출</th><th>객단가</th></tr></thead><tbody>${rows}</tbody></table></div>`:'<div class="empty"><strong>오늘 주문 집계가 없습니다.</strong>주문이 없거나 원장 연결이 아직 준비되지 않았습니다.</div>'}`;
  }
  function customerPanel(){
    const m=state.snapshot?.metrics||{},mk=state.snapshot?.marketing||{};
    $('mainPanel').innerHTML=`<h2>고객 흐름</h2><p class="panel-lead">개인 식별정보 없이 관계 지표만 봅니다.</p><div class="mini-grid"><div class="mini"><small>오늘 고객</small><strong>${num(m.customers)}</strong></div><div class="mini"><small>신규 고객</small><strong>${num(m.newCustomers)}</strong></div><div class="mini"><small>재방문율</small><strong>${m.repeatRate==null?'—':esc(m.repeatRate+'%')}</strong></div><div class="mini"><small>30일 비활성</small><strong>${num(mk.inactiveCustomers)}</strong></div></div><div class="note">고객 연락처 원문은 중앙 집계 응답에 포함하지 않습니다. 고객 접촉·메시지 발송은 별도 동의와 사람 승인이 필요합니다.</div>`;
  }
  function reviewsPanel(){const mk=state.snapshot?.marketing||{};$('mainPanel').innerHTML=`<h2>리뷰 운영</h2><div class="mini-grid"><div class="mini"><small>미응답 리뷰</small><strong>${num(mk.unansweredReviews)}</strong></div><div class="mini"><small>Marketing 집계</small><strong>${mk.connected?'연결됨':'대기'}</strong></div></div><div class="actions"><a class="button primary" href="/yogurt/marketing">Marketing AI 열기</a></div><div class="note">답변 초안은 AI가 도울 수 있지만 고객에게 공개 발송하기 전 사람의 검토를 유지합니다.</div>`}
  function salesPanel(){const s=state.snapshot||{},m=s.metrics||{},o=s.orders||{};$('mainPanel').innerHTML=`<h2>오늘 매출</h2><div class="mini-grid"><div class="mini"><small>매출</small><strong>${won(m.sales)}</strong></div><div class="mini"><small>주문</small><strong>${num(o.count)}</strong></div><div class="mini"><small>객단가</small><strong>${won(o.averageTicket)}</strong></div><div class="mini"><small>지난주 같은 요일 대비</small><strong>${m.salesDelta==null?'—':esc((m.salesDelta>=0?'+':'')+m.salesDelta+'%')}</strong></div></div>`}
  function inventoryPanel(){
    const sold=(state.menu?.items||[]).filter(x=>x.availability==='sold_out');const rows=sold.map(x=>`<div class="service-row"><div><strong>${esc(x.name)}</strong><p>${esc(x.provider)} · ${esc(x.category||'분류 없음')}</p></div><span class="tag warn">품절</span></div>`).join('');
    $('mainPanel').innerHTML=`<h2>재고 · 품절 신호</h2><p class="panel-lead">현재는 배달채널의 판매가능/품절 상태를 우선 사용합니다. 원재료 재고는 별도 재고 Connector가 연결될 때 확장합니다.</p><div class="service-list">${rows||'<div class="empty"><strong>확인된 품절 메뉴 없음</strong>메뉴 스냅샷이 없으면 품절 여부도 추정하지 않습니다.</div>'}</div>`;
  }
  function marketingPanel(){$('mainPanel').innerHTML=`<h2>요거트퍼플 Marketing AI</h2><p class="panel-lead">다른 점포와 데이터·권한이 분리된 요거트퍼플 전용 마케팅 운영공간입니다.</p><div class="actions"><a class="button primary" href="/yogurt/marketing">전용 Marketing AI 열기</a></div>`}
  function workPanel(){const op=state.snapshot?.operations||{};$('mainPanel').innerHTML=`<h2>매장업무</h2><div class="mini-grid"><div class="mini"><small>우선 행동</small><strong>${num(op.highPriorityActions)}</strong></div><div class="mini"><small>승인 대기</small><strong>${num(op.pendingApprovals)}</strong></div></div><div class="note">가격변경·환불·외부메시지·주문변경처럼 고객이나 금전에 영향을 주는 행동은 자동 확정하지 않습니다.</div>`}
  function financePanel(){const f=state.snapshot?.finance||{};$('mainPanel').innerHTML=`<h2>비용 · 정산</h2><div class="mini-grid"><div class="mini"><small>비용</small><strong>${won(f.costTotal)}</strong></div><div class="mini"><small>마케팅비</small><strong>${won(f.marketingSpend)}</strong></div><div class="mini"><small>현금 유입</small><strong>${won(f.cashIn)}</strong></div><div class="mini"><small>추정 영업마진</small><strong>${f.estimatedOperatingMargin==null?'—':esc(f.estimatedOperatingMargin+'%')}</strong></div></div><div class="note">${f.connected?'읽기 전용 재무 집계가 연결되어 있습니다.':'재무 원장이 연결되지 않아 값을 추정하지 않습니다.'}</div>`}
  function connectionsPanel(){
    const labels={supabase_orders:'EKODI Orders',pos_bridge:'POS Bridge',baemin:'배달의민족',coupang_eats:'쿠팡이츠',yogiyo:'요기요'};
    const rows=['supabase_orders','pos_bridge','baemin','coupang_eats','yogiyo'].map(provider=>{const c=(state.connector?.connectors||[]).find(x=>x.provider===provider)||{status:'setup_required'};return `<div class="service-row"><div><strong>${esc(labels[provider])}</strong><p>${c.lastSuccessAt?'마지막 성공 '+esc(new Date(c.lastSuccessAt).toLocaleString('ko-KR')):'공식 연결 또는 승인된 Bridge가 필요합니다.'}</p></div>${statusTag(c.status)}</div>`}).join('');
    $('mainPanel').innerHTML=`<h2>데이터 연결</h2><p class="panel-lead">배달플랫폼 직접 연동은 공식 API·파트너 계약이 확인된 경우에만 활성화합니다. 자격정보는 메뉴 원장에 저장하지 않습니다.</p><div class="service-list">${rows}</div><div class="actions"><button class="button primary" id="syncOrders" type="button">EKODI Orders 다시 동기화</button></div><div class="note">배달의민족·쿠팡이츠·요기요가 partner_required이면 실패가 아니라 아직 공식 연결 권한이 없는 상태입니다.</div>`;
    $('syncOrders').onclick=async()=>{const b=$('syncOrders');b.disabled=true;b.textContent='동기화 중';try{await control('/api/marketing/connectors/supabase-orders/sync',{method:'POST',body:JSON.stringify({store:STORE_ID})});await loadData();setState('동기화 완료','live')}catch(e){$('pageCopy').textContent=e.message;setState('확인 필요','warn')}finally{b.disabled=false;b.textContent='EKODI Orders 다시 동기화'}};
  }
  function render(){summary();({overview,menu:menuPanel,orders:ordersPanel,customers:customerPanel,reviews:reviewsPanel,sales:salesPanel,inventory:inventoryPanel,marketing:marketingPanel,work:workPanel,finance:financePanel,connections:connectionsPanel}[section]||overview)();setState('요거트퍼플 점포 운영','live')}
  async function loadData(){
    setState('실데이터 확인 중');
    const [snapshot,menu,connector]=await Promise.all([
      rpc('business_os_store_admin_snapshot',{p_workspace_key:'yogurt'}),
      rpc('store_operating_space_snapshot',{p_operating_slug:'yogurt'}),
      control(`/api/marketing/connectors/status?store=${encodeURIComponent(STORE_ID)}`)
    ]);
    state.snapshot=snapshot;state.menu=menu;state.connector=connector;render();
  }
  async function boot(){
    setup();state.session=storedSession();try{await exchangeCentralToken()}catch(e){clearSession();return loginPanel('통합인증 연결에 실패했습니다. 다시 로그인해 주세요.')}
    if(!(await accessToken()))return loginPanel();
    try{await loadData()}catch(e){if(e.status===401)return loginPanel();if(e.status===403)return loginPanel('이 계정에는 요거트퍼플 목포대점 운영 권한이 없습니다.');$('summaryCards').innerHTML=[card('운영공간','요거트퍼플 목포대점','데이터 확인 필요')].join('');$('mainPanel').innerHTML=`<div class="empty"><strong>실데이터 연결 확인 필요</strong>${esc(e.message)}</div>`;setState('확인 필요','warn')}
  }
  $('refreshData').onclick=()=>loadData().catch(e=>{setState('확인 필요','warn');$('pageCopy').textContent=e.message});
  $('logout').onclick=()=>{clearSession();location.assign('/yogurt/admin')};
  boot();
}

export function isYogurtAdminPath(pathname){return /^\/yogurt\/admin(?:\/(?:overview|menu|orders|customers|reviews|sales|inventory|marketing|work|finance|connections))?\/?$/i.test(String(pathname||''))}
export function yogurtAdminCss(){return new Response(CSS,{headers:{'content-type':'text/css; charset=utf-8','cache-control':'public, max-age=300','x-content-type-options':'nosniff'}})}
export function yogurtAdminScript(){return new Response(`(${clientMain.toString()})();`,{headers:{'content-type':'text/javascript; charset=utf-8','cache-control':'no-store','x-content-type-options':'nosniff'}})}
export function yogurtAdminPage(){
  const html='<!doctype html><html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"><meta name="robots" content="noindex,nofollow"><title>요거트퍼플 목포대점 관리자</title><link rel="stylesheet" href="/yogurt-admin.css"></head><body><header class="topbar"><a class="brand" href="/yogurt/admin"><span class="mark">YP</span><span class="brand-copy"><strong>요거트퍼플 목포대점</strong><small>STORE OPERATIONS</small></span></a><div class="top-actions"><a href="/yogurt/marketing">마케팅</a><button id="refreshData" type="button">새로고침</button><button id="logout" type="button">로그아웃</button></div></header><div class="layout"><aside class="sidebar"><div class="scope"><small>독립 점포 운영공간</small><strong>요거트퍼플 목포대점</strong><span>YOGURT PURPLE</span></div><nav id="adminNav"></nav><p class="boundary">다른 점포는 별도 운영공간입니다. 공통 엔진만 공유하고 데이터·권한은 공유하지 않습니다.</p></aside><main><section class="heading"><div><p class="eyebrow">YOGURT PURPLE STORE ADMIN</p><h1 id="pageTitle">운영 홈</h1><p id="pageCopy">점포 운영 데이터를 확인합니다.</p></div><span class="state" id="pageState">확인 중</span></section><section class="cards" id="summaryCards"></section><section class="panel" id="mainPanel"><div class="empty"><strong>운영 데이터를 불러오고 있습니다.</strong>점포 권한과 실제 연결 상태를 확인합니다.</div></section></main></div><script src="/yogurt-admin.js?v=20260906-store-admin" defer></script></body></html>';
  return new Response(html,{headers:{'content-type':'text/html; charset=utf-8','cache-control':'no-store','x-content-type-options':'nosniff','x-frame-options':'DENY','referrer-policy':'strict-origin-when-cross-origin','content-security-policy':"default-src 'self'; style-src 'self'; script-src 'self'; connect-src 'self' https://api.ekodi.kr https://renzehysxirjilvdxacv.supabase.co; frame-ancestors 'none'; base-uri 'self'; form-action 'self'",'x-ekodi-route':'yogurt-store-admin','x-ekodi-store-scope':YOGURT_STORE_ID}});
}
