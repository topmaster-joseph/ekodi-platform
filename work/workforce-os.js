(()=>{
  const cfg=window.EKODI_WORK_CONFIG||{dataEnabled:false};
  const $=selector=>document.querySelector(selector);
  const typeLabel={university:'대학',merchant_association:'상인회·상권',municipality:'지자체',institution:'기관',community:'지역 커뮤니티'};
  const statusLabel={pilot:'파일럿',active:'운영중',planning:'준비중',paused:'일시중지',submitted:'접수',reviewing:'검토중',approved:'승인',rejected:'종료',ready:'준비완료',closed:'종료'};
  let client=null;
  try{if(typeof sb!=='undefined')client=sb}catch{}
  if(!client&&cfg.dataEnabled&&window.supabase){client=window.supabase.createClient(cfg.supabaseUrl,cfg.supabasePublishableKey,{auth:{persistSession:true,autoRefreshToken:true,detectSessionInUrl:false}})}

  function notice(message){
    try{if(typeof toast==='function')return toast(message)}catch{}
    const el=$('#toast');
    if(!el)return;
    el.textContent=message;el.classList.add('show');setTimeout(()=>el.classList.remove('show'),2500);
  }
  function split(value){return String(value||'').split(',').map(v=>v.trim()).filter(Boolean)}
  async function currentSession(){if(!client)return null;return (await client.auth.getSession()).data.session||null}
  async function requireSession(){const session=await currentSession();if(session)return session;$('#loginBtn')?.click();return null}
  function setPrivateState(signedIn){document.querySelectorAll('[data-work-private]').forEach(el=>el.classList.toggle('signed-out',!signedIn))}

  function renderNetworkExamples(){
    const host=$('#networkModelGrid');if(!host)return;
    const models=[
      ['대학 Work Network','학생·졸업생의 일경험과 지역 사업장을 연결하고 성과를 한곳에서 관리합니다.','university'],
      ['상권 Work Network','회원점은 기본 등록을 가볍게 쓰고, 상권은 반복되는 인력수요를 공동으로 관리합니다.','merchant_association'],
      ['지역 Work Network','지자체·기관은 지역의 수요와 연결 흐름을 보되 개인의 민감정보는 분리해 관리합니다.','municipality']
    ];
    host.replaceChildren();
    models.forEach(([title,copy,type])=>{const card=document.createElement('article');card.className='network-model-card';const badge=document.createElement('span');badge.textContent=typeLabel[type];const h=document.createElement('h3');h.textContent=title;const p=document.createElement('p');p.textContent=copy;card.append(badge,h,p);host.append(card)});
  }

  function networkCard(network){
    const card=document.createElement('article');card.className='network-card';
    const top=document.createElement('div');top.className='network-card-top';
    const type=document.createElement('span');type.className='network-type';type.textContent=typeLabel[network.network_type]||'지역 네트워크';
    const status=document.createElement('span');status.className=`network-status status-${network.status}`;status.textContent=statusLabel[network.status]||network.status;
    top.append(type,status);
    const h=document.createElement('h3');h.textContent=network.name;
    const meta=document.createElement('p');meta.className='network-meta';meta.textContent=[network.operator_name,network.region].filter(Boolean).join(' · ');
    const desc=document.createElement('p');desc.textContent=network.description||'지역의 사람과 일을 하나의 운영망에서 연결합니다.';
    card.append(top,h,meta,desc);return card;
  }

  async function loadNetworks(){
    renderNetworkExamples();const host=$('#networkGrid'),empty=$('#networkEmpty');if(!host||!empty)return;
    host.replaceChildren();
    if(!client){empty.textContent='격리 스테이징에서는 운영 Network 데이터를 연결하지 않습니다. 화면과 권한 계약만 검증합니다.';empty.classList.remove('hide');return}
    try{
      const {data,error}=await client.from('work_networks').select('id,slug,name,network_type,operator_name,region,description,status,created_at,updated_at').order('name');
      if(error)throw error;(data||[]).forEach(row=>host.append(networkCard(row)));empty.classList.toggle('hide',(data||[]).length>0);
      if(!(data||[]).length)empty.textContent='아직 공개 운영 중인 Work Network가 없습니다. 기관·지역 단위 파일럿을 요청하면 별도 검토 후 개설합니다.';
    }catch(error){console.error(error);empty.textContent='Work Network 목록을 불러오지 못했습니다.';empty.classList.remove('hide')}
  }

  async function loadPassport(session){
    const form=$('#passportForm'),empty=$('#relationshipEmpty');if(!form)return;
    if(!client||!session){form.reset();if(empty){empty.textContent='로그인하면 나의 Work Passport와 연결 이력을 확인할 수 있습니다.';empty.classList.remove('hide')}return}
    try{
      const {data,error}=await client.from('work_passports').select('*').eq('user_id',session.user.id).maybeSingle();if(error)throw error;
      const p=data||{};form.availability_text.value=p.availability_text||'';form.preferred_types.value=(p.preferred_types||[]).join(', ');form.mobility_text.value=p.mobility_text||'';form.experience_summary.value=p.experience_summary||'';form.alerts_opt_in.checked=!!p.alerts_opt_in;
    }catch(error){console.error(error);notice('Work Passport를 불러오지 못했습니다.')}
    await loadRelationships(session);
  }

  async function savePassport(event){
    event.preventDefault();const session=await requireSession();if(!session||!client)return;
    const form=event.currentTarget,payload={user_id:session.user.id,availability_text:form.availability_text.value.trim(),preferred_types:split(form.preferred_types.value),mobility_text:form.mobility_text.value.trim(),experience_summary:form.experience_summary.value.trim(),alerts_opt_in:form.alerts_opt_in.checked,updated_at:new Date().toISOString()};
    const {error}=await client.from('work_passports').upsert(payload,{onConflict:'user_id'});if(error){console.error(error);return notice('Work Passport를 저장하지 못했습니다.')}notice('Work Passport를 저장했습니다.')
  }

  async function loadRelationships(session){
    const host=$('#relationshipList'),empty=$('#relationshipEmpty');if(!host||!empty)return;host.replaceChildren();
    if(!client||!session){empty.classList.remove('hide');return}
    try{
      const {data,error}=await client.rpc('work_my_relationships');if(error)throw error;
      (data||[]).forEach(item=>{const row=document.createElement('div');row.className='relationship-item';const main=document.createElement('div');const strong=document.createElement('strong');strong.textContent=item.job_title||'연결된 일';const meta=document.createElement('span');meta.textContent=[item.organization_name,statusLabel[item.status]||item.status].filter(Boolean).join(' · ');main.append(strong,meta);const when=document.createElement('time');when.textContent=item.connected_at?new Date(item.connected_at).toLocaleDateString('ko-KR'):'';row.append(main,when);host.append(row)});
      empty.classList.toggle('hide',(data||[]).length>0);if(!(data||[]).length)empty.textContent='아직 확정된 연결 이력이 없습니다. 실제 채용 연결이 생기면 이곳에 쌓입니다.';
    }catch(error){console.error(error);empty.textContent='연결 이력을 불러오지 못했습니다.';empty.classList.remove('hide')}
  }

  async function saveNetworkRequest(event){
    event.preventDefault();const session=await requireSession();if(!session||!client)return;
    const form=event.currentTarget,payload={requester_user_id:session.user.id,organization_name:form.organization_name.value.trim(),network_type:form.network_type.value,region:form.region.value.trim(),note:form.note.value.trim(),status:'submitted'};
    const {error}=await client.from('work_network_requests').insert(payload);if(error){console.error(error);return notice('Network 요청을 저장하지 못했습니다.')}form.reset();notice('지역 Work Network 도입 요청을 접수했습니다.');await loadNetworkRequests(session)
  }

  async function loadNetworkRequests(session){
    const host=$('#networkRequestList');if(!host)return;host.replaceChildren();if(!client||!session)return;
    try{const {data,error}=await client.from('work_network_requests').select('id,organization_name,network_type,region,status,created_at').order('created_at',{ascending:false}).limit(5);if(error)throw error;(data||[]).forEach(item=>{const row=document.createElement('div');row.className='request-status-row';const main=document.createElement('div');const strong=document.createElement('strong');strong.textContent=item.organization_name;const small=document.createElement('span');small.textContent=[typeLabel[item.network_type],item.region].filter(Boolean).join(' · ');main.append(strong,small);const badge=document.createElement('b');badge.textContent=statusLabel[item.status]||item.status;row.append(main,badge);host.append(row)})}catch(error){console.error(error)}
  }

  async function saveQuickHire(event){
    event.preventDefault();const session=await requireSession();if(!session||!client)return;
    const form=event.currentTarget,brief=form.brief.value.trim();if(brief.length<8)return notice('필요한 사람과 시간을 조금 더 구체적으로 적어 주세요.');
    const {data:orgData,error:orgError}=await client.rpc('work_get_my_organization');if(orgError){console.error(orgError);return notice('사업장 정보를 확인하지 못했습니다.')}const org=(Array.isArray(orgData)?orgData[0]:orgData)||null;if(!org)return notice('사업장 정보를 먼저 저장해 주세요.');
    const payload={organization_id:org.id,created_by:session.user.id,brief,urgency:form.urgency.value,target_date:form.target_date.value||null,status:'submitted'};
    const {error}=await client.from('work_quick_hire_requests').insert(payload);if(error){console.error(error);return notice('빠른 채용 요청을 저장하지 못했습니다.')}form.reset();notice('빠른 채용 요청을 저장했습니다. 공고 작성과는 별도로 관리됩니다.');await loadQuickHireRequests(session)
  }

  async function loadQuickHireRequests(session){
    const host=$('#quickHireList');if(!host)return;host.replaceChildren();if(!client||!session)return;
    try{const {data,error}=await client.from('work_quick_hire_requests').select('id,brief,urgency,target_date,status,created_at').order('created_at',{ascending:false}).limit(5);if(error)throw error;(data||[]).forEach(item=>{const row=document.createElement('div');row.className='request-status-row';const main=document.createElement('div');const strong=document.createElement('strong');strong.textContent=item.brief.length>70?`${item.brief.slice(0,70)}…`:item.brief;const small=document.createElement('span');small.textContent=[item.urgency==='urgent'?'긴급':item.urgency==='this_week'?'이번 주':'일반',item.target_date||''].filter(Boolean).join(' · ');main.append(strong,small);const badge=document.createElement('b');badge.textContent=statusLabel[item.status]||item.status;row.append(main,badge);host.append(row)})}catch(error){console.error(error)}
  }

  async function refreshPrivate(sessionArg){const session=sessionArg||await currentSession();setPrivateState(!!session);await Promise.all([loadPassport(session),loadNetworkRequests(session),loadQuickHireRequests(session)])}

  function bind(){
    $('#passportForm')?.addEventListener('submit',savePassport);
    $('#networkRequestForm')?.addEventListener('submit',saveNetworkRequest);
    $('#quickHireForm')?.addEventListener('submit',saveQuickHire);
    $('#networkStartBtn')?.addEventListener('click',()=>{$('.nav-link[data-view="network"]')?.click();setTimeout(()=>$('#networkRequestForm')?.scrollIntoView({behavior:'smooth',block:'center'}),80)});
  }

  bind();loadNetworks();refreshPrivate();
  if(client)client.auth.onAuthStateChange((_event,session)=>setTimeout(()=>refreshPrivate(session),0));
})();
