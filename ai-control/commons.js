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

// Official public notices are read only from the owning SUPPORT service contract.
// No third-party page scraping or provider credentials run in the browser.
const SUPPORT_FEED_URL='/support/api/opportunities?source=combined&limit=100';
const AI_NOTICE_PATTERN=/(?:^|[^a-z])ai(?:[^a-z]|$)|인공지능|생성형|딥러닝|머신러닝|초거대|지능형|llm|대규모언어모델/i;
const SUPPORT_TOPIC_PATTERNS=Object.freeze({
  education:/교육|인재|훈련|역량|수강|교육생|인력양성|캠프|아카데미/i,
  startup:/창업|사업화|스타트업|기업육성|엑셀러레이팅|상용화|기업지원/i,
  research:/연구개발|R&D|실증|기술개발|과제|연구과제|테스트베드|고도화/i,
  adoption:/도입|전환|바우처|활용|보급|디지털혁신|디지털 전환/i,
});
const supportState={loaded:false,busy:false,items:[],fetchedAt:'',sources:[]};
function supportKoreaDate(){return new Date().toLocaleDateString('sv-SE',{timeZone:'Asia/Seoul'})}
function supportNoticeStatus(item,today=supportKoreaDate()){
  const period=String(item.applicationPeriod||'');
  const dates=(period.match(/20\d{2}[-./]\d{1,2}[-./]\d{1,2}/g)||[]).map(value=>value.replace(/[./]/g,'-').split('-').map((part,i)=>i?part.padStart(2,'0'):part).join('-'));
  if(dates.length){
    const from=dates.length>1?dates[0]:null,end=dates[dates.length-1];
    if(from&&today<from)return{kind:'upcoming',label:'접수 예정',deadline:end};
    if(today>end)return{kind:'closed',label:'마감',deadline:end};
    const days=Math.round((Date.parse(end+'T00:00:00Z')-Date.parse(today+'T00:00:00Z'))/86400000);
    if(days>=0&&days<=7)return{kind:'soon',label:days===0?'오늘 마감':'마감 '+days+'일 전',deadline:end};
    return{kind:'open',label:'접수중',deadline:end};
  }
  if(/상시|수시/.test(period))return{kind:'permanent',label:'상시 접수',deadline:''};
  return{kind:'unknown',label:'기간 확인 필요',deadline:''};
}
function supportNoticeText(item){return [item.title,item.summary,item.category,item.target,item.region,item.agency,item.operator,...(Array.isArray(item.tags)?item.tags:[])].join(' ')}
function supportSafeUrl(value){try{const url=new URL(String(value||''));return url.protocol==='https:'?url.toString():''}catch{return''}}
function renderSupportNotice(item){
  const card=document.createElement('article');card.className='support-notice';
  const url=supportSafeUrl(item.url);
  const title=document.createElement(url?'a':'strong');title.className='support-notice-title';title.textContent=item.title||'공고명 미확인';
  if(url){title.href=url;title.target='_blank';title.rel='noopener noreferrer'}
  const status=supportNoticeStatus(item);
  const meta=document.createElement('div');meta.className='support-notice-meta';
  const chip=document.createElement('span');chip.className='support-chip '+status.kind;chip.textContent=status.label;meta.append(chip);
  const source=document.createElement('span');source.textContent=item.sourceName||item.agency||'공식 지원사업';meta.append(source);
  if(item.agency&&item.agency!==item.sourceName){const agency=document.createElement('span');agency.textContent='· '+item.agency;meta.append(agency)}
  if(item.region){const region=document.createElement('span');region.textContent='· '+item.region;meta.append(region)}
  const period=document.createElement('div');period.className='support-notice-meta';
  period.textContent='신청 기간: '+(item.applicationPeriod||'원문 확인');
  card.append(title,meta,period);
  if(item.summary){const desc=document.createElement('p');desc.className='support-notice-desc';desc.textContent=String(item.summary).slice(0,190);card.append(desc)}
  const detail=document.createElement('button');detail.type='button';detail.className='support-notice-detail';detail.textContent='상세 보기 · 지원 요청 →';detail.disabled=!url;
  detail.addEventListener('click',()=>openSupportDetail(item,true));card.append(detail);
  return card;
}
function renderSupportFeed(){
  const target=$('supportNotices');target.replaceChildren();
  const search=$('supportSearch').value.trim().toLocaleLowerCase('ko-KR');
  const topic=$('supportTopic').value,statusFilter=$('supportStatusFilter').value;
  const items=supportState.items.filter(item=>{
    const full=supportNoticeText(item);
    if(search&&!full.toLocaleLowerCase('ko-KR').includes(search))return false;
    if(topic!=='all'&&!SUPPORT_TOPIC_PATTERNS[topic]?.test(full))return false;
    const status=supportNoticeStatus(item).kind;
    if(statusFilter==='open'&&!['open','soon','permanent'].includes(status))return false;
    if(statusFilter==='soon'&&status!=='soon')return false;
    return true;
  });
  const priority={soon:0,open:1,permanent:2,upcoming:3,unknown:4,closed:5};
  items.sort((a,b)=>{
    const diff=(priority[supportNoticeStatus(a).kind]??6)-(priority[supportNoticeStatus(b).kind]??6);
    return diff||String(b.publishedAt||'').localeCompare(String(a.publishedAt||''))||String(a.title||'').localeCompare(String(b.title||''));
  });
  for(const item of items.slice(0,36))target.append(renderSupportNotice(item));
  if(!items.length){const p=document.createElement('p');p.className='support-empty';
    p.textContent=supportState.loaded?'현재 수집된 공고에 해당하는 AI 지원사업이 없습니다. 검색 조건을 조정하거나 원문 사이트를 확인해 주세요.':'공식 공고를 조회 중입니다.';
    target.append(p);
  }
  if(supportState.loaded)$('supportStatus').textContent='공식 공고 '+supportState.items.length+'건 중 '+items.length+'건 표시'+(items.length>36?' (상위 36건)':'')+' · 확인 시각 '+supportState.fetchedAt+' · 수집 범위: 기업마당 및 연결된 검증 기관';
}
async function loadSupportFeed(){
  if(supportState.busy)return;
  supportState.busy=true;$('supportRefresh').disabled=true;
  $('supportStatus').textContent='지원사업 AI의 공식 공고를 확인하고 있습니다.';
  const controller=new AbortController(),timeout=setTimeout(()=>controller.abort(),15000);
  try{
    const response=await fetch(SUPPORT_FEED_URL,{headers:{accept:'application/json'},credentials:'omit',cache:'no-store',signal:controller.signal});
    if(!response.ok)throw new Error('http_'+response.status);
    const result=await response.json();
    if(result.ok!==true||!Array.isArray(result.items))throw new Error('invalid_official_feed');
    supportState.items=result.items.filter(item=>item&&item.official===true&&AI_NOTICE_PATTERN.test(supportNoticeText(item))&&item.title);
    supportState.sources=Array.isArray(result.sources)?result.sources:[];
    supportState.loaded=true;
    supportState.fetchedAt=new Date().toLocaleString('ko-KR',{timeZone:'Asia/Seoul',hour12:false});
    renderSupportFeed();
    const requested=new URL(location.href).searchParams.get('support_notice');
    if(requested){const notice=supportState.items.find(item=>supportNoticeKey(item)===requested);if(notice)void openSupportDetail(notice,false);else $('supportStatus').textContent+=' · 링크된 공고는 현재 수집 목록에서 확인되지 않습니다.'}
  }catch{
    $('supportStatus').textContent='공식 공고 연결을 확인하지 못했습니다. 새로고침하거나 기존 지원사업 AI에서 직접 검색해 주세요.';
    if(!supportState.loaded){$('supportNotices').replaceChildren();const p=document.createElement('p');p.className='support-empty';p.textContent='공고 정보를 불러오지 못했습니다. 확인되지 않은 공고는 임의로 표시하지 않습니다.';$('supportNotices').append(p)}
  }finally{clearTimeout(timeout);supportState.busy=false;$('supportRefresh').disabled=false}
}
function initSupportFeed(){
  $('supportFilters').addEventListener('submit',event=>event.preventDefault());
  for(const id of ['supportSearch','supportTopic','supportStatusFilter'])$(''+id).addEventListener(id==='supportSearch'?'input':'change',renderSupportFeed);
  $('supportRefresh').addEventListener('click',()=>void loadSupportFeed());
  const section=$('support-programs');
  if('IntersectionObserver' in window){
    const observer=new IntersectionObserver(entries=>{if(entries.some(entry=>entry.isIntersecting)){observer.disconnect();void loadSupportFeed()}},{rootMargin:'240px'});
    observer.observe(section);
  }else void loadSupportFeed();
}


