(() => {
  'use strict';
  const SECTION='member-login-methods';
  const URL='https://renzehysxirjilvdxacv.supabase.co';
  const PUBLIC_KEY='sb_publishable_0QjB0WzZbjrd-FJ5D5cR7A_xUkXyOY_';
  const API=URL+'/functions/v1/identity-api';
  const LINK='https://ekodi.kr/auth/?manage=1';
  let clientPromise, selected=null, canManage=false, loading=false;

  async function accessToken(){
    if(!clientPromise)clientPromise=import('https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm')
      .then(({createClient})=>createClient(URL,PUBLIC_KEY,{auth:{persistSession:true}}));
    const client=await clientPromise;
    const {data}=await client.auth.getSession();
    if(data?.session?.access_token)return data.session.access_token;
    const fallback=sessionStorage.getItem('ekodi-auth-token')||'';
    return fallback.split('.').length===3?fallback:'';
  }
  async function api(path,options={}){
    const bearer=await accessToken();
    if(!bearer)throw new Error('통합 로그인 후 이용할 수 있습니다.');
    const response=await fetch(API+path,{...options,cache:'no-store',
      headers:{apikey:PUBLIC_KEY,Authorization:'Bearer '+bearer,
        ...(options.body?{'content-type':'application/json'}:{}),...(options.headers||{})}});
    const body=await response.json().catch(()=>({}));
    if(!response.ok)throw Object.assign(new Error(body.error||'요청 실패'),{status:response.status});
    return body;
  }
  const text=(tag,content,className='')=>{
    const e=document.createElement(tag);e.textContent=String(content??'');if(className)e.className=className;return e;
  };
  const button=(label,action)=>{const e=text('button',label);e.type='button';e.addEventListener('click',action);return e;};
  function panel(){
    let element=document.getElementById('ekodiMemberLoginMethods');
    if(element)return element;
    const root=document.querySelector('#app .content');if(!root)return null;
    element=document.createElement('section');element.id='ekodiMemberLoginMethods';
    element.className='section ekodi-member-login-methods';element.dataset.panel=SECTION;element.hidden=true;
    element.innerHTML='<header><div><p class="kicker">IDENTITY & ACCOUNT SECURITY</p><h2>회원 로그인 수단</h2><p>연결된 로그인 수단을 확인합니다. 사이트 관리자는 자기 사이트 회원만 조회할 수 있습니다.</p></div><a href="'+LINK+'" target="_blank" rel="noopener noreferrer">본인 연결 안내</a></header><form data-search><label for="memberLoginSearch">이름·이메일·EKODI ID 검색</label><div class="member-login-search"><input id="memberLoginSearch" name="query" minlength="3" maxlength="100" required autocomplete="off" placeholder="3자 이상 입력"><button type="submit">검색</button></div></form><p role="status" data-status></p><div data-results></div><div data-detail></div>';
    root.append(element);
    element.querySelector('[data-search]').addEventListener('submit',async e=>{
      e.preventDefault();const q=element.querySelector('input[name=query]').value.trim();await search(q);
    });
    return element;
  }
  function ensureStyle(){
    if(document.getElementById('ekodiMemberLoginsStyle'))return;
    const s=document.createElement('style');s.id='ekodiMemberLoginsStyle';
    s.textContent=`.ekodi-member-login-methods{width:100%;max-width:1280px;margin:0 auto;color:#26384c}
    .ekodi-member-login-methods header{display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap}
    .ekodi-member-login-methods header h2{margin:0 0 4px}
    .ekodi-member-login-methods header p:last-child{margin:0 0 10px;color:#65758a}
    .ekodi-member-login-methods a{color:#0c62b7}
    .ekodi-member-login-methods form{margin:12px 0}
    .ekodi-member-login-methods label{font-size:13px;font-weight:700}
    .member-login-search{display:flex;gap:8px;margin-top:6px}
    .member-login-search input{flex:1;min-width:0;min-height:40px;padding:9px;border:1px solid #d4dfec;border-radius:9px}
    .ekodi-member-login-methods button{min-height:35px;padding:7px 12px;border:1px solid #b6cae0;border-radius:9px;background:#fff;color:#194c81;cursor:pointer}
    .ekodi-member-login-methods button:disabled{opacity:.5;cursor:not-allowed}
    .member-login-person,.member-login-identity,.member-login-merge{display:flex;align-items:center;gap:12px;justify-content:space-between;padding:12px;border:1px solid #dce4ef;border-radius:10px;margin:8px 0;background:#fff;flex-wrap:wrap}
    .member-login-person strong,.member-login-identity strong{display:block}
    .member-login-person small,.member-login-identity small{display:block;color:#596d83}
    .member-login-person-actions{display:flex;gap:6px;flex-wrap:wrap}
    .member-login-badge{display:inline-block;border-radius:999px;background:#eef5fd;color:#235c90;padding:3px 8px;font-size:12px}
    .member-login-badge.primary{background:#dfeede;color:#2c6539}
    .member-login-login-methods-empty{padding:18px;color:#5d6f84}
    .member-login-stepup{position:fixed;inset:0;z-index:20000;display:grid;place-items:center;background:rgba(4,17,32,.7);padding:16px}
    .member-login-stepup>div{background:#fff;color:#243950;border-radius:14px;padding:24px;max-width:460px;width:100%;display:grid;gap:12px}
    @media(max-width:600px){.member-login-search{flex-wrap:wrap}.member-login-search input{flex-basis:100%}}`;
    document.head.append(s);
  }
  function status(msg){const s=panel()?.querySelector('[data-status]');if(s)s.textContent=msg;}
  async function search(query){
    if(loading)return;loading=true;status('검색 중입니다.');
    const root=panel(),target=root?.querySelector('[data-results]');
    try{
      const data=await api('/admin/persons?query='+encodeURIComponent(query));
      canManage=data.canManage===true;target.replaceChildren();
      const people=data.people||[];
      if(!people.length)target.append(text('p','조회 권한이 있는 회원이 검색되지 않았습니다.','member-login-login-methods-empty'));
      for(const person of people){
        const row=text('article','','member-login-person');
        const info=text('div');info.append(text('strong',person.displayName||'이름 없음'),
          text('small',person.ekodiId||''));row.append(info,button('로그인 수단 보기',()=>details(person.id)));
        target.append(row);
      }
      status(people.length+'명 조회 · '+(canManage?'최고관리자: 해제·되돌리기 가능':'사이트 관리자: 조회 전용'));
    }catch(e){status('조회 실패: '+e.message);target?.replaceChildren();}
    finally{loading=false;}
  }
  async function details(personId){
    selected=personId;const target=panel()?.querySelector('[data-detail]');if(!target)return;
    status('로그인 수단을 조회 중입니다.');
    try{
      const data=await api('/admin/persons/'+encodeURIComponent(personId)+'/identities');
      if(selected!==personId)return;
      target.replaceChildren();
      const head=text('h3',(data.person.displayName||'회원')+' · '+(data.person.ekodiId||''));target.append(head);
      const linkActions=text('div','','member-login-person-actions');
      linkActions.append(text('a','본인 연결 안내 링크'));
      const anchor=linkActions.querySelector('a');anchor.href=LINK;anchor.target='_blank';anchor.rel='noopener noreferrer';
      if(data.canManage)linkActions.append(button('연결 안내 보내기',()=>sendGuide(personId)));
      target.append(linkActions);
      const rows=data.identities||[];
      for(const identity of rows){
        const row=text('article','','member-login-identity');
        const info=text('div');info.append(text('strong',identity.provider||'로그인'),
          text('small',identity.email),text('small','연결일 '+(identity.linkedAt?new Date(identity.linkedAt).toLocaleDateString('ko-KR'):'확인 필요')));
        const tags=text('div','','member-login-person-actions');
        tags.append(text('span',identity.isPrimary?'기본 로그인':identity.status==='active'?'연결됨':'해제됨',
          'member-login-badge'+(identity.isPrimary?' primary':'')));
        if(data.canManage&&identity.status==='active'){
          const disabled=identity.isPrimary||rows.filter(x=>x.status==='active').length<=1;
          const unlink=button('해제',()=>perform('disconnect',identity.id));
          unlink.disabled=disabled;
          unlink.title=identity.isPrimary?'기본 로그인을 먼저 변경해야 합니다.':disabled?'마지막 로그인은 해제할 수 없습니다.':'';
          tags.append(unlink);
        }
        row.append(info,tags);target.append(row);
      }
      for(const merge of data.merges||[]){
        const row=text('article','','member-login-merge');
        row.append(text('span','계정 합치기 · '+(merge.executedAt?new Date(merge.executedAt).toLocaleDateString('ko-KR'):'실행됨')));
        if(data.canManage)row.append(button('합치기 되돌리기',()=>perform('revert',merge.id)));
        target.append(row);
      }
      status('로그인 수단 '+rows.length+'건 · '+(data.canManage?'최고관리자':'읽기 전용'));
    }catch(e){status('조회 실패: '+e.message);target.replaceChildren();}
  }
  async function sendGuide(id){
    if(!canManage)return;
    try{const result=await api('/admin/persons/'+id+'/send-link',{method:'POST'});
      status(result.notification==='sent'?'연결 안내 전송 완료':'연결 안내 전송 확인필요: 알림 채널이나 발송 설정을 확인하십시오.');
    }catch(e){status('안내 전송 실패: '+e.message);}
  }
  async function stepUp(){
    const challenge=await api('/admin/step-up/challenge',{method:'POST'});
    if(!window.google?.accounts?.id){
      await new Promise((resolve,reject)=>{
        const s=document.createElement('script');s.src='https://accounts.google.com/gsi/client';s.async=true;
        s.onload=resolve;s.onerror=()=>reject(new Error('Google 인증 로드 실패'));document.head.append(s);
      });
    }
    const overlay=text('section','','member-login-stepup');const card=text('div');
    card.append(text('h3','Google 재인증'),text('p','현재 최고관리자의 Google 계정으로 다시 인증하십시오. 인증 후 15분 동안 변경할 수 있습니다.'));
    const host=text('div'),state=text('p','Google 버튼을 선택하십시오.');
    card.append(host,state);overlay.append(card);document.body.append(overlay);
    return new Promise((resolve,reject)=>{
      let settled=false;
      const finish=(error)=>{if(settled)return;settled=true;overlay.remove();error?reject(error):resolve();};
      card.append(button('취소',()=>finish(new Error('인증 취소'))));
      window.google.accounts.id.initialize({client_id:challenge.clientId,nonce:challenge.nonce,auto_select:false,
        callback:async response=>{
          try{await api('/admin/step-up/verify',{method:'POST',body:JSON.stringify({nonce:challenge.nonce,credential:response.credential})});finish();}
          catch(e){state.textContent='Google 재인증 실패: '+e.message;}
        }});
      window.google.accounts.id.renderButton(host,{theme:'outline',size:'large',type:'standard',text:'signin_with'});
    });
  }
  async function perform(kind,id){
    if(!canManage)return;
    const reason=window.prompt(kind==='disconnect'?'해제 사유(5자 이상)를 입력하십시오.':'합치기 되돌리기 사유(5자 이상)를 입력하십시오.');
    if(!reason||reason.trim().length<5){status('사유를 5자 이상 입력해야 합니다.');return;}
    if(!window.confirm('로그인 수단만 변경됩니다. 결제·구독·포인트는 유지됩니다. 실행하시겠습니까?'))return;
    const url=kind==='disconnect'?'/admin/identities/'+encodeURIComponent(id):
      '/admin/merge-requests/'+encodeURIComponent(id)+'/revert';
    const method=kind==='disconnect'?'DELETE':'POST';
    const request=()=>api(url,{method,body:JSON.stringify({reason:reason.trim()})});
    try{
      let result;
      try{result=await request();}
      catch(e){if(e.status!==401)throw e;await stepUp();result=await request();}
      status('변경 완료 · 알림 '+(result.notification==='sent'?'전송됨':'확인필요'));
      await details(selected);
      if(result.notification!=='sent')status('변경 완료 · 본인 알림 확인필요');
    }catch(e){status('실행 실패: '+e.message);}
  }
  function boot(){ensureStyle();panel();if(location.hash==='#'+SECTION)load();}
  async function load(){panel();status('회원 이름이나 이메일을 검색하십시오.');}
  window.EKODIMemberLoginMethods=Object.freeze({load});
  window.addEventListener('ekodi-admin-section-changed',e=>{if(e.detail?.section===SECTION)load();});
  window.addEventListener('ekodi-admin-ready',boot);
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else boot();
})();
