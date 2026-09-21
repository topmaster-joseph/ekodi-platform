(()=>{
  const root=document.documentElement;
  if(root.dataset.ekodiRegionSurface!=='admin'||!location.pathname.replace(/\/+$/,'').endsWith('/admin/access'))return;
  const API='https://ekodi.kr';
  const SCOPES=[['cheonggye-local','청계잇다 지역플랫폼'],['cheonggye-pass','청계패스']];
  const ROLES=[['owner','책임관리자'],['admin','관리자'],['manager','운영책임자'],['viewer','조회·검수자'],['external_vendor','외부업체'],['external_developer','외부개발자']];
  const $=selector=>document.querySelector(selector);
  const token=()=>sessionStorage.getItem('ekodi-auth-token')||(()=>{try{return JSON.parse(sessionStorage.getItem('ekodi-region-admin-session')||'null')?.accessToken||''}catch{return''}})();
  async function request(path,options={}){
    const headers=new Headers(options.headers||{});const auth=token();if(auth)headers.set('authorization','Bearer '+auth);if(options.body)headers.set('content-type','application/json');
    const response=await fetch(API+path,{...options,headers,cache:'no-store'});const data=await response.json().catch(()=>({}));
    if(!response.ok)throw new Error(data.error||data.code||('http_'+response.status));return data;
  }
  function dateAfter(days){const date=new Date();date.setDate(date.getDate()+days);return date.toISOString().slice(0,10)}
  function renderUsers(users){
    const host=$('[data-region-access-list]');if(!host)return;host.replaceChildren();
    if(!users?.length){const p=document.createElement('p');p.textContent='등록된 권한이 없습니다.';host.append(p);return}
    const table=document.createElement('table');table.innerHTML='<thead><tr><th>사용자</th><th>역할</th><th>상태</th><th>만료</th><th>관리</th></tr></thead>';const body=document.createElement('tbody');
    for(const user of users){
      const row=document.createElement('tr');const status=user.status==='active'?'활성':user.status==='pre_registered'?'Google 인증 대기':user.status==='expired'?'만료':'중지';
      const values=[user.displayName?(user.displayName+' / '+user.email):user.email,user.roleLabel||user.role,status,user.expiresAt?new Date(user.expiresAt).toLocaleDateString('ko-KR'):'-'];
      for(const value of values){const td=document.createElement('td');td.textContent=value;row.append(td)}
      const manage=document.createElement('td');const button=document.createElement('button');button.type='button';button.textContent='권한 회수';button.className='button';button.style.cssText='background:#fff;color:#172c3e;border:1px solid #dce3e8';
      button.onclick=async()=>{if(!confirm(user.email+' 권한을 회수할까요?'))return;button.disabled=true;try{await request('/api/customers/tenants/'+encodeURIComponent($('#regionAccessScope').value)+'/access/revoke',{method:'POST',body:JSON.stringify({email:user.email})});await load()}catch(error){alert(error.message)}finally{button.disabled=false}};
      manage.append(button);row.append(manage);body.append(row);
    }
    table.append(body);host.append(table);
  }
  async function load(){const scope=$('#regionAccessScope')?.value||'cheonggye-local';const data=await request('/api/customers/tenants/'+encodeURIComponent(scope)+'/users');renderUsers(data.users||[])}
  function syncFields(){
    const role=$('#regionAccessRole')?.value||'viewer';const external=role==='external_vendor'||role==='external_developer';const developer=role==='external_developer';
    const expiry=$('#regionAccessExpiry'),github=$('#regionAccessGithub'),wrap=$('[data-external-fields]');if(wrap)wrap.hidden=!external;if(expiry)expiry.required=external;if(github)github.required=developer;if(github&&!developer)github.value='';
  }
  async function ready(event){
    const access=event?.detail||root.__EKODI_REGION_ACCESS__;
    if(!access?.canManageAccess){const main=document.querySelector('main');if(main)main.innerHTML='<section class="hero"><h1>사용자·권한 관리 권한이 없습니다</h1><p class="lead">책임관리자 또는 권한관리 권한이 있는 계정만 이메일을 등록·수정·회수할 수 있습니다.</p></section>';return}
    const scope=$('#regionAccessScope'),role=$('#regionAccessRole');
    for(const item of SCOPES){const option=document.createElement('option');option.value=item[0];option.textContent=item[1];scope.append(option)}
    for(const item of ROLES){const option=document.createElement('option');option.value=item[0];option.textContent=item[1];role.append(option)}
    $('#regionAccessExpiry').value=dateAfter(90);scope.addEventListener('change',load);role.addEventListener('change',syncFields);syncFields();
    $('#regionAccessForm').addEventListener('submit',async event=>{
      event.preventDefault();const submit=$('#regionAccessSubmit');submit.disabled=true;const external=role.value==='external_vendor'||role.value==='external_developer';const expiry=$('#regionAccessExpiry').value;const expiresAt=external&&expiry?new Date(expiry+'T23:59:59+09:00').toISOString():'';
      try{
        await request('/api/customers/tenants/'+encodeURIComponent(scope.value)+'/pre-register',{method:'POST',body:JSON.stringify({displayName:$('#regionAccessName').value.trim(),email:$('#regionAccessEmail').value.trim(),role:role.value,githubUsername:role.value==='external_developer'?$('#regionAccessGithub').value.trim():'',expiresAt})});
        $('#regionAccessResult').textContent='등록했습니다. 같은 이메일의 Google 계정으로 로그인하면 지정된 범위의 메뉴만 열립니다.';event.target.reset();$('#regionAccessExpiry').value=dateAfter(90);syncFields();await load();
      }catch(error){$('#regionAccessResult').textContent=error.message}finally{submit.disabled=false}
    });
    await load();
  }
  document.addEventListener('ekodi:region-access-ready',ready,{once:true});if(root.__EKODI_REGION_ACCESS__)ready({detail:root.__EKODI_REGION_ACCESS__});
})();
