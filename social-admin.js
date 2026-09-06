(() => {
  const API = 'https://api.ekodi.kr';
  const TOKEN_KEY = 'ekodi-auth-token';
  const token = () => sessionStorage.getItem(TOKEN_KEY) || '';
  const providers = ['youtube','instagram','facebook','kakao','blog','threads','live','tiktok','linkedin','other'];
  let revision = 0;
  let registry = { version:3, organizations:[] };
  let dirty = false;

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
      navButton.append(document.createTextNode('◉ '), el('span', 'Social'));
      const communication = nav.querySelector('[data-section="communication"]');
      if (communication?.parentElement) communication.insertAdjacentElement('afterend', navButton);
      else nav.append(navButton);
    }

    const section = el('section', '', 'section social-admin hidden-panel');
    section.dataset.panel = 'social'; section.id = 'socialAdmin';
    const head = el('div', '', 'social-admin-head');
    const copy = el('div');
    copy.append(el('p','CENTRAL CHANNEL REGISTRY','kicker'), el('h2','Social Channels'), el('p','기관별 공식 채널과 노출 정책을 한 곳에서 관리합니다. 저장된 설정은 Social Hub가 자동으로 읽습니다.','operations-copy'));
    const actions = el('div','','social-admin-actions');
    const open = el('a','Open Social ↗','secondary'); open.href='https://social.ekodi.kr'; open.target='_blank'; open.rel='noopener';
    const refresh = el('button','↻ Refresh','secondary'); refresh.type='button';
    const save = el('button','Save changes','primary'); save.type='button'; save.disabled=true;
    actions.append(open, refresh, save); head.append(copy, actions);

    const summary = el('div','','social-admin-summary');
    const status = el('p','Registry를 불러오지 않았습니다.','social-admin-status'); status.setAttribute('role','status');
    const list = el('div','','social-org-list');
    const addOrg = el('button','＋ Add organization','ghost social-add-org'); addOrg.type='button';
    section.append(head, summary, status, list, addOrg); content.append(section);

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
      const pageTitle=document.querySelector('#pageTitle'); if(pageTitle) pageTitle.textContent='Social'; document.querySelector('.sidebar')?.classList.remove('open');
      if (!registry.organizations.length) await load();
    }

    navButton.addEventListener('click',activate); refresh.addEventListener('click',load); save.addEventListener('click',saveChanges);
    addOrg.addEventListener('click',()=>{ const id=`org-${Date.now().toString(36)}`; registry.organizations.push({id,name:'New organization',shortName:'Organization',description:'',website:'https://',isActive:true,order:(registry.organizations.length+1)*10,socialPolicy:'inherit_org',channels:[]}); markDirty(save,status); render(); });
    window.addEventListener('beforeunload',event=>{ if(!dirty)return; event.preventDefault(); event.returnValue=''; });
  }
  install();
})();

