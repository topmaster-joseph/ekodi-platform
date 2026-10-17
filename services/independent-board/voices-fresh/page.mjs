
/**
 * Fresh citizen page: intentionally independent of legacy boardPage and
 * queue/publish polling. Existing EKODI shell/header is reused, not the old UI.
 */
const content = '<div class="notice-search"><label for="freshSearch">의견 검색</label><input id="freshSearch" type="search" placeholder="내용 검색"></div>'+
  '<p id="freshStatus" role="status" aria-live="polite"></p>'+
  '<form id="freshForm" hidden><label for="freshMessage">시민의견</label><textarea id="freshMessage" maxlength="12000" rows="6" required placeholder="의견을 작성해 주세요."></textarea><div class="admin-actions"><button type="submit">등록</button><button id="freshCancel" type="button" class="secondary">취소</button></div></form>'+
  '<section id="freshList" aria-label="등록된 시민의견"></section>';
export const freshVoiceClient = String.raw`
(async()=>{
  const el=id=>document.getElementById(id),form=el('freshForm'),status=el('freshStatus'),list=el('freshList'),search=el('freshSearch');
  const root=location.pathname.startsWith('/seonammedi/board/')?'/seonammedi/board':'/board';
  const api=root+'/api/voices-fresh',KEY='sb-renzehysxirjilvdxacv-auth-token';
  const storageList=()=>[localStorage,sessionStorage];
  let posts=[],adminAllowed=false;
  const readSessions=()=>{const list=[];for(const st of storageList())try{const d=JSON.parse(st.getItem(KEY)||'null'),s=d?.currentSession||d?.session||d;if(s?.access_token)list.push({s,st})}catch{}return list.sort((a,b)=>Number(b.s.expires_at||0)-Number(a.s.expires_at||0))};
  async function accessToken(){
    const sessions=readSessions(),now=Math.floor(Date.now()/1000);
    const fresh=sessions.find(x=>Number(x.s.expires_at||0)>now+30);
    if(fresh)return fresh.s.access_token;
    const item=sessions.find(x=>x.s.refresh_token);if(!item)return '';
    try{
      const response=await fetch('https://renzehysxirjilvdxacv.supabase.co/auth/v1/token?grant_type=refresh_token',{method:'POST',headers:{apikey:'sb_publishable_0QjB0WzZbjrd-FJ5D5cR7A_xUkXyOY_','content-type':'application/json'},body:JSON.stringify({refresh_token:item.s.refresh_token}),cache:'no-store'});
      const data=await response.json().catch(()=>null);if(!response.ok||!data?.access_token)return '';
      const next={access_token:data.access_token,refresh_token:data.refresh_token||item.s.refresh_token,expires_at:Number(data.expires_at||0)||now+Number(data.expires_in||3600)};
      item.st.setItem(KEY,JSON.stringify(next));return next.access_token;
    }catch{return ''}
  }
  async function request(route,opts={}){
    const r=await fetch(api+route,{cache:'no-store',...opts}),d=await r.json().catch(()=>({}));
    if(!r.ok||d.ok===false)throw Error(d.error||'request_failed');
    return d;
  }
  async function session(){
    const token=await accessToken();
    if(!token)return null;
    try{const r=await fetch(root+'/api/auth/session',{headers:{authorization:'Bearer '+token},cache:'no-store'});const d=await r.json().catch(()=>({}));return r.ok&&d?.authenticated===true&&d?.provider==='google'?token:null}catch{return null}
  }
  function beginLogin(){
    const dest=new URL(location.href);
    dest.hash='';dest.searchParams.set('compose','1');dest.searchParams.delete('auth_attempt');dest.searchParams.delete('choose_account');
    const url=new URL('https://ekodi.kr/auth/');
    url.searchParams.set('site','seonammedi');url.searchParams.set('direct','1');
    url.searchParams.set('purpose','seonammedi-board-write');url.searchParams.set('select_account','1');
    url.searchParams.set('return_to',dest.href);
    location.assign(url.href);
  }
  function message(value){status.textContent=value}
  function showEditor(){form.hidden=false;el('freshMessage').focus()}
  function closeEditor(){form.hidden=true;form.reset()}
  const btn=document.getElementById('freshWrite');
  btn.addEventListener('click',async()=>{
    btn.disabled=true;
    try{if(await session()){showEditor();return}message('글쓰기를 위해 Google 계정을 선택해 주세요.');beginLogin()}
    finally{btn.disabled=false}
  });
  el('freshCancel').addEventListener('click',closeEditor);
  function render(){
    list.replaceChildren();
    const q=search.value.trim().toLowerCase(),shown=posts.filter(p=>!q||p.message.toLowerCase().includes(q));
    if(!shown.length){const p=document.createElement('p');p.textContent='등록된 시민의견이 없습니다.';list.append(p);return}
    for(const item of shown){
      const details=document.createElement('details');details.className='board-row notice-record';
      const summary=document.createElement('summary');summary.className='row-head';
      const title=document.createElement('strong');title.textContent=item.message.slice(0,75)+(item.message.length>75?'…':'');
      const date=document.createElement('small');date.textContent=(item.createdAt||'').slice(0,16).replace('T',' ');
      summary.append(title,date);details.append(summary);
      const body=document.createElement('p');body.className='row-body';body.style.whiteSpace='pre-wrap';body.textContent=item.message;details.append(body);
      if(adminAllowed){
        const actions=document.createElement('div');actions.className='admin-actions';
        const edit=document.createElement('button');edit.type='button';edit.textContent='수정';
        edit.onclick=async()=>{const next=prompt('수정할 의견',item.message);if(next===null||!next.trim())return;try{await adminEdit(item.id,next);message('수정되었습니다.')}catch(e){message(e.message)}};
        const remove=document.createElement('button');remove.type='button';remove.className='secondary';remove.textContent='삭제';
        remove.onclick=async()=>{if(!confirm('이 의견을 삭제하시겠습니까?'))return;try{await adminDelete(item.id);message('삭제되었습니다.')}catch(e){message(e.message)}};
        actions.append(edit,remove);details.append(actions);
      }
      list.append(details);
    }
  }
  async function reload(){
    const d=await request(''+(search.value?'?q='+encodeURIComponent(search.value):''));
    posts=d.items||[];render();
  }
  async function adminCheck(){
    const token=await session();if(!token)return;
    try{
      const r=await request('/admin',{headers:{authorization:'Bearer '+token}});
      adminAllowed=Array.isArray(r.items);render();
    }catch{adminAllowed=false}
  }
  async function adminEdit(id,value){
    const t=await session();if(!t)throw Error('login_required');
    await request('/'+id,{method:'PUT',headers:{authorization:'Bearer '+t,'content-type':'application/json'},body:JSON.stringify({message:value.trim()})});
    await reload();
  }
  async function adminDelete(id){
    const t=await session();if(!t)throw Error('login_required');
    await request('/'+id,{method:'DELETE',headers:{authorization:'Bearer '+t}});
    await reload();
  }
  async function waitUntilPublished(created){
    if(!created?.queued||!/^[a-f0-9-]{36}$/i.test(created.submissionId||''))throw Error('저장 접수 확인 실패');
    for(let attempt=0;attempt<20;attempt++){
      await new Promise(resolve=>setTimeout(resolve,750));
      const latest=await request('/submissions/'+created.submissionId);
      if(latest.status==='published'&&Number.isSafeInteger(Number(latest.id))&&Number(latest.id)>0)return Number(latest.id);
    }
    throw Error('등록 요청은 접수됐지만 저장 완료를 아직 확인하지 못했습니다. 다시 등록하지 말고 잠시 후 목록을 확인해 주세요.');
  }
  form.addEventListener('submit',async event=>{
    event.preventDefault();const submit=form.querySelector('button[type=submit]');submit.disabled=true;
    try{
      const t=await session();if(!t){message('Google 로그인 확인이 필요합니다.');return}
      const body=el('freshMessage').value.trim();if(!body)throw Error('의견을 입력해 주세요.');
      message('저장 중입니다.');
      const saved=await request('',{method:'POST',headers:{authorization:'Bearer '+t,'content-type':'application/json'},body:JSON.stringify({message:body})});
      const savedId=await waitUntilPublished(saved);
      await reload();
      if(!posts.some(p=>p.id===savedId))throw Error('저장됐지만 목록에서 확인되지 않았습니다. 다시 등록하지 말고 목록을 새로고침해 주세요.');
      closeEditor();message('의견이 저장됐습니다.');
    }catch(e){message(e.message||'저장 오류')}finally{submit.disabled=false}
  });
  search.addEventListener('input',()=>{render()});
  try{
    await reload();await adminCheck();
    if(new URLSearchParams(location.search).get('compose')==='1'){
      if(await session()){showEditor();message('Google 로그인 확인 완료. 의견을 작성해 주세요.')}
      else message('Google 로그인 상태가 확인되지 않았습니다. 글쓰기 버튼으로 계정을 선택해 주세요.');
    }
  }catch(e){message('목록을 불러오지 못했습니다: '+e.message)}
})();
`;
export function renderFreshVoicePage(req,shell){
  return shell(req,'voices','시민의견','CITIZEN VOICES','누구나 읽을 수 있으며 Google 로그인 후 간단히 의견을 등록할 수 있습니다.',
    '<button id="freshWrite" type="button">글쓰기</button>',content,
    freshVoiceClient);
}
