(() => {
  const API='https://marketing-publish-api.ekodi.kr';
  const section=document.querySelector('#personal-brand');
  if(!section)return;
  const host=document.createElement('div');
  host.id='personalChannelAutomation';
  host.className='recommendation-card';
  host.innerHTML='<small>04 · SHORTS AUTOMATION</small><h3>내 쇼츠 게시 자동화</h3><p data-copy>로그인하면 내 등급과 연결 채널을 확인할 수 있습니다.</p><div data-body></div>';
  const grid=section.querySelector('.recommendation-grid');
  if(grid)grid.append(host);
  const body=host.querySelector('[data-body]'),copy=host.querySelector('[data-copy]');
  const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'})[c]);
  const token=()=>window.EKODI_MY_AUTH?.getAccessToken?.()||'';
  async function api(path,options={}){
    const access=token();if(!access)throw Object.assign(new Error('AUTH_REQUIRED'),{code:'AUTH_REQUIRED'});
    const r=await fetch(API+path,{...options,headers:{'content-type':'application/json',authorization:`Bearer ${access}`,...(options.headers||{})},cache:'no-store'});
    const d=await r.json().catch(()=>({}));if(!r.ok)throw Object.assign(new Error(d.error||`HTTP_${r.status}`),{code:d.error||'API_ERROR',status:r.status,data:d});return d;
  }
  const planLabel=p=>String(p||'free').toUpperCase();
  const channelLabel=c=>`${c.display_name||c.displayName||c.provider} · ${c.provider}`;
  function render(data){
    const e=data.entitlement||{};const connections=data.connections||[];const channels=data.channels||[];
    copy.textContent=`${planLabel(e.plan)} · 자동 게시 채널 ${channels.length}/${Number(e.maxChannels||0)} · 개인 소유`;
    const connectionRows=connections.map(c=>{
      const choices=(c.discoveredChannels||[]).map(ch=>`<button class="secondary" type="button" data-select="${esc(c.id)}" data-channel="${esc(ch.id)}">${esc(ch.title)} 선택</button>`).join(' ');
      return `<div style="margin:10px 0;padding:10px;border:1px solid #e7e9ee;border-radius:10px"><strong>${esc(c.displayName||'YouTube 연결')}</strong><p>${esc(c.status)}</p>${c.status==='selection_required'?choices:''}${c.status==='active'?`<button class="secondary" type="button" data-disconnect="${esc(c.id)}">연결 해제</button>`:''}</div>`;
    }).join('');
    const channelRows=channels.map(c=>`<li>${esc(channelLabel(c))} · ${esc(c.status)}</li>`).join('');
    const capability=e.maxChannels>0?`<button class="primary" type="button" data-connect>Google/YouTube 연결</button>`:'<a class="text-link" href="https://marketing.ekodi.kr/">FLEX 이상에서 채널 자동 게시 사용 →</a>';
    body.innerHTML=`<p><strong>${planLabel(e.plan)}</strong> ${e.immediate?'즉시게시':''} ${e.scheduled?'· 예약':''} ${e.repeating?'· 반복':''} ${e.autonomous?'· AI 자동':''}</p>${capability}${channelRows?`<ul>${channelRows}</ul>`:''}${connectionRows}`;
    bind();
  }
  function bind(){
    body.querySelector('[data-connect]')?.addEventListener('click',connect);
    body.querySelectorAll('[data-select]').forEach(btn=>btn.addEventListener('click',()=>select(btn.dataset.select,btn.dataset.channel)));
    body.querySelectorAll('[data-disconnect]').forEach(btn=>btn.addEventListener('click',()=>disconnect(btn.dataset.disconnect)));
  }
  async function connect(){
    try{const d=await api('/v1/oauth/youtube/start?subject_type=person',{method:'POST',body:JSON.stringify({returnTo:location.origin+location.pathname+'#personal-brand'})});location.assign(d.authorizeUrl)}catch(e){copy.textContent=e.code==='CHANNEL_PLAN_UPGRADE_REQUIRED'?'FLEX 이상 등급에서 채널을 연결할 수 있습니다.':'YouTube 연결을 시작하지 못했습니다.'}
  }
  async function select(id,channel){try{await api(`/v1/oauth/connections/${encodeURIComponent(id)}/select?subject_type=person`,{method:'POST',body:JSON.stringify({externalAccountId:channel})});await load()}catch(e){copy.textContent=e.code==='CHANNEL_PLAN_LIMIT_REACHED'?'현재 등급의 채널 연결 한도에 도달했습니다.':'채널 선택을 완료하지 못했습니다.'}}
  async function disconnect(id){try{await api(`/v1/oauth/connections/${encodeURIComponent(id)}/disconnect?subject_type=person`,{method:'POST',body:'{}'});await load()}catch{copy.textContent='채널 연결 해제를 완료하지 못했습니다.'}}
  async function load(){
    if(!token()){copy.textContent='로그인하면 내 등급과 연결 채널을 확인할 수 있습니다.';body.innerHTML='';return}
    copy.textContent='내 쇼츠 자동화 상태를 확인하고 있습니다.';
    try{render(await api('/v1/automation?subject_type=person'))}catch(e){copy.textContent=e.code==='CHANNEL_SCHEMA_NOT_READY'?'쇼츠 자동화 운영 승격을 준비하고 있습니다.':'쇼츠 자동화 상태를 확인하지 못했습니다.';body.innerHTML=''}
  }
  window.addEventListener('ekodi:my-session',load);
  window.addEventListener('pageshow',load);
  setTimeout(load,0);
})();
