import {createClient} from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm';

const $=id=>document.getElementById(id);
const state={config:null,client:null,session:null,categories:[],requests:[],sourceServiceId:'',activeCategory:''};
const API_BASE=location.pathname.startsWith('/ai')?'/ai':'';
const escText=value=>String(value??'').trim();
function apiUrl(path){const normalized=String(path||'').replace(/^\/ai(?=\/api\/commons(?:\/|$))/,'');return `${API_BASE}${normalized}`}
async function api(path,options={}){
  const headers={accept:'application/json',...(options.headers||{})};
  if(state.session?.access_token)headers.authorization=`Bearer ${state.session.access_token}`;
  if(options.body&&!headers['content-type'])headers['content-type']='application/json';
  const response=await fetch(apiUrl(path),{...options,headers,cache:'no-store'});const data=await response.json().catch(()=>({}));
  if(!response.ok)throw Object.assign(new Error(data.error||`http_${response.status}`),{status:response.status,data});return data;
}
function setSession(session){state.session=session||null;$('loginLink').hidden=Boolean(state.session);$('sessionState').textContent=state.session?'로그인됨':'로그인 없이 바로 사용';updateChatSession();void loadChatAvailability()}
function serviceStatusMeta(service){return [service.categoryLabel,service.availabilityLabel,service.deliveryLabel].filter(Boolean).join(' · ')||'운영 · 바로 실행'}
function serviceButton(service){
  const link=document.createElement('a');link.className='service-button';link.href=service.launchUrl;
  const title=document.createElement('strong');title.textContent=service.label;const meta=document.createElement('small');meta.textContent=serviceStatusMeta(service);link.append(title,meta);return link;
}
function serviceAccessMeta(service){
  if(!service.usableNow)return '준비 중';
  return service.access?.paidAvailable?'기본 무료 · 고급 구독':'기본 무료';
}
function serviceCard(service){
  const card=document.createElement(service.usableNow&&service.launchUrl?'a':'article');card.className='service-card';
  if(card.tagName==='A')card.href=service.launchUrl;else{card.classList.add('preview');card.setAttribute('aria-disabled','true')}
  const copy=document.createElement('div');const title=document.createElement('strong');title.textContent=service.label;
  const description=document.createElement('p');description.className='service-description';description.textContent=service.description||'기본 기능을 바로 사용할 수 있습니다.';
  const meta=document.createElement('div');meta.className='service-meta';
  const access=document.createElement('span');access.className='service-state state-'+(service.availability||'live');access.textContent=serviceAccessMeta(service);
  const status=document.createElement('small');status.textContent=service.usableNow&&service.availability!=='live'?(service.availabilityLabel||'운영'):'';
  meta.append(access);if(status.textContent)meta.append(status);
  copy.append(title,description,meta);const arrow=document.createElement('b');arrow.textContent=service.usableNow?'›':'·';card.append(copy,arrow);return card;
}
function renderActiveCategory(){
  const host=$('servicePanel');host.replaceChildren();
  const category=state.categories.find(item=>item.id===state.activeCategory)||state.categories[0];
  if(!category){host.textContent='준비 중입니다.';return}
  state.activeCategory=category.id;
  document.querySelectorAll('.service-tab').forEach(button=>button.setAttribute('aria-selected',String(button.dataset.category===category.id)));
  const services=category.services||[];
  for(const service of services)host.append(serviceCard(service));
  if(!services.length){const p=document.createElement('p');p.className='empty';p.textContent='이 분류의 서비스를 준비하고 있습니다.';host.append(p)}
}
function renderServices(categories=[]){
  state.categories=categories;state.activeCategory=categories[0]?.id||'';
  const tabs=$('serviceTabs');tabs.replaceChildren();
  for(const category of categories){
    const button=document.createElement('button');button.type='button';button.className='service-tab';button.dataset.category=category.id;button.role='tab';button.textContent=category.label;
    button.addEventListener('click',()=>{state.activeCategory=category.id;renderActiveCategory()});tabs.append(button);
  }
  renderActiveCategory();
}
function requestButton(item){
  const row=document.createElement('button');row.type='button';row.className='request-button';
  const title=document.createElement('strong');title.textContent=item.title.endsWith('해줘')?item.title:`${item.title} 해줘`;
  const meta=document.createElement('span');meta.textContent=`${item.userStatus} · ${item.requestCount}명`;
  row.append(title,meta);row.addEventListener('click',()=>supportRequest(item.title));return row;
}
function renderRequestList(id,items,empty){const host=$(id);host.replaceChildren();if(!items.length){const p=document.createElement('p');p.className='empty';p.textContent=empty;host.append(p);return}for(const item of items)host.append(requestButton(item))}
function renderReleased(items=[]){
  const host=$('releasedRequests');host.replaceChildren();if(!items.length){const p=document.createElement('p');p.className='empty';p.textContent='아직 없습니다.';host.append(p);return}
  for(const item of items){const row=requestButton(item);row.classList.add('released-request');host.append(row)}
}
function renderRequests(items=[]){
  state.requests=items;const developing=items.filter(item=>['candidate','sandboxed','verified','staged'].includes(item.status));
  const released=items.filter(item=>item.status==='shared').sort((a,b)=>String(b.updatedAt||b.createdAt||'').localeCompare(String(a.updatedAt||a.createdAt||''))).slice(0,6);
  const recommended=items.filter(item=>item.recommended&&!developing.includes(item)&&item.status!=='shared'&&item.status!=='rejected');
  const pending=items.filter(item=>!developing.includes(item)&&!recommended.includes(item)&&!['shared','rejected'].includes(item.status));
  renderRequestList('recommendedRequests',recommended,'없음');renderRequestList('developingRequests',developing,'없음');renderRequestList('pendingRequests',pending,'없음');renderReleased(released);
}
function renderMyIdeas(items=[]){
  const host=$('ideaHistory');host.replaceChildren();if(!state.session){host.textContent='로그인하면 확인할 수 있습니다.';return}
  if(!items.length){host.textContent='아직 요청이 없습니다.';return}
  for(const item of items){const row=document.createElement('div');row.className='my-request';const strong=document.createElement('strong');strong.textContent=item.title||item.outcome;const span=document.createElement('span');span.textContent=item.userStatus||item.status;row.append(strong,span);host.append(row)}
}
function renderMatches(services=[]){const host=$('matches');host.replaceChildren();for(const service of services)host.append(serviceButton(service))}
async function refreshRequests(){try{const data=await api('/api/commons/requests');renderRequests(data.requests||[])}catch{renderRequests([])}}
async function refreshMyIdeas(){if(!state.session)return renderMyIdeas([]);try{const data=await api('/api/commons/ideas');renderMyIdeas(data.ideas||[])}catch(error){$('ideaHistory').textContent=`불러오기 실패: ${error.message}`}}
async function supportRequest(title){
  if(!state.session){$('wantInput').value=title;$('wantResult').textContent='로그인하면 이 요청에 참여할 수 있습니다.';$('loginLink').hidden=false;return}
  try{const data=await api('/api/commons/ideas',{method:'POST',body:JSON.stringify({request:title,sourceServiceId:state.sourceServiceId})});$('wantResult').textContent=data.reusedSubmission?'이미 참여 중입니다.':'요청에 참여했습니다.';await Promise.all([refreshRequests(),refreshMyIdeas()])}catch(error){$('wantResult').textContent=`요청 실패: ${error.message}`}
}
async function submitWanted(requestText){
  $('wantResult').textContent='가능한 서비스를 찾고 있습니다.';renderMatches([]);
  const matched=await api('/api/commons/match',{method:'POST',body:JSON.stringify({job:requestText})});
  if((matched.services||[]).length){renderMatches(matched.services);$('wantResult').textContent='관련 서비스를 찾았습니다.';return}
  if(!state.session){$('wantResult').textContent='아직 없는 기능입니다. 로그인하면 개발 요청으로 보낼 수 있습니다.';$('loginLink').hidden=false;return}
  const created=await api('/api/commons/ideas',{method:'POST',body:JSON.stringify({request:requestText,sourceServiceId:state.sourceServiceId})});
  $('wantResult').textContent=created.reusedSubmission?'같은 요청에 참여했습니다.':'개발 요청을 접수했습니다.';await Promise.all([refreshRequests(),refreshMyIdeas()]);
}
async function boot(){
  const params=new URLSearchParams(location.search);state.sourceServiceId=escText(params.get('source')).toLowerCase().replace(/[^a-z0-9-]/g,'').slice(0,80);const handoff=escText(params.get('q')).slice(0,600);
  const [config,catalog,requests]=await Promise.all([api('/api/commons/config'),api('/api/commons/services'),api('/api/commons/requests').catch(()=>({requests:[]}))]);
  state.config=config;renderServices(catalog.categories||[]);renderRequests(requests.requests||[]);
  const loginUrl=new URL(config.authUrl||'/auth/?site=ai',location.origin);loginUrl.searchParams.set('return_to',location.href.split('#')[0]);$('loginLink').href=loginUrl.toString();
  if(config.supabaseUrl&&config.supabasePublishableKey){state.client=createClient(config.supabaseUrl,config.supabasePublishableKey,{auth:{persistSession:true,autoRefreshToken:true,detectSessionInUrl:true}});const {data}=await state.client.auth.getSession();setSession(data.session);await refreshMyIdeas();state.client.auth.onAuthStateChange((_event,session)=>{setSession(session);void refreshMyIdeas()})}else setSession(null);
  if(handoff){$('wantInput').value=handoff;if(params.get('auto')==='1')await submitWanted(handoff);}
}
$('wantForm').addEventListener('submit',async event=>{event.preventDefault();const value=$('wantInput').value.trim();if(!value)return;const button=event.submitter;button.disabled=true;try{await submitWanted(value)}catch(error){$('wantResult').textContent=`처리 실패: ${error.message}`}finally{button.disabled=false}});
$('requestForm').addEventListener('submit',async event=>{event.preventDefault();const value=$('requestInput').value.trim();if(!value)return;$('wantInput').value=value;try{await submitWanted(value);$('requestInput').value=''}catch(error){$('wantResult').textContent=`요청 실패: ${error.message}`}});

