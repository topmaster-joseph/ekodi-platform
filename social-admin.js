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
