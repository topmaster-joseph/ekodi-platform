(() => {
  'use strict';
  if (window.EKODIProviderControl) return;

  const API='https://api.ekodi.kr';
  const TOKEN_KEY='ekodi-auth-token';
  const ENVIRONMENTS=['production','staging','development'];
  const SUPABASE_DEFAULTS=[
    {organization:'krxqskyavhrbsuxsjuzv',project:'cheonggye-market',ref:'renzehysxirjilvdxacv',region:'ap-southeast-1',status:'ACTIVE_HEALTHY'},
    {organization:'krxqskyavhrbsuxsjuzv',project:'ekodi-church',ref:'lxcxwbdwwojjkgybbqii',region:'ap-southeast-1',status:'ACTIVE_HEALTHY'},
  ];
  const DEFINITIONS=Object.freeze({
    cloudflare:{label:'Cloudflare',specialist:'infrastructure',levels:['계정','Zone / 도메인','Worker','환경','Secret']},
    github:{label:'GitHub',specialist:'development',levels:['계정 / 조직','Repository','Branch / Environment','환경','Actions Secret']},
    supabase:{label:'Supabase',specialist:'data',levels:['조직','Project','Edge Function / DB','환경','Project Secret']},
  });
  let inventory=null;
  let selection={provider:'cloudflare',account:'',scope:'',runtime:'',environment:'production'};

  const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  function token(){try{return sessionStorage.getItem(TOKEN_KEY)||''}catch{return''}}
  function configuredSupabase(){
    const external=window.EKODI_PROVIDER_BOOTSTRAP?.supabaseProjects;
    return Array.isArray(external)&&external.length?external:SUPABASE_DEFAULTS;
  }
  function normalize(data={}){
    const cf=data.cloudflare||{}; const gh=data.github||{};
    const supabaseProjects=configuredSupabase();
    return {
      cloudflare:{configured:Boolean(cf.configured),accounts:[{id:cf.account?.idMasked||'ekodi',name:cf.account?.name||'EKODI Cloudflare'}],scopes:(cf.zones||[]).map(z=>({id:z.name,name:z.name,status:z.status})),runtimes:(cf.workers||[]).map(w=>({id:w.name,name:w.name,allowed:w.allowed!==false})),secretWrite:Boolean(cf.configured),warning:(cf.warnings||[]).join(', ')},
      github:{configured:Boolean(gh.configured),accounts:[{id:gh.owner||'topmaster-joseph',name:gh.owner||'topmaster-joseph'}],scopes:(gh.repositories||[]).map(r=>({id:r.fullName||r.name,name:r.name,status:r.private?'private':'public',allowed:r.allowed!==false})),runtimes:[],secretWrite:Boolean(gh.secretWrite),warning:gh.warning||''},
      supabase:{configured:supabaseProjects.length>0,accounts:[...new Set(supabaseProjects.map(p=>p.organization))].map(id=>({id,name:id})),scopes:supabaseProjects.map(p=>({id:p.ref,name:p.project,status:p.status,organization:p.organization,region:p.region})),runtimes:[],secretWrite:false,warning:'Secret 쓰기는 전용 최소권한 자격증명 연결 시 활성화'},
    };
  }
  async function load(){
    const auth=token(); let data={};
    if(auth){
      try{
        const response=await fetch(`${API}/api/control/secrets/providers`,{headers:{authorization:`Bearer ${auth}`},cache:'no-store'});
        if(response.ok)data=await response.json();
      }catch(error){console.warn('[EKODI Provider Control] inventory fetch failed',error)}
    }
    inventory=normalize(data); ensureSelection(); renderAll();
    window.dispatchEvent(new CustomEvent('ekodi-provider-inventory',{detail:snapshot()}));
    return snapshot();
  }
  function ensureSelection(){
    const current=inventory?.[selection.provider]||{};
    if(!current.accounts?.some(x=>x.id===selection.account))selection.account=current.accounts?.[0]?.id||'';
    const scopes=current.scopes||[];
    if(!scopes.some(x=>x.id===selection.scope))selection.scope=scopes[0]?.id||'';
    const runtimes=current.runtimes||[];
    if(!runtimes.some(x=>x.id===selection.runtime))selection.runtime=runtimes[0]?.id||'';
  }
  function setSelection(patch={}){selection={...selection,...patch};ensureSelection();renderAll();return snapshot()}
  function snapshot(){return JSON.parse(JSON.stringify({selection,inventory,definitions:DEFINITIONS,environments:ENVIRONMENTS}))}
  function options(rows,value){return rows.length?rows.map(x=>`<option value="${esc(x.id)}" ${x.id===value?'selected':''}>${esc(x.name)}${x.status?` · ${esc(x.status)}`:''}</option>`).join(''):'<option value="">확인 필요</option>'}
  function panel(){
    const p=inventory?.[selection.provider]||{accounts:[],scopes:[],runtimes:[]}; const d=DEFINITIONS[selection.provider];
    const runtimes=p.runtimes?.length?p.runtimes:[{id:'default',name:selection.provider==='github'?'Repository 기본 실행환경':selection.provider==='supabase'?'Project 기본 실행환경':'Worker 확인 필요'}];
    const write=p.secretWrite?'Secret 쓰기 가능':'조회/매핑 가능 · 쓰기 자격증명 필요';
    return `<section class="ekodi-unified-provider" data-ekodi-unified-provider><h3>외부 서비스 통합 관리</h3><div class="ekodi-up-grid">
      <label>서비스<select data-up="provider">${Object.entries(DEFINITIONS).map(([id,x])=>`<option value="${id}" ${id===selection.provider?'selected':''}>${x.label}</option>`).join('')}</select></label>
      <label>${d.levels[0]}<select data-up="account">${options(p.accounts||[],selection.account)}</select></label>
      <label>${d.levels[1]}<select data-up="scope">${options(p.scopes||[],selection.scope)}</select></label>
      <label>${d.levels[2]}<select data-up="runtime">${options(runtimes,selection.runtime||runtimes[0]?.id)}</select></label>
      <label>${d.levels[3]}<select data-up="environment">${ENVIRONMENTS.map(x=>`<option value="${x}" ${x===selection.environment?'selected':''}>${x}</option>`).join('')}</select></label>
      <div class="ekodi-up-status"><strong>${esc(write)}</strong><small>${esc(p.warning||'총괄 AI가 현재 선택 범위를 기준으로 전문 AI와 협업합니다.')}</small></div>
    </div><div class="ekodi-up-note">${d.levels.join(' → ')} 순서로 컨텍스트를 고정합니다. 같은 Secret 이름도 계정·프로젝트·Repository·환경이 다르면 별개로 취급합니다. Production 쓰기·교체·삭제는 Human Gate를 유지합니다.</div></section>`;
  }
  function installStyle(){if(document.querySelector('#ekodiUnifiedProviderStyle'))return;const s=document.createElement('style');s.id='ekodiUnifiedProviderStyle';s.textContent=`.ekodi-unified-provider{margin:12px 0;padding:14px;border:1px solid rgba(148,163,184,.22);border-radius:14px;background:rgba(15,23,42,.56)}.ekodi-unified-provider h3{margin:0 0 10px;font-size:15px}.ekodi-up-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:10px}.ekodi-up-grid label{font-size:11px;opacity:.8}.ekodi-up-grid select{display:block;width:100%;min-height:36px;margin-top:5px;border-radius:9px;border:1px solid rgba(148,163,184,.28);background:#111827;color:#e5e7eb;padding:0 8px}.ekodi-up-status{padding:9px;border-radius:10px;background:rgba(30,41,59,.72)}.ekodi-up-status strong,.ekodi-up-status small{display:block}.ekodi-up-status small,.ekodi-up-note{margin-top:5px;font-size:11px;opacity:.7;line-height:1.45}.ekodi-up-note{margin-top:10px}@media(max-width:760px){.ekodi-up-grid{grid-template-columns:1fr}}`;document.head.appendChild(s)}
  function bind(root){root.querySelectorAll('[data-up]').forEach(el=>el.addEventListener('change',()=>{const key=el.dataset.up;const patch={[key]:el.value};if(key==='provider')Object.assign(patch,{account:'',scope:'',runtime:''});setSelection(patch)}))}
  function renderInto(host){if(!host)return;host.querySelector('[data-ekodi-unified-provider]')?.remove();const wrap=document.createElement('div');wrap.innerHTML=panel();const node=wrap.firstElementChild;host.prepend(node);bind(node)}
  function renderAll(){installStyle();renderInto(document.querySelector('#aiOpsPanel'));const secret=document.querySelector('#ekodiAdminSecretGenerator .admin-secret-auto-card');if(secret)renderInto(secret)}
  const observer=new MutationObserver(()=>{if(inventory)renderAll()});observer.observe(document.documentElement,{childList:true,subtree:true});
  window.EKODIProviderControl=Object.freeze({VERSION:'1.0.0',DEFINITIONS,ENVIRONMENTS,load,setSelection,snapshot});
  window.addEventListener('ekodi-authenticated',load);queueMicrotask(load);
})();
