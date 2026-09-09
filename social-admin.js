(() => {
  const API = 'https://api.ekodi.kr';
  const CONNECT_API = 'https://marketing-connect-api.ekodi.kr';
  const TOKEN_KEY = 'ekodi-auth-token';
  const token = () => sessionStorage.getItem(TOKEN_KEY) || '';
  const providers = ['youtube','instagram','facebook','kakao','blog','threads','live','tiktok','linkedin','other'];
  let revision = 0;
  let registry = { version:3, organizations:[] };
  let dirty = false;
  let connectionScope = { type:'person', key:'' };

  function el(tag, text = '', className = '') {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text) node.textContent = text;
    return node;
  }
  function input(value = '', type = 'text', placeholder = '') {
    const node = document.createElement('input');
    node.type = type; node.value = value ?? ''; node.placeholder = placeholder;
    return node;
  }
  function field(label, control, className = '') {
    const wrap = el('label', '', `social-field ${className}`.trim());
    wrap.append(el('span', label), control); return wrap;
  }
  function select(value, values) {
    const node = document.createElement('select');
    values.forEach(([v, label]) => { const option = document.createElement('option'); option.value = v; option.textContent = label; node.append(option); });
    node.value = value; return node;
  }
  async function api(path, options = {}) {
    const headers = new Headers(options.headers || {});
    if (token()) headers.set('authorization', `Bearer ${token()}`);
    if (options.body && !headers.has('content-type')) headers.set('content-type', 'application/json');
    const response = await fetch(`${API}${path}`, { ...options, headers, cache:'no-store' });
    let data = {}; try { data = await response.json(); } catch {}
    if (!response.ok) { const error = new Error(data.error || `API 요청 실패 (${response.status})`); error.code = data.code; error.revision = data.revision; throw error; }
    return data;
  }
  async function connectApi(path, options = {}) {
    const headers = new Headers(options.headers || {});
    if (token()) headers.set('authorization', `Bearer ${token()}`);
    if (options.body && !headers.has('content-type')) headers.set('content-type', 'application/json');
    const url = new URL(`${CONNECT_API}${path}`);
    url.searchParams.set('subject_type',connectionScope.type);
    if (connectionScope.type !== 'person' && connectionScope.key) url.searchParams.set('subject_key',connectionScope.key);
    const response = await fetch(url, { ...options, headers, body: options.body ? JSON.stringify(options.body) : undefined, cache:'no-store' });
    let data = {}; try { data = await response.json(); } catch {}
    if (!response.ok) throw new Error(data.detail || data.error || `채널 연결 요청 실패 (${response.status})`);
    return data;
  }
  function providerLabel(value) { return ({youtube:'YouTube',instagram:'Instagram',facebook:'Facebook',threads:'Threads',facebook_ads:'Meta 광고',kakao:'Kakao',blog:'Blog',tiktok:'TikTok',linkedin:'LinkedIn'})[String(value||'').toLowerCase()] || String(value || '채널'); }
  function reconnectProvider(value) { const provider=String(value||'').toLowerCase(); return provider==='youtube'?'youtube':provider==='threads'?'threads':['facebook','instagram','facebook_ads','meta'].includes(provider)?'meta':''; }
  function formatDate(value) { const parsed=Date.parse(String(value||'')); return Number.isFinite(parsed)?new Date(parsed).toLocaleString('ko-KR'):'-'; }
  function connectionState(value) { return ({active:'연결됨',expired:'만료',revoked:'해제',error:'오류',paused:'중지'})[String(value||'').toLowerCase()] || String(value || '확인중'); }
  function returnUrl() { const url = new URL(location.href); ['ekodi_connect','provider','connections','reason'].forEach(key => url.searchParams.delete(key)); url.hash = 'social'; return url.href; }
  async function startConnection(provider) {
    const path = provider === 'youtube' ? '/v1/connect/youtube/start' : provider === 'threads' ? '/v1/connect/threads/start' : '/v1/connect/meta/start';
    const data = await connectApi(path, { method:'POST', body:{ mode:'publish', returnUrl:returnUrl() } });
    if (!data.authorizationUrl) throw new Error('인증 주소를 받지 못했습니다.');
    location.assign(data.authorizationUrl);
  }
  function slug(value) { return String(value || '').trim().toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'').slice(0,48); }
  function markDirty(save, status) {
    dirty = true; save.disabled = false; status.textContent = '저장하지 않은 변경사항이 있습니다.'; status.dataset.state = 'dirty';
  }

  function install() {
    if (!token()) return;
    const nav = document.querySelector('.sidebar nav');
    const content = document.querySelector('.content');
    if (!nav || !content || content.querySelector('[data-panel~="social"]')) return;

    let navButton = nav.querySelector('[data-section="social"], [data-lazy-section="social"]');
    if (!navButton) {
      navButton = el('button', '', 'nav');
      navButton.type = 'button'; navButton.dataset.section = 'social';
      navButton.append(document.createTextNode('◉ '), el('span', '채널·계정 연결'));
      const communication = nav.querySelector('[data-section="communication"]');
      if (communication?.parentElement) communication.insertAdjacentElement('afterend', navButton);
      else nav.append(navButton);
    }

    const section = el('section', '', 'section social-admin hidden-panel');
    section.dataset.panel = 'social'; section.id = 'socialAdmin';
    const head = el('div', '', 'social-admin-head');
    const copy = el('div');
    copy.append(el('p','MULTI-CHANNEL CONTROL CENTER','kicker'), el('h2','멀티채널·계정 연결'), el('p','YouTube·Facebook·Instagram·Threads의 여러 계정과 여러 채널을 한 곳에서 연결·상태확인·해제하고, 기관별 채널 등록정보까지 함께 관리합니다. OAuth 비밀값은 암호화 Vault에만 보관됩니다.','operations-copy'));
    const actions = el('div','','social-admin-actions');
    const open = el('a','Social Hub 열기 ↗','secondary'); open.href='https://social.ekodi.kr'; open.target='_blank'; open.rel='noopener';
    const refresh = el('button','↻ 새로고침','secondary'); refresh.type='button';
    const save = el('button','변경사항 저장','primary'); save.type='button'; save.disabled=true;
    actions.append(open, refresh, save); head.append(copy, actions);

    const connectionPanel = el('section','','social-connections');
    const connectionHead = el('div','','social-channel-head');
    connectionHead.append(el('h3','멀티채널 공식 계정 연결'),el('span','Google · Meta · Threads 공식 OAuth · 암호화 Vault'));
    const scopeBar = el('div','','social-scope-bar');
    const scopeType = select('person', [['person','내 계정'],['tenant','운영공간'],['store','매장']]);
    const scopeKey = input('', 'text', '운영공간 slug 또는 매장 ID'); scopeKey.disabled=true;
    const scopeApply = el('button','범위 불러오기','secondary'); scopeApply.type='button';
    scopeBar.append(field('관리 범위',scopeType),field('공간 / 매장 키',scopeKey,'wide'),scopeApply);
    const connectionActions = el('div','','social-connection-actions');
    const youtubeConnect = el('button','＋ YouTube 계정·채널 추가','primary'); youtubeConnect.type='button'; youtubeConnect.dataset.connectProvider='youtube';
    const metaConnect = el('button','＋ Facebook · Instagram 계정 추가','secondary'); metaConnect.type='button'; metaConnect.dataset.connectProvider='meta';
    const threadsConnect = el('button','＋ Threads 계정 추가','secondary'); threadsConnect.type='button'; threadsConnect.dataset.connectProvider='threads';
    connectionActions.append(youtubeConnect,metaConnect,threadsConnect);
    const connectionMetrics = el('div','','social-connection-metrics');
    const connectionStatus = el('p','OAuth 연결상태를 확인하지 않았습니다.','social-admin-status'); connectionStatus.setAttribute('role','status');
    const connectionList = el('div','','social-connection-list');
    connectionPanel.append(connectionHead,scopeBar,connectionActions,connectionMetrics,connectionStatus,connectionList);
    const summary = el('div','','social-admin-summary');
    const status = el('p','Registry를 불러오지 않았습니다.','social-admin-status'); status.setAttribute('role','status');
    const list = el('div','','social-org-list');
    const addOrg = el('button','＋ 기관 추가','ghost social-add-org'); addOrg.type='button';
    section.append(head, connectionPanel, summary, status, list, addOrg); content.append(section);

    function renderSummary() {
      const orgs = registry.organizations || [];
      const channels = orgs.flatMap(org => org.channels || []);
      summary.replaceChildren();
      [['Organizations',orgs.length],['Active orgs',orgs.filter(o=>o.isActive!==false).length],['Channels',channels.length],['Active channels',channels.filter(c=>c.isActive!==false).length]].forEach(([label,value]) => {
        const card = el('article'); card.append(el('small',label),el('strong',String(value))); summary.append(card);
      });
    }

    function channelRow(org, channel, index) {
      const row = el('div','','social-channel-row');
      const provider = select(channel.provider || 'other', providers.map(v => [v, v]));
      const label = input(channel.label || '');
      const url = input(channel.url || '', 'url', 'https://…');
      const handle = input(channel.handle || '', 'text', '@handle');
      const channelId = input(channel.channelId || '', 'text', 'YouTube channel ID');
      const orderInput = input(channel.order ?? (index+1)*10, 'number'); orderInput.min='0'; orderInput.max='9999';
      const active = document.createElement('input'); active.type='checkbox'; active.checked=channel.isActive!==false;
      const remove = el('button','Delete','ghost danger'); remove.type='button';
      row.append(field('Provider',provider),field('Label',label),field('URL',url,'wide'),field('Handle',handle),field('Channel ID',channelId),field('Order',orderInput),field('Active',active,'check'),remove);
      const sync = () => {
        channel.provider=provider.value; channel.label=label.value; channel.url=url.value; channel.handle=handle.value; channel.channelId=channelId.value; channel.order=Number(orderInput.value||0); channel.isActive=active.checked;
        if (!channel.id) channel.id = `${org.id || 'org'}-${provider.value}-${Date.now().toString(36)}`;
        markDirty(save,status); renderSummary();
      };
      [provider,label,url,handle,channelId,orderInput,active].forEach(control => control.addEventListener(control.tagName==='SELECT'||control.type==='checkbox'?'change':'input',sync));
      remove.addEventListener('click',()=>{ org.channels.splice(index,1); markDirty(save,status); render(); });
      return row;
    }

    function orgCard(org, index) {
      const card = el('article','','social-org-card');
      const top = el('div','','social-org-card-head');
      const title = el('div'); title.append(el('strong',org.name || 'New organization'),el('small',org.id || 'new-org'));
      const remove = el('button','Delete organization','ghost danger'); remove.type='button';
      top.append(title,remove);
      const fields = el('div','','social-org-fields');
      const name = input(org.name || '');
      const id = input(org.id || '');
      const shortName = input(org.shortName || '');
      const website = input(org.website || 'https://', 'url');
      const description = input(org.description || '');
      const orderInput = input(org.order ?? (index+1)*10,'number');
      const policy = select(org.socialPolicy || 'inherit_org', [['inherit_org','Inherit organization'],['custom','Custom'],['none','Hidden']]);
      const active = document.createElement('input'); active.type='checkbox'; active.checked=org.isActive!==false;
      fields.append(field('Name',name),field('ID',id),field('Short name',shortName),field('Website',website,'wide'),field('Description',description,'wide'),field('Order',orderInput),field('Policy',policy),field('Active',active,'check'));
      const channelHead = el('div','','social-channel-head');
      channelHead.append(el('h3','Channels'),el('span',`${(org.channels||[]).length} registered`));
      const channelList = el('div','','social-channel-list');
      (org.channels||[]).forEach((channel,channelIndex)=>channelList.append(channelRow(org,channel,channelIndex)));
      const addChannel = el('button','＋ Add channel','ghost'); addChannel.type='button';
      addChannel.addEventListener('click',()=>{ org.channels ||= []; org.channels.push({ id:`${org.id||'org'}-other-${Date.now().toString(36)}`,provider:'other',label:'New channel',url:'https://',description:'',isActive:true,order:(org.channels.length+1)*10 }); markDirty(save,status); render(); });
      const sync = () => {
        org.name=name.value; org.id=slug(id.value)||id.value.trim(); org.shortName=shortName.value; org.website=website.value; org.description=description.value; org.order=Number(orderInput.value||0); org.socialPolicy=policy.value; org.isActive=active.checked;
        title.querySelector('strong').textContent=org.name||'New organization'; title.querySelector('small').textContent=org.id||'new-org'; markDirty(save,status); renderSummary();
      };
      [name,id,shortName,website,description,orderInput,policy,active].forEach(control=>control.addEventListener(control.tagName==='SELECT'||control.type==='checkbox'?'change':'input',sync));
      remove.addEventListener('click',()=>{ if ((registry.organizations||[]).length<=1) { status.textContent='최소 한 개 기관은 남아 있어야 합니다.'; status.dataset.state='error'; return; } registry.organizations.splice(index,1); markDirty(save,status); render(); });
      card.append(top,fields,channelHead,channelList,addChannel); return card;
    }

    function render() {
      renderSummary(); list.replaceChildren();
      (registry.organizations||[]).forEach((org,index)=>list.append(orgCard(org,index)));
    }

    function renderConnections(data) {
      const connections = Array.isArray(data?.connections) ? data.connections : [];
      const active = connections.filter(row=>row.status==='active');
      const counts = new Map(); active.forEach(row=>counts.set(row.provider,(counts.get(row.provider)||0)+1));
      connectionMetrics.replaceChildren();
      [['전체 연결',active.length],['YouTube',counts.get('youtube')||0],['Facebook',counts.get('facebook')||0],['Instagram',counts.get('instagram')||0],['Threads',counts.get('threads')||0]].forEach(([label,value])=>{const metric=el('article');metric.append(el('small',String(label)),el('strong',String(value)));connectionMetrics.append(metric);});
      connectionList.replaceChildren();
      if (!connections.length) connectionList.append(el('p','아직 연결된 공식 계정이 없습니다. 같은 플랫폼도 여러 계정과 여러 채널을 반복해서 연결할 수 있습니다.','social-connection-empty'));
      connections.forEach(row => {
        const card = el('article','','social-connection-card');
        const text = el('div','','social-connection-copy');
        const meta = [providerLabel(row.provider),row.resource_type,row.external_id].filter(Boolean).join(' · ');
        const detail = [row.token_expires_at?`토큰 만료 ${formatDate(row.token_expires_at)}`:'',row.last_check_at?`확인 ${formatDate(row.last_check_at)}`:''].filter(Boolean).join(' · ');
        text.append(el('strong',row.display_name || providerLabel(row.provider)),el('small',meta));
        if(detail) text.append(el('small',detail));
        const side=el('div','','social-connection-side');
        const state = el('span',connectionState(row.status),`social-connection-state ${String(row.status || '').toLowerCase()}`);
        side.append(state);
        if(row.status==='active') { const disconnect=el('button','연결 해제','ghost danger'); disconnect.type='button'; disconnect.dataset.disconnectConnection=String(row.id); side.append(disconnect); }
        else { const provider=reconnectProvider(row.provider); if(provider){ const reconnect=el('button','다시 연결','secondary'); reconnect.type='button'; reconnect.dataset.reconnectProvider=provider; side.append(reconnect); } }
        card.append(text,side); connectionList.append(card);
      });
      const platform = data?.platform || {};
      youtubeConnect.disabled = platform.youtubeConfigured === false;
      metaConnect.disabled = platform.metaConfigured === false;
      threadsConnect.disabled = platform.threadsConfigured === false;
      const missing = [platform.youtubeConfigured===false?'YouTube':null,platform.metaConfigured===false?'Meta':null,platform.threadsConfigured===false?'Threads':null].filter(Boolean);
      const scopeLabel=connectionScope.type==='person'?'내 계정':`${connectionScope.type}:${connectionScope.key}`;
      connectionStatus.textContent = missing.length ? `${scopeLabel} · 플랫폼 앱 설정 필요: ${missing.join(', ')}` : `${scopeLabel} · 활성 연결 ${active.length}개 · 같은 플랫폼의 여러 계정·채널을 함께 보관할 수 있습니다.`;
      connectionStatus.dataset.state = missing.length ? 'dirty' : 'ready';
    }

    async function loadConnections() {
      connectionStatus.textContent='OAuth 연결상태를 확인하는 중입니다.'; connectionStatus.dataset.state='loading';
      try { renderConnections(await connectApi('/v1/connections')); }
      catch(error) { connectionStatus.textContent=error.message; connectionStatus.dataset.state='error'; }
    }

    async function load() {
      refresh.disabled=true; save.disabled=true; status.textContent='Registry를 불러오는 중입니다.'; status.dataset.state='loading';
      try {
        const data=await api('/api/control/social/registry'); registry=data.registry; revision=Number(data.revision||0); dirty=false; render();
        status.textContent=`Revision ${revision} · ${data.updatedAt ? new Date(data.updatedAt).toLocaleString('ko-KR') : '초기 설정'}`; status.dataset.state='ready';
      } catch(error) { status.textContent=error.message; status.dataset.state='error'; }
      finally { refresh.disabled=false; }
    }

    async function saveChanges() {
      if (!dirty) return;
      save.disabled=true; status.textContent='검증 후 저장 중입니다.'; status.dataset.state='loading';
      try {
        const data=await api('/api/control/social/registry',{method:'PUT',body:JSON.stringify({registry,expectedRevision:revision})});
        registry=data.registry; revision=Number(data.revision||revision+1); dirty=false; render();
        status.textContent=`저장 완료 · Revision ${revision}`; status.dataset.state='saved';
      } catch(error) {
        status.textContent=error.code==='REVISION_CONFLICT'?'다른 관리자 변경이 먼저 저장되었습니다. Refresh 후 다시 수정해 주세요.':error.message; status.dataset.state='error'; save.disabled=!dirty;
      }
    }

    async function activate() {
      document.querySelectorAll('[data-panel]').forEach(panel=>{ const targets=String(panel.dataset.panel||'').split(' '); panel.classList.toggle('hidden-panel',!targets.includes('social')); });
      document.querySelectorAll('.sidebar .nav[data-section]').forEach(item=>item.classList.toggle('active',item.dataset.section==='social'));
      const pageTitle=document.querySelector('#pageTitle'); if(pageTitle) pageTitle.textContent='멀티채널·계정 연결'; document.querySelector('.sidebar')?.classList.remove('open');
      await Promise.all([registry.organizations.length ? Promise.resolve() : load(), loadConnections()]);
    }

    navButton.addEventListener('click',activate);
    refresh.addEventListener('click',()=>Promise.all([load(),loadConnections()]));
    save.addEventListener('click',saveChanges);
    scopeType.addEventListener('change',()=>{ scopeKey.disabled=scopeType.value==='person'; if(scopeKey.disabled) scopeKey.value=''; });
    scopeApply.addEventListener('click',async()=>{
      const type=scopeType.value; const key=scopeKey.value.trim();
      if(type!=='person'&&!key){connectionStatus.textContent='운영공간 slug 또는 매장 ID를 입력해 주세요.';connectionStatus.dataset.state='error';return;}
      connectionScope={type,key:type==='person'?'':key}; await loadConnections();
    });
    connectionActions.addEventListener('click', async event => {
      const button = event.target.closest('[data-connect-provider]'); if (!button) return;
      button.disabled=true; connectionStatus.textContent=`${button.textContent} 준비 중입니다.`; connectionStatus.dataset.state='loading';
      try { await startConnection(button.dataset.connectProvider); }
      catch(error) { connectionStatus.textContent=error.message; connectionStatus.dataset.state='error'; button.disabled=false; }
    });
    connectionList.addEventListener('click',async event=>{
      const disconnect=event.target.closest('[data-disconnect-connection]');
      if(disconnect){
        if(!confirm('이 연결의 저장된 OAuth 자격증명을 폐기하고 게시 연결을 중지할까요? 다시 OAuth 연결할 수 있습니다.'))return;
        disconnect.disabled=true; connectionStatus.textContent='연결 자격증명을 안전하게 폐기하는 중입니다.'; connectionStatus.dataset.state='loading';
        try{await connectApi(`/v1/connections/${encodeURIComponent(disconnect.dataset.disconnectConnection)}/disconnect`,{method:'POST',body:{}});await loadConnections();}
        catch(error){connectionStatus.textContent=error.message;connectionStatus.dataset.state='error';disconnect.disabled=false;}
        return;
      }
      const reconnect=event.target.closest('[data-reconnect-provider]');
      if(reconnect){try{await startConnection(reconnect.dataset.reconnectProvider);}catch(error){connectionStatus.textContent=error.message;connectionStatus.dataset.state='error';}}
    });
    addOrg.addEventListener('click',()=>{ const id=`org-${Date.now().toString(36)}`; registry.organizations.push({id,name:'New organization',shortName:'Organization',description:'',website:'https://',isActive:true,order:(registry.organizations.length+1)*10,socialPolicy:'inherit_org',channels:[]}); markDirty(save,status); render(); });
    window.addEventListener('beforeunload',event=>{ if(!dirty)return; event.preventDefault(); event.returnValue=''; });
  }
  install();
})();
