import {createClient} from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm';

const $=id=>document.getElementById(id);
const state={config:null,client:null,session:null,services:[],requests:[],sourceServiceId:''};
// Canonical /ai clients apply the public prefix exactly once, even behind the shared path router.
const API_BASE=location.pathname.startsWith('/ai')?'/ai':'';
const escText=value=>String(value??'').trim();
function apiUrl(path){
  const normalized=String(path||'').replace(/^\/ai(?=\/api\/commons(?:\/|$))/,'');
  return `${API_BASE}${normalized}`;
}

async function api(path,options={}){
  const headers={accept:'application/json',...(options.headers||{})};
  if(state.session?.access_token)headers.authorization=`Bearer ${state.session.access_token}`;
  if(options.body&&!headers['content-type'])headers['content-type']='application/json';
  const response=await fetch(apiUrl(path),{...options,headers,cache:'no-store'});
  const data=await response.json().catch(()=>({}));
  if(!response.ok)throw Object.assign(new Error(data.error||`http_${response.status}`),{status:response.status,data});
  return data;
}

function setSession(session){
  state.session=session||null;
  $('loginLink').hidden=Boolean(state.session);
  $('sessionState').textContent=state.session?`${state.session.user?.email||'에코디 회원'} 로그인됨`:'로그인하면 AI 요청과 진행상태 확인을 사용할 수 있습니다.';
}

function serviceButton(service){
  const link=document.createElement('a');link.className='service-button';link.href=service.launchUrl;link.textContent=service.label;
  link.setAttribute('aria-label',`${service.label} 실행`);return link;
}
function renderServices(categories=[]){
  const host=$('serviceCategories');host.replaceChildren();
  for(const category of categories){
    const block=document.createElement('section');block.className='service-category';
    const title=document.createElement('h3');title.textContent=category.label;block.append(title);
    const list=document.createElement('div');list.className='service-buttons';
    for(const service of category.services||[])list.append(serviceButton(service));
    block.append(list);host.append(block);
  }
  if(!categories.length)host.textContent='현재 공개 가능한 실행 서비스를 준비하고 있습니다.';
}

function requestButton(item){
  const row=document.createElement('button');row.type='button';row.className='request-button';row.dataset.requestTitle=item.title;
  const title=document.createElement('strong');title.textContent=item.title.endsWith('해줘')?item.title:`${item.title} 해줘`;
  const meta=document.createElement('span');meta.textContent=`${item.userStatus} · ${item.requestCount}명 요청`;
  row.append(title,meta);row.addEventListener('click',()=>supportRequest(item.title));return row;
}

function renderRequestList(id,items,empty){
  const host=$(id);host.replaceChildren();
  if(!items.length){const p=document.createElement('p');p.className='empty';p.textContent=empty;host.append(p);return}
  for(const item of items)host.append(requestButton(item));
}
async function openReleased(item){
  $('wantInput').value=item.title;
  $('wantResult').textContent='공개된 AI와 현재 실행서비스를 연결하고 있습니다.';
  renderMatches([]);
  try{
    const matched=await api('/api/commons/match',{method:'POST',body:JSON.stringify({job:item.title})});
    if((matched.services||[]).length){
      renderMatches(matched.services);
      $('wantResult').textContent='현재 바로 사용할 수 있는 실행서비스를 찾았습니다.';
      return;
    }
    $('wantResult').textContent='공개 기록은 확인됐지만 연결 가능한 실행서비스가 아직 카탈로그에 반영되지 않았습니다.';
  }catch(error){$('wantResult').textContent=`실행서비스 연결 확인 실패: ${error.message}`;}
}
function renderReleased(items=[]){
  const host=$('releasedRequests');if(!host)return;host.replaceChildren();
  if(!items.length){const p=document.createElement('p');p.className='empty';p.textContent='아직 공개 완료된 요청이 없습니다.';host.append(p);return}
  for(const item of items){
    const row=document.createElement('button');row.type='button';row.className='request-button released-request';
    const title=document.createElement('strong');title.textContent=item.title;
    const meta=document.createElement('span');meta.textContent=`사용가능 · ${item.requestCount}명 요청`;
    row.append(title,meta);row.addEventListener('click',()=>void openReleased(item));host.append(row);
  }
}
function renderRequests(items=[]){
  state.requests=items;
  const developing=items.filter(item=>['candidate','sandboxed','verified','staged'].includes(item.status));
  const released=items.filter(item=>item.status==='shared').sort((a,b)=>String(b.updatedAt||b.createdAt||'').localeCompare(String(a.updatedAt||a.createdAt||''))).slice(0,8);
  const recommended=items.filter(item=>item.recommended&&!developing.includes(item)&&item.status!=='shared'&&item.status!=='rejected');
  const pending=items.filter(item=>!developing.includes(item)&&!recommended.includes(item)&&!['shared','rejected'].includes(item.status));
  renderRequestList('recommendedRequests',recommended,'아직 추천 요청 AI가 없습니다.');
  renderRequestList('developingRequests',developing,'현재 개발중인 요청이 없습니다.');
  renderRequestList('pendingRequests',pending,'아직 요청중인 AI가 없습니다.');
  renderReleased(released);
}