const chatState={history:[],busy:false,availability:null};
const CHAT_ERRORS={
  authentication_required:'로그인 후 이용할 수 있습니다.',
  invalid_session:'로그인 세션이 만료되었습니다. 다시 로그인해 주세요.',
  identity_unavailable:'로그인 서비스에 연결할 수 없습니다.',
  daily_chat_limit_reached:'오늘 사용 가능한 대화 횟수에 도달했습니다.',
  provider_unavailable:'선택한 AI가 아직 연결되지 않았습니다.',
  paid_provider_not_enabled:'GPT·Claude API는 관리자가 유료 사용을 허용한 후 사용할 수 있습니다.',
  all_providers_unavailable:'연결된 AI가 일시적으로 응답하지 않습니다. 잠시 후 다시 시도해 주세요.',
  local_queue_unavailable:'로컬 Ollama 실행 대기열을 이용할 수 없습니다.',
  chat_usage_store_unavailable:'사용량 관리 시스템을 확인할 수 없습니다.',
  invalid_conversation:'대화가 너무 길어 새 질문으로 시작해야 합니다.',
};
function chatStatus(message){$('chatStatus').textContent=message}
function updateChatSession(){
  if(!$('chatStatus'))return;
  if(!state.session&&!chatState.busy)chatStatus('로그인 후 AI 대화를 이용할 수 있습니다. 상단 로그인 버튼을 이용해 주세요.');
  else if(!chatState.busy)chatStatus('대화를 시작할 수 있습니다. 무료 모델을 우선 사용하며 GPT·Claude API 비용은 별도 승인 후 허용됩니다.');
}
function chatBubble(role,content,provider=''){
  const log=$('chatMessages');if(log.querySelector('.chat-intro'))log.replaceChildren();
  const bubble=document.createElement('div');bubble.className='chat-bubble '+role;
  const caption=document.createElement('small');caption.textContent=role==='user'?'나':provider?'EKODI AI · '+provider:'EKODI AI';
  const message=document.createElement('div');message.textContent=String(content||'');
  bubble.append(caption,message);log.append(bubble);log.scrollTop=log.scrollHeight;return bubble;
}
function chatPayload(userMessage){
  const last=[...chatState.history,{role:'user',content:userMessage.slice(0,1200)}].slice(-8);
  while(last.length>1&&last.reduce((sum,m)=>sum+m.content.length,0)>2000)last.shift();
  return last;
}
function rememberChat(userMessage,answer){
  chatState.history.push({role:'user',content:userMessage.slice(0,1200)},{role:'assistant',content:answer.slice(0,900)});
  chatState.history=chatState.history.slice(-8);
}
async function chatPoll(jobId){
  for(let i=0;i<180;i++){
    await new Promise(resolve=>setTimeout(resolve,3000));
    const item=await api('/api/commons/chat/jobs/'+encodeURIComponent(jobId));
    if(item.state==='completed')return{reply:item.reply||'',provider:item.provider||'ollama'};
    if(item.state==='expired'||item.state==='failed')throw new Error('local_model_failed');
    chatStatus('Ollama 로컬 컴퓨터의 응답을 기다리고 있습니다. 대기열 상태: '+(item.state||'대기 중'));
  }
  throw new Error('local_queue_timeout');
}
async function loadChatAvailability(){
  try{
    const data=await api('/api/commons/chat/status');
    chatState.availability=data.providers||{};
    const names=[['auto','무료 AI'],['ollama','Ollama'],['gpt','GPT'],['claude','Claude']];
    $('chatAvailability').textContent=names.map(([id,label])=>label+' '+(chatState.availability[id]?'연결됨':'대기')).join(' · ');
    for(const option of $('chatProvider').options){
      if(option.value!=='auto')option.textContent=option.textContent.replace(/ · (연결됨|연결 대기)$/,'')+' · '+(chatState.availability[option.value]?'연결됨':'연결 대기');
    }
  }catch{$('chatAvailability').textContent='AI 연결 상태를 확인할 수 없습니다.';}
}
function initChat(){
  $('chatForm').addEventListener('submit',async event=>{
    event.preventDefault();
    if(chatState.busy)return;
    const message=$('chatInput').value.trim();if(!message)return;
    if(!state.session){chatStatus('AI 대화를 사용하려면 로그인이 필요합니다.');$('loginLink').hidden=false;return}
    chatState.busy=true;$('chatSubmit').disabled=true;chatStatus('AI가 응답을 생성하고 있습니다.');
    try{
      const payload=chatPayload(message),mode=$('chatProvider').value;
      const response=await api('/api/commons/chat',{method:'POST',body:JSON.stringify({mode,messages:payload})});
      $('chatInput').value='';
      chatBubble('user',message);
      const result=response.jobId?await chatPoll(response.jobId):response;
      if(!result.reply)throw new Error('empty_model_answer');
      chatBubble('assistant',result.reply,result.provider||mode);
      rememberChat(message,result.reply);
      chatStatus('응답 완료 · '+(result.provider||mode));
    }catch(error){
      chatStatus(CHAT_ERRORS[error.message]||(
        error.message==='local_model_failed'||error.message==='local_queue_timeout'
          ?'로컬 모델이 아직 응답하지 않았습니다. 나중에 다시 시도해 주세요.'
          :'AI 처리 실패: '+String(error.message).slice(0,100)
      ));
    }finally{chatState.busy=false;$('chatSubmit').disabled=false}
  });
  void loadChatAvailability();
}

initChat();
boot().catch(error=>{$('sessionState').textContent=`초기화 실패: ${error.message}`});
