const API=new URL('https://ekodi.kr/api/');
const state=document.querySelector('#sessionState');
const workspace=document.querySelector('#workspace');
const storeForm=document.querySelector('#storeForm');
const bookForm=document.querySelector('#bookForm');
const storeSelect=document.querySelector('#storeSelect');
const storeList=document.querySelector('#storeList');
const bookList=document.querySelector('#bookList');
const refreshButton=document.querySelector('#refreshButton');
const tabButtons=[...document.querySelectorAll('[data-studio-tab]')];
const tabPanels=[...document.querySelectorAll('[data-studio-panel]')];
const TOKEN_KEY=/^sb-renzehysxirjilvdxacv-auth-token(?:\.\d+)?$/;
const STAGES={MANUSCRIPT:'원고 준비',EDITING:'편집',PRODUCTION:'제작'};
const STATUSES={DRAFT:'초안',SUBMITTED:'출간 검토 중',PUBLISHED:'출간 완료',REJECTED:'수정 요청'};
let snapshot={stores:[],books:[]};

function memberToken(){
  // A browser token is only a transport credential. The API verifies it independently.
  try{
    for(let i=0;i<localStorage.length;i++){
      const key=localStorage.key(i)||'';
      if(!TOKEN_KEY.test(key))continue;
      const raw=JSON.parse(localStorage.getItem(key)||'null');
      const session=raw?.currentSession||raw?.session||raw;
      const token=String(session?.access_token||'');
      const expiry=Number(session?.expires_at||0)*1000;
      if(session?.user?.id&&token&&Number.isFinite(expiry)&&expiry>Date.now()+15000)return token;
    }
  }catch{}
  return '';
}
async function api(path,options={}){
  const token=memberToken();
  const headers={accept:'application/json',...(options.body?{'content-type':'application/json'}:{}),...(token?{authorization:'Bearer '+token}:{}),...(options.headers||{})};
  const response=await fetch(new URL(path,API),{credentials:'include',cache:'no-store',...options,headers});
  const data=await response.json().catch(()=>({}));
  if(!response.ok)throw Object.assign(new Error(data.error||data.code||'HTTP '+response.status),{status:response.status,code:data.code});
  return data;
}
function escapeHtml(value=''){return String(value).replace(/[&<>'"]/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[ch]));}
function money(value){return Number(value)>0?Number(value).toLocaleString('ko-KR')+'원':'가격 미정';}
function selectTab(name,{updateUrl=true}={}){
  const tab=tabButtons.some(button=>button.dataset.studioTab===name)?name:'books';
  for(const button of tabButtons){const active=button.dataset.studioTab===tab;button.setAttribute('aria-selected',String(active));button.tabIndex=active?0:-1;}
  for(const panel of tabPanels)panel.hidden=panel.dataset.studioPanel!==tab;
  if(updateUrl){const u=new URL(location.href);u.searchParams.set('tab',tab);history.replaceState(history.state,'',u);}
}
function render(){
  const stores=Array.isArray(snapshot.stores)?snapshot.stores:[];
  const books=Array.isArray(snapshot.books)?snapshot.books:[];
  storeSelect.innerHTML='<option value="">나중에 선택</option>'+stores.map(s=>'<option value="'+Number(s.id)+'">'+escapeHtml(s.name)+'</option>').join('');
  document.querySelector('#bookCount').textContent=books.length+'권';
  document.querySelector('#storeCount').textContent=stores.length+'곳';
  bookList.innerHTML=books.length?books.map(b=>'<article class="card"><div class="card-head"><span class="tag">'+escapeHtml(STATUSES[b.status]||b.status)+'</span><button class="ghost" type="button" data-edit-book="'+Number(b.id)+'">정보 수정</button></div><h3>'+escapeHtml(b.title)+'</h3><div class="meta">'+escapeHtml(b.author)+' · '+money(b.priceKrw)+' · '+escapeHtml(STAGES[b.stage]||b.stage)+'</div>'+(b.adminNote?'<div class="meta">검토 메모: '+escapeHtml(b.adminNote)+'</div>':'')+'</article>').join(''):'<p class="empty">등록한 책이 없습니다. ‘새 책 만들기’에서 초안을 시작할 수 있습니다.</p>';
  storeList.innerHTML=stores.length?stores.map(s=>'<article class="card"><div class="card-head"><span class="tag">내 서점</span><button class="ghost" type="button" data-edit-store="'+Number(s.id)+'">정보 수정</button></div><h3>'+escapeHtml(s.name)+'</h3><div class="meta">'+escapeHtml(s.description||'서점 소개를 등록해 주세요.')+'</div><a href="https://ekodi.kr/books/store/'+encodeURIComponent(s.slug)+'" target="_blank" rel="noopener noreferrer">서점 열기</a></article>').join(''):'<p class="empty">아직 만든 서점이 없습니다. 아래에서 시작할 수 있습니다.</p>';
}
function clearBookEdit(){bookForm.reset();delete bookForm.dataset.editId;document.querySelector('#bookFormTitle').textContent='새 책 등록';document.querySelector('#cancelBookEdit').hidden=true;}
function clearStoreEdit(){storeForm.reset();delete storeForm.dataset.editSlug;storeForm.elements.slug.readOnly=false;document.querySelector('#storeFormTitle').textContent='새 서점 만들기';document.querySelector('#cancelStoreEdit').hidden=true;}
function editBook(id){
  const book=snapshot.books.find(item=>Number(item.id)===id);
  if(!book)return;
  clearBookEdit();
  for(const field of ['title','author','description','coverImage','priceKrw','buyUrl','storeId']){
    if(bookForm.elements[field])bookForm.elements[field].value=book[field]??'';
  }
  bookForm.dataset.editId=String(id);
  document.querySelector('#bookFormTitle').textContent='책 정보 수정';
  document.querySelector('#cancelBookEdit').hidden=false;
  selectTab('new');
  bookForm.elements.title.focus();
}
function editStore(id){
  const store=snapshot.stores.find(item=>Number(item.id)===id);
  if(!store)return;
  clearStoreEdit();
  for(const field of ['name','description','slug'])storeForm.elements[field].value=store[field]??'';
  storeForm.dataset.editSlug=store.slug;
  storeForm.elements.slug.readOnly=true;
  document.querySelector('#storeFormTitle').textContent='서점 정보 수정';
  document.querySelector('#cancelStoreEdit').hidden=false;
  selectTab('stores');
  storeForm.elements.name.focus();
}
function notice(text){state.textContent=text;}
async function load(){
  notice('EKODI 계정을 확인하고 있습니다.');
  try{
    snapshot=await api('books/me');
    if(!snapshot.account||!Array.isArray(snapshot.books)||!Array.isArray(snapshot.stores))throw Error('작업공간 자료 형식이 올바르지 않습니다.');
    workspace.hidden=false;
    notice('계정이 연결되었습니다. 개인별 원고와 서점만 표시됩니다.');
    render();
  }catch(error){
    workspace.hidden=true;
    if(error.status===401){
      notice('로그인 후 내 책과 서점을 관리할 수 있습니다. ');
      const link=document.createElement('a');
      const target=new URL('https://ekodi.kr/auth/');
      target.searchParams.set('return_to',location.href);
      link.href=target.href;link.textContent='EKODI 통합 로그인';
      state.append(link);
      return;
    }
    const message=error.status===403?'이 작업공간에 접근할 권한이 없습니다.':error.status>=500?'출판 서버가 일시적으로 응답하지 않습니다.':error instanceof TypeError?'출판 서버 연결에 실패했습니다.':'자료를 불러오지 못했습니다: '+error.message;
    notice(message+' ');
    const retry=document.createElement('button');retry.type='button';retry.textContent='다시 시도';retry.addEventListener('click',load,{once:true});state.append(retry);
  }
}
async function saveForm(form,path,data,method='POST'){
  const button=form.querySelector('button[type="submit"]:not([value])')||form.querySelector('button[type="submit"]');
  if(button)button.disabled=true;
  try{await api(path,{method,body:JSON.stringify(data)});return true;}
  catch(e){notice(e.status===401?'로그인이 만료되었습니다. 다시 로그인해 주세요.':e.message);return false;}
  finally{if(button)button.disabled=false;}
}
storeForm.addEventListener('submit',async event=>{
  event.preventDefault();
  const data=Object.fromEntries(new FormData(storeForm));
  const slug=storeForm.dataset.editSlug;
  if(!await saveForm(storeForm,slug?'books/me/stores/'+encodeURIComponent(slug):'books/me/stores',data,slug?'PUT':'POST'))return;
  clearStoreEdit();await load();selectTab('stores');storeForm.querySelector('input')?.focus();
});
bookForm.addEventListener('submit',async event=>{
  event.preventDefault();
  const data=Object.fromEntries(new FormData(bookForm));
  data.status=event.submitter?.value==='SUBMITTED'?'SUBMITTED':'DRAFT';
  data.storeId=data.storeId?Number(data.storeId):null;
  data.priceKrw=Number(data.priceKrw||0);
  const id=bookForm.dataset.editId;
  if(!await saveForm(bookForm,id?'books/me/titles/'+encodeURIComponent(id):'books/me/titles',data,id?'PUT':'POST'))return;
  clearBookEdit();await load();selectTab('books');
});
document.querySelector('#cancelBookEdit').addEventListener('click',clearBookEdit);
document.querySelector('#cancelStoreEdit').addEventListener('click',clearStoreEdit);
refreshButton.addEventListener('click',load);
document.addEventListener('click',event=>{
  const tab=event.target.closest('[data-studio-tab]');if(tab){selectTab(tab.dataset.studioTab);return;}
  const book=event.target.closest('[data-edit-book]');if(book){editBook(Number(book.dataset.editBook));return;}
  const store=event.target.closest('[data-edit-store]');if(store)editStore(Number(store.dataset.editStore));
});
selectTab(new URL(location.href).searchParams.get('tab')||'books',{updateUrl:false});
load();
