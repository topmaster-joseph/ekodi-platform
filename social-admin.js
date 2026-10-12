(() => {
  const API = 'https://ekodi.kr';
  const CONNECT_API = '/marketing-connect-api';
  const TOKEN_KEY = 'ekodi-auth-token';
  const token = () => sessionStorage.getItem(TOKEN_KEY) || '';
  const providers = ['youtube','instagram','facebook','kakao','blog','naver_blog','brunch','threads','live','tiktok','linkedin','x','pinterest','band','telegram','discord','podcast','newsletter','rss','marketplace','naver_store','coupang','kakao_channel','daangn','google_business','wordpress','medium','substack','website','other'];
  const channelKinds = [['owned','직접 운영'],['partner','제휴·협력'],['external','외부 참고']];
  const channelPurposes = [['general','일반·소개'],['commerce','상품·판매'],['community','커뮤니티'],['ministry','교회·사역'],['support','고객지원'],['news','뉴스·정보']];
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
    const url = new URL(`${CONNECT_API}${path}`, location.origin);
    url.searchParams.set('subject_type',connectionScope.type);
    if (connectionScope.type !== 'person' && connectionScope.key) url.searchParams.set('subject_key',connectionScope.key);
    const response = await fetch(url, { ...options, headers, body: options.body ? JSON.stringify(options.body) : undefined, cache:'no-store' });
    let data = {}; try { data = await response.json(); } catch {}
    if (!response.ok) throw new Error(data.detail || data.error || `채널 연결 요청 실패 (${response.status})`);
    return data;
  }
  async function publishingApi(path, options = {}) {
    const headers = new Headers(options.headers || {});
    if (token()) headers.set('authorization', `Bearer ${token()}`);
    if (options.body && !headers.has('content-type')) headers.set('content-type', 'application/json');
    const url = new URL(`/marketing-publish-api${path}`, location.origin);
    url.searchParams.set('subject_type',connectionScope.type);
    if (connectionScope.type !== 'person' && connectionScope.key) url.searchParams.set('subject_key',connectionScope.key);
    const response = await fetch(url, { ...options, headers, body: options.body ? JSON.stringify(options.body) : undefined, cache:'no-store' });
    let data = {}; try { data = await response.json(); } catch {}
    if (!response.ok) { const error=new Error(data.detail || data.error || `게시 채널 요청 실패 (${response.status})`); error.code=data.error||''; throw error; }
    return data;
  }
  function providerLabel(value) { return ({youtube:'YouTube',instagram:'Instagram',facebook:'Facebook',threads:'Threads',facebook_ads:'Meta 광고',kakao:'Kakao',blog:'Blog',naver_blog:'네이버 블로그',brunch:'브런치',tiktok:'TikTok',linkedin:'LinkedIn',x:'X',pinterest:'Pinterest',band:'네이버 밴드',telegram:'Telegram',discord:'Discord',podcast:'팟캐스트',newsletter:'뉴스레터',rss:'RSS',marketplace:'외부 판매처',naver_store:'네이버 스마트스토어',coupang:'쿠팡',kakao_channel:'카카오톡 채널',daangn:'당근',google_business:'Google 비즈니스 프로필',wordpress:'WordPress',medium:'Medium',substack:'Substack',website:'웹사이트',live:'라이브'})[String(value||'').toLowerCase()] || String(value || '채널'); }
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
  function initialConnectionIntent() {
    const params = new URLSearchParams(location.search);
    const requestedType = String(params.get('social_scope') || '').toLowerCase();
    const type = ['person','tenant','store'].includes(requestedType) ? requestedType : 'person';
    const key = type === 'person' ? '' : slug(params.get('social_subject') || '');
    const requestedProvider = String(params.get('social_connect') || '').toLowerCase();
    const provider = ['youtube','meta','threads'].includes(requestedProvider) ? requestedProvider : '';
    return { type, key, provider };
  }
  function consumeConnectionIntent() {
    const url = new URL(location.href);
    url.searchParams.delete('social_connect');
    history.replaceState(history.state, '', url.href);
  }
  function markDirty(save, status) {
    dirty = true; save.disabled = false; status.textContent = '저장하지 않은 변경사항이 있습니다.'; status.dataset.state = 'dirty';
  }

  async function loadChannelAdminDirectory() {
    const catalog = await import('./admin-service-catalog.js');
    return catalog.socialManagedServices().map(item => ({
      ...item,
      publicUrl: catalog.canonicalServiceUrl(item.basePath),
      channelAdminUrl: catalog.canonicalServiceSocialAdminUrl(item),
    }));
  }

  function install() {
    const nav = document.querySelector('.sidebar nav');
    const content = document.querySelector('.content');
    if (!nav || !content || content.querySelector('[data-panel~="social"]')) return;

    let navButton = nav.querySelector('[data-section="social"], [data-lazy-section="social"]');
    if (!navButton) {
      navButton = el('button', '', 'nav');
      navButton.type = 'button'; navButton.dataset.section = 'social';
      navButton.append(document.createTextNode('◉ '), el('span', '채널'));
      const communication = nav.querySelector('[data-section="communication"]');
      if (communication?.parentElement) communication.insertAdjacentElement('afterend', navButton);
      else nav.append(navButton);
    }

    const section = el('section', '', 'section social-admin hidden-panel');
    section.dataset.panel = 'social'; section.id = 'socialAdmin';
    const head = el('div', '', 'social-admin-head');
    const copy = el('div');
    copy.append(el('p','MULTI-CHANNEL CONTROL CENTER','kicker'), el('h2','내부·외부 채널 통합관리'), el('p','모든 현재·미래 EKODI 사이트와 서비스는 중앙 Social Hub 정책을 자동 상속합니다. 공개 채널 링크와 외부 제휴처를 등록·분류하고, 실제 게시 권한은 별도 공식 계정 연결 원장에서 관리합니다. 비밀번호는 저장하지 않으며 OAuth 비밀값은 암호화 Vault에만 보관됩니다.','operations-copy'));
    const actions = el('div','','social-admin-actions');
    const open = el('a','Open Social ↗','secondary'); open.href='https://social.ekodi.kr'; open.target='_blank'; open.rel='noopener';
    const refresh = el('button','↻ Refresh','secondary'); refresh.type='button';
    const save = el('button','Save changes','primary'); save.type='button'; save.disabled=true;
    actions.append(open, refresh, save); head.append(copy, actions);

    const siteDirectoryPanel = el('section','','social-site-directory');
    siteDirectoryPanel.dataset.siteChannelDirectory='true';
    const siteDirectoryHead = el('div','','social-channel-head');
    siteDirectoryHead.append(el('h3','전체 사이트·서비스 채널관리'),el('span','모든 현재·미래 서비스가 중앙 Social Hub 정책을 자동 상속'));
    const siteDirectoryStatus = el('p','사용자 사이트 관리자 목록을 불러오는 중입니다.','social-admin-status');
    siteDirectoryStatus.setAttribute('role','status');
    const siteDirectoryList = el('div','','social-site-directory-list');
    siteDirectoryPanel.append(siteDirectoryHead,siteDirectoryStatus,siteDirectoryList);

    async function renderSiteDirectory() {
      siteDirectoryStatus.textContent='사용자 사이트 관리자 목록을 불러오는 중입니다.';
      siteDirectoryStatus.dataset.state='loading';
      try {
        const sites=await loadChannelAdminDirectory();
        siteDirectoryList.replaceChildren();
        for(const site of sites){
          const card=el('article','','social-site-directory-card');
          card.dataset.siteChannelAdmin=site.id;
          const copy=el('div','','social-site-directory-copy');
          const kind=site.siteRelation==='customer-partner'?'고객·파트너 사이트':site.kind==='site'?'사용자 사이트':'플랫폼 서비스';
          copy.append(el('small',kind),el('strong',site.name),el('span',site.channelAdminUrl.replace('https://ekodi.kr','')));
          const controls=el('div','','social-site-directory-actions');
          const publicLink=el('a','사용자페이지 ↗','secondary');
          publicLink.href=site.publicUrl; publicLink.target='_blank'; publicLink.rel='noopener';
          const adminLink=el('a',site.socialAdminMode==='local-channel-center'?'사이트 채널센터 ↗':'중앙 Social Hub ↗','primary');
          adminLink.href=site.channelAdminUrl; adminLink.dataset.siteChannelAdminUrl=site.id;
          controls.append(publicLink,adminLink);
          if(site.channelSubjectKey){
            const centralManage=el('button','최고관리자에서 관리','secondary'); centralManage.type='button';
            centralManage.dataset.centralChannelSubject=site.channelSubjectKey;
            centralManage.dataset.centralChannelName=site.name;
            controls.append(centralManage);
          }
          card.append(copy,controls);
          siteDirectoryList.append(card);
        }
        siteDirectoryStatus.textContent=`${sites.length}개 사이트·서비스 · 게시 기능이 준비된 사이트는 로컬 채널센터를 사용하고, 나머지는 중앙 Social Hub에서 동일 정책·권한·감사 원장을 상속합니다.`;
        siteDirectoryStatus.dataset.state='ready';
      } catch(error) {
        siteDirectoryStatus.textContent=`사이트별 관리자 목록을 불러오지 못했습니다: ${error.message}`;
        siteDirectoryStatus.dataset.state='error';
      }
    }

    const connectionPanel = el('section','','social-connections');
    const connectionHead = el('div','','social-channel-head');
    connectionHead.append(el('h3','플랫폼 연결 원장 점검'),el('span','고급 · Google · Meta · Threads 공식 OAuth · 암호화 Vault'));
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

    const publishingPanel = el('section','','social-publishing-registry');
    const publishingHead = el('div','','social-channel-head');
    publishingHead.append(el('h3','선택 사이트 채널센터'),el('span','계정 등록 · 연결 · 기본채널 · 자동게시 설정을 같은 원장에서 관리'));
    const publishingActions = el('div','','social-connection-actions');
    const publishingAddYoutube = el('button','＋ YouTube 계정·채널 연결','primary'); publishingAddYoutube.type='button';
    const publishingReload = el('button','↻ 게시 채널 새로고침','secondary'); publishingReload.type='button';
    publishingActions.append(publishingAddYoutube,publishingReload);
    const publishingStatus = el('p','게시 채널 원장을 불러오지 않았습니다.','social-admin-status'); publishingStatus.setAttribute('role','status');
    const publishingConnections = el('div','','social-publishing-connections');
    const publishingChannels = el('div','','social-publishing-channels');
    publishingPanel.append(publishingHead,publishingActions,publishingStatus,publishingConnections,publishingChannels);
    // Read-only Mall data: publication authorization and profit authority stay in their existing services.
    const growthPanel = el('section','','social-mall-growth');
    const growthHead = el('div','','social-channel-head');
    growthHead.append(el('h3','성과'),el('span','에코디몰 · 최근 30일 · 제휴 보고서 기준'));
    const growthReload = el('button','조회','secondary'); growthReload.type='button';
    const growthStatus = el('p','에코디몰 운영공간을 선택하면 연결·판매 성과를 확인할 수 있습니다.','social-admin-status');
    const growthMetrics = el('div','','social-connection-metrics');
    const growthChannels = el('div','','social-publishing-channels');
    const growthAdvice = el('div','','social-growth-advice');
    growthPanel.append(growthHead,growthReload,growthStatus,growthMetrics,growthChannels,growthAdvice);
    const initialIntent = initialConnectionIntent();
    if (initialIntent.type !== 'person' && initialIntent.key) {
      scopeType.value = initialIntent.type;
      scopeKey.disabled = false;
      scopeKey.value = initialIntent.key;
      connectionScope = { type:initialIntent.type, key:initialIntent.key };
    } else if (initialIntent.type === 'person') {
      connectionScope = { type:'person', key:'' };
    }
    const summary = el('div','','social-admin-summary');
    const directoryFilters = el('div','','social-directory-filters');
    const channelSearch = input('', 'search', '기관·상품·채널명·주소 찾기');
    const kindFilter = select('all',[['all','모든 관계'],...channelKinds]);
    const purposeFilter = select('all',[['all','모든 목적'],...channelPurposes]);
    directoryFilters.append(field('채널 검색',channelSearch,'wide'),field('운영 관계',kindFilter),field('목적',purposeFilter));
    const status = el('p','Registry를 불러오지 않았습니다.','social-admin-status'); status.setAttribute('role','status');
    const list = el('div','','social-org-list');
    const addOrg = el('button','＋ 기관 추가','ghost social-add-org'); addOrg.type='button';
    const addMall = el('button','＋ 에코디몰 채널 그룹','secondary social-add-mall'); addMall.type='button';
    const directoryHelp = el('p','채널 주소 등록은 자동게시 승인이 아닙니다. 직접 운영 채널도 공식 OAuth 연결·사이트 매핑·발행 정책 확인 후에만 게시됩니다. 외부·제휴 링크는 등록·공개·분석 용도로만 사용합니다.','social-admin-status');
    const directoryHead = el('div','','social-channel-head');
    directoryHead.append(el('h3','채널 등록·공개 관리'),el('span','검색 노출·외부 제휴 채널은 링크 관리, 실제 게시 계정은 하단에서 연결'));
    // Compact sections: simple menu labels, advanced actions remain accessible.
    const foldPanel=(panel,label)=>{
      const fold=el('details','','social-admin-fold');
      fold.append(el('summary',label),panel);
      return fold;
    };
    const siteFold=foldPanel(siteDirectoryPanel,'사이트');
    const connectionFold=foldPanel(connectionPanel,'연결');
    const publishingFold=foldPanel(publishingPanel,'발행');
    const growthFold=foldPanel(growthPanel,'성과');
    section.append(head, directoryHead, summary, directoryFilters, addMall, directoryHelp, status, list, addOrg, siteFold, connectionFold, publishingFold, growthFold); content.append(section);

    function renderSummary() {
      const orgs = registry.organizations || [];
      const channels = orgs.flatMap(org => org.channels || []);
      summary.replaceChildren();
      [['그룹',orgs.length],['공개 그룹',orgs.filter(o=>o.isActive!==false && o.socialPolicy!=='none').length],['전체 채널',channels.length],['공개 채널',channels.filter(c=>c.isActive!==false && c.visibility!=='internal').length],['외부·제휴',channels.filter(c=>['external','partner'].includes(c.kind)).length],['관리 전용',channels.filter(c=>c.visibility==='internal').length]].forEach(([label,value]) => {
        const card = el('article'); card.append(el('small',label),el('strong',String(value))); summary.append(card);
      });
    }

    function channelRow(org, channel, index) {
      const row = el('div','','social-channel-row');
      const provider = select(channel.provider || 'other', providers.map(v => [v, v]));
      const label = input(channel.label || '');
      const url = input(channel.url || '', 'url', 'https://…');
      const description = input(channel.description || '', 'text', '채널 소개');
      const kind = select(channel.kind || 'owned',channelKinds);
      const purpose = select(channel.purpose || 'general',channelPurposes);
      const visibility = select(channel.visibility || 'public',[['public','공개'],['internal','관리 전용']]);
      const publicationMode = select(channel.publicationMode || 'link_only',[['link_only','링크 관리'],['manual','수동 게시 준비']]);
      const handle = input(channel.handle || '', 'text', '@handle');
      const channelId = input(channel.channelId || '', 'text', 'YouTube channel ID');
      const orderInput = input(channel.order ?? (index+1)*10, 'number'); orderInput.min='0'; orderInput.max='9999';
      const active = document.createElement('input'); active.type='checkbox'; active.checked=channel.isActive!==false;
      const remove = el('button','Delete','ghost danger'); remove.type='button';
      row.append(field('플랫폼',provider),field('채널명',label),field('링크',url,'wide'),field('소개',description,'wide'),field('소유관계',kind),field('목적',purpose),field('노출',visibility),field('발행 방식',publicationMode),field('Handle',handle),field('Channel ID',channelId),field('순서',orderInput),field('활성',active,'check'),remove);
      const sync = () => {
        if (kind.value !== 'owned') publicationMode.value = 'link_only';
        publicationMode.disabled = kind.value !== 'owned';
        channel.provider=provider.value; channel.label=label.value; channel.url=url.value;
        channel.description=description.value; channel.kind=kind.value; channel.purpose=purpose.value;
        channel.visibility=visibility.value; channel.publicationMode=publicationMode.value;
        channel.handle=handle.value; channel.channelId=channelId.value; channel.order=Number(orderInput.value||0); channel.isActive=active.checked;
        if (!channel.id) channel.id = `${org.id || 'org'}-${provider.value}-${Date.now().toString(36)}`;
        markDirty(save,status); renderSummary();
      };
      publicationMode.disabled = kind.value !== 'owned';
      [provider,label,url,description,kind,purpose,visibility,publicationMode,handle,channelId,orderInput,active].forEach(control => control.addEventListener(control.tagName==='SELECT'||control.type==='checkbox'?'change':'input',sync));
      remove.addEventListener('click',()=>{ org.channels.splice(index,1); markDirty(save,status); render(); });
      return row;
    }

    function orgCard(org, index) {
      const card = el('article','','social-org-card'); card.dataset.socialOrg=org.id;
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
      channelHead.append(el('h3','공개·내부·외부 채널'),el('span',`${(org.channels||[]).length}개 등록 · 실제 게시 계정은 별도 OAuth 원장`));
      const channelList = el('div','','social-channel-list');
      (org.channels||[]).forEach((channel,channelIndex)=>channelList.append(channelRow(org,channel,channelIndex)));
      const addChannel = el('button','＋ 운영 채널 등록','ghost'); addChannel.type='button';
      const addExternal = el('button','＋ 외부·제휴 채널 등록','secondary'); addExternal.type='button';
      const newChannel = kind => {
        org.channels ||= [];
        org.channels.push({ id:`${org.id||'org'}-other-${Date.now().toString(36)}`,provider:'other',label:'새 채널',url:'https://',description:'',kind,purpose:'general',visibility:'internal',publicationMode:'link_only',isActive:false,order:(org.channels.length+1)*10 });
        markDirty(save,status); render();
      };
      addChannel.addEventListener('click',()=>newChannel('owned'));
      addExternal.addEventListener('click',()=>newChannel('external'));
      const sync = () => {
        org.name=name.value; org.id=slug(id.value)||id.value.trim(); org.shortName=shortName.value; org.website=website.value; org.description=description.value; org.order=Number(orderInput.value||0); org.socialPolicy=policy.value; org.isActive=active.checked;
        title.querySelector('strong').textContent=org.name||'New organization'; title.querySelector('small').textContent=org.id||'new-org'; markDirty(save,status); renderSummary();
      };
      [name,id,shortName,website,description,orderInput,policy,active].forEach(control=>control.addEventListener(control.tagName==='SELECT'||control.type==='checkbox'?'change':'input',sync));
      remove.addEventListener('click',()=>{ if ((registry.organizations||[]).length<=1) { status.textContent='최소 한 개 기관은 남아 있어야 합니다.'; status.dataset.state='error'; return; } registry.organizations.splice(index,1); markDirty(save,status); render(); });
      card.append(top,fields,channelHead,channelList,addChannel,addExternal); return card;
    }

    function applyDirectoryFilters() {
      const query=channelSearch.value.trim().toLocaleLowerCase('ko-KR');
      const kind=kindFilter.value, purpose=purposeFilter.value;
      Array.from(list.children).forEach((card,index)=>{
        const org=(registry.organizations||[])[index];
        if (!org) return;
        const candidates=(org.channels||[]).filter(channel=>
          (kind==='all'||(channel.kind||'owned')===kind)
          && (purpose==='all'||(channel.purpose||'general')===purpose));
        const orgMatches=`${org.name||''} ${org.id||''} ${org.website||''}`.toLocaleLowerCase('ko-KR').includes(query);
        const channelMatches=candidates.some(ch=>`${ch.label||''} ${ch.provider||''} ${ch.url||''} ${ch.description||''}`.toLocaleLowerCase('ko-KR').includes(query));
        card.hidden=!(kind==='all'&&purpose==='all'&&orgMatches || candidates.length>0&&(orgMatches||channelMatches));
      });
    }
    function render() {
      renderSummary(); list.replaceChildren();
      (registry.organizations||[]).forEach((org,index)=>list.append(orgCard(org,index)));
      applyDirectoryFilters();
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

    function publishingBindingRow(binding, sites, state, rerender) {
      const row=el('div','','social-publishing-binding');
      const service=sites.find(site=>site.id===binding.serviceId);
      const label=el('div','','social-publishing-binding-copy');
      label.append(el('strong',service?.name||binding.serviceId),el('small',service?.url||binding.serviceId));
      const role=select(binding.role||'primary',[['primary','주 연결'],['secondary','보조'],['archive_only','아카이브만']]);
      const primary=document.createElement('input');primary.type='checkbox';primary.checked=Boolean(binding.isDefault);
      const archive=document.createElement('input');archive.type='checkbox';archive.checked=Boolean(binding.autoArchive);
      const remove=el('button','삭제','ghost danger');remove.type='button';
      role.addEventListener('change',()=>binding.role=role.value);
      primary.addEventListener('change',()=>binding.isDefault=primary.checked);
      archive.addEventListener('change',()=>binding.autoArchive=archive.checked);
      remove.addEventListener('click',()=>{state.splice(state.indexOf(binding),1);rerender()});
      row.append(label,field('역할',role),field('기본채널',primary,'check'),field('지난행사 자동등록',archive,'check'),remove);
      return row;
    }
    function publishingChannelCard(channel, sites) {
      const card=el('article','','social-publishing-channel-card');
      const head=el('div','','social-publishing-channel-head');
      const copy=el('div','','social-publishing-channel-copy');
      copy.append(el('strong',channel.display_name||channel.displayName||channel.external_account_id||'YouTube'),el('small',`${providerLabel(channel.provider)} · ${channel.status||'-'} · ${channel.external_account_id||''}`));
      head.append(copy,el('span',channel.status==='active'?'사용 가능':'확인 필요',`social-connection-state ${channel.status||''}`));
      const state=(channel.siteBindings||[]).map(item=>({serviceId:item.service_id||item.serviceId,role:item.role||'primary',isDefault:Boolean(item.isDefault??item.is_default),autoArchive:Boolean(item.autoArchive??item.auto_archive),archiveCategory:item.archive_category||item.archiveCategory||'past-event',enabled:item.enabled!==false,priority:Number(item.priority||100)}));
      const bindings=el('div','','social-publishing-bindings');
      const controls=el('div','','social-publishing-site-add');
      const siteSelect=select('',[['','연결할 사이트 선택'],...sites.map(site=>[site.id,`${site.name} · ${new URL(site.url).pathname}`])]);
      const addSite=el('button','사이트 연결 추가','secondary');addSite.type='button';
      const saveSites=el('button','사이트 연결 저장','primary');saveSites.type='button';
      const note=el('small','','social-publishing-note');
      const rerender=()=>{
        bindings.replaceChildren();
        state.forEach(binding=>bindings.append(publishingBindingRow(binding,sites,state,rerender)));
        note.textContent=state.length?`${state.length}개 사이트 연결`:'연결 사이트 없음';
      };
      addSite.addEventListener('click',()=>{
        const serviceId=siteSelect.value;
        if(!serviceId||state.some(item=>item.serviceId===serviceId))return;
        state.push({serviceId,role:'primary',isDefault:state.length===0,autoArchive:false,archiveCategory:'past-event',enabled:true,priority:(state.length+1)*10});
        rerender();
      });
      saveSites.addEventListener('click',async()=>{
        saveSites.disabled=true; publishingStatus.textContent=`${channel.display_name||'채널'} 사이트 연결을 저장하는 중입니다.`; publishingStatus.dataset.state='loading';
        try{
          await publishingApi(`/v1/channels/${encodeURIComponent(channel.id)}/sites`,{method:'PUT',body:{bindings:state}});
          publishingStatus.textContent='채널과 사이트 연결을 저장했습니다.';publishingStatus.dataset.state='saved';await loadPublishingChannels();
        }catch(error){publishingStatus.textContent=error.message;publishingStatus.dataset.state='error';saveSites.disabled=false}
      });
      controls.append(siteSelect,addSite,saveSites,note);
      card.append(head,bindings,controls);rerender();return card;
    }
    async function loadPublishingChannels() {
      publishingStatus.textContent='게시 채널과 사이트 연결을 확인하는 중입니다.';publishingStatus.dataset.state='loading';
      try{
        const channelData=await publishingApi('/v1/channels');
        const sites=Array.isArray(channelData.sites)?channelData.sites:[];
        publishingConnections.replaceChildren();
        const authNote=el('p','Google/YouTube 인증은 EKODI 공식 채널 연결 원장을 사용합니다. 인증 완료 후 게시 채널 원장이 자동 동기화됩니다.','social-connection-empty');
        publishingConnections.append(authNote);
        publishingChannels.replaceChildren();
        for(const channel of channelData.channels||[])publishingChannels.append(publishingChannelCard(channel,sites));
        if(!(channelData.channels||[]).length)publishingChannels.append(el('p','등록된 게시 채널이 없습니다. YouTube 계정·채널 연결을 눌러 최초 1회 공식 인증해 주세요.','social-connection-empty'));
        publishingStatus.textContent=`등록 채널 ${(channelData.channels||[]).length}개 · OAuth는 공식 연결 원장, 게시·사이트 매핑은 게시 원장으로 분리 관리합니다.`;
        publishingStatus.dataset.state='ready';
      }catch(error){
        publishingConnections.replaceChildren();publishingChannels.replaceChildren();
        publishingStatus.textContent=error.code==='CHANNEL_SITE_BINDINGS_NOT_READY'?'채널-사이트 연결 스키마 배포가 필요합니다.':error.message;
        publishingStatus.dataset.state='error';
      }
    }

    async function loadMallGrowth() {
      growthMetrics.replaceChildren(); growthChannels.replaceChildren(); growthAdvice.replaceChildren();
      if (connectionScope.type !== 'tenant' || connectionScope.key !== 'ekodimall') {
        growthStatus.textContent='관리 범위를 에코디몰(운영공간)로 선택하면 성과가 표시됩니다.';
        growthStatus.dataset.state='ready'; return;
      }
      growthStatus.textContent='실제 제휴 보고서와 발행 원장을 조회하고 있습니다.';
      growthStatus.dataset.state='loading';
      try {
        const data = await connectApi('/v1/mall/dashboard');
        if (!data?.ok || !data?.schemaReady) throw new Error('성과 원장이 아직 준비되지 않았습니다.');
        const perf=data.performance30d||{};
        const number=value=>new Intl.NumberFormat('ko-KR').format(Number.isFinite(Number(value))?Number(value):0);
        const rows=[
          ['활성 상품',data.inventory?.activeProducts],
          ['제휴 클릭',perf.productClicks],
          ['보고 주문',perf.orders],
          ['보고 수수료',`${number(perf.observedCommissionKrw)}원`],
          ['홍보 방문',perf.campaignVisits],
          ['외부 이동',perf.outboundAffiliateClicks],
        ];
        for (const [label,value] of rows) {
          const item=el('article');
          item.append(el('small',label),el('strong',typeof value==='string'?value:number(value)));
          growthMetrics.append(item);
        }
        const channels=Array.isArray(data.channels)?data.channels:[];
        for (const channel of channels) {
          const card=el('article','','social-publishing-selection');
          card.append(el('strong',`${providerLabel(channel.provider)} · 발행 ${number(channel.published30d)} · 실패 ${number(channel.failed30d)}`));
          card.append(el('small',channel.lastPublishedAt?`마지막 발행 ${formatDate(channel.lastPublishedAt)}`:'최근 발행 기록 없음'));
          growthChannels.append(card);
        }
        const loop=data.autonomousProfitLoop||{};
        const stages=loop.stages||{};
        const stepLabels={source:'상품 수집',feedback:'실적 수집',intelligence:'분석',curate:'추천',publish:'발행',learn:'학습'};
        if (loop.ok && Object.keys(stages).length) {
          const flow=el('section','','social-growth-flow');
          flow.append(el('strong','자동화 단계'));
          for (const [key,label] of Object.entries(stepLabels)) {
            const stage=stages[key]||{};
            const line=el('div','','social-growth-stage');
            line.append(el('span',label),el('span',String(stage.status||'대기')));
            line.dataset.fresh=stage.fresh===true?'true':'false';
            flow.append(line);
          }
          growthChannels.append(flow);
        }
        const notes=[];
        if (!perf.reportReady) notes.push('상품별 제휴 실적 보고서가 확인되지 않았습니다. 수익 추정이나 자동 확대를 보류하세요.');
        if (loop.ok && (loop.blockers||[]).length) notes.push(`자동화 선행 문제: ${(loop.blockers||[]).slice(0,3).join(', ')} · 원장/연결 상태부터 복구하세요.`);
        if (loop.ok && (loop.stale||[]).length) notes.push(`오래된 데이터: ${(loop.stale||[]).slice(0,3).join(', ')} · 갱신 후 결과를 재평가하세요.`);
        if (channels.some(ch=>Number(ch.failed30d)>0)) notes.push('발행 오류가 있습니다. 채널 연결 상태와 승인 원장을 점검하세요.');
        const decisions=Array.isArray(data.decisions)?data.decisions:[];
        if (decisions.length) {
          notes.push('상품별 개선 후보는 검토용입니다. 정산·비용·충분한 근거를 확인하기 전에는 유료홍보나 대량 자동발행을 시작하지 않습니다.');
          const actions={scale:'확대 검토',test:'소규모 실험',observe:'관찰',hold:'보류'};
          for (const decision of decisions.slice(0,5)) {
            const card=el('article','','social-publishing-selection');
            const action=actions[decision.action]||'관찰';
            card.append(el('strong',`${decision.productName||'상품'} · ${action}`));
            card.append(el('small',`${providerLabel(decision.provider)} · 보고 주문 ${number(decision.orders30d)} · 보고 수수료 ${number(decision.observedProductCommission30dKrw)}원 · 평가 ${number(decision.policyScore)}`));
            growthAdvice.append(card);
          }
        }
        if (Number(perf.campaignVisits)>0 && !Number(perf.outboundAffiliateClicks)) notes.push('홍보 방문은 있으나 외부 판매처 이동 집계가 없습니다. 랜딩 페이지·추적 연동을 확인하세요.');
        notes.push('채널별 매출 귀속은 추정치입니다. 표시된 수수료는 공급자 보고값이며 정산 완료 수익이나 순이익이 아닙니다.');
        notes.push('SEO·AEO·GEO 실제 검색 노출·AI 답변 인용은 Search Console 등 별도의 검증 데이터가 필요합니다.');
        for (const note of notes) growthAdvice.append(el('p',note,'social-growth-advice-item'));
        growthStatus.textContent=`보고 기준 ${perf.latestMetricDate||'미확인'} · 조회 ${formatDate(data.generatedAt)} · 읽기 전용`;
        growthStatus.dataset.state='ready';
      } catch (error) {
        growthStatus.textContent=`성과 조회 불가: ${error.message}`;growthStatus.dataset.state='error';
      }
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
      const pageTitle=document.querySelector('#pageTitle'); if(pageTitle) pageTitle.textContent='채널'; document.querySelector('.sidebar')?.classList.remove('open');
      await Promise.all([renderSiteDirectory(), registry.organizations.length ? Promise.resolve() : load(), loadConnections(), loadPublishingChannels(), loadMallGrowth()]);
    }

    navButton.addEventListener('click',activate);
    channelSearch.addEventListener('input',applyDirectoryFilters);
    kindFilter.addEventListener('change',applyDirectoryFilters);
    purposeFilter.addEventListener('change',applyDirectoryFilters);
    refresh.addEventListener('click',()=>Promise.all([renderSiteDirectory(),load(),loadConnections(),loadPublishingChannels()]));
    save.addEventListener('click',saveChanges);
    scopeType.addEventListener('change',()=>{ scopeKey.disabled=scopeType.value==='person'; if(scopeKey.disabled) scopeKey.value=''; });
    scopeApply.addEventListener('click',async()=>{
      const type=scopeType.value; const key=scopeKey.value.trim();
      if(type!=='person'&&!key){connectionStatus.textContent='운영공간 slug 또는 매장 ID를 입력해 주세요.';connectionStatus.dataset.state='error';return;}
      connectionScope={type,key:type==='person'?'':key};
      if (type==='tenant' && key==='ekodimall') growthFold.open=true;
      await Promise.all([loadConnections(),loadPublishingChannels(),loadMallGrowth()]);
    });
    siteDirectoryList.addEventListener('click',async event=>{
      const button=event.target.closest('[data-central-channel-subject]');
      if(!button)return;
      const key=slug(button.dataset.centralChannelSubject||'');
      if(!key)return;
      scopeType.value='tenant';scopeKey.disabled=false;scopeKey.value=key;connectionScope={type:'tenant',key};
      publishingFold.open=true;
      if (key==='ekodimall') growthFold.open=true;
      siteDirectoryStatus.textContent=`${button.dataset.centralChannelName||key} 채널센터를 최고관리자 권한으로 불러오는 중입니다.`;siteDirectoryStatus.dataset.state='loading';
      await Promise.all([loadConnections(),loadPublishingChannels(),loadMallGrowth()]);
      siteDirectoryStatus.textContent=`${button.dataset.centralChannelName||key} 채널센터 · 사이트 관리자와 동일 원장`;siteDirectoryStatus.dataset.state='ready';
      publishingPanel.scrollIntoView({behavior:'smooth',block:'start'});
    });
    publishingAddYoutube.addEventListener('click',async()=>{publishingAddYoutube.disabled=true;publishingStatus.textContent='EKODI 공식 YouTube 연결 인증을 준비하는 중입니다.';publishingStatus.dataset.state='loading';try{await startConnection('youtube')}catch(error){publishingStatus.textContent=error.message;publishingStatus.dataset.state='error';publishingAddYoutube.disabled=false}});
    publishingReload.addEventListener('click',loadPublishingChannels);
    growthReload.addEventListener('click',loadMallGrowth);
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
    addOrg.addEventListener('click',()=>{ const id=`org-${Date.now().toString(36)}`; registry.organizations.push({id,name:'새 그룹',shortName:'Group',description:'',website:'https://',isActive:false,order:(registry.organizations.length+1)*10,socialPolicy:'inherit_org',channels:[]}); markDirty(save,status); render(); });
    addMall.addEventListener('click',()=>{
      channelSearch.value=''; kindFilter.value='all'; purposeFilter.value='all'; applyDirectoryFilters();
      if ((registry.organizations||[]).some(org=>org.id==='mall')) {
        status.textContent='에코디몰 채널 그룹이 이미 등록되어 있습니다.'; status.dataset.state='ready';
        list.querySelector('[data-social-org="mall"]')?.scrollIntoView({behavior:'smooth',block:'center'}); return;
      }
      registry.organizations.push({id:'mall',name:'에코디몰',shortName:'Mall',description:'상품 검색·판매자 협업·외부 채널 유입을 관리합니다.',website:'https://ekodi.kr/ekodimall/',isActive:true,order:35,socialPolicy:'custom',channels:[]});
      markDirty(save,status); render();
      list.querySelector('[data-social-org="mall"]')?.scrollIntoView({behavior:'smooth',block:'center'});
    });
    if (initialIntent.provider && (initialIntent.type === 'person' || initialIntent.key)) {
      consumeConnectionIntent();
      queueMicrotask(async()=>{
        connectionStatus.textContent=`${providerLabel(initialIntent.provider)} 연결 준비 중입니다.`;
        connectionStatus.dataset.state='loading';
        try {
          await loadConnections();
          const providerButton = initialIntent.provider === 'youtube' ? youtubeConnect : initialIntent.provider === 'threads' ? threadsConnect : metaConnect;
          if (providerButton.disabled) {
            connectionStatus.textContent=`${providerLabel(initialIntent.provider)} 플랫폼 앱 설정이 먼저 필요합니다.`;
            connectionStatus.dataset.state='dirty';
            return;
          }
          await startConnection(initialIntent.provider);
        } catch(error) {
          connectionStatus.textContent=error.message;
          connectionStatus.dataset.state='error';
        }
      });
    }
    window.addEventListener('beforeunload',event=>{ if(!dirty)return; event.preventDefault(); event.returnValue=''; });
  }
  install();
})();
