const API='https://ekodi.kr';
const state=document.querySelector('#sessionState');
const workspace=document.querySelector('#workspace');
const storeForm=document.querySelector('#storeForm');
const bookForm=document.querySelector('#bookForm');
const storeSelect=document.querySelector('#storeSelect');
const storeList=document.querySelector('#storeList');
const bookList=document.querySelector('#bookList');
const refreshButton=document.querySelector('#refreshButton');
const studioLoginUrl=()=>'https://ekodi.kr/auth/?site=publishing&return_to='+encodeURIComponent(location.href);
function showAuthenticated(on){document.documentElement.classList.toggle('publishing-signed-in',on);workspace.hidden=!on;}
let snapshot={stores:[],books:[]};

async function api(path,options={}){
  const response=await fetch(`${API}${path}`,{credentials:'include',...options,headers:{'content-type':'application/json',...(options.headers||{})}});
  const data=await response.json().catch(()=>({}));
  if(!response.ok)throw Object.assign(new Error(data.error||`HTTP ${response.status}`),{status:response.status,code:data.code});
  return data;
}

function escapeHtml(value=''){return String(value).replace(/[&<>'"]/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[ch]));}
function money(value){return Number(value||0)?`${Number(value).toLocaleString('ko-KR')}원`:'가격 미정';}

function render(){
  storeSelect.innerHTML='<option value="">나중에 선택</option>'+snapshot.stores.map(s=>`<option value="${s.id}">${escapeHtml(s.name)}</option>`).join('');
  storeList.innerHTML=snapshot.stores.length?snapshot.stores.map(s=>`<article class="card"><span class="tag">ONLINE STORE</span><h3>${escapeHtml(s.name)}</h3><div class="meta">${escapeHtml(s.description||'소개를 입력하지 않았습니다.')}</div><a href="${s.url}" target="_blank" rel="noopener">서점 열기 ↗</a></article>`).join(''):'<p class="empty">아직 만든 서점이 없습니다.</p>';
  bookList.innerHTML=snapshot.books.length?snapshot.books.map(b=>`<article class="card"><span class="tag">${escapeHtml(b.status)}</span><h3>${escapeHtml(b.title)}</h3><div class="meta">${escapeHtml(b.author)} · ${money(b.priceKrw)} · ${escapeHtml(b.stage)}</div>${b.adminNote?`<div class="meta">검토 메모: ${escapeHtml(b.adminNote)}</div>`:''}</article>`).join(''):'<p class="empty">아직 등록한 책이 없습니다.</p>';
}

async function load(){
  try{
    snapshot=await api('/api/books/me');
    state.textContent=`${snapshot.account.email} 계정으로 연결되었습니다.`;
    showAuthenticated(true);render();
  }catch(error){
    showAuthenticated(false);
    if(error.status===401){
      // The shared site header is not an authorization grant for this studio.
      // Explicitly distinguish a missing central session from a service handoff mismatch.
      let centralSession=false;
      try{
        const response=await fetch('/api/session',{credentials:'include',cache:'no-store'});
        const session=await response.json().catch(()=>({}));
        centralSession=response.ok&&Boolean(session.authenticated);
      }catch{}
      state.replaceChildren();
      const message=document.createElement('span');
      message.textContent=centralSession
        ? '에코디 로그인은 확인되지만 출판 스튜디오 연결이 되지 않았습니다. '
        : '출판 스튜디오 이용을 위해 로그인이 필요합니다. ';
      const signIn=document.createElement('a');
      signIn.href=studioLoginUrl();
      signIn.textContent=centralSession?'계정 연결 다시 확인':'통합 로그인';
      const retry=document.createElement('button');
      retry.type='button';retry.className='ghost';retry.textContent='다시 확인';
      retry.addEventListener('click',load);
      state.append(message,signIn,document.createTextNode(' '),retry);
    }else state.textContent=`연결 오류: ${error.message}`;
  }
}

storeForm.addEventListener('submit',async event=>{
  event.preventDefault();
  const data=Object.fromEntries(new FormData(storeForm));
  try{await api('/api/books/me/stores',{method:'POST',body:JSON.stringify(data)});storeForm.reset();await load();}
  catch(error){alert(error.message);}
});

bookForm.addEventListener('submit',async event=>{
  event.preventDefault();
  const submitter=event.submitter;
  const data=Object.fromEntries(new FormData(bookForm));
  data.status=submitter?.value==='SUBMITTED'?'SUBMITTED':'DRAFT';
  data.storeId=data.storeId?Number(data.storeId):null;
  data.priceKrw=Number(data.priceKrw||0);
  try{await api('/api/books/me/titles',{method:'POST',body:JSON.stringify(data)});bookForm.reset();await load();}
  catch(error){alert(error.message);}
});
refreshButton.addEventListener('click',load);
load();
