
/**
 * Fresh citizen page: intentionally independent of legacy boardPage and
 * queue/publish polling. Existing EKODI shell/header is reused, not the old UI.
 */
const content = '<style>body.board-voices .notice-search{display:flex;align-items:center;gap:10px;flex-wrap:wrap;margin:10px 0}body.board-voices .notice-search label{font-weight:600;font-size:13px}body.board-voices .notice-search input{flex:1 1 220px;max-width:420px;min-height:36px;border:1px solid #cbd5e1;border-radius:6px;padding:7px 10px;box-sizing:border-box}body.board-voices #freshStatus{font-size:13px;margin:8px 0}body.board-voices #freshStatus:empty{display:none}body.board-voices #freshForm{margin:12px 0;padding:14px;border:1px solid #d7dfe8;border-radius:8px}body.board-voices #freshForm[hidden]{display:none}body.board-voices #freshMessage{display:block;box-sizing:border-box;width:100%;min-height:140px;margin:8px 0;padding:10px;border:1px solid #cbd5e1;border-radius:6px}body.board-voices #freshTitle{display:block;box-sizing:border-box;width:100%;min-height:40px;margin:6px 0 10px;padding:8px 10px;border:1px solid #cbd5e1;border-radius:6px;font-weight:600}body.board-voices .row-body a{color:#1d4ed8;text-decoration:underline;overflow-wrap:anywhere;word-break:break-all}body.board-voices .voice-actions{display:flex;flex-wrap:wrap;align-items:center;gap:8px;margin-top:10px}body.board-voices .voice-actions button{margin:0}body.board-voices .reply-count{margin-left:6px;color:#1d4ed8;font-size:13px;font-weight:600}body.board-voices .voice-replies{margin:12px 0 0;padding:0 0 0 12px;border-left:3px solid #e2e8f0}body.board-voices .voice-replies:empty{display:none}body.board-voices .voice-reply{padding:8px 0;border-bottom:1px solid #f1f5f9}body.board-voices .voice-reply-head{display:flex;align-items:center;gap:8px;font-size:12px;color:#64748b}body.board-voices .voice-reply-head button{margin:0 0 0 auto;min-height:28px;padding:2px 10px;font-size:12px}body.board-voices .voice-reply-body{margin:4px 0 0;white-space:pre-wrap;overflow-wrap:anywhere}body.board-voices .voice-reply-body a{color:#1d4ed8;text-decoration:underline;word-break:break-all}body.board-voices .voice-reply-form{margin-top:10px}body.board-voices .voice-reply-form textarea{display:block;box-sizing:border-box;width:100%;min-height:80px;margin:0 0 8px;padding:8px 10px;border:1px solid #cbd5e1;border-radius:6px}body.board-voices .voice-reply-form[hidden]{display:none}body.board-voices details.is-shared>summary{outline:2px solid #2b6cb0;outline-offset:2px;border-radius:6px}</style>'+
  '<div class="notice-search"><label for="freshSearch">의견 검색</label><input id="freshSearch" type="search" placeholder="제목·내용 검색"></div>'+
  '<p id="freshStatus" role="status" aria-live="polite"></p>'+
  '<form id="freshForm" hidden><label for="freshTitle">제목</label><input id="freshTitle" type="text" maxlength="160" required placeholder="제목을 입력해 주세요."><label for="freshMessage">시민의견</label><textarea id="freshMessage" maxlength="12000" rows="6" required placeholder="의견을 작성해 주세요."></textarea><div class="admin-actions"><button type="submit">등록</button><button id="freshCancel" type="button" class="secondary">취소</button></div></form>'+
  '<section id="freshList" aria-label="등록된 시민의견"></section>';