(() => {
  'use strict';
  const API='https://api.ekodi.kr';
  const TOKEN_KEY='ekodi-auth-token';
  const MAX_SELECT=25;
  const state={status:null,friends:[],selected:new Set(),history:[]};
  const token=()=>{try{return sessionStorage.getItem(TOKEN_KEY)||'';}catch{return '';}};
  const el=(tag,text='',className='')=>{const n=document.createElement(tag);if(className)n.className=className;if(text)n.textContent=text;return n;};
  async function api(path,options={}){
    const headers=new Headers(options.headers||{});
    if(token())headers.set('authorization',`Bearer ${token()}`);
    if(options.body&&!headers.has('content-type'))headers.set('content-type','application/json');
    const response=await fetch(`${API}${path}`,{...options,headers,cache:'no-store'});
    let data={};try{data=await response.json();}catch{}
    if(!response.ok){const error=new Error(data.error||`API 요청 실패 (${response.status})`);error.code=data.code;error.data=data;throw error;}
    return data;
  }
  function installStyles(){
    if(document.querySelector('#kakaoPersonalAgentStyles'))return;
    const style=document.createElement('style');style.id='kakaoPersonalAgentStyles';style.textContent=`
      .kakao-personal-agent{border:1px solid var(--line,#d9dee8);border-radius:16px;padding:16px;background:linear-gradient(145deg,rgba(255,235,59,.07),rgba(255,255,255,.02));display:grid;gap:14px}
      .kakao-agent-head,.kakao-agent-actions,.kakao-friend-toolbar,.kakao-agent-approval,.kakao-history-head{display:flex;align-items:center;justify-content:space-between;gap:10px;flex-wrap:wrap}
      .kakao-agent-head h3{margin:2px 0 4px;font-size:19px}.kakao-agent-head p{margin:0;opacity:.72;font-size:13px}.kakao-agent-badge{padding:6px 10px;border-radius:999px;background:rgba(100,116,139,.12);font-size:12px;font-weight:800}.kakao-agent-badge[data-state="ready"]{background:rgba(34,197,94,.14)}.kakao-agent-badge[data-state="warn"]{background:rgba(245,158,11,.16)}.kakao-agent-badge[data-state="error"]{background:rgba(239,68,68,.14)}
      .kakao-agent-grid{display:grid;grid-template-columns:minmax(0,.9fr) minmax(360px,1.1fr);gap:14px}.kakao-agent-pane{border:1px solid var(--line,#d9dee8);border-radius:13px;padding:13px;background:rgba(100,116,139,.035);display:grid;gap:10px;align-content:start}.kakao-agent-pane h4{margin:0;font-size:14px}.kakao-agent-field{display:grid;gap:5px}.kakao-agent-field>span{font-size:11px;font-weight:800;opacity:.65}.kakao-agent-field input,.kakao-agent-field textarea,.kakao-friend-toolbar input{width:100%;padding:10px 11px;border:1px solid var(--line,#d9dee8);border-radius:10px;background:var(--panel,#fff);color:inherit;font:inherit}.kakao-agent-field textarea{min-height:118px;resize:vertical}.kakao-char-count{text-align:right;font-size:11px;opacity:.62}.kakao-agent-note{margin:0;font-size:12px;opacity:.7;line-height:1.55}.kakao-agent-status{margin:0;padding:9px 11px;border-radius:10px;background:rgba(100,116,139,.08);font-size:12px}.kakao-agent-status[data-state="error"]{background:rgba(239,68,68,.12)}.kakao-agent-status[data-state="success"]{background:rgba(34,197,94,.12)}
      .kakao-friend-toolbar input{min-width:170px;flex:1}.kakao-friend-list{display:grid;gap:6px;max-height:330px;overflow:auto}.kakao-friend-row{display:grid;grid-template-columns:auto 34px minmax(0,1fr) auto;align-items:center;gap:8px;padding:8px;border:1px solid rgba(100,116,139,.12);border-radius:10px;background:rgba(255,255,255,.035)}.kakao-friend-row img{width:34px;height:34px;border-radius:50%;object-fit:cover}.kakao-friend-avatar{width:34px;height:34px;border-radius:50%;display:grid;place-items:center;background:rgba(100,116,139,.12);font-weight:800}.kakao-friend-row strong{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.kakao-friend-row small{opacity:.62}.kakao-friend-empty{padding:18px;text-align:center;opacity:.6}.kakao-agent-approval{padding:11px;border:1px solid rgba(245,158,11,.22);border-radius:11px;background:rgba(245,158,11,.06)}.kakao-agent-approval label{display:flex;align-items:center;gap:8px;font-size:13px;font-weight:750}.kakao-agent-approval input{width:18px;height:18px}.kakao-history{display:grid;gap:6px}.kakao-history-row{display:grid;grid-template-columns:minmax(130px,1.4fr) repeat(3,minmax(70px,.55fr)) minmax(120px,.9fr);gap:8px;padding:8px 10px;border-radius:9px;background:rgba(100,116,139,.055);font-size:12px}.kakao-history-row strong{text-transform:uppercase}.kakao-history-empty{font-size:12px;opacity:.6}
      @media(max-width:950px){.kakao-agent-grid{grid-template-columns:1fr}.kakao-history-row{grid-template-columns:1fr 1fr}.kakao-history-row span:last-child{grid-column:1/-1}}
      @media(max-width:620px){.kakao-personal-agent{padding:12px}.kakao-friend-row{grid-template-columns:auto 30px minmax(0,1fr)}.kakao-friend-row small{grid-column:3}.kakao-history-row{grid-template-columns:1fr}}
    `;document.head.append(style);
  }
  function install(){
    const section=document.querySelector('#socialAdmin');
    if(!section||section.querySelector('#kakaoPersonalAgent'))return;
    installStyles();
    const root=el('article','','kakao-personal-agent');root.id='kakaoPersonalAgent';
    const head=el('div','','kakao-agent-head');
    const copy=el('div');copy.append(el('p','APPROVAL-GATED CLOUD SEND','kicker'),el('h3','Kakao 개인메시지'),el('p','클라우드가 준비하고, 사람은 내용과 받을 친구를 마지막으로 확인합니다. 친구목록은 저장하지 않습니다.'));
    const headRight=el('div','','kakao-agent-actions');
    const badge=el('span','연결 확인 중','kakao-agent-badge');
    const connect=el('button','카카오 연결','secondary');connect.type='button';
    const disconnect=el('button','연결 해제','ghost');disconnect.type='button';disconnect.hidden=true;
    headRight.append(badge,connect,disconnect);head.append(copy,headRight);

    const grid=el('div','','kakao-agent-grid');
    const compose=el('div','','kakao-agent-pane');compose.append(el('h4','1. 메시지 최종 확인'));
    const linkLabel=el('label','','kakao-agent-field');linkLabel.append(el('span','공유 링크'));
    const link=document.createElement('input');link.type='url';link.placeholder='https://www.youtube.com/watch?v=…';link.autocomplete='off';linkLabel.append(link);
    const messageLabel=el('label','','kakao-agent-field');messageLabel.append(el('span','개인 카톡 메시지 · 최대 200자'));
    const message=document.createElement('textarea');message.maxLength=200;message.placeholder='공유할 이유와 한 문장을 간결하게 적어 주세요.';messageLabel.append(message);
    const count=el('div','0 / 200','kakao-char-count');
    const fill=el('button','기본문구 채우기','ghost');fill.type='button';
    const composeActions=el('div','','kakao-agent-actions');composeActions.append(fill,count);
    compose.append(linkLabel,messageLabel,composeActions,el('p','링크 버튼은 카카오 개발자 설정에서 허용된 웹 도메인만 안정적으로 동작합니다.','kakao-agent-note'));

    const friendsPane=el('div','','kakao-agent-pane');friendsPane.append(el('h4','2. 받을 친구 선택'));
    const toolbar=el('div','','kakao-friend-toolbar');
    const loadFriends=el('button','친구 불러오기','secondary');loadFriends.type='button';
    const search=document.createElement('input');search.type='search';search.placeholder='이름 검색';search.disabled=true;
    const selectedText=el('span','0명 선택','kakao-agent-badge');
    toolbar.append(loadFriends,search,selectedText);
    const friendList=el('div','','kakao-friend-list');friendList.append(el('div','카카오 연결 후 친구를 불러오세요.','kakao-friend-empty'));
    friendsPane.append(toolbar,friendList,el('p',`한 번의 최종 승인으로 최대 ${MAX_SELECT}명까지 선택합니다. 서버는 카카오 제한에 맞춰 5명씩 나눠 보냅니다.`,'kakao-agent-note'));
    grid.append(compose,friendsPane);

    const approval=el('div','','kakao-agent-approval');
    const approvalLabel=document.createElement('label');
    const approve=document.createElement('input');approve.type='checkbox';
    approvalLabel.append(approve,document.createTextNode('메시지와 대상자를 최종 확인했습니다.'));
    const send=el('button','승인하고 개인 카톡 보내기','primary');send.type='button';send.disabled=true;
    approval.append(approvalLabel,send);
    const status=el('p','카카오 연결 상태를 확인합니다.','kakao-agent-status');status.setAttribute('role','status');

    const historyHead=el('div','','kakao-history-head');historyHead.append(el('h4','최근 발송 이력'));
    const refreshHistory=el('button','↻ 이력 새로고침','ghost');refreshHistory.type='button';historyHead.append(refreshHistory);
    const historyList=el('div','','kakao-history');historyList.append(el('div','아직 이력이 없습니다.','kakao-history-empty'));
    root.append(head,grid,approval,status,historyHead,historyList);
    const summary=section.querySelector('.social-admin-summary');
    if(summary)section.insertBefore(root,summary);else section.append(root);

    const resetApproval=()=>{approve.checked=false;updateSendState();};
    const validLink=()=>{try{return new URL(link.value).protocol==='https:';}catch{return false;}};
    function updateSendState(){
      selectedText.textContent=`${state.selected.size}명 선택`;
      send.disabled=!(state.status?.connected&&approve.checked&&state.selected.size>0&&state.selected.size<=MAX_SELECT&&message.value.trim()&&validLink());
    }
    function setStatus(textValue,kind=''){status.textContent=textValue;status.dataset.state=kind;}
    function renderFriends(){
      const query=search.value.trim().toLocaleLowerCase('ko-KR');
      const visible=state.friends.filter(friend=>!query||friend.nickname.toLocaleLowerCase('ko-KR').includes(query));
      friendList.replaceChildren();
      if(!visible.length){friendList.append(el('div',state.friends.length?'검색 결과가 없습니다.':'API에서 조회 가능한 친구가 없습니다.','kakao-friend-empty'));return;}
      visible.forEach(friend=>{
        const row=el('label','','kakao-friend-row');
        const checkbox=document.createElement('input');checkbox.type='checkbox';checkbox.checked=state.selected.has(friend.uuid);
        checkbox.addEventListener('change',()=>{
          if(checkbox.checked&&state.selected.size>=MAX_SELECT){checkbox.checked=false;setStatus(`최대 ${MAX_SELECT}명까지 선택할 수 있습니다.`,'error');return;}
          if(checkbox.checked)state.selected.add(friend.uuid);else state.selected.delete(friend.uuid);
          resetApproval();
        });
        let avatar;
        if(friend.thumbnail){avatar=document.createElement('img');avatar.src=friend.thumbnail;avatar.alt='';avatar.referrerPolicy='no-referrer';}
        else avatar=el('span',friend.nickname.slice(0,1)||'K','kakao-friend-avatar');
        const name=el('strong',friend.nickname);
        const meta=el('small',friend.favorite?'★ 즐겨찾기':'카카오 친구');
        row.append(checkbox,avatar,name,meta);friendList.append(row);
      });
    }
    function renderHistory(){
      historyList.replaceChildren();
      if(!state.history.length){historyList.append(el('div','아직 발송 이력이 없습니다.','kakao-history-empty'));return;}
      state.history.forEach(item=>{
        const row=el('div','','kakao-history-row');
        const when=item.sent_at||item.created_at;
        row.append(el('strong',item.status||'-'),el('span',`대상 ${item.recipient_count||0}`),el('span',`성공 ${item.success_count||0}`),el('span',`실패 ${item.failure_count||0}`),el('span',`${item.link_host||'-'} · ${when?new Date(when).toLocaleString('ko-KR'):'-'}`));
        historyList.append(row);
      });
    }
    async function loadStatus(){
      try{
        const data=await api('/api/control/social/kakao/status');state.status=data;
        if(!data.configured){badge.textContent='서버 설정 필요';badge.dataset.state='warn';connect.disabled=true;disconnect.hidden=true;loadFriends.disabled=true;setStatus(`카카오 Worker Secret 설정이 필요합니다: ${(data.missing||[]).join(', ')}`,'error');}
        else if(data.connected){badge.textContent=data.consentReady?'연결됨':'동의 확인 필요';badge.dataset.state=data.consentReady?'ready':'warn';connect.textContent='다시 연결';connect.disabled=false;disconnect.hidden=false;loadFriends.disabled=false;setStatus(data.consentReady?'카카오가 연결되었습니다. 친구를 불러온 뒤 최종 승인해 보내세요.':'friends · talk_message 동의 상태를 다시 확인해 주세요.',data.consentReady?'success':'error');}
        else{badge.textContent='연결 안 됨';badge.dataset.state='warn';connect.textContent='카카오 연결';connect.disabled=false;disconnect.hidden=true;loadFriends.disabled=true;setStatus('카카오 계정을 연결하면 API에서 조회 가능한 친구에게 개인메시지를 보낼 수 있습니다.');}
        updateSendState();
      }catch(error){badge.textContent='상태 오류';badge.dataset.state='error';connect.disabled=true;loadFriends.disabled=true;setStatus(error.message,'error');}
    }
    async function loadHistory(){
      if(!state.status?.connected){state.history=[];renderHistory();return;}
      try{const data=await api('/api/control/social/kakao/history');state.history=data.history||[];renderHistory();}catch(error){setStatus(error.message,'error');}
    }
    connect.addEventListener('click',async()=>{
      connect.disabled=true;setStatus('카카오 공식 로그인 화면을 준비합니다.');
      try{const data=await api('/api/control/social/kakao/connect',{method:'POST'});if(!data.authorizeUrl)throw new Error('카카오 인증 주소를 받지 못했습니다.');location.assign(data.authorizeUrl);}catch(error){connect.disabled=false;setStatus(error.message,'error');}
    });
    disconnect.addEventListener('click',async()=>{
      if(!window.confirm('카카오 연결을 해제할까요? 저장된 암호화 토큰이 삭제됩니다.'))return;
      disconnect.disabled=true;
      try{await api('/api/control/social/kakao/disconnect',{method:'DELETE'});state.friends=[];state.selected.clear();search.disabled=true;renderFriends();resetApproval();await loadStatus();await loadHistory();}catch(error){setStatus(error.message,'error');}finally{disconnect.disabled=false;}
    });
    loadFriends.addEventListener('click',async()=>{
      loadFriends.disabled=true;setStatus('카카오에서 현재 메시지 전송 가능한 친구를 불러옵니다.');
      try{const data=await api('/api/control/social/kakao/friends?limit=100');state.friends=data.friends||[];state.selected.clear();search.disabled=false;search.value='';renderFriends();resetApproval();setStatus(`${state.friends.length}명의 API 가능 친구를 불러왔습니다. 이 목록은 저장하지 않습니다.`,'success');}catch(error){state.friends=[];renderFriends();setStatus(error.message,'error');}finally{loadFriends.disabled=!state.status?.connected;}
    });
    search.addEventListener('input',renderFriends);
    fill.addEventListener('click',()=>{
      if(!message.value.trim())message.value='함께 나누고 싶은 콘텐츠가 있어 보내드립니다. 확인해 보세요.';
      count.textContent=`${message.value.length} / 200`;resetApproval();message.focus();
    });
    message.addEventListener('input',()=>{count.textContent=`${message.value.length} / 200`;resetApproval();});
    link.addEventListener('input',resetApproval);
    approve.addEventListener('change',updateSendState);
    send.addEventListener('click',async()=>{
      if(send.disabled)return;
      const recipients=[...state.selected];
      send.disabled=true;approve.disabled=true;setStatus(`${recipients.length}명에게 카카오 개인메시지를 전송합니다.`);
      const requestId=globalThis.crypto?.randomUUID?.()||`kakao-${Date.now()}-${Math.random().toString(36).slice(2)}`;
      try{
        const result=await api('/api/control/social/kakao/send',{method:'POST',body:JSON.stringify({requestId,approved:true,recipientUuids:recipients,message:message.value.trim(),linkUrl:link.value.trim()})});
        setStatus(`발송 완료 · 성공 ${result.successCount||0}명 · 실패 ${result.failureCount||0}명`,result.failureCount?'error':'success');
        state.selected.clear();renderFriends();resetApproval();await loadHistory();
      }catch(error){setStatus(error.message,'error');approve.checked=false;updateSendState();}
      finally{approve.disabled=false;updateSendState();}
    });
    refreshHistory.addEventListener('click',loadHistory);

    const query=new URLSearchParams(location.search);
    const oauthResult=query.get('kakao');
    if(oauthResult){
      if(oauthResult==='connected')setStatus('카카오 연결이 완료되었습니다.','success');else if(oauthResult==='cancelled')setStatus('카카오 연결이 취소되었습니다.');else setStatus(`카카오 연결 결과: ${oauthResult}`,'error');
      query.delete('kakao');const next=`${location.pathname}${query.toString()?`?${query}`:''}${location.hash}`;window.history.replaceState(null,'',next);
    }
    const incoming=new URLSearchParams(location.search);
    if(incoming.get('link'))link.value=incoming.get('link').slice(0,1000);
    if(incoming.get('message'))message.value=incoming.get('message').slice(0,200);
    count.textContent=`${message.value.length} / 200`;
    loadStatus().then(loadHistory);
  }
  install();
})();