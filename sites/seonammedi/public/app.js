const el=id=>document.getElementById(id);
const money=n=>typeof n==='number'?new Intl.NumberFormat('ko-KR',{style:'currency',currency:'KRW',maximumFractionDigits:0}).format(n):'자료 입력 전';
const safeUrl=value=>{try{const u=new URL(String(value||''));return u.protocol==='https:'?u.href:'#'}catch{return'#'}};
const mediaLabel=item=>item.type==='video'?'영상':item.type==='photo'?'사진':'자료';
const evidenceBlock=item=>{
  const evidence=(item.links||[]).map(link=>`<a class="evidence-link" href="${safeUrl(link.url)}" target="_blank" rel="noopener noreferrer"><span>근거자료</span>${link.label||link.source||'원문 보기'}</a>`).join('');
  const media=(item.media||[]).map(media=>`<a class="media-link media-${media.type||'source'}" href="${safeUrl(media.url)}" target="_blank" rel="noopener noreferrer"><span>${mediaLabel(media)}</span><strong>${media.label||'관련 자료 보기'}</strong><small>${[media.source,media.date].filter(Boolean).join(' · ')}</small></a>`).join('');
  return evidence||media?`<div class="evidence-row">${evidence}${media}</div>`:'';
};
const escapeHtml=value=>String(value??'').replace(/[<>&"]/g,c=>({'<':'&lt;','>':'&gt;','&':'&amp;','"':'&quot;'}[c]));
const kstDate=value=>{try{return new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Seoul',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(value)).replaceAll('-','.')}catch{return''}};
const genericWords=new Set(['국립의대','의과대학','관련','활동','일정','발표','추진','서남권','전남','광주','의대']);
const keywordsFor=event=>{
  if(Array.isArray(event.monitorKeywords)&&event.monitorKeywords.length)return event.monitorKeywords.map(v=>String(v).trim()).filter(Boolean);
  return [...new Set(String(event.title||'').match(/[가-힣A-Za-z0-9]{2,}/g)||[])].filter(word=>!genericWords.has(word)).slice(0,6);
};
const monitorMatches=(event,item)=>{
  if(!/^\d{4}\.\d{2}\.\d{2}$/.test(event.date||''))return false;
  if(kstDate(item.published_at||item.media_published_at||item.first_seen_at)!==event.date)return false;
  const corpus=(String(item.title||'')+' '+String(item.query_label||'')+' '+String(item.publisher||'')).toLowerCase();
  const keywords=keywordsFor(event);if(!keywords.length)return false;
  const hits=keywords.filter(keyword=>corpus.includes(String(keyword).toLowerCase())).length;
  return hits>=(Array.isArray(event.monitorKeywords)&&event.monitorKeywords.length?1:Math.min(2,keywords.length));
};
const attachMonitorMedia=items=>{
  const data=window.__SEONAM_MEDI_DATA;if(!data?.timeline)return;
  document.querySelectorAll('.auto-evidence-row').forEach(node=>node.remove());
  for(const event of data.timeline){
    const card=document.querySelector('.timeline-item[data-event-date="'+CSS.escape(String(event.date||''))+'"]');if(!card)continue;
    const known=new Set([...(event.links||[]).map(x=>x.url),...(event.media||[]).map(x=>x.url)].filter(Boolean));
    const matches=(items||[]).filter(item=>item.media_state==='candidate'&&['photo','video'].includes(item.media_type)&&monitorMatches(event,item)&&!known.has(item.resolved_url||item.url));
    if(!matches.length)continue;
    const row=document.createElement('div');row.className='evidence-row auto-evidence-row';
    for(const item of matches.slice(0,4)){
      const a=document.createElement('a');a.className='media-link media-'+item.media_type;a.href=safeUrl(item.resolved_url||item.url);a.target='_blank';a.rel='noopener noreferrer';
      const type=document.createElement('span');type.textContent=item.media_type==='video'?'자동수집 영상':'자동수집 사진';
      const title=document.createElement('strong');title.textContent=item.title||'관련 근거자료 후보';
      const meta=document.createElement('small');meta.textContent=[item.media_source||item.publisher,kstDate(item.media_published_at||item.published_at),'원문 확인 필요'].filter(Boolean).join(' · ');
      a.append(type,title,meta);row.append(a);
    }
    card.querySelector(':scope > div:last-child')?.append(row);
  }
};
let latestMonitorData=null;
const statusSourceRows=(rows,emptyText)=>rows.length?rows.map(s=>'<article class="source status-source"><a href="'+safeUrl(s.url)+'" target="_blank" rel="noopener noreferrer">'+escapeHtml(s.title||'자료')+'</a><small>'+escapeHtml([s.publisher,s.date,s.kind].filter(Boolean).join(' · '))+'</small></article>').join(''):'<p class="muted">'+escapeHtml(emptyText)+'</p>';
const renderStatusDetail=(key,d)=>{
  const panel=el('statusDetail');if(!panel)return;
  let label='CURRENT STATUS',title='',description='',body='',target='#status',targetLabel='관련 내용 보기';
  if(key==='official'){
    const rows=(d.sources||[]).filter(s=>/(공식|당사자)/.test(String(s.kind||''))).slice(0,8);
    label='OFFICIAL RECORD';title='공식 기록';description='정부·지자체·대학·비대위 등 자료의 주체와 성격을 구분해 원문 기준으로 확인할 수 있습니다.';
    body='<div class="status-detail-list">'+statusSourceRows(rows,'현재 연결된 공식 자료가 없습니다.')+'</div>';target='#records';targetLabel='관련자료 보기';
  }else if(key==='news'){
    const rows=(d.sources||[]).filter(s=>/(보도|언론)/.test(String(s.kind||''))).slice(0,8);
    label='RELATED NEWS';title='관련 보도';description='기사 제목·언론사·보도일을 확인하고 원문으로 바로 이동할 수 있습니다.';
    body='<div class="status-detail-list">'+statusSourceRows(rows,'현재 연결된 관련 보도가 없습니다.')+'</div>';target='#records';targetLabel='관련자료 보기';
  }else if(key==='daily'){
    const run=latestMonitorData&&latestMonitorData.lastRun;
    const rows=((latestMonitorData&&latestMonitorData.items)||[]).slice(0,6);
    const summary=run?('최근 점검 '+(run.status==='ok'?'정상':run.status==='partial'?'일부 확인':'확인 필요')+' · 출처 '+Number(run.sources_checked||0)+'개 · 신규 '+Number(run.new_items||0)+'건 · 사진·영상 근거 후보 '+Number((latestMonitorData&&latestMonitorData.mediaCandidateCount)||0)+'건'):'자동점검 상태를 불러오는 중입니다.';
    label='DAILY CHECK';title='일일 점검';description='EKODI가 공개 자료를 확인해 새 항목과 근거자료 후보를 수집하고, 원문 확인이 필요한 상태를 구분해 표시합니다.';
    body='<div class="monitor-summary status-monitor-summary">'+escapeHtml(summary)+'</div><div class="status-detail-list">'+statusSourceRows(rows.map(item=>({title:item.title||'수집 자료',url:item.resolved_url||item.url,publisher:item.publisher||'출처 확인 중',date:kstDate(item.published_at||item.media_published_at||item.first_seen_at),kind:'자동수집 · 원문 확인 필요'})),'최근 수집된 새 자료가 없습니다.')+'</div>';target='#status';targetLabel='일일점검 전체 보기';
  }else{
    const item=(d.status||[]).find(x=>x.key===key);title=item?.title||'현재 진행상황';description=item?.text||'';
  }
  panel.innerHTML='<div class="status-detail-head"><div><p class="eyebrow">'+escapeHtml(label)+'</p><h3>'+escapeHtml(title)+'</h3></div><a class="status-detail-link" href="'+target+'">'+escapeHtml(targetLabel)+'</a></div><p class="status-detail-description">'+escapeHtml(description)+'</p>'+body;
  panel.hidden=false;
  el('statusCards')?.querySelectorAll('.status-card').forEach(button=>button.setAttribute('aria-expanded',button.dataset.status===key?'true':'false'));
};
const closeStatusDetail=()=>{const panel=el('statusDetail');if(panel)panel.hidden=true;el('statusCards')?.querySelectorAll('.status-card').forEach(button=>button.setAttribute('aria-expanded','false'))};
const refreshStatusDetail=()=>{const active=el('statusCards')?.querySelector('.status-card[aria-expanded="true"]');if(active&&window.__SEONAM_MEDI_DATA)renderStatusDetail(active.dataset.status,window.__SEONAM_MEDI_DATA)};
async function load(){
const [r,timelineResponse,pageResponse]=await Promise.all([fetch('/seonammedi/data.json',{cache:'no-store'}),fetch('/api/seonammedi/timeline',{cache:'no-store'}).catch(()=>null),fetch('/api/seonammedi/page-data',{cache:'no-store'}).catch(()=>null)]);
if(!r.ok)throw new Error('data');const d=await r.json();
if(timelineResponse?.ok){const timelineBody=await timelineResponse.json().catch(()=>({}));if(Array.isArray(timelineBody.items))d.timeline=timelineBody.items}
if(pageResponse?.ok){const pageBody=await pageResponse.json().catch(()=>({}));if(Array.isArray(pageBody.page?.status?.items))d.status=pageBody.page.status.items;if(pageBody.page?.organization&&typeof pageBody.page.organization==='object')d.organization=pageBody.page.organization;if(pageBody.finance&&typeof pageBody.finance==='object')d.finance=pageBody.finance}
window.__SEONAM_MEDI_DATA=d;
el('lastUpdated').textContent='최종 업데이트 '+d.updatedAt;
const statusCards=el('statusCards');
statusCards.innerHTML=d.status.filter(x=>x?.key!=='daily').map((x,i)=>{const key=x.key||['official','news'][i]||('status-'+i);return `<button type="button" class="card status-card" data-status="${escapeHtml(key)}" aria-expanded="false" aria-controls="statusDetail"><span class="status-card-copy"><strong class="status-card-title">${escapeHtml(x.title)}</strong><span class="status-card-text">${escapeHtml(x.text)}</span></span><span class="status-card-action">내용 보기 <span aria-hidden="true">→</span></span></button>`}).join('');
statusCards.addEventListener('click',event=>{const button=event.target.closest('.status-card');if(!button)return;if(button.getAttribute('aria-expanded')==='true'){closeStatusDetail();return}renderStatusDetail(button.dataset.status,d)});
const cats=['전체',...new Set(d.timeline.map(x=>x.category))];
el('timelineFilters').innerHTML=cats.map((c,i)=>`<button data-cat="${c}" class="${i===0?'active':''}">${c}</button>`).join('');
const render=cat=>{const rows=cat==='전체'?d.timeline:d.timeline.filter(x=>x.category===cat);el('timelineList').innerHTML=rows.map(x=>`<article class="timeline-item" data-event-date="${x.date}"><div class="timeline-date">${x.date}</div><div><h3>${x.title}</h3><p>${x.summary}</p><div class="chips"><span class="chip">${x.category}</span><span class="chip">${x.evidence}</span></div>${evidenceBlock(x)}</div></article>`).join('')};
render('전체');el('timelineFilters').addEventListener('click',e=>{const b=e.target.closest('button');if(!b)return;[...el('timelineFilters').children].forEach(x=>x.classList.remove('active'));b.classList.add('active');render(b.dataset.cat);attachMonitorMedia(window.__SEONAM_MONITOR_ITEMS||[])});
const normalizeUrlKey=value=>{try{const u=new URL(String(value||''),location.origin);u.hash='';['utm_source','utm_medium','utm_campaign','utm_term','utm_content','fbclid','gclid'].forEach(k=>u.searchParams.delete(k));return u.href.replace(/\/$/,'')}catch{return String(value||'').trim().replace(/\/$/,'')}};
const timelineEvidenceUrls=new Set((d.timeline||[]).flatMap(item=>[...(item.links||[]).map(link=>link.url),...(item.media||[]).map(media=>media.url)]).filter(Boolean).map(normalizeUrlKey));
const seenMaterialKeys=new Set();
const materialItems=[
  ...(Array.isArray(d.sources)?d.sources:[]).map(item=>({
    category:/(공식|당사자)/.test(String(item.kind||''))?'공식자료':'관련보도',
    date:item.date||'',
    title:item.title||'자료',
    publisher:item.publisher||'',
    subtype:item.kind||'자료',
    summary:'',
    verification:'',
    url:item.url||''
  })),
  ...(Array.isArray(d.publicPosts)?d.publicPosts:[]).map(item=>({
    category:'시민·온라인자료',
    date:item.date||'',
    title:item.title||'공개 게시물',
    publisher:item.publisher||'',
    subtype:item.sourceType||'온라인자료',
    summary:item.summary||'',
    verification:item.verification||'원문 확인 필요',
    url:item.url||''
  }))
].filter(item=>{
  const urlKey=normalizeUrlKey(item.url);
  if(urlKey&&timelineEvidenceUrls.has(urlKey))return false;
  const titleKey=String(item.title||'').toLowerCase().replace(/\s+/g,' ').trim();
  const key=urlKey||[item.date||'',titleKey,item.publisher||''].join('|');
  if(!key||seenMaterialKeys.has(key))return false;
  seenMaterialKeys.add(key);return true;
});
const materialCats=['전체','공식자료','관련보도','시민·온라인자료'];
const materialFilters=el('materialFilters'),materialList=el('materialList');
if(materialFilters&&materialList){
  materialFilters.innerHTML=materialCats.map((cat,i)=>`<button data-material-cat="${escapeHtml(cat)}" class="${i===0?'active':''}">${escapeHtml(cat)}</button>`).join('');
  const renderMaterials=cat=>{
    const rows=(cat==='전체'?materialItems:materialItems.filter(item=>item.category===cat)).slice().sort((a,b)=>String(b.date).localeCompare(String(a.date)));
    materialList.innerHTML=rows.length?rows.map(item=>`<article class="material-item"><div class="material-date">${escapeHtml(item.date||'날짜 확인 중')}</div><div><h3><a href="${safeUrl(item.url)}" target="_blank" rel="noopener noreferrer">${escapeHtml(item.title)}</a></h3>${item.summary?'<p>'+escapeHtml(item.summary)+'</p>':''}<div class="public-post-meta"><span class="source-type">${escapeHtml(item.category)}</span><span class="source-type">${escapeHtml(item.subtype)}</span>${item.publisher?'<span class="source-type">'+escapeHtml(item.publisher)+'</span>':''}${item.verification?'<span class="verify-state">'+escapeHtml(item.verification)+'</span>':''}</div></div></article>`).join(''):'<p class="muted">표시할 관련자료가 없습니다.</p>';
  };
  renderMaterials('전체');
  materialFilters.addEventListener('click',event=>{const button=event.target.closest('button');if(!button)return;[...materialFilters.children].forEach(x=>x.classList.remove('active'));button.classList.add('active');renderMaterials(button.dataset.materialCat)});
}
const org=d.organization||{};
const ORG_GROUP_META=[['bidae','비대위'],['mokpo','목포대'],['minhak','민학비대위']];
const ORG_LEGACY_KEYS={bidae:'integrated',minhak:'civic'};
const cleanOrgPublicText=value=>String(value||'').replace(/\s*\([^)]*위원회\s*겸임[^)]*\)/g,'').trim();
const publicOrgStatusLabel=group=>group?.key!=='minhak'&&String(group?.statusLabel||'').trim()==='운영 중'?'':String(group?.statusLabel||'').trim();
const orgGroups=Array.isArray(org.groups)&&org.groups.length
  ?ORG_GROUP_META.map(([key,label])=>{const legacyKey=ORG_LEGACY_KEYS[key];const found=org.groups.find(group=>group.key===key)||(legacyKey?org.groups.find(group=>group.key===legacyKey):null);return{...(found||{}),key,label}})
  :ORG_GROUP_META.map(([key,label],index)=>index===0?{key,label,levels:org.levels||[],committees:org.committees||[],participants:org.participants||[]}:{key,label,status:key==='minhak'?'forming':'active',statusLabel:key==='minhak'?'구성 논의 중':'',levels:[],committees:[],participants:[]});
const chart=el('organizationChart');
const participantHost=el('participantOrganizations');
const orgTabs=el('organizationTabs');
function renderOrganizationGroup(key){
  const group=orgGroups.find(item=>item.key===key)||orgGroups[0];
  if(chart){
    const statusLabel=publicOrgStatusLabel(group);const status=statusLabel?'<p class="note org-status">'+escapeHtml(statusLabel)+'</p>':'';
    const levels=(group.levels||[]).map(level=>'<article class="org-level"><strong>'+escapeHtml(level.name)+'</strong>'+(Array.isArray(level.members)&&level.members.length?'<p>'+level.members.map(cleanOrgPublicText).filter(Boolean).map(escapeHtml).join(' · ')+'</p>':'')+'</article>').join('');
    const committees=(group.committees||[]).map(item=>'<article class="org-committee"><strong>'+escapeHtml(item.name)+'</strong><span>'+escapeHtml(cleanOrgPublicText(item.lead)||'담당자 확인 중')+'</span></article>').join('');
    chart.innerHTML=status+((levels||committees)?'<div class="org-levels">'+levels+'</div><div class="org-committees">'+committees+'</div>':'<p class="muted">등록된 조직 구성이 없습니다.</p>');
  }
  if(participantHost){
    const participants=(group.participants||[]).filter(item=>item&&item.visible!==false).slice().sort((a,b)=>String(a.name||'').localeCompare(String(b.name||''),'ko-KR'));
    participantHost.innerHTML=participants.length?participants.map(item=>'<article class="participant-item"><strong>'+escapeHtml(item.name||'')+'</strong>'+(item.representative?'<span>대표 '+escapeHtml(item.representative)+'</span>':'')+(item.url?'<a href="'+safeUrl(item.url)+'" target="_blank" rel="noopener noreferrer">연결</a>':'')+'</article>').join(''):'<p class="muted">등록 준비중</p>';
  }
  if(orgTabs)[...orgTabs.querySelectorAll('button')].forEach(button=>{const active=button.dataset.orgGroup===group.key;button.classList.toggle('active',active);button.setAttribute('aria-selected',active?'true':'false')});
}
if(orgTabs){
  orgTabs.innerHTML=orgGroups.map((group,index)=>'<button type="button" data-org-group="'+escapeHtml(group.key)+'" class="'+(index===0?'active':'')+'" role="tab" aria-selected="'+(index===0?'true':'false')+'">'+escapeHtml(group.label)+'</button>').join('');
  orgTabs.addEventListener('click',event=>{const button=event.target.closest('button[data-org-group]');if(button)renderOrganizationGroup(button.dataset.orgGroup)});
}
renderOrganizationGroup('bidae');
el('raised').textContent=money(d.finance.raised);el('spent').textContent=money(d.finance.spent);el('balance').textContent=money(d.finance.balance);
const financeHost=el('financeList');if(financeHost){const rows=Array.isArray(d.finance.entries)?d.finance.entries:[];financeHost.innerHTML=rows.length?rows.map(item=>'<article class="material-item"><div class="material-date">'+escapeHtml(item.date||'')+'</div><div><h3>'+escapeHtml((item.type==='income'?'수입 ':'지출 ')+money(Number(item.amount||0)))+'</h3><p>'+escapeHtml(item.purpose||'')+'</p><div class="public-post-meta">'+(item.event?'<span class="source-type">'+escapeHtml(item.event)+'</span>':'')+'<span class="source-type">'+escapeHtml(item.evidenceStatus==='verified'?'증빙 확인완료':item.evidenceStatus==='held'?'증빙 보유':'증빙 미등록')+'</span></div>'+(item.note?'<p>'+escapeHtml(item.note)+'</p>':'')+'</div></article>').join(''):'<p class="muted">공개된 회계내역이 없습니다.</p>'}}

const siteReady=load().catch(()=>{el('lastUpdated').textContent='데이터를 불러오지 못했습니다.'});
async function loadMonitor(){
  const badge=el('monitorBadge'),summary=el('monitorSummary'),list=el('monitorList');
  try{
    const response=await fetch('/api/seonammedi/monitor',{cache:'no-store'});
    const data=await response.json().catch(()=>({}));
    latestMonitorData=data;
    if(!response.ok||!data.ok)throw new Error(data.message||'점검 상태를 불러오지 못했습니다.');
    const run=data.lastRun;
    badge.textContent=run?.completed_at?'사이트 자동점검: '+new Date(run.completed_at).toLocaleString('ko-KR',{timeZone:'Asia/Seoul',month:'numeric',day:'numeric',hour:'2-digit',minute:'2-digit'}):'사이트 자동점검: 첫 실행 대기';
    summary.textContent=run?('최근 점검 '+(run.status==='ok'?'정상':run.status==='partial'?'일부 확인':'확인 필요')+' · 출처 '+run.sources_checked+'개 · 신규 '+run.new_items+'건 · 사진·영상 근거 후보 '+Number(data.mediaCandidateCount||0)+'건'):'첫 자동점검은 매일 08:00에 실행됩니다.';
    const rows=(data.items||[]).slice(0,18);window.__SEONAM_MONITOR_ITEMS=data.items||[];attachMonitorMedia(window.__SEONAM_MONITOR_ITEMS);
    list.innerHTML=rows.length?rows.map(item=>`<article class="source"><a href="${safeUrl(item.resolved_url||item.url)}" target="_blank" rel="noopener noreferrer">${escapeHtml(item.title||'')}</a>${item.summary_text?'<p>'+escapeHtml(item.summary_text)+'</p>':''}<small>${escapeHtml(item.publisher||'출처 확인 중')} · 자동수집 ${item.source_type==='blog'?'블로그':'보도'}${item.media_type?' · '+(item.media_type==='video'?'영상 근거 후보':'사진 근거 후보'):''} · ${item.source_type==='blog'?'개인·온라인 게시물 / 공식자료 교차확인 필요':'원문 확인 필요'}</small></article>`).join(''):'<p class="muted">최근 7일 내 새로 수집된 공개 자료가 없습니다.</p>';
    refreshStatusDetail();
  }catch(error){
    latestMonitorData=null;
    badge.textContent='사이트 자동점검: 준비 중';
    summary.textContent=error.message||'점검 상태를 불러오지 못했습니다.';
    list.innerHTML='';
    refreshStatusDetail();
  }
}
// 사이트 자동점검 상태는 관리자 페이지에서만 표시합니다.


const voiceForm=el('voiceForm');
if(voiceForm){
  const status=el('voiceStatus'),submitButton=voiceForm.querySelector('button[type="submit"]');
  voiceForm.addEventListener('input',()=>{status.textContent=''});
  voiceForm.addEventListener('submit',async event=>{
    event.preventDefault();
    if(submitButton?.disabled)return;
    const form=new FormData(voiceForm);
    const payload={category:form.get('category'),name:form.get('name'),contact:form.get('contact'),message:form.get('message'),publicConsent:form.get('publicConsent')==='on',privacyConsent:form.get('privacyConsent')==='on'};
    if(!String(payload.message||'').trim()){status.textContent='내용을 입력해 주세요.';return}
    if(!payload.privacyConsent){status.textContent='개인정보 처리 동의가 필요합니다.';return}
    if(submitButton)submitButton.disabled=true;
    status.textContent='접수 중…';
    try{
      const response=await fetch('/api/seonammedi/voices',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(payload)});
      const body=await response.json().catch(()=>({}));
      if(!response.ok||body.ok!==true||!body.submissionId){const detail=body.message||body.error||body.code||('HTTP '+response.status);throw new Error('접수하지 못했습니다. '+detail)}
      voiceForm.reset();
      status.textContent=body.message||'접수되었습니다.';
    }catch(error){
      status.textContent=error.message||'접수하지 못했습니다. 잠시 후 다시 시도해 주세요.';
    }finally{
      if(submitButton)submitButton.disabled=false;
    }
  });
}


const viewAliases={status:'status',monitor:'status',organization:'organization',records:'records',timeline:'records',materials:'records',news:'records','public-posts':'records',notices:'notices',voices:'voices',channels:'channels',finance:'finance'};
function showView(view,{updateHash=false}={}){
  const key=viewAliases[view]||'';
  document.querySelectorAll('[data-view-section]').forEach(section=>{section.hidden=section.dataset.viewSection!==key});
  document.querySelectorAll('[data-view-link]').forEach(link=>{
    const active=link.dataset.viewLink===key;
    if(active)link.setAttribute('aria-current','page');else link.removeAttribute('aria-current');
  });
  const hero=document.querySelector('.hero');
  if(hero)hero.hidden=Boolean(key);
  if(updateHash){
    const next=key?'#'+key:location.pathname;
    history.pushState({view:key},'',next);
  }
  if(key){
    const first=document.querySelector('[data-view-section="'+CSS.escape(key)+'"]');
    first?.scrollIntoView({block:'start'});
  }else window.scrollTo({top:0});
}
function syncViewFromLocation(){
  const raw=location.hash.replace(/^#/,'');
  showView(raw,{updateHash:false});
}
document.querySelector('.site-header nav')?.addEventListener('click',event=>{
  const link=event.target.closest('[data-view-link]');
  if(!link)return;
  event.preventDefault();
  showView(link.dataset.viewLink,{updateHash:true});
});
window.addEventListener('popstate',syncViewFromLocation);
syncViewFromLocation();

async function loadNotices(){
  const host=el('noticeList');if(!host)return;
  try{
    const response=await fetch('/api/seonammedi/notices',{cache:'no-store'});
    const data=await response.json().catch(()=>({}));
    if(!response.ok||!data.ok)throw new Error(data.message||'공지 목록을 불러오지 못했습니다.');
    const rows=Array.isArray(data.items)?data.items:[];
    host.innerHTML=rows.length?rows.map(item=>{
      const date=item.published_at||item.updated_at||'';
      const dateText=date?new Date(date).toLocaleDateString('ko-KR',{timeZone:'Asia/Seoul'}):'';
      return '<article class="notice-item"><h3>'+escapeHtml(item.title||'공지')+(item.pinned?'<span class="notice-pin">중요</span>':'')+'</h3><p>'+escapeHtml(item.body||'')+'</p><small>'+escapeHtml(dateText)+'</small></article>';
    }).join(''):'<p class="muted">등록된 공지가 없습니다.</p>';
  }catch(error){
    host.innerHTML='<p class="muted">'+escapeHtml(error.message||'공지 목록을 불러오지 못했습니다.')+'</p>';
  }
}
loadNotices();

const channelPlatformLabel=value=>({youtube:'YouTube',instagram:'Instagram',facebook:'Facebook',blog:'블로그',website:'웹사이트',other:'기타'})[String(value||'').toLowerCase()]||'채널';
const channelCategoryLabel=value=>({official:'공식','related-org':'관련기관',media:'미디어',civic:'시민·단체',other:'기타'})[String(value||'').toLowerCase()]||'관련';
const channelEmbedPolicy=platform=>({youtube:'embed',instagram:'preview',facebook:'preview',blog:'preview',website:'preview',other:'preview'})[String(platform||'').toLowerCase()]||'preview';
let publicChannels=[];
let channelPreviewSeq=0;
function renderChannelFallback(item,data={}){
  const host=el('channelPreviewFallback');if(!host)return;
  const title=escapeHtml(data.title||item.name||'관련 채널');
  const description=escapeHtml(data.description||item.note||'등록된 공개 채널입니다.');
  const image=safeUrl(data.image||'');
  const platform=channelPlatformLabel(item.platform);
  const hint=channelEmbedPolicy(item.platform)==='embed'
    ?'채널 미리보기를 불러오지 못해 공개 채널 정보로 표시합니다.'
    :'이 채널은 외부 사이트 전체 화면 삽입을 제한하므로 안전한 미리보기와 원문 링크로 표시합니다.';
  host.innerHTML='<div class="channel-preview-summary">'+(image!=='#'?'<img src="'+image+'" alt="" loading="lazy">':'')+'<div><span class="source-type">'+escapeHtml(platform)+'</span><h4>'+title+'</h4><p>'+description+'</p><small>'+escapeHtml(hint)+'</small></div></div>';
  host.hidden=false;
}
async function showChannelPreview(index){
  const item=publicChannels[index];if(!item)return;
  const seq=++channelPreviewSeq;
  const preview=el('channelPreview'),frame=el('channelPreviewFrame'),fallback=el('channelPreviewFallback'),title=el('channelPreviewTitle'),metaHost=el('channelPreviewMeta'),open=el('channelPreviewOpen');
  const url=safeUrl(item.url);
  const platform=String(item.platform||'').toLowerCase();
  const policy=channelEmbedPolicy(platform);
  const meta=[channelPlatformLabel(item.platform),channelCategoryLabel(item.category),item.official?'공식 확인':'관련 채널'].filter(Boolean).join(' · ');
  if(title)title.textContent=item.name||'관련 채널';
  if(metaHost)metaHost.textContent=meta;
  if(open){open.href=url;open.setAttribute('aria-label',(item.name||'관련 채널')+' 원문 채널 열기')}
  if(frame){frame.hidden=true;frame.src='about:blank';frame.title=(item.name||'관련 채널')+' 미리보기'}
  if(fallback){fallback.hidden=false;fallback.innerHTML='<p class="muted">채널 화면을 준비 중입니다.</p>'}
  if(preview)preview.hidden=false;
  el('publicChannelTabs')?.querySelectorAll('[data-channel-index]').forEach(button=>{
    const active=Number(button.dataset.channelIndex)===index;
    button.classList.toggle('active',active);
    button.setAttribute('aria-selected',active?'true':'false');
    button.tabIndex=active?0:-1;
  });
  let providerPreview=null;
  if(['instagram','youtube','facebook'].includes(platform)){
    try{
      const response=await fetch('/api/seonammedi/channels/'+encodeURIComponent(item.id)+'/preview',{cache:'no-store'});
      const body=await response.json().catch(()=>({}));
      if(response.ok&&body.ok)providerPreview=body.preview||null;
    }catch{}
  }
  if(seq!==channelPreviewSeq)return;
  const embedUrl=policy==='embed'?safeUrl(providerPreview?.embedUrl||''):'#';
  if(embedUrl!=='#'&&frame){
    let settled=false;
    const fallbackTimer=setTimeout(()=>{
      if(settled||seq!==channelPreviewSeq)return;
      frame.hidden=true;frame.src='about:blank';renderChannelFallback(item,providerPreview||{});
    },4500);
    frame.onload=()=>{settled=true;clearTimeout(fallbackTimer)};
    frame.onerror=()=>{settled=true;clearTimeout(fallbackTimer);frame.hidden=true;frame.src='about:blank';renderChannelFallback(item,providerPreview||{})};
    frame.src=embedUrl;
    frame.hidden=false;
    if(fallback)fallback.hidden=true;
  }else{
    renderChannelFallback(item,providerPreview||{});
  }
}
async function loadChannels(){
  const host=el('publicChannelTabs');if(!host)return;
  try{
    const response=await fetch('/api/seonammedi/channels',{cache:'no-store'});
    const data=await response.json().catch(()=>({}));
    if(!response.ok||!data.ok)throw new Error(data.message||'채널 목록을 불러오지 못했습니다.');
    publicChannels=(Array.isArray(data.items)?data.items:[]).filter(item=>safeUrl(item.url)!=='#');
    if(!publicChannels.length){
      host.innerHTML='<span class="muted">등록된 공개 채널이 없습니다.</span>';
      const preview=el('channelPreview');if(preview)preview.hidden=true;
      return;
    }
    host.innerHTML=publicChannels.map((item,index)=>{
      const platform=channelPlatformLabel(item.platform);
      return '<button type="button" class="channel-tab'+(index===0?' active':'')+'" role="tab" aria-selected="'+(index===0?'true':'false')+'" tabindex="'+(index===0?'0':'-1')+'" data-channel-index="'+index+'"><span>'+escapeHtml(platform)+'</span><strong>'+escapeHtml(item.name||'관련 채널')+'</strong></button>';
    }).join('');
    host.addEventListener('click',event=>{const button=event.target.closest('[data-channel-index]');if(button)showChannelPreview(Number(button.dataset.channelIndex))});
    host.addEventListener('keydown',event=>{
      const buttons=[...host.querySelectorAll('[data-channel-index]')];if(!buttons.length||!['ArrowLeft','ArrowRight','Home','End'].includes(event.key))return;
      event.preventDefault();
      const current=Math.max(0,buttons.findIndex(button=>button.getAttribute('aria-selected')==='true'));
      const next=event.key==='Home'?0:event.key==='End'?buttons.length-1:(current+(event.key==='ArrowRight'?1:-1)+buttons.length)%buttons.length;
      showChannelPreview(next);buttons[next]?.focus();
    });
    showChannelPreview(0);
  }catch(error){
    publicChannels=[];
    host.innerHTML='<span class="muted">'+escapeHtml(error.message||'채널 목록을 불러오지 못했습니다.')+'</span>';
    const preview=el('channelPreview');if(preview)preview.hidden=true;
  }
}
loadChannels();
