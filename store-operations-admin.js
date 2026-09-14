(() => {
  'use strict';

  const API = 'https://api.ekodi.kr';
  const TOKEN_KEY = 'ekodi-auth-token';
  const STORE_META = Object.freeze({
    'jadam.ai.ekodi.kr': { key:'jadam', name:'자담치킨 목포대점', siteUrl:'https://jadam.ekodi.kr/', aiUrl:'https://jadam.ai.ekodi.kr/' },
    'pizzamaru.ai.ekodi.kr': { key:'pizzamaru', name:'피자마루 목포대점', siteUrl:'https://pizzamaru.ekodi.kr/', aiUrl:'https://pizzamaru.ai.ekodi.kr/' },
    'yogurt.ai.ekodi.kr': { key:'yogurtpurple', name:'요거트퍼플 목포대점', siteUrl:'https://yogurt.ekodi.kr/', aiUrl:'https://yogurt.ai.ekodi.kr/' },
  });
  const STORE_ORDER = ['jadam','pizzamaru','yogurtpurple'];
  const TABS = Object.freeze([
    ['overview','통합 홈'], ['pos','매장 · POS'], ['menu','메뉴 · 가격'], ['sales','매출 · 주문'],
    ['delivery','배달'], ['reviews','리뷰 · 답글'], ['ekodi','EKODI 브리프'],
  ]);
  const ORIGINAL_MENU = Object.freeze([
    ['overview','운영 홈'], ['site','사용자 사이트'], ['orders','주문 · 채널'], ['menu','메뉴 · 가격'], ['sales','매출'],
    ['inventory','재고'], ['customers','고객'], ['reviews','리뷰'], ['marketing','Marketing AI'], ['work','매장업무'],
    ['connections','연결관리'], ['finance','비용 · 정산'],
  ]);

  const state = { tab:'overview', scope:'all', stores:[], loading:false, message:'', error:false };
  const esc = value => String(value ?? '').replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
  const token = () => { try { return sessionStorage.getItem(TOKEN_KEY) || ''; } catch { return ''; } };
  const won = value => `₩${Math.max(0, Number(value || 0)).toLocaleString('ko-KR')}`;
  const num = value => Number(value || 0).toLocaleString('ko-KR');
  const dateText = value => value ? new Date(value).toLocaleString('ko-KR',{month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit'}) : '—';
  const providerLabel = provider => ({pos_bridge:'POS Bridge',supabase_orders:'EKODI Orders',baemin:'배달의민족',coupang_eats:'쿠팡이츠',yogiyo:'요기요'})[provider] || provider;
  const channelLabel = channel => ({pos:'POS',owned_order:'EKODI 주문',baemin:'배달의민족',coupang_eats:'쿠팡이츠',yogiyo:'요기요'})[channel] || channel || '기타';
  const statusLabel = status => ({active:'연결됨',ready:'준비됨',setup_required:'설정 필요',partner_required:'제휴 필요',credentials_required:'인증 필요',paused:'중지',error:'오류'})[status] || status || '확인 필요';

  async function api(path, options = {}) {
    const headers = new Headers(options.headers || {});
    if (token()) headers.set('authorization', `Bearer ${token()}`);
    if (options.body && !headers.has('content-type')) headers.set('content-type','application/json');
    const response = await fetch(`${API}${path}`, { ...options, headers, cache:'no-store' });
    let data = {};
    try { data = await response.json(); } catch {}
    if (!response.ok) throw new Error(data.error || `API 요청 실패 (${response.status})`);
    return data;
  }

  function style() {
    if (document.querySelector('#ekodi-store-operations-style')) return;
    const node = document.createElement('style');
    node.id = 'ekodi-store-operations-style';
    node.textContent = `
      .store-ops{display:grid;gap:18px}.store-ops-head{display:flex;justify-content:space-between;gap:16px;align-items:flex-start}.store-ops-head h2{margin:3px 0 5px;font-size:24px}.store-ops-head p{margin:0;color:var(--ekodi-ui-muted,#66768a);line-height:1.55}.store-ops-actions{display:flex;gap:8px;flex-wrap:wrap}.store-ops button,.store-ops a.store-btn{border:1px solid var(--ekodi-ui-border,#d9e2ec);background:var(--ekodi-ui-surface,#fff);color:var(--ekodi-ui-text,#172033);border-radius:9px;min-height:36px;padding:7px 11px;font:inherit;text-decoration:none;cursor:pointer}.store-ops button.primary{background:var(--ekodi-ui-accent,#155eef);color:#fff;border-color:transparent}.store-ops button:disabled{opacity:.45;cursor:not-allowed}.store-ops-scope,.store-ops-tabs{display:flex;gap:7px;flex-wrap:wrap}.store-ops-scope button.active,.store-ops-tabs button.active{border-color:var(--ekodi-ui-accent,#155eef);color:var(--ekodi-ui-accent,#155eef);font-weight:800}.store-ops-message{min-height:20px;font-size:12px;color:var(--ekodi-ui-muted,#66768a)}.store-ops-message.error{color:#b42318}.store-ops-kpis{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:10px}.store-kpi,.store-card{border:1px solid var(--ekodi-ui-border,#d9e2ec);background:var(--ekodi-ui-surface,#fff);border-radius:12px;padding:14px}.store-kpi span,.store-card small{display:block;color:var(--ekodi-ui-muted,#66768a);font-size:11px}.store-kpi strong{display:block;margin-top:6px;font-size:22px}.store-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:12px}.store-card h3{margin:5px 0 4px;font-size:17px}.store-card p{margin:0;color:var(--ekodi-ui-muted,#66768a);font-size:12px;line-height:1.5}.store-links{display:flex;gap:7px;flex-wrap:wrap;margin-top:12px}.store-menu-mirror{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:6px;margin-top:12px}.store-menu-mirror button{min-height:32px;padding:5px 7px;font-size:11px;text-align:left}.store-status-list{display:grid;gap:7px;margin-top:12px}.store-status-row{display:grid;grid-template-columns:minmax(110px,1fr) auto;gap:10px;align-items:center;border-top:1px solid var(--ekodi-ui-border,#d9e2ec);padding-top:7px}.store-status-row span{font-size:12px}.store-status-row b{font-size:11px}.store-status-row b.active,.store-status-row b.ready{color:#027a48}.store-status-row b.error{color:#b42318}.store-table-wrap{overflow:auto;border:1px solid var(--ekodi-ui-border,#d9e2ec);border-radius:12px;background:var(--ekodi-ui-surface,#fff)}.store-table{width:100%;border-collapse:collapse;min-width:720px}.store-table th,.store-table td{padding:10px 12px;border-bottom:1px solid var(--ekodi-ui-border,#d9e2ec);text-align:left;font-size:12px}.store-table th{color:var(--ekodi-ui-muted,#66768a);font-weight:700}.store-table td strong{display:block}.store-note{border:1px dashed var(--ekodi-ui-border,#d9e2ec);border-radius:12px;padding:14px;color:var(--ekodi-ui-muted,#66768a);line-height:1.6}.store-note strong{color:var(--ekodi-ui-text,#172033)}.store-brief{display:grid;gap:10px}.store-brief article{border-left:3px solid var(--ekodi-ui-accent,#155eef);padding:10px 12px;background:var(--ekodi-ui-surface-raised,#f8fafc);border-radius:0 10px 10px 0}.store-brief article h4{margin:0 0 4px}.store-brief article p{margin:0;color:var(--ekodi-ui-muted,#66768a);font-size:12px;line-height:1.55}.store-learning-loop{display:flex;gap:5px;align-items:center;flex-wrap:wrap;margin-top:10px}.store-learning-loop span{font-size:10px;font-weight:800;border:1px solid var(--ekodi-ui-border,#d9e2ec);border-radius:999px;padding:5px 8px}.store-learning-loop i{font-style:normal;color:var(--ekodi-ui-muted,#66768a)}.store-empty{padding:24px;text-align:center;color:var(--ekodi-ui-muted,#66768a)}
      @media(max-width:980px){.store-ops-kpis{grid-template-columns:repeat(2,1fr)}.store-grid{grid-template-columns:1fr}.store-menu-mirror{grid-template-columns:repeat(4,1fr)}}
      @media(max-width:620px){.store-ops-head{display:grid}.store-ops-kpis{grid-template-columns:1fr 1fr}.store-menu-mirror{grid-template-columns:repeat(2,1fr)}}
    `;
    document.head.append(node);
  }

  function expectedStores(workspaces) {
    const byKey = new Map();
    for (const workspace of workspaces || []) {
      const domain = String(workspace.canonicalDomain || '').toLowerCase();
      const meta = STORE_META[domain];
      if (meta) byKey.set(meta.key,{...meta,workspace,storeId:String(workspace.storeId || '')});
    }
    return STORE_ORDER.map(key => byKey.get(key) || Object.values(STORE_META).find(meta => meta.key === key)).map(item => ({...item,storeId:item.storeId || '',workspace:item.workspace || null}));
  }

  async function loadStore(base) {
    if (!base.storeId) return {...base,ledger:null,connectors:null,error:'점포 Workspace ID를 확인할 수 없습니다.'};
    const encoded = encodeURIComponent(base.storeId);
    const [ledger, connectors] = await Promise.allSettled([
      api(`/api/marketing/ledger/overview?workspaceType=store&workspaceKey=${encoded}`),
      api(`/api/marketing/connectors/status?store=${encoded}`),
    ]);
    const errors = [];
    if (ledger.status === 'rejected') errors.push(`원장: ${ledger.reason.message}`);
    if (connectors.status === 'rejected') errors.push(`연결: ${connectors.reason.message}`);
    return {
      ...base,
      ledger:ledger.status === 'fulfilled' ? ledger.value : null,
      connectors:connectors.status === 'fulfilled' ? connectors.value : null,
      error:errors.join(' · '),
    };
  }

  async function refresh() {
    if (!token() || state.loading) return;
    state.loading = true; setMessage('3개 매장의 실제 원장과 연결 상태를 확인하는 중입니다.'); render();
    try {
      const admin = await api('/api/marketing/admin/overview');
      state.stores = await Promise.all(expectedStores(admin.workspaces).map(loadStore));
      const degraded = state.stores.filter(store => store.error).length;
      setMessage(`${degraded ? `일부 연결 확인 필요 ${degraded}개 · ` : ''}마지막 확인 ${new Date().toLocaleTimeString('ko-KR',{hour:'2-digit',minute:'2-digit'})}`, Boolean(degraded));
    } catch (error) {
      setMessage(error.message || '통합 운영 데이터를 불러오지 못했습니다.', true);
    } finally { state.loading = false; render(); }
  }

  async function syncOrders(store) {
    if (!store?.storeId || state.loading) return;
    state.loading = true; setMessage(`${store.name} 주문 원장을 동기화하는 중입니다.`); render();
    try {
      const result = await api('/api/marketing/connectors/supabase-orders/sync',{method:'POST',body:JSON.stringify({store:store.storeId})});
      setMessage(`${store.name} 동기화 완료 · 읽음 ${num(result.read)}건 · 신규 ${num(result.inserted)}건`);
      await refresh();
    } catch (error) { setMessage(error.message || '주문 동기화에 실패했습니다.', true); state.loading = false; render(); }
  }

  function setMessage(text,error=false){ state.message=text || ''; state.error=error; }
  function selectedStores(){ return state.scope === 'all' ? state.stores : state.stores.filter(store => store.key === state.scope); }
  function recentEvents(store){ return Array.isArray(store?.ledger?.recentEvents) ? store.ledger.recentEvents : []; }
  function connectors(store){ return Array.isArray(store?.connectors?.connectors) ? store.connectors.connectors : []; }
  function connector(store,provider){ return connectors(store).find(item => item.provider === provider); }
  function totalValue(stores){ return stores.reduce((sum,store) => sum + Number(store?.ledger?.crm?.totalValueKrw || 0),0); }
  function totalEvents(stores){ return stores.reduce((sum,store) => sum + Number(store?.ledger?.crm?.events || 0),0); }
  function connectedChannels(stores){ return stores.reduce((sum,store) => sum + connectors(store).filter(item => ['active','ready'].includes(item.status)).length,0); }

  function mirrorButton(store,[key,label]) {
    const internal = ({overview:'overview',orders:'sales',menu:'menu',sales:'sales',reviews:'reviews',connections:'pos'})[key];
    if (internal) return `<button type="button" data-open-tab="${esc(internal)}" title="${esc(store.name)} ${esc(label)}">${esc(label)}</button>`;
    if (key === 'site') return `<a class="store-btn" href="${esc(store.siteUrl)}" target="_blank" rel="noopener">${esc(label)} ↗</a>`;
    if (key === 'marketing') return `<a class="store-btn" href="${esc(store.workspace?.canonicalUrl || store.aiUrl)}" target="_blank" rel="noopener">${esc(label)} ↗</a>`;
    return `<button type="button" disabled title="원본 관리자 기능 연결을 보존하는 항목입니다.">${esc(label)}</button>`;
  }

  function storeCard(store) {
    return `<article class="store-card"><small>${esc(store.workspace?.status ? String(store.workspace.status).toUpperCase() : 'WORKSPACE CHECK')}</small><h3>${esc(store.name)}</h3><p>${store.storeId ? `Store ID ${esc(store.storeId.slice(0,8))}…` : 'Workspace 연결 확인 필요'}${store.error ? ` · ${esc(store.error)}` : ''}</p>
      <div class="store-links"><a class="store-btn" href="${esc(store.siteUrl)}" target="_blank" rel="noopener">사용자 사이트 ↗</a><a class="store-btn" href="${esc(store.workspace?.canonicalUrl || store.aiUrl)}" target="_blank" rel="noopener">Marketing AI ↗</a><button type="button" data-sync-store="${esc(store.key)}" ${!store.storeId || state.loading ? 'disabled' : ''}>주문 원장 동기화</button></div>
      <div class="store-menu-mirror">${ORIGINAL_MENU.map(item => mirrorButton(store,item)).join('')}</div></article>`;
  }

  function renderOverview(stores) {
    const values = totalValue(stores), events = totalEvents(stores), channels = connectedChannels(stores);
    return `<div class="store-ops-kpis"><article class="store-kpi"><span>선택 매장</span><strong>${num(stores.length)}</strong></article><article class="store-kpi"><span>수집 원장 누적금액</span><strong>${won(values)}</strong></article><article class="store-kpi"><span>원장 이벤트</span><strong>${num(events)}</strong></article><article class="store-kpi"><span>준비·활성 커넥터</span><strong>${num(channels)}</strong></article></div><div class="store-grid">${stores.map(storeCard).join('')}</div><div class="store-note"><strong>표시 원칙</strong><br>매출은 POS나 배달사 화면을 추정한 값이 아니라 EKODI 원장에 실제 수집된 금액만 합산합니다. 연결되지 않은 데이터는 0으로 꾸미지 않고 연결 필요 상태로 표시합니다.</div>`;
  }

  function renderPos(stores) {
    return `<div class="store-grid">${stores.map(store => `<article class="store-card"><small>STORE · POS</small><h3>${esc(store.name)}</h3><p>현재 POS Bridge는 주문 수집용 승인 연결 계층입니다. 매장 프로필과 메뉴 스냅샷의 실시간 조회·수정은 공급자 Bridge 기능이 연결될 때 활성화됩니다.</p><div class="store-status-list">${['pos_bridge','supabase_orders'].map(provider => { const c=connector(store,provider); return `<div class="store-status-row"><span>${esc(providerLabel(provider))}</span><b class="${esc(c?.status || '')}">${esc(c ? statusLabel(c.status) : '미등록')}${c?.paired ? ' · Pair' : ''}</b></div>`; }).join('')}</div></article>`).join('')}</div>`;
  }

  function renderMenu(stores) {
    return `<div class="store-grid">${stores.map(store => { const pos=connector(store,'pos_bridge'); return `<article class="store-card"><small>MENU · PRICE</small><h3>${esc(store.name)}</h3><p>개별 관리자 메뉴의 ‘메뉴 · 가격’ 기능을 통합 위치에 보존했습니다. POS 메뉴 원본 읽기·쓰기 계약은 ${pos?.paired ? 'Bridge가 페어링되어 있으나 현재 주문 수집 모드' : 'Bridge 연결 대기'}입니다.</p><div class="store-status-list"><div class="store-status-row"><span>POS 메뉴 읽기</span><b>${pos?.paired ? 'Bridge 확장 필요' : '연결 필요'}</b></div><div class="store-status-row"><span>POS 메뉴 수정</span><b>외부 쓰기 잠금</b></div></div><div class="store-links"><a class="store-btn" href="${esc(store.siteUrl)}" target="_blank" rel="noopener">현재 공개 메뉴 확인 ↗</a></div></article>`; }).join('')}</div><div class="store-note"><strong>안전 경계</strong><br>현재 커넥터 정책은 externalWriteBack=false입니다. 따라서 실제 POS 메뉴를 수정한 것처럼 보이는 가짜 저장 버튼은 만들지 않았습니다. 공식 POS 쓰기 권한과 Bridge adapter가 확인되면 이 탭이 같은 자리에서 편집 화면으로 전환되도록 구성했습니다.</div>`;
  }

  function eventRows(stores, predicate) {
    const rows=[];
    for (const store of stores) for (const event of recentEvents(store)) if (predicate(event)) rows.push({...event,storeName:store.name});
    return rows.sort((a,b)=>String(b.occurredAt||b.occurred_at||'').localeCompare(String(a.occurredAt||a.occurred_at||'')));
  }

  function renderEvents(rows, empty) {
    return `<div class="store-table-wrap"><table class="store-table"><thead><tr><th>매장</th><th>유형</th><th>채널</th><th>금액</th><th>시각</th></tr></thead><tbody>${rows.length ? rows.map(row => `<tr><td><strong>${esc(row.storeName)}</strong></td><td>${esc(row.eventType || row.event_type || 'event')}</td><td>${esc(channelLabel(row.channel))}</td><td>${won(row.valueKrw ?? row.value_krw)}</td><td>${esc(dateText(row.occurredAt || row.occurred_at))}</td></tr>`).join('') : `<tr><td colspan="5" class="store-empty">${esc(empty)}</td></tr>`}</tbody></table></div>`;
  }

  function renderSales(stores) {
    const rows=eventRows(stores,row => ['order','repeat_order'].includes(String(row.eventType || row.event_type || '')));
    return `<div class="store-ops-kpis"><article class="store-kpi"><span>수집 원장 누적금액</span><strong>${won(totalValue(stores))}</strong></article><article class="store-kpi"><span>원장 이벤트</span><strong>${num(totalEvents(stores))}</strong></article><article class="store-kpi"><span>최근 주문 신호</span><strong>${num(rows.length)}</strong></article><article class="store-kpi"><span>조회 범위</span><strong>${state.scope==='all'?'3매장':'1매장'}</strong></article></div>${renderEvents(rows,'최근 원장에 주문 신호가 없습니다. 주문 동기화 또는 POS·배달 연결 상태를 확인하세요.')}`;
  }

  function renderDelivery(stores) {
    const delivery = new Set(['baemin','coupang_eats','yogiyo']);
    const rows=eventRows(stores,row => delivery.has(String(row.channel || '')));
    return `<div class="store-grid">${stores.map(store => `<article class="store-card"><small>DELIVERY CHANNELS</small><h3>${esc(store.name)}</h3><div class="store-status-list">${['baemin','coupang_eats','yogiyo'].map(provider => {const c=connector(store,provider);return `<div class="store-status-row"><span>${esc(providerLabel(provider))}</span><b class="${esc(c?.status||'')}">${esc(c ? statusLabel(c.status) : '미등록')}</b></div>`}).join('')}</div></article>`).join('')}</div>${renderEvents(rows,'최근 수집 원장에 배달 채널 주문이 없습니다.')}`;
  }

  function renderReviews(stores) {
    const rows=eventRows(stores,row => String(row.eventType || row.event_type || '') === 'review');
    return `${renderEvents(rows,'수집된 리뷰 이벤트가 없습니다.')}<div class="store-note"><strong>리뷰 답글 관리</strong><br>리뷰 이벤트의 통합 조회 위치는 마련했습니다. 다만 현재 배민·쿠팡이츠·요기요 커넥터는 import_only이고 externalWriteBack=false라 리뷰 본문 조회와 답글 게시를 실제 공급자에 쓰는 권한은 없습니다. 공식 리뷰 API 또는 승인된 Bridge가 쓰기 capability를 제공할 때만 답글 입력·전송을 활성화합니다.</div>`;
  }

  function renderEkodi(stores) {
    const briefs=[];
    for (const store of stores) {
      const cs=connectors(store); const missing=cs.filter(c=>!['active','ready'].includes(c.status) && ['pos_bridge','baemin','coupang_eats','yogiyo'].includes(c.provider));
      if (missing.length) briefs.push({title:`${store.name} 연결 보강`,copy:`${missing.map(c=>providerLabel(c.provider)).join(', ')}: ${missing.map(c=>statusLabel(c.status)).join(', ')}. 공식 연결이 열리면 같은 통합 화면에서 데이터 범위가 자동 확대됩니다.`});
      const reviewCount=recentEvents(store).filter(e=>String(e.eventType||e.event_type||'')==='review').length;
      if (reviewCount) briefs.push({title:`${store.name} 리뷰 신호`,copy:`최근 원장에 리뷰 이벤트 ${reviewCount}건이 있습니다. 답글 capability가 연결되기 전까지 외부 전송은 잠금 상태를 유지합니다.`});
    }
    if (!briefs.length) briefs.push({title:'운영 신호 안정',copy:'현재 읽을 수 있는 범위에서는 즉시 조치가 필요한 연결 신호가 없습니다. 데이터가 없는 영역은 추정하지 않습니다.'});
    return `<div class="store-brief">${briefs.map(item=>`<article><h4>${esc(item.title)}</h4><p>${esc(item.copy)}</p></article>`).join('')}</div><div class="store-note"><strong>EKODI 학습 루프</strong><div class="store-learning-loop"><span>RESEARCH</span><i>→</i><span>PREPARE</span><i>→</i><span>APPROVE</span><i>→</i><span>EXECUTE</span><i>→</i><span>MEASURE</span><i>→</i><span>LEARN</span></div><br>세 매장을 같은 데이터 계약으로 관찰해 매장별 차이를 비교하고, 실제 연결·성과·오류 신호를 다음 운영 판단에 재사용하는 구조입니다. 외부 실행은 기존 Human Gate를 유지합니다.</div>`;
  }

  function bodyHtml(stores) {
    if (!stores.length) return '<div class="store-empty">표시할 매장 Workspace가 없습니다.</div>';
    if (state.tab==='overview') return renderOverview(stores);
    if (state.tab==='pos') return renderPos(stores);
    if (state.tab==='menu') return renderMenu(stores);
    if (state.tab==='sales') return renderSales(stores);
    if (state.tab==='delivery') return renderDelivery(stores);
    if (state.tab==='reviews') return renderReviews(stores);
    return renderEkodi(stores);
  }

  function render() {
    const panel=document.querySelector('[data-panel~="store-operations"]');
    if (!panel) return;
    const stores=selectedStores();
    const body=panel.querySelector('[data-store-ops-body]');
    const message=panel.querySelector('[data-store-ops-message]');
    if (message){message.textContent=state.message;message.classList.toggle('error',state.error)}
    panel.querySelectorAll('[data-store-scope]').forEach(btn=>btn.classList.toggle('active',btn.dataset.storeScope===state.scope));
    panel.querySelectorAll('[data-store-tab]').forEach(btn=>btn.classList.toggle('active',btn.dataset.storeTab===state.tab));
    if (body) body.innerHTML=state.loading && !state.stores.length ? '<div class="store-empty">통합 운영 데이터를 불러오는 중입니다.</div>' : bodyHtml(stores);
    body?.querySelectorAll('[data-open-tab]').forEach(btn=>btn.addEventListener('click',()=>selectTab(btn.dataset.openTab)));
    body?.querySelectorAll('[data-sync-store]').forEach(btn=>btn.addEventListener('click',()=>syncOrders(state.stores.find(store=>store.key===btn.dataset.syncStore))));
  }

  function selectTab(tab){ if (!TABS.some(([key])=>key===tab)) return; state.tab=tab; render(); }
  function show(){
    document.querySelectorAll('[data-panel]').forEach(item=>{const targets=String(item.dataset.panel||'').split(' ');item.classList.toggle('hidden-panel',!targets.includes('store-operations'));item.hidden=!targets.includes('store-operations')});
    document.querySelectorAll('.sidebar .nav').forEach(item=>item.classList.toggle('active',(item.dataset.section||item.dataset.lazySection)==='store-operations'));
    const title=document.querySelector('#pageTitle'); if(title) title.textContent='3매장 통합운영';
    document.querySelector('.sidebar')?.classList.remove('open');
    if(location.hash!=='#store-operations') history.replaceState(null,'','#store-operations');
    refresh();
  }

  function install() {
    if (document.querySelector('[data-panel~="store-operations"]')) return true;
    const nav=document.querySelector('.sidebar nav'),content=document.querySelector('.content'); if(!nav||!content) return false;
    style();
    let button=nav.querySelector('.nav[data-section="store-operations"],.nav[data-lazy-section="store-operations"]');
    if(!button){button=document.createElement('button');button.type='button';button.className='nav';button.dataset.section='store-operations';button.innerHTML='3 <span>3매장 통합운영</span>';const work=nav.querySelector('.nav[data-section="work"],.nav[data-lazy-section="work"]');work?.after(button) || nav.append(button)}
    const panel=document.createElement('section');panel.className='section store-ops hidden-panel';panel.dataset.panel='store-operations';panel.hidden=true;
    panel.innerHTML=`<div class="store-ops-head"><div><p class="kicker">TRI-STORE OPERATIONS</p><h2>3매장 통합운영</h2><p>자담치킨 · 피자마루 · 요거트퍼플의 기존 관리자 구조를 보존하면서 POS, 주문, 매출, 배달, 리뷰를 한 운영면에 모읍니다.</p></div><div class="store-ops-actions"><button type="button" class="primary" data-store-refresh>↻ 새로고침</button></div></div><div class="store-ops-scope"><button type="button" data-store-scope="all" class="active">전체 3매장</button>${Object.values(STORE_META).map(store=>`<button type="button" data-store-scope="${esc(store.key)}">${esc(store.name.replace(' 목포대점',''))}</button>`).join('')}</div><div class="store-ops-tabs">${TABS.map(([key,label])=>`<button type="button" data-store-tab="${esc(key)}" class="${key==='overview'?'active':''}">${esc(label)}</button>`).join('')}</div><p class="store-ops-message" data-store-ops-message role="status"></p><div data-store-ops-body><div class="store-empty">통합 운영 데이터를 준비하고 있습니다.</div></div>`;
    content.append(panel);
    button.addEventListener('click',show);
    panel.querySelector('[data-store-refresh]').addEventListener('click',refresh);
    panel.querySelectorAll('[data-store-scope]').forEach(btn=>btn.addEventListener('click',()=>{state.scope=btn.dataset.storeScope;render()}));
    panel.querySelectorAll('[data-store-tab]').forEach(btn=>btn.addEventListener('click',()=>selectTab(btn.dataset.storeTab)));
    window.dispatchEvent(new CustomEvent('ekodi-nav-changed',{detail:{feature:'store-operations'}}));
    window.dispatchEvent(new CustomEvent('ekodi-feature-installed',{detail:{feature:'store-operations'}}));
    if(location.hash==='#store-operations'&&token()) setTimeout(show,0);
    return true;
  }

  const run=()=>{if(!install()) setTimeout(install,250)};
  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',run,{once:true}); else run();
  window.addEventListener('ekodi-admin-ready',install);
})();