export const freshVoiceClient = String.raw`
(async()=>{
  const el=id=>document.getElementById(id),form=el('freshForm'),status=el('freshStatus'),list=el('freshList'),search=el('freshSearch');
  const root=location.pathname.startsWith('/seonammedi/board/')?'/seonammedi/board':'/board';
  const api=root+'/api/voices-fresh',KEY='sb-renzehysxirjilvdxacv-auth-token';
  const storageList=()=>{const items=[];try{items.push(localStorage)}catch{}try{items.push(sessionStorage)}catch{}return items};
  let posts=[],adminAllowed=false,replyOpenFor=0,replyDraft='';
  const openIds=new Set();
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
  const attemptKey='ekodi:seonammedi:voices:login-once:'+location.pathname;
  async function finishHandoff(){
    const params=new URLSearchParams(location.hash.replace(/^#/,''));
    const tokenHash=params.get('ekodi_token');if(!tokenHash)return;
    const type=params.get('ekodi_type')||'email';
    // Erase the one-time credential before the first network request.
    history.replaceState(null,'',location.pathname+location.search);
    if(type!=='email')throw Error('지원되지 않는 로그인 확인 방식입니다.');
    const response=await fetch('https://renzehysxirjilvdxacv.supabase.co/auth/v1/verify',{
      method:'POST',headers:{apikey:'sb_publishable_0QjB0WzZbjrd-FJ5D5cR7A_xUkXyOY_','content-type':'application/json'},
      body:JSON.stringify({token_hash:tokenHash,type}),cache:'no-store',referrerPolicy:'no-referrer'
    });
    const data=await response.json().catch(()=>({}));
    if(!response.ok||!data?.access_token)throw Error('Google 인증값을 세션으로 연결하지 못했습니다. 글쓰기로 다시 시도해 주세요.');
    const savedSession=JSON.stringify({
      access_token:data.access_token,refresh_token:data.refresh_token||'',
      expires_at:Number(data.expires_at||0)||Math.floor(Date.now()/1000)+Number(data.expires_in||3600),user:data.user||null
    });
    let saved=false;
    // Keep both browser storage scopes in sync. A stale token in the other
    // scope must not win over a fresh, Google-verified handoff after reload.
    for(const st of storageList())try{st.setItem(KEY,savedSession);saved=true}catch{}
    if(!saved)throw Error('브라우저에서 로그인 정보를 저장할 수 없습니다. 사이트 저장소 설정을 확인해 주세요.');
    try{sessionStorage.removeItem(attemptKey)}catch{}
  }
  function autoLoginOnce(){
    // Same-origin, per-tab guard: a cancelled/failed handoff must not loop.
    try{
      if(sessionStorage.getItem(attemptKey)==='1')return false;
      sessionStorage.setItem(attemptKey,'1');
    }catch{return false}
    beginLogin();return true;
  }
  async function session(){
    const token=await accessToken();
    // Old EKODI/Supabase logins can coexist in local and session storage.
    // Verify each candidate on the server instead of treating the first
    // unexpired token as authoritative. Never infer privileges from storage.
    const candidates=[token,...readSessions().map(item=>item.s.access_token)].filter(Boolean);
    for(const candidate of new Set(candidates)){
      try{
        const r=await fetch(root+'/api/auth/session',{headers:{authorization:'Bearer '+candidate},cache:'no-store'});
        const d=await r.json().catch(()=>({}));
        if(r.ok&&d?.authenticated===true&&(d?.provider==='ekodi'||d?.provider==='google'))return candidate;
      }catch{}
    }
    return null;
  }
  function beginLogin(replyTo){
    const dest=new URL(location.href);
    dest.hash='';
    if(replyTo){dest.searchParams.set('reply',String(replyTo));dest.searchParams.delete('compose')}else dest.searchParams.set('compose','1');dest.searchParams.delete('auth_attempt');dest.searchParams.delete('choose_account');
    const url=new URL('https://ekodi.kr/auth/');
    url.searchParams.set('site','seonammedi');url.searchParams.set('direct','1');
    url.searchParams.set('purpose','seonammedi-board-write');url.searchParams.set('select_account','1');
    url.searchParams.set('return_to',dest.href);
    location.assign(url.href);
  }
  function message(value){status.textContent=value}
  function showEditor(){form.hidden=false;el('freshTitle').focus()}
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
    const q=search.value.trim().toLowerCase(),shown=posts.filter(p=>!q||p.message.toLowerCase().includes(q)||String(p.title||'').toLowerCase().includes(q));
    if(!shown.length){const p=document.createElement('p');p.textContent='등록된 시민의견이 없습니다.';list.append(p);return}
    for(const item of shown){
      const replies=Array.isArray(item.replies)?item.replies:[];
      const details=document.createElement('details');details.className='board-row notice-record';details.id='voice-'+item.id;
      details.open=openIds.has(item.id);
      details.addEventListener('toggle',()=>{if(details.open)openIds.add(item.id);else openIds.delete(item.id)});
      const summary=document.createElement('summary');summary.className='row-head';
      const heading=voiceTitle(item);
      const title=document.createElement('strong');title.textContent=heading;
      if(replies.length){const count=document.createElement('span');count.className='reply-count';count.textContent='['+replies.length+']';title.append(count)}
      const date=document.createElement('small');date.textContent=(item.createdAt||'').slice(0,16).replace('T',' ');
      summary.append(title,date);details.append(summary);
      const body=document.createElement('p');body.className='row-body';body.style.whiteSpace='pre-wrap';appendLinkedText(body,String(item.message||''));details.append(body);
      // One row: 답글 · 공유 · (관리자) 수정 · 삭제
      const actions=document.createElement('div');actions.className='voice-actions';
      const replyBtn=document.createElement('button');replyBtn.type='button';replyBtn.className='secondary voice-reply-toggle';replyBtn.textContent='답글';
      replyBtn.onclick=()=>openReply(item.id);
      const share=document.createElement('button');share.type='button';share.className='secondary voice-share';share.textContent='공유';
      share.onclick=()=>shareVoice(item);
      actions.append(replyBtn,share);
      if(adminAllowed){
        const edit=document.createElement('button');edit.type='button';edit.className='voice-edit';edit.textContent='수정';
        edit.onclick=async()=>{const nextTitle=prompt('수정할 제목',item.title||'');if(nextTitle===null)return;const next=prompt('수정할 의견',item.message);if(next===null||!next.trim())return;try{await adminEdit(item.id,next,nextTitle);message('수정되었습니다.')}catch(e){message(e.message)}};
        const remove=document.createElement('button');remove.type='button';remove.className='secondary voice-delete';remove.textContent='삭제';
        remove.onclick=async()=>{if(!confirm('이 의견을 삭제하시겠습니까?'))return;try{await adminDelete(item.id);message('삭제되었습니다.')}catch(e){message(e.message)}};
        actions.append(edit,remove);
      }
      details.append(actions);
      const thread=document.createElement('div');thread.className='voice-replies';thread.setAttribute?.('aria-label','답글');
      for(const r of replies){
        const row=document.createElement('div');row.className='voice-reply';row.id='voice-reply-'+r.id;
        const head=document.createElement('div');head.className='voice-reply-head';
        const label=document.createElement('strong');label.textContent='답글';
        const when=document.createElement('small');when.textContent=String(r.createdAt||'').slice(0,16).replace('T',' ');
        head.append(label,when);
        if(adminAllowed){
          const del=document.createElement('button');del.type='button';del.className='secondary';del.textContent='삭제';
          del.onclick=async()=>{if(!confirm('이 답글을 삭제하시겠습니까?'))return;try{await adminDeleteReply(r.id);message('답글이 삭제되었습니다.')}catch(e){message(e.message)}};
          head.append(del);
        }
        const text=document.createElement('p');text.className='voice-reply-body';appendLinkedText(text,String(r.message||''));
        row.append(head,text);thread.append(row);
      }
      details.append(thread);
      if(replyOpenFor===item.id)details.append(replyForm(item.id));
      list.append(details);
    }
    openSharedVoice();
  }
  // Citizen text stays text: only http(s) URLs become anchors, built via DOM (no innerHTML).
  function appendLinkedText(node,text){
    const re=/https?:\/\/[^\s<>"']+/g;let last=0,m;
    while((m=re.exec(text))){
      let url=m[0];while(/[.,;:!?)\]}]$/.test(url))url=url.slice(0,-1);
      if(m.index>last)node.append(text.slice(last,m.index));
      let safe=null;try{const u=new URL(url);if(u.protocol==='http:'||u.protocol==='https:')safe=u.href}catch{}
      if(safe){const a=document.createElement('a');a.href=safe;a.target='_blank';a.rel='noopener noreferrer nofollow ugc';a.textContent=url;node.append(a)}else node.append(url);
      last=m.index+url.length;re.lastIndex=last;
    }
    if(last<text.length)node.append(text.slice(last));
  }
  function replyForm(voiceId){
    const box=document.createElement('form');box.className='voice-reply-form';
    const area=document.createElement('textarea');area.maxLength=2000;area.rows=3;area.placeholder='답글을 작성해 주세요.';area.value=replyDraft;
    area.setAttribute?.('aria-label','답글 내용');
    area.addEventListener('input',()=>{replyDraft=area.value});
    const row=document.createElement('div');row.className='voice-actions';
    const send=document.createElement('button');send.type='submit';send.textContent='답글 등록';
    const cancel=document.createElement('button');cancel.type='button';cancel.className='secondary';cancel.textContent='취소';
    cancel.onclick=()=>{replyOpenFor=0;replyDraft='';render()};
    row.append(send,cancel);box.append(area,row);
    box.addEventListener('submit',async event=>{event.preventDefault();send.disabled=true;try{await submitReply(voiceId,area.value)}finally{send.disabled=false}});
    setTimeout(()=>{try{area.focus()}catch{}},0);
    return box;
  }
  async function openReply(voiceId){
    if(await session()){replyOpenFor=voiceId;openIds.add(voiceId);render();return}
    message('답글을 쓰려면 Google 계정을 선택해 주세요.');beginLogin(voiceId);
  }
  async function submitReply(voiceId,value){
    try{
      const text=String(value||'').trim();if(!text)throw Error('답글을 입력해 주세요.');
      const t=await session();if(!t){message('Google 로그인 확인이 필요합니다.');beginLogin(voiceId);return}
      message('답글을 저장 중입니다.');
      const saved=await request('/'+voiceId+'/replies',{method:'POST',headers:{authorization:'Bearer '+t,'content-type':'application/json'},body:JSON.stringify({message:text})});
      const replyId=await waitUntilPublished(saved,'/replies/submissions/');
      replyOpenFor=0;replyDraft='';openIds.add(voiceId);
      await reload();
      const parent=posts.find(p=>p.id===voiceId);
      if(!parent||!(parent.replies||[]).some(r=>r.id===replyId))throw Error('답글은 저장됐지만 목록에서 확인되지 않았습니다. 다시 등록하지 말고 새로고침해 주세요.');
      message('답글이 등록됐습니다.');
    }catch(e){message(e.message||'답글 저장 오류')}
  }
  function voiceTitle(item){const t=String(item.title||'').trim();if(t)return t;const first=String(item.message||'').split('\n')[0].trim();return first.slice(0,75)+(first.length>75?'…':'')}
  function voiceUrl(id){const u=new URL(location.href);u.hash='';u.search='';u.searchParams.set('id',String(id));return u.href}
  async function shareVoice(item){
    const url=voiceUrl(item.id),title=voiceTitle(item);
    try{if(navigator.share){await navigator.share({title:title+' · 시민의견',text:title,url});return}}catch(e){if(e&&e.name==='AbortError')return}
    try{await navigator.clipboard.writeText(url);message('공유 링크를 복사했습니다.')}catch{prompt('아래 링크를 복사해 공유해 주세요.',url)}
  }
  let sharedOpened=false;
  function openSharedVoice(){
    if(sharedOpened)return;const id=new URLSearchParams(location.search).get('id');if(!/^\d{1,12}$/.test(id||''))return;
    const target=document.getElementById('voice-'+id);if(!target)return;
    sharedOpened=true;target.open=true;target.classList.add('is-shared');target.scrollIntoView({block:'center'});
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
  async function adminEdit(id,value,titleValue){
    const t=await session();if(!t)throw Error('login_required');
    await request('/'+id,{method:'PUT',headers:{authorization:'Bearer '+t,'content-type':'application/json'},body:JSON.stringify({title:String(titleValue||'').trim(),message:value.trim()})});
    await reload();
  }
  async function adminDelete(id){
    const t=await session();if(!t)throw Error('login_required');
    await request('/'+id,{method:'DELETE',headers:{authorization:'Bearer '+t}});
    await reload();
  }
  async function adminDeleteReply(id){
    const t=await session();if(!t)throw Error('login_required');
    await request('/replies/'+id,{method:'DELETE',headers:{authorization:'Bearer '+t}});
    await reload();
  }
  async function waitUntilPublished(created,statusRoute='/submissions/'){
    if(!created?.queued||!/^[a-f0-9-]{36}$/i.test(created.submissionId||''))throw Error('저장 접수 확인 실패');
    for(let attempt=0;attempt<20;attempt++){
      await new Promise(resolve=>setTimeout(resolve,750));
      const latest=await request(statusRoute+created.submissionId);
      if(latest.status==='published'&&Number.isSafeInteger(Number(latest.id))&&Number(latest.id)>0)return Number(latest.id);
    }
    throw Error('등록 요청은 접수됐지만 저장 완료를 아직 확인하지 못했습니다. 다시 등록하지 말고 잠시 후 목록을 확인해 주세요.');
  }
  form.addEventListener('submit',async event=>{
    event.preventDefault();const submit=form.querySelector('button[type=submit]');submit.disabled=true;
    try{
      const t=await session();if(!t){message('Google 로그인 확인이 필요합니다.');return}
      const titleValue=el('freshTitle').value.replace(/\s+/g,' ').trim();if(!titleValue)throw Error('제목을 입력해 주세요.');
      const body=el('freshMessage').value.trim();if(!body)throw Error('의견을 입력해 주세요.');
      message('저장 중입니다.');
      const saved=await request('',{method:'POST',headers:{authorization:'Bearer '+t,'content-type':'application/json'},body:JSON.stringify({title:titleValue,message:body})});
      const savedId=await waitUntilPublished(saved);
      await reload();
      if(!posts.some(p=>p.id===savedId))throw Error('저장됐지만 목록에서 확인되지 않았습니다. 다시 등록하지 말고 목록을 새로고침해 주세요.');
      closeEditor();message('의견이 저장됐습니다.');
    }catch(e){message(e.message||'저장 오류')}finally{submit.disabled=false}
  });
  search.addEventListener('input',()=>{render()});
  let handoffError='';
  try{await finishHandoff()}catch(e){handoffError=e.message||'인증 복귀 오류'}
  try{
    await reload();await adminCheck();
    const replyIntent=Number(new URLSearchParams(location.search).get('reply')||0);
    if(Number.isSafeInteger(replyIntent)&&replyIntent>0&&posts.some(p=>p.id===replyIntent)){
      if(await session()){
        try{sessionStorage.removeItem(attemptKey)}catch{}
        replyOpenFor=replyIntent;openIds.add(replyIntent);render();
        document.getElementById('voice-'+replyIntent)?.scrollIntoView?.({block:'center'});
        message('Google 로그인 확인 완료. 답글을 작성해 주세요.');
      }else if(handoffError)message('Google 로그인 복귀에 실패했습니다: '+handoffError);
    }else if(new URLSearchParams(location.search).get('compose')==='1'){
      if(await session()){
        try{sessionStorage.removeItem(attemptKey)}catch{}
        showEditor();message('Google 로그인 확인 완료. 의견을 작성해 주세요.');
      }else if(handoffError){
        message('Google 로그인 복귀에 실패했습니다: '+handoffError);
      }else{
        message('Google 로그인이 필요합니다. 계정 선택창을 여는 중입니다.');
        if(!autoLoginOnce())message('Google 로그인 상태가 확인되지 않았습니다. 글쓰기 버튼으로 계정을 선택해 주세요.');
      }
    }else if(handoffError)message('Google 로그인 복귀에 실패했습니다: '+handoffError);
  }catch(e){message('목록을 불러오지 못했습니다: '+e.message)}
})();
`;
export function renderFreshVoicePage(req,shell){
  return shell(req,'voices','시민의견','CITIZEN VOICES','누구나 읽을 수 있으며 Google 로그인 후 간단히 의견을 등록할 수 있습니다.',
    '<button id="freshWrite" type="button">글쓰기</button>',content,
    freshVoiceClient);
}