function renderMyIdeas(items=[]){
  const host=$('ideaHistory');host.replaceChildren();
  if(!state.session){host.textContent='로그인하면 내가 요청한 AI를 확인할 수 있습니다.';return}
  if(!items.length){host.textContent='아직 요청한 AI가 없습니다.';return}
  for(const item of items){
    const row=document.createElement('div');row.className='my-request';
    const strong=document.createElement('strong');strong.textContent=item.title||item.outcome;
    const span=document.createElement('span');span.textContent=`${item.userStatus||item.status} · ${item.requestCount||1}명 요청`;
    row.append(strong,span);host.append(row);
  }
}

function renderMatches(services=[]){
  const host=$('matches');host.replaceChildren();
  for(const service of services){const link=serviceButton(service);link.classList.add('match');host.append(link)}
}
async function refreshRequests(){
  try{const data=await api('/api/commons/requests');renderRequests(data.requests||[])}catch{renderRequests([])}
}

async function refreshMyIdeas(){
  if(!state.session)return renderMyIdeas([]);
  try{const data=await api('/api/commons/ideas');renderMyIdeas(data.ideas||[])}catch(error){$('ideaHistory').textContent=`요청 내역을 불러오지 못했습니다: ${error.message}`}
}

async function supportRequest(title){
  if(!state.session){$('wantInput').value=title;$('wantResult').textContent='이 요청에 참여하려면 에코디 로그인이 필요합니다.';$('loginLink').hidden=false;return}
  try{
    const data=await api('/api/commons/ideas',{method:'POST',body:JSON.stringify({request:title,sourceServiceId:state.sourceServiceId})});
    $('wantResult').textContent=data.reusedSubmission?'이미 이 요청에 참여하고 있습니다.':'요청에 함께 참여했습니다.';
    await Promise.all([refreshRequests(),refreshMyIdeas()]);
  }catch(error){$('wantResult').textContent=`요청 처리 실패: ${error.message}`}
}

async function submitWanted(requestText){
  $('wantResult').textContent='에코디가 기존 실행서비스와 요청을 확인하고 있습니다.';renderMatches([]);
  const matched=await api('/api/commons/match',{method:'POST',body:JSON.stringify({job:requestText})});
  if((matched.services||[]).length){renderMatches(matched.services);$('wantResult').textContent='이미 사용할 수 있는 실행서비스를 찾았습니다. 아래에서 바로 시작할 수 있습니다.';return}
  if(!state.session){$('wantResult').textContent='아직 제공되지 않는 서비스입니다. 로그인하면 새 AI로 요청할 수 있습니다.';$('loginLink').hidden=false;return}
  const created=await api('/api/commons/ideas',{method:'POST',body:JSON.stringify({request:requestText,sourceServiceId:state.sourceServiceId})});
  $('wantResult').textContent=created.reusedSubmission?`같은 요청이 이미 있습니다. 현재 ${created.idea.requestCount||1}명이 요청했습니다.`:'요청했습니다. 에코디 AI가 자동 검토·개발하고, 검증 후 최고관리자가 공개 여부를 최종 판단합니다.';
  await Promise.all([refreshRequests(),refreshMyIdeas()]);
}
async function boot(){
  const params=new URLSearchParams(location.search);state.sourceServiceId=escText(params.get('source')).toLowerCase().replace(/[^a-z0-9-]/g,'').slice(0,80);const handoff=escText(params.get('q')).slice(0,600);
  const [config,catalog,requests]=await Promise.all([api('/api/commons/config'),api('/api/commons/services'),api('/api/commons/requests').catch(()=>({requests:[]}))]);
  state.config=config;state.services=catalog.categories||[];renderServices(state.services);renderRequests(requests.requests||[]);
  const loginUrl=new URL(config.authUrl||'/auth/?site=ai',location.origin);loginUrl.searchParams.set('return_to',location.href.split('#')[0]);$('loginLink').href=loginUrl.toString();
  if(config.supabaseUrl&&config.supabasePublishableKey){
    state.client=createClient(config.supabaseUrl,config.supabasePublishableKey,{auth:{persistSession:true,autoRefreshToken:true,detectSessionInUrl:true}});
    const {data}=await state.client.auth.getSession();setSession(data.session);await refreshMyIdeas();
    state.client.auth.onAuthStateChange((_event,session)=>{setSession(session);void refreshMyIdeas()});
  }else setSession(null);
  if(handoff){$('wantInput').value=handoff;if(params.get('auto')==='1')await submitWanted(handoff);}
}

$('wantForm').addEventListener('submit',async event=>{
  event.preventDefault();const input=$('wantInput');const value=input.value.trim();if(!value)return;
  const button=event.submitter;button.disabled=true;
  try{await submitWanted(value)}catch(error){$('wantResult').textContent=`요청 처리 실패: ${error.message}`}
  finally{button.disabled=false}
});

boot().catch(error=>{$('sessionState').textContent=`서비스 초기화 실패: ${error.message}`});
