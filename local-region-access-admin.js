function clientMain(){
  const root=document.documentElement;
  const cleanPath=location.pathname.replace(/\/+$/,'');
  const accessPage=cleanPath.endsWith('/admin/access');
  const summaryHost=document.querySelector('[data-region-admin-summary-list]');
  if(root.dataset.ekodiRegionSurface!=='admin'||(!accessPage&&!summaryHost))return;
  const API='https://ekodi.kr';
  const SCOPES=[['cheonggye-local','청계잇다 지역플랫폼'],['cheonggye-pass','청계패스']];
  const REGION_ROLES=[['admin','관리자'],['manager','운영책임자'],['viewer','조회·검수자']];
  const PASS_ROLES=[...REGION_ROLES,['external_vendor','외부업체'],['external_developer','외부개발자']];
  const ADMIN_ROLES=new Set(['owner','admin','manager','tenant_admin','workspace_admin','client_admin','store_owner','senior_pastor']);
  const ROLE_LABELS=new Map([['owner','책임관리자'],...PASS_ROLES]);
  const $=selector=>document.querySelector(selector);
  let currentDirectory=null;
  const token=()=>sessionStorage.getItem('ekodi-auth-token')||(()=>{try{return JSON.parse(sessionStorage.getItem('ekodi-region-admin-session')||'null')?.accessToken||''}catch{return''}})();
  async function request(path,options={}){
    const headers=new Headers(options.headers||{});const auth=token();if(auth)headers.set('authorization','Bearer '+auth);if(options.body)headers.set('content-type','application/json');
    const response=await fetch(API+path,{...options,headers,cache:'no-store'});const data=await response.json().catch(()=>({}));
    if(!response.ok)throw new Error(data.error||data.code||('http_'+response.status));return data;
  }
  function dateAfter(days){const date=new Date();date.setDate(date.getDate()+days);return date.toISOString().slice(0,10)}
  function renderSummaryUsers(users,scope){
    if(!summaryHost)return;
    const administrators=(users||[]).filter(user=>ADMIN_ROLES.has(user.role));
    summaryHost.replaceChildren();
    if(!administrators.length){const p=document.createElement('p');p.className='muted';p.textContent='등록된 관리자가 없습니다.';summaryHost.append(p);return}
    const table=document.createElement('table');table.innerHTML='<thead><tr><th>관리자</th><th>권한</th><th>상태</th></tr></thead>';const body=document.createElement('tbody');
    for(const user of administrators){const row=document.createElement('tr');const status=user.status==='active'?'활성':user.status==='pre_registered'?'Google 인증 대기':user.status==='expired'?'만료':'중지';const name=document.createElement('td');name.innerHTML='<strong></strong><div class="muted"></div>';name.querySelector('strong').textContent=user.displayName||user.email;name.querySelector('.muted').textContent=user.email;const role=document.createElement('td');role.textContent=user.roleLabel||ROLE_LABELS.get(user.role)||user.role;const state=document.createElement('td');state.textContent=status;row.append(name,role,state);body.append(row)}
    table.append(body);summaryHost.append(table);
    const note=document.createElement('p');note.className='muted';note.textContent='권한 설정은 역할 계층에 따라 허용되며 본인·동급·상위 관리자는 보호됩니다.';summaryHost.append(note);
  }
  function roleOptions(user){
    const options=Array.isArray(user.assignableRoles)?user.assignableRoles:[];
    return options.map(item=>'<option value="'+item.role+'" '+(item.role===user.role?'selected':'')+'>'+item.label+'</option>').join('');
  }
  function renderUsers(users){
    const host=$('[data-region-access-list]');if(!host)return;host.replaceChildren();
    const administrators=(users||[]).filter(user=>ADMIN_ROLES.has(user.role));
    if(!administrators.length){const p=document.createElement('p');p.textContent='등록된 관리자가 없습니다.';host.append(p);return}
    const table=document.createElement('table');table.innerHTML='<thead><tr><th>관리자</th><th>권한</th><th>상태</th><th>최근 로그인</th><th>권한 설정</th></tr></thead>';const body=document.createElement('tbody');
    for(const user of administrators){
      const row=document.createElement('tr');const status=user.status==='active'?'활성':user.status==='pre_registered'?'Google 인증 대기':user.status==='expired'?'만료':'중지';
      const name=document.createElement('td');name.innerHTML='<strong></strong><div class="muted"></div>';name.querySelector('strong').textContent=user.displayName||user.email;name.querySelector('.muted').textContent=user.email;row.append(name);
      const roleCell=document.createElement('td'),statusCell=document.createElement('td'),loginCell=document.createElement('td'),manage=document.createElement('td');
      if(user.canManage&&user.assignableRoles?.length){
        const inactive=['disabled','expired'].includes(user.status);
        const select=document.createElement('select');select.innerHTML=roleOptions(user);select.value=user.role;roleCell.append(select);
        const save=document.createElement('button');save.type='button';save.className='button';save.textContent='저장';
        save.onclick=async()=>{save.disabled=true;try{await request('/api/customers/tenants/'+encodeURIComponent($('#regionAccessScope').value)+'/access/update',{method:'POST',body:JSON.stringify({email:user.email,role:select.value,status:user.status==='disabled'?'disabled':'active'})});await load()}catch(error){alert(error.message)}finally{save.disabled=false}};
        const toggle=document.createElement('button');toggle.type='button';toggle.className='button';toggle.textContent=inactive?'재활성':'중지';
        toggle.onclick=async()=>{toggle.disabled=true;try{const scope=encodeURIComponent($('#regionAccessScope').value);if(inactive){const payload={email:user.email,role:select.value,status:'active'};if(user.status==='expired')payload.expiresAt='';await request('/api/customers/tenants/'+scope+'/access/update',{method:'POST',body:JSON.stringify(payload)})}else{await request('/api/customers/tenants/'+scope+'/access/revoke',{method:'POST',body:JSON.stringify({email:user.email})})}await load()}catch(error){alert(error.message)}finally{toggle.disabled=false}};
        manage.append(save,toggle);
      }else{roleCell.textContent=user.roleLabel||ROLE_LABELS.get(user.role)||user.role;const protectedTag=document.createElement('span');protectedTag.className='status';protectedTag.textContent=user.email===root.dataset.regionEmail?'본인':'보호됨';manage.append(protectedTag)}
      statusCell.textContent=status;loginCell.textContent=user.lastLoginAt?new Date(user.lastLoginAt).toLocaleString('ko-KR'):'아직 로그인 전';row.append(roleCell,statusCell,loginCell,manage);body.append(row);
    }
    table.append(body);host.append(table);
  }
  async function load(){
    const scope=$('#regionAccessScope')?.value||'cheonggye-local';
    currentDirectory=await request('/api/customers/directory?tenant='+encodeURIComponent(scope));
    renderUsers(currentDirectory.members||[]);
    return currentDirectory;
  }
  function syncFields(){
    const role=$('#regionAccessRole')?.value||'viewer';const external=role==='external_vendor'||role==='external_developer';const developer=role==='external_developer';
    const expiry=$('#regionAccessExpiry'),github=$('#regionAccessGithub'),wrap=$('[data-external-fields]');if(wrap)wrap.hidden=!external;if(expiry)expiry.required=external;if(github)github.required=developer;if(github&&!developer)github.value='';
  }
  async function ready(event){
    const access=event?.detail||root.__EKODI_REGION_ACCESS__;
    if(!accessPage){
      if(!access?.canManageAccess){summaryHost?.closest('section')?.remove();return}
      const summaryScope=cleanPath.startsWith('/cheonggye/admin/pass')?'cheonggye-pass':'cheonggye-local';
      try{const data=await request('/api/customers/directory?tenant='+encodeURIComponent(summaryScope));renderSummaryUsers(data.members||[],summaryScope)}catch(error){if(summaryHost)summaryHost.innerHTML='<p class="muted">'+error.message+'</p>'}
      return;
    }
    if(!access?.canManageAccess){const main=document.querySelector('main');if(main)main.innerHTML='<section class="hero"><h1>사용자·권한 관리 권한이 없습니다</h1><p class="lead">책임관리자 또는 권한관리 권한이 있는 계정만 이메일을 등록·수정·회수할 수 있습니다.</p></section>';return}
    const scope=$('#regionAccessScope'),role=$('#regionAccessRole');
    for(const item of SCOPES){const option=document.createElement('option');option.value=item[0];option.textContent=item[1];scope.append(option)}
    const requestedScope=new URLSearchParams(location.search).get('scope');
    if(SCOPES.some(item=>item[0]===requestedScope))scope.value=requestedScope;
    const syncRoles=()=>{
      const selected=role.value;role.replaceChildren();
      const allowed=new Set((currentDirectory?.authority?.assignableRoles||[]).map(item=>item.role));
      const roles=(scope.value==='cheonggye-pass'?PASS_ROLES:REGION_ROLES).filter(item=>allowed.has(item[0]));
      if(allowed.has('owner'))roles.unshift(['owner','책임관리자']);
      for(const item of roles){const option=document.createElement('option');option.value=item[0];option.textContent=item[1];role.append(option)}
      if([...role.options].some(option=>option.value===selected))role.value=selected;
      $('#regionAccessSubmit').disabled=!role.options.length;
      syncFields();
    };
    $('#regionAccessExpiry').value=dateAfter(90);
    scope.addEventListener('change',async()=>{await load();syncRoles()});
    role.addEventListener('change',syncFields);
    $('#regionAccessForm').addEventListener('submit',async event=>{
      event.preventDefault();const submit=$('#regionAccessSubmit');submit.disabled=true;const external=role.value==='external_vendor'||role.value==='external_developer';const expiry=$('#regionAccessExpiry').value;const expiresAt=external&&expiry?new Date(expiry+'T23:59:59+09:00').toISOString():'';
      try{
        await request('/api/customers/tenants/'+encodeURIComponent(scope.value)+'/pre-register',{method:'POST',body:JSON.stringify({displayName:$('#regionAccessName').value.trim(),email:$('#regionAccessEmail').value.trim(),role:role.value,githubUsername:role.value==='external_developer'?$('#regionAccessGithub').value.trim():'',expiresAt})});
        $('#regionAccessResult').textContent='등록했습니다. 같은 이메일의 Google 계정으로 로그인하면 지정된 범위의 메뉴만 열립니다.';event.target.reset();$('#regionAccessExpiry').value=dateAfter(90);await load();syncRoles();
      }catch(error){$('#regionAccessResult').textContent=error.message}finally{submit.disabled=!role.options.length}
    });
    await load();syncRoles();
  }
  document.addEventListener('ekodi:region-access-ready',ready,{once:true});if(root.__EKODI_REGION_ACCESS__)ready({detail:root.__EKODI_REGION_ACCESS__});
}

export function localRegionAccessAdminScript(){
  return new Response('('+clientMain.toString()+')();',{headers:{'content-type':'text/javascript; charset=utf-8','cache-control':'no-store','x-content-type-options':'nosniff'}});
}