// Per-notice independent EKODIBIZ assistance: review draft only, never a client-authoritative contract or payment.
const assistanceState={notice:null,catalog:null,chosen:new Set(),busy:false};
function supportNoticeKey(item){return [String(item.source||'official'),String(item.id||'')].join(':')}
function moneyKRW(amount){return new Intl.NumberFormat('ko-KR',{style:'currency',currency:'KRW',maximumFractionDigits:0}).format(amount)}
function assistanceSelectedPlans(){return(assistanceState.catalog?.plans||[]).filter(plan=>assistanceState.chosen.has(plan.id))}
async function loadAssistanceCatalog(){
  if(assistanceState.catalog)return assistanceState.catalog;
  const result=await api('/api/commons/assistance/catalog');
  if(!Array.isArray(result.plans))throw new Error('assistance_catalog_unavailable');
  assistanceState.catalog=result;return result;
}
function assistanceRenderContract(){
  const plans=assistanceSelectedPlans(),sum=$('assistancePriceSummary'),contract=$('assistanceContractText');
  if(!plans.length){sum.textContent='서비스를 선택하면 비용을 계산합니다.';contract.textContent='서비스를 선택하면 계약서 초안이 생성됩니다.';return}
  const quoted=plans.some(p=>p.price.amount===null);
  const total=quoted?null:plans.reduce((a,p)=>a+p.price.amount,0);
  sum.textContent=quoted?'선택 항목 중 개별 견적 서비스가 있습니다. 최종 가격과 부가세 포함 여부는 별도 승인 견적서에서 확정합니다.':'공개된 선택 항목 합계 '+moneyKRW(total)+' · 최종 계약 및 결제는 에코디비즈 승인 후';
  contract.textContent=[
    '지원사업 업무지원 계약 검토용 초안 (체결·서명 문서 아님)',
    '계약 제공주체: EKODIBIZ (정식 사업자정보는 계약 확정 전 고지)',
    '계약 요청인: 아래 입력한 신청인 (본인확인 및 당사자 확인 필요)',
    '관련 공고: '+(assistanceState.notice?.title||''),
    '선택 서비스: '+plans.map(p=>p.label).join(', '),
    '업무 범위·결과물: '+plans.map(p=>p.label+' — '+p.deliverables.join(' / ')).join('; '),
    '비용: '+(total===null?'개별 서면 견적 후 확정':moneyKRW(total)+' (최종 검토 전 안내 금액)'),
    '업무기간 및 납품·수정 범위: 최종 계약 시 서면 확정',
    '취소·환불·지급조건·개인정보 보유기간: 최종 계약서 및 개인정보처리 안내에서 별도 고지·승인',
    '정부·수행기관 신청과 무관한 독립 지원서비스로, 사업 선정이나 지급액은 보장하지 않습니다.',
    '전자서명, 상호 계약승인, PG 결제 검증이 완료되기 전에는 업무 착수하지 않습니다.'
  ].join('\n');
}
function assistanceRenderPlans(){
  const host=$('assistancePlanList');host.replaceChildren();
  for(const plan of assistanceState.catalog?.plans||[]){
    const label=document.createElement('label');label.className='assistance-plan';
    const check=document.createElement('input');check.type='checkbox';check.value=plan.id;check.checked=assistanceState.chosen.has(plan.id);
    check.addEventListener('change',()=>{if(check.checked)assistanceState.chosen.add(plan.id);else assistanceState.chosen.delete(plan.id);assistanceRenderContract()});
    const wrap=document.createElement('span'),title=document.createElement('strong'),desc=document.createElement('small'),outputs=document.createElement('small'),cost=document.createElement('b');
    title.textContent=plan.label;desc.textContent=plan.description;outputs.textContent='제공: '+plan.deliverables.join(' · ');
    cost.textContent=plan.price.kind==='quote_required'?'비용: 상담 후 개별 견적':plan.price.kind==='free'?'비용: 무료':
      '비용: '+moneyKRW(plan.price.amount)+(plan.price.vatIncluded?' (부가세 포함)':' (부가세 별도)');
    wrap.append(title,desc,outputs);label.append(check,wrap,cost);host.append(label);
  }
  assistanceRenderContract();
}
async function loadAssistanceHistory(){
  const host=$('assistanceHistory');
  if(!state.session){host.textContent='로그인 후 조회할 수 있습니다.';return}
  try{
    const result=await api('/api/commons/assistance/requests');
    host.replaceChildren();
    for(const request of result.requests||[]){
      const row=document.createElement('p');row.className='assistance-history-row';
      row.textContent=(request.createdAt||'').slice(0,10)+' · '+request.noticeTitle+' · '+(request.state==='review_requested'?'계약·견적 검토 대기':request.state)+' · '+(request.quoteRequired?'견적 대기':moneyKRW(request.amount));
      host.append(row);
    }
    if(!host.children.length)host.textContent='접수한 요청이 없습니다.';
  }catch{host.textContent='이력을 불러올 수 없습니다.'}
}
async function openSupportDetail(item,pushHistory=true){
  if(!item||!supportSafeUrl(item.url))return;
  assistanceState.notice=item;assistanceState.chosen=new Set();
  const pane=$('support-detail');pane.hidden=false;
  const body=$('supportDetailBody');body.replaceChildren();
  const title=document.createElement('h4');title.textContent=item.title||'공고';
  const link=document.createElement('a');link.href=supportSafeUrl(item.url);link.target='_blank';link.rel='noopener noreferrer';link.textContent='공식 공고 원문 보기 ↗';
  const facts=document.createElement('p');facts.textContent='출처: '+(item.sourceName||item.source||'공식 출처')+' · 주관기관: '+(item.agency||'원문 확인')+' · 신청 기간: '+(item.applicationPeriod||'원문 확인')+' · 상태: '+supportNoticeStatus(item).label;
  const desc=document.createElement('p');desc.textContent=item.summary||'공고 내용과 제출 요건은 원문에서 직접 확인하세요.';
  body.append(title,facts,desc,link);
  $('assistancePlanList').textContent='지원 유형 및 공개된 비용 정보를 확인하고 있습니다.';
  $('assistanceRequestStatus').textContent='업무계약은 EKODIBIZ 승인 및 실제 결제 확인 후에만 진행합니다.';
  if(pushHistory){const u=new URL(location.href);u.searchParams.set('support_notice',supportNoticeKey(item));u.hash='support-detail';history.pushState(null,'',u)}
  pane.scrollIntoView({behavior:'smooth',block:'start'});
  try{await loadAssistanceCatalog();if(assistanceState.notice===item)assistanceRenderPlans()}catch{
    $('assistancePlanList').textContent='지원서비스 가격정보를 불러올 수 없습니다. 계약 요청을 진행할 수 없습니다.';
    $('assistanceRequestSubmit').disabled=true;
  }
  void loadAssistanceHistory();
}
function closeSupportDetail(){
  $('support-detail').hidden=true;assistanceState.notice=null;assistanceState.chosen.clear();
  const u=new URL(location.href);u.searchParams.delete('support_notice');u.hash='support-programs';history.pushState(null,'',u);
}
function initAssistanceRequest(){
  $('supportDetailClose').addEventListener('click',closeSupportDetail);
  $('assistanceRequestForm').addEventListener('submit',async event=>{
    event.preventDefault();
    const submit=$('assistanceRequestSubmit');if(assistanceState.busy||!assistanceState.notice)return;
    if(!state.session){$('assistanceRequestStatus').textContent='지원 요청을 저장하려면 로그인해야 합니다.';$('assistanceLoginLink').hidden=false;return}
    const plans=assistanceSelectedPlans();
    if(!plans.length){$('assistanceRequestStatus').textContent='지원 유형을 한 개 이상 선택하세요.';return}
    assistanceState.busy=true;submit.disabled=true;
    try{
      const item=assistanceState.notice;
      const body={noticeId:String(item.id||''),noticeTitle:item.title,noticeSource:item.source||item.sourceName,
        noticeUrl:supportSafeUrl(item.url),planIds:plans.map(p=>p.id),
        applicantName:$('assistanceApplicant').value,organization:$('assistanceOrganization').value,
        scopeAcknowledged:$('assistanceScopeConsent').checked,privacyAcknowledged:$('assistancePrivacyConsent').checked,
        precontractAcknowledged:$('assistancePrecontractConsent').checked};
      const result=await api('/api/commons/assistance/requests',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body)});
      $('assistanceRequestStatus').textContent=result.message||'검토 요청 접수 · 계약과 결제는 별도 확인 후 진행됩니다.';
      $('assistanceRequestForm').reset();void loadAssistanceHistory();
    }catch(error){$('assistanceRequestStatus').textContent='요청 저장 실패: '+(error.message==='assistance_schema_unavailable'?'서버 저장소 준비가 필요합니다.':'입력 또는 로그인 상태를 확인하세요.')}
    finally{assistanceState.busy=false;submit.disabled=false}
  });
}

initAssistanceRequest();
initSupportFeed();
initChat();
boot().catch(error=>{$('sessionState').textContent=`초기화 실패: ${error.message}`});
