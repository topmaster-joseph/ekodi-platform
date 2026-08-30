(() => {
  'use strict';
  const API = 'https://api.ekodi.kr';
  const TOKEN_KEY = 'ekodi-auth-token';
  const PROVIDERS = ['youtube','instagram','facebook','kakao','blog','threads','live','tiktok','linkedin','other'];
  const PUBLISHABLE = new Set(['facebook','instagram','youtube']);
  let revision = 0;
  let registry = { version:3, organizations:[] };
  let dirty = false;
  let activeTab = 'registry';
  let activeTenant = '';
  let connections = [];
  let posts = [];
  let generatedDrafts = [];

  const el = (tag, text = '', className = '') => {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text) node.textContent = text;
    return node;
  };
  const token = () => sessionStorage.getItem(TOKEN_KEY) || '';
  const input = (value = '', type = 'text', placeholder = '') => {
    const node = document.createElement('input');
    node.type = type; node.value = value ?? ''; node.placeholder = placeholder;
    return node;
  };
  const textarea = (value = '', placeholder = '') => {
    const node = document.createElement('textarea');
    node.value = value ?? ''; node.placeholder = placeholder; node.rows = 4;
    return node;
  };
  const field = (label, control, className = '') => {
    const wrap = el('label', '', `social-field ${className}`.trim());
    wrap.append(el('span', label), control); return wrap;
  };
  const select = (value, values) => {
    const node = document.createElement('select');
    values.forEach(([v, label]) => { const option = el('option', label); option.value = v; node.append(option); });
    node.value = value; return node;
  };
  const slug = value => String(value || '').trim().toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'').slice(0,48);
  const dateLabel = value => value ? new Date(value).toLocaleString('ko-KR') : '—';
  const stateLabel = value => ({draft:'초안',scheduled:'예약',publishing:'게시 중',published:'게시됨',failed:'실패',cancelled:'취소'}[value] || value || '—');

  async function api(path, options = {}) {
    const headers = new Headers(options.headers || {});
    if (token()) headers.set('authorization', `Bearer ${token()}`);
    if (options.body && !headers.has('content-type')) headers.set('content-type', 'application/json');
    const response = await fetch(`${API}${path}`, { ...options, headers, cache:'no-store' });
    let data = {}; try { data = await response.json(); } catch {}
    if (!response.ok) {
      const error = new Error(data.error || `API 요청 실패 (${response.status})`);
      error.code = data.code; error.revision = data.revision; throw error;
    }
    return data;
  }

  function markDirty(save, status) {
    dirty = true; save.disabled = false; status.textContent = '저장하지 않은 변경사항이 있습니다.'; status.dataset.state = 'dirty';
  }

  function installRuntimeStyles() {
    if (document.querySelector('#socialPublishingConsoleStyles')) return;
    const style = el('style'); style.id = 'socialPublishingConsoleStyles';
    style.textContent = `
      .social-tabs{display:flex;gap:6px;flex-wrap:wrap;margin:10px 0 14px}.social-tab{border:1px solid rgba(120,145,170,.28);border-radius:9px;background:transparent;color:inherit;padding:8px 11px;font-weight:750}.social-tab.active{background:rgba(90,135,180,.16);border-color:rgba(90,135,180,.52)}
      .social-publishing-grid{display:grid;grid-template-columns:minmax(0,1fr) minmax(280px,.8fr);gap:14px}.social-console-card{border:1px solid rgba(120,145,170,.22);border-radius:14px;padding:14px;background:rgba(9,24,39,.38)}.social-console-card h3{margin:0 0 10px;font-size:15px}.social-console-row{display:flex;gap:8px;align-items:center;flex-wrap:wrap}.social-console-list{display:grid;gap:8px;margin-top:10px}.social-connection,.social-post-row,.social-learning{border:1px solid rgba(120,145,170,.18);border-radius:10px;padding:10px}.social-connection strong,.social-post-row strong{display:block}.social-mini{font-size:11px;opacity:.72}.social-state{font-size:11px;font-weight:800}.social-state.failed{color:#ff9b94}.social-state.published{color:#86d8a7}.social-draft{border:1px solid rgba(120,145,170,.18);border-radius:10px;padding:10px;margin-top:8px}.social-draft textarea{width:100%;min-height:100px}.social-draft-actions{display:flex;gap:7px;margin-top:8px}.social-wide{grid-column:1/-1}.social-form-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:9px}.social-form-grid .wide{grid-column:1/-1}.social-form-grid input,.social-form-grid textarea,.social-form-grid select{width:100%}.social-empty{padding:14px;border:1px dashed rgba(120,145,170,.28);border-radius:10px;opacity:.72}.social-metric-grid{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:8px}.social-metric-grid article{padding:10px;border:1px solid rgba(120,145,170,.18);border-radius:10px}.social-metric-grid strong{display:block;font-size:20px}@media(max-width:850px){.social-publishing-grid{grid-template-columns:1fr}.social-form-grid{grid-template-columns:1fr}.social-metric-grid{grid-template-columns:repeat(2,1fr)}}
    `;
    document.head.append(style);
  }

  function install() {
    if (!token()) return;
    installRuntimeStyles();
    const nav = document.querySelector('.sidebar nav');
    const content = document.querySelector('.content');
    if (!nav || !content || document.querySelector('[data-section="social"]')) return;

    const navButton = el('button', '', 'nav');
    navButton.type = 'button'; navButton.dataset.section = 'social'; navButton.append(document.createTextNode('◉ '), el('span', 'Social'));
    const placeholder = nav.querySelector('[data-lazy-section="social"]');
    const communication = nav.querySelector('[data-section="communication"]');
    if (placeholder) placeholder.insertAdjacentElement('beforebegin', navButton);
    else if (communication) communication.insertAdjacentElement('afterend', navButton);
    else nav.append(navButton);

    const section = el('section', '', 'section social-admin hidden-panel');
    section.dataset.panel = 'social'; section.id = 'socialAdmin';
    const head = el('div', '', 'social-admin-head');
    const copy = el('div');
    copy.append(el('p','DIRECT CHANNEL OPERATIONS','kicker'), el('h2','소셜 채널 · 게시 운영'), el('p','채널 연결부터 AI 초안, 예약 게시, UTM, 성과 학습까지 직접 운영합니다. 외부 예약 SaaS에 의존하지 않습니다.','operations-copy'));
    const actions = el('div','','social-admin-actions');
    const open = el('a','Social Hub ↗','secondary'); open.href='https://social.ekodi.kr'; open.target='_blank'; open.rel='noopener';
    const refresh = el('button','↻ 새로고침','secondary'); refresh.type='button';
    const save = el('button','등록부 저장','primary'); save.type='button'; save.disabled=true;
    actions.append(open, refresh, save); head.append(copy, actions);

    const tabs = el('div','','social-tabs');
    [['registry','채널 등록부'],['publishing','게시 · 홍보'],['performance','성과 · 학습']].forEach(([key,label]) => {
      const button=el('button',label,'social-tab'); button.type='button'; button.dataset.tab=key;
      button.addEventListener('click',()=>switchTab(key)); tabs.append(button);
    });
    const status = el('p','소셜 운영 데이터를 불러오지 않았습니다.','social-admin-status'); status.setAttribute('role','status');
    const body = el('div','','social-admin-body');
    section.append(head,tabs,status,body); content.append(section);

    function setStatus(message, state='ready') { status.textContent=message; status.dataset.state=state; }
    function tenantOptions() {
      const rows=(registry.organizations||[]).filter(org=>org.isActive!==false);
      return rows.map(org=>[org.id,org.name||org.id]);
    }
    function ensureTenant() {
      const options=tenantOptions();
      if (!activeTenant || !options.some(([id])=>id===activeTenant)) activeTenant=options[0]?.[0]||'';
      return options;
    }

    function renderRegistry() {
      body.replaceChildren();
      const summary=el('div','','social-admin-summary');
      const orgs=registry.organizations||[]; const channels=orgs.flatMap(org=>org.channels||[]);
      [['기관',orgs.length],['활성 기관',orgs.filter(o=>o.isActive!==false).length],['채널',channels.length],['직접 게시 지원',channels.filter(c=>c.isActive!==false&&PUBLISHABLE.has(c.provider)).length]].forEach(([label,value])=>{const card=el('article');card.append(el('small',label),el('strong',String(value)));summary.append(card);});
      const list=el('div','','social-org-list');
      orgs.forEach((org,index)=>list.append(orgCard(org,index)));
      const add=el('button','＋ 기관 추가','ghost social-add-org'); add.type='button';
      add.addEventListener('click',()=>{const id=`org-${Date.now().toString(36)}`;registry.organizations.push({id,name:'새 기관',shortName:'기관',website:'https://',description:'',isActive:true,order:(orgs.length+1)*10,socialPolicy:'inherit_org',channels:[]});markDirty(save,status);renderRegistry();});
      body.append(summary,list,add);
    }

    function channelRow(org,channel,index) {
      const row=el('div','','social-channel-row');
      const provider=select(channel.provider||'other',PROVIDERS.map(v=>[v,v]));
      const label=input(channel.label||''); const url=input(channel.url||'','url','https://…'); const handle=input(channel.handle||'','text','@handle'); const channelId=input(channel.channelId||'','text','channel id'); const active=document.createElement('input'); active.type='checkbox'; active.checked=channel.isActive!==false; const remove=el('button','삭제','ghost danger'); remove.type='button';
      row.append(field('Provider',provider),field('Label',label),field('URL',url,'wide'),field('Handle',handle),field('Channel ID',channelId),field('Active',active,'check'),remove);
      const sync=()=>{channel.provider=provider.value;channel.label=label.value;channel.url=url.value;channel.handle=handle.value;channel.channelId=channelId.value;channel.isActive=active.checked;if(!channel.id)channel.id=`${org.id||'org'}-${provider.value}-${Date.now().toString(36)}`;markDirty(save,status);};
      [provider,label,url,handle,channelId,active].forEach(control=>control.addEventListener(control.tagName==='SELECT'||control.type==='checkbox'?'change':'input',sync));
      remove.addEventListener('click',()=>{org.channels.splice(index,1);markDirty(save,status);renderRegistry();}); return row;
    }

    function orgCard(org,index) {
      const card=el('article','','social-org-card'); const top=el('div','','social-org-card-head'); const title=el('div'); title.append(el('strong',org.name||'새 기관'),el('small',org.id||'new-org')); const remove=el('button','기관 삭제','ghost danger'); remove.type='button'; top.append(title,remove);
      const fields=el('div','','social-org-fields'); const name=input(org.name||''); const id=input(org.id||''); const website=input(org.website||'','url'); const description=input(org.description||''); const policy=select(org.socialPolicy||'inherit_org',[['inherit_org','기관 기본'],['custom','사용자 지정'],['none','숨김']]); const active=document.createElement('input'); active.type='checkbox'; active.checked=org.isActive!==false;
      fields.append(field('Name',name),field('ID',id),field('Website',website,'wide'),field('Description',description,'wide'),field('Policy',policy),field('Active',active,'check'));
      const channelList=el('div','','social-channel-list');(org.channels||[]).forEach((channel,i)=>channelList.append(channelRow(org,channel,i))); const add=el('button','＋ 채널 추가','ghost');add.type='button';add.addEventListener('click',()=>{org.channels||=[];org.channels.push({id:`${org.id||'org'}-other-${Date.now().toString(36)}`,provider:'other',label:'새 채널',url:'https://',isActive:true,order:(org.channels.length+1)*10});markDirty(save,status);renderRegistry();});
      const sync=()=>{org.name=name.value;org.id=slug(id.value)||id.value.trim();org.website=website.value;org.description=description.value;org.socialPolicy=policy.value;org.isActive=active.checked;title.querySelector('strong').textContent=org.name||'새 기관';title.querySelector('small').textContent=org.id||'new-org';markDirty(save,status);};
      [name,id,website,description,policy,active].forEach(control=>control.addEventListener(control.tagName==='SELECT'||control.type==='checkbox'?'change':'input',sync)); remove.addEventListener('click',()=>{if(registry.organizations.length<=1)return setStatus('최소 한 개 기관은 남겨야 합니다.','error');registry.organizations.splice(index,1);markDirty(save,status);renderRegistry();});
      card.append(top,fields,el('h3','Channels'),channelList,add);return card;
    }

    async function loadPublishingData() {
      ensureTenant(); if(!activeTenant){connections=[];posts=[];return;}
      const [connectionData,postData]=await Promise.all([
        api(`/api/control/social/connections?tenantId=${encodeURIComponent(activeTenant)}`),
        api(`/api/control/social/posts?tenantId=${encodeURIComponent(activeTenant)}`),
      ]);
      connections=connectionData.connections||[]; posts=postData.posts||[];
    }

    function tenantPicker(onChange) {
      const picker=select(activeTenant,ensureTenant());
      picker.addEventListener('change',async()=>{activeTenant=picker.value;setStatus('운영 데이터를 불러오는 중입니다.','loading');try{await loadPublishingData();onChange();setStatus('채널 운영 데이터를 불러왔습니다.');}catch(error){setStatus(error.message,'error');}});return picker;
    }

    function connectionCard(connection) {
      const row=el('div','','social-connection');
      row.append(el('strong',`${connection.provider.toUpperCase()} · ${connection.accountName||connection.accountHandle||connection.providerAccountId}`),el('span',connection.status,'social-state'),el('div',`토큰 만료: ${dateLabel(connection.tokenExpiresAt)} · ${connection.scopes||'scope 정보 없음'}`,'social-mini'));
      const disconnect=el('button','연결 해제','ghost danger');disconnect.type='button';disconnect.addEventListener('click',async()=>{try{await api(`/api/control/social/connections/${encodeURIComponent(connection.id)}`,{method:'DELETE'});await loadPublishingData();renderPublishing();setStatus('채널 연결을 해제했습니다.','saved');}catch(error){setStatus(error.message,'error');}});row.append(disconnect);return row;
    }

    async function connectProvider(provider) {
      try {
        setStatus(`${provider==='meta'?'Meta':'YouTube'} 인증을 준비하는 중입니다.`,'loading');
        const data=await api(`/api/control/social/oauth/${provider}/start`,{method:'POST',body:JSON.stringify({tenantId:activeTenant,returnUrl:`${location.origin}${location.pathname}#social`})});
        if(!data.authorizationUrl)throw new Error('OAuth 연결 주소를 받지 못했습니다.');
        location.href=data.authorizationUrl;
      } catch(error){setStatus(error.message,'error');}
    }

    function renderPublishing() {
      body.replaceChildren(); ensureTenant();
      if(!activeTenant){body.append(el('div','먼저 채널 등록부에 기관을 등록해 주세요.','social-empty'));return;}
      const grid=el('div','','social-publishing-grid');
      const connectionsCard=el('article','','social-console-card');connectionsCard.append(el('h3','1. 채널 연결'),field('운영 공간',tenantPicker(renderPublishing)));
      const connectActions=el('div','','social-console-row'); const meta=el('button','Facebook · Instagram 연결','primary');meta.type='button';meta.addEventListener('click',()=>connectProvider('meta'));const youtube=el('button','YouTube 연결','secondary');youtube.type='button';youtube.addEventListener('click',()=>connectProvider('youtube'));connectActions.append(meta,youtube);connectionsCard.append(connectActions);
      const connectionList=el('div','','social-console-list'); if(connections.length)connections.forEach(item=>connectionList.append(connectionCard(item)));else connectionList.append(el('div','아직 직접 연결된 게시 채널이 없습니다.','social-empty'));connectionsCard.append(connectionList);

      const campaignCard=el('article','','social-console-card');campaignCard.append(el('h3','2. 캠페인 · AI 초안'));
      const campaignName=input('','text','예: 에코디몰 발견 캠페인');const destination=input('https://mall.ekodi.kr','url','https://mall.ekodi.kr');const topic=input('','text','홍보할 상품·주제');const benefit=input('','text','사용자가 얻는 핵심 효익');const audience=input('','text','주요 대상');const cta=input('에코디몰에서 확인해 보세요.','text','CTA');const generate=el('button','AI 초안 생성','primary');generate.type='button';
      const draftBox=el('div','','social-console-list');
      campaignCard.append(field('캠페인명',campaignName),field('목적지 URL',destination),field('상품·주제',topic),field('핵심 효익',benefit),field('대상',audience),field('행동 유도',cta),generate,draftBox);
      const renderDrafts=()=>{draftBox.replaceChildren();generatedDrafts.forEach((draft,index)=>{const wrap=el('div','','social-draft');wrap.append(el('strong',draft.provider.toUpperCase()));if(draft.title){const titleInput=input(draft.title);titleInput.addEventListener('input',()=>draft.title=titleInput.value);wrap.append(field('제목',titleInput));}const message=textarea(draft.message);message.addEventListener('input',()=>draft.message=message.value);wrap.append(field('문안',message,'wide'),el('div',draft.guidance||'','social-mini'));const use=el('button','게시 작성기로 보내기','secondary');use.type='button';use.addEventListener('click',()=>{composerProvider.value=draft.provider;composerTitle.value=draft.title||'';composerMessage.value=draft.message||'';setStatus(`${draft.provider} 초안을 게시 작성기에 넣었습니다.`,'ready');});wrap.append(use);draftBox.append(wrap);});};
      generate.addEventListener('click',async()=>{try{generate.disabled=true;setStatus('최근 성과를 반영해 초안을 생성하는 중입니다.','loading');const data=await api('/api/control/social/content/generate',{method:'POST',body:JSON.stringify({tenantId:activeTenant,product:topic.value,topic:topic.value,benefit:benefit.value,audience:audience.value,cta:cta.value,destinationUrl:destination.value,providers:['facebook','instagram','youtube']})});generatedDrafts=data.drafts||[];renderDrafts();setStatus(data.mode==='ai'?`AI 초안 ${generatedDrafts.length}개를 생성했습니다.`:`규칙 기반 안전 초안 ${generatedDrafts.length}개를 생성했습니다. ${data.notice||''}`,'saved');}catch(error){setStatus(error.message,'error');}finally{generate.disabled=false;}});

      const composer=el('article','','social-console-card social-wide');composer.append(el('h3','3. 게시 작성 · 예약'));
      const composerProvider=select('facebook',[['facebook','Facebook'],['instagram','Instagram'],['youtube','YouTube']]);const connectionSelect=select('',[]);const rebuildConnections=()=>{connectionSelect.replaceChildren();connections.filter(c=>c.provider===composerProvider.value&&c.status==='connected').forEach(c=>{const option=el('option',c.accountName||c.accountHandle||c.providerAccountId);option.value=c.id;connectionSelect.append(option);});};composerProvider.addEventListener('change',rebuildConnections);rebuildConnections();const composerTitle=input('','text','YouTube 제목');const composerMessage=textarea('','게시 문안');const assetUrl=input('','url','https://… 이미지/영상 URL');const assetType=select('',[['','없음'],['image','이미지'],['video','영상']]);const scheduleAt=input('','datetime-local');const createPost=el('button','초안 저장','secondary');const schedulePost=el('button','예약 저장','primary');const publishNow=el('button','지금 게시','primary');[createPost,schedulePost,publishNow].forEach(b=>b.type='button');
      const form=el('div','','social-form-grid');form.append(field('Provider',composerProvider),field('연결 계정',connectionSelect),field('제목',composerTitle),field('미디어 형식',assetType),field('게시 문안',composerMessage,'wide'),field('미디어 URL',assetUrl,'wide'),field('예약 시각',scheduleAt),field('목적지',destination));const composerActions=el('div','','social-console-row');composerActions.append(createPost,schedulePost,publishNow);composer.append(form,composerActions);
      async function createAndMaybe(action){try{if(!connectionSelect.value)throw new Error(`${composerProvider.value} 연결 계정을 먼저 선택해 주세요.`);const bodyData={tenantId:activeTenant,connectionId:connectionSelect.value,message:composerMessage.value,title:composerTitle.value,assetUrl:assetUrl.value,assetType:assetType.value,destinationUrl:destination.value,utmCampaign:slug(campaignName.value||topic.value||'social'),metadata:{privacyStatus:'public'}};if(action==='schedule'){if(!scheduleAt.value)throw new Error('예약 시각을 선택해 주세요.');bodyData.scheduledAt=new Date(scheduleAt.value).toISOString();}setStatus('게시 데이터를 안전하게 저장하는 중입니다.','loading');const created=await api('/api/control/social/posts',{method:'POST',body:JSON.stringify(bodyData)});if(action==='publish')await api(`/api/control/social/posts/${encodeURIComponent(created.post.id)}/publish`,{method:'POST',body:'{}'});await loadPublishingData();renderPublishing();setStatus(action==='publish'?'플랫폼 응답을 확인해 게시 결과를 기록했습니다.':action==='schedule'?'예약 게시를 저장했습니다.':'게시 초안을 저장했습니다.','saved');}catch(error){setStatus(error.message,'error');}}
      createPost.addEventListener('click',()=>createAndMaybe('draft'));schedulePost.addEventListener('click',()=>createAndMaybe('schedule'));publishNow.addEventListener('click',()=>createAndMaybe('publish'));

      const queue=el('article','','social-console-card social-wide');queue.append(el('h3','4. 게시 큐 · 결과'));const postList=el('div','','social-console-list');if(!posts.length)postList.append(el('div','아직 게시 기록이 없습니다.','social-empty'));posts.forEach(post=>{const row=el('div','','social-post-row');row.append(el('strong',`${post.provider.toUpperCase()} · ${post.title||post.message.slice(0,70)||'게시물'}`),el('span',stateLabel(post.state),`social-state ${post.state}`),el('div',`예약 ${dateLabel(post.scheduledAt)} · 게시 ${dateLabel(post.publishedAt)} · 시도 ${post.attemptCount||0}`,'social-mini'));if(post.trackedUrl)row.append(el('div',post.trackedUrl,'social-mini'));if(post.lastErrorMessage)row.append(el('div',`${post.lastErrorCode}: ${post.lastErrorMessage}`,'social-mini'));if(post.providerUrl){const link=el('a','게시물 열기 ↗','secondary');link.href=post.providerUrl;link.target='_blank';link.rel='noopener';row.append(link);}if(post.state==='failed'){const retry=el('button','재시도','secondary');retry.type='button';retry.addEventListener('click',async()=>{try{await api(`/api/control/social/posts/${encodeURIComponent(post.id)}/retry`,{method:'POST',body:'{}'});await loadPublishingData();renderPublishing();}catch(error){setStatus(error.message,'error');}});row.append(retry);}postList.append(row);});queue.append(postList);
      grid.append(connectionsCard,campaignCard,composer,queue);body.append(grid);
    }

    async function renderPerformance(load=true) {
      body.replaceChildren();ensureTenant();if(!activeTenant){body.append(el('div','운영 공간을 먼저 선택해 주세요.','social-empty'));return;}
      const shell=el('div','','social-publishing-grid');const controls=el('article','','social-console-card social-wide');const sync=el('button','성과 새로 수집','primary');sync.type='button';controls.append(el('h3','성과 수집 · 학습'),field('운영 공간',tenantPicker(()=>renderPerformance(true))),sync);shell.append(controls);body.append(shell);
      const loadData=async()=>{const data=await api(`/api/control/social/performance?tenantId=${encodeURIComponent(activeTenant)}`);const rows=data.posts||[];const totals={posts:rows.filter(p=>p.state==='published').length,views:rows.reduce((a,p)=>a+Number(p.views||0),0),clicks:rows.reduce((a,p)=>a+Number(p.clicks||0),0),conversions:rows.reduce((a,p)=>a+Number(p.conversions||0),0)};const metrics=el('div','','social-metric-grid social-wide');[['게시',totals.posts],['조회',totals.views],['클릭',totals.clicks],['전환',totals.conversions]].forEach(([label,value])=>{const card=el('article');card.append(el('small',label),el('strong',String(value)));metrics.append(card);});const learningCard=el('article','','social-console-card social-wide');learningCard.append(el('h3','성공 패턴'));if(!(data.learnings||[]).length)learningCard.append(el('div','아직 반복할 만큼의 성과 데이터가 없습니다. 게시 후 성과 수집을 실행하면 패턴이 쌓입니다.','social-empty'));(data.learnings||[]).forEach(item=>{const row=el('div','','social-learning');row.append(el('strong',`${item.provider||'전체'} · 신뢰도 ${Math.round(Number(item.confidence||0)*100)}%`),el('div',item.summary||''),el('div',`갱신 ${dateLabel(item.updated_at)}`,'social-mini'));learningCard.append(row);});shell.append(metrics,learningCard);};
      sync.addEventListener('click',async()=>{try{sync.disabled=true;setStatus('각 플랫폼에서 최신 성과를 수집하는 중입니다.','loading');await api('/api/control/social/metrics/sync',{method:'POST',body:JSON.stringify({tenantId:activeTenant})});await renderPerformance(false);setStatus('최신 성과를 수집하고 학습 패턴을 갱신했습니다.','saved');}catch(error){setStatus(error.message,'error');}finally{sync.disabled=false;}});if(load){try{await loadData();setStatus('성과 데이터를 불러왔습니다.');}catch(error){setStatus(error.message,'error');}}
    }

    async function switchTab(tab) {
      activeTab=tab;tabs.querySelectorAll('.social-tab').forEach(button=>button.classList.toggle('active',button.dataset.tab===tab));
      try {
        if(tab==='registry')renderRegistry();
        else if(tab==='publishing'){setStatus('게시 운영 데이터를 불러오는 중입니다.','loading');await loadPublishingData();renderPublishing();setStatus('게시 운영 데이터를 불러왔습니다.');}
        else {setStatus('성과 데이터를 불러오는 중입니다.','loading');await renderPerformance(true);}
      } catch(error){setStatus(error.message,'error');}
    }

    async function load() {
      refresh.disabled=true;save.disabled=true;setStatus('Social Registry를 불러오는 중입니다.','loading');
      try{const data=await api('/api/control/social/registry');registry=data.registry||{version:3,organizations:[]};revision=Number(data.revision||0);dirty=false;ensureTenant();await switchTab(activeTab);setStatus(`Revision ${revision} · ${data.updatedAt?new Date(data.updatedAt).toLocaleString('ko-KR'):'초기 설정'}`,'ready');}
      catch(error){setStatus(error.message,'error');}finally{refresh.disabled=false;}
    }
    async function saveChanges(){if(!dirty)return;save.disabled=true;setStatus('등록부를 검증하고 저장하는 중입니다.','loading');try{const data=await api('/api/control/social/registry',{method:'PUT',body:JSON.stringify({registry,expectedRevision:revision})});registry=data.registry;revision=Number(data.revision||revision+1);dirty=false;ensureTenant();renderRegistry();setStatus(`저장 완료 · Revision ${revision}`,'saved');}catch(error){setStatus(error.code==='REVISION_CONFLICT'?'다른 관리자 변경이 먼저 저장되었습니다. 새로고침 후 다시 수정해 주세요.':error.message,'error');save.disabled=!dirty;}}
    async function activate(){document.querySelectorAll('[data-panel]').forEach(panel=>{const targets=String(panel.dataset.panel||'').split(' ');panel.classList.toggle('hidden-panel',!targets.includes('social'));});document.querySelectorAll('.sidebar .nav[data-section]').forEach(item=>item.classList.toggle('active',item.dataset.section==='social'));const pageTitle=document.querySelector('#pageTitle');if(pageTitle)pageTitle.textContent='Social';document.querySelector('.sidebar')?.classList.remove('open');if(!registry.organizations.length)await load();else await switchTab(activeTab);}

    navButton.addEventListener('click',activate);refresh.addEventListener('click',load);save.addEventListener('click',saveChanges);window.addEventListener('beforeunload',event=>{if(!dirty)return;event.preventDefault();event.returnValue='';});
  }
  install();
})();
