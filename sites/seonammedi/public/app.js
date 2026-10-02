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
    body='<div class="status-detail-list">'+statusSourceRows(rows,'현재 연결된 공식 자료가 없습니다.')+'</div>';target='#status';targetLabel='근거자료 보기';
  }else if(key==='news'){
    const rows=(d.sources||[]).filter(s=>/(보도|언론)/.test(String(s.kind||''))).slice(0,8);
    label='RELATED NEWS';title='관련 보도';description='기사 제목·언론사·보도일을 확인하고 원문으로 바로 이동할 수 있습니다.';
    body='<div class="status-detail-list">'+statusSourceRows(rows,'현재 연결된 관련 보도가 없습니다.')+'</div>';target='#status';targetLabel='근거자료 보기';
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
if(statusCards){
  statusCards.innerHTML=d.status.filter(x=>x?.key!=='daily').map((x,i)=>{const key=x.key||['official','news'][i]||('status-'+i);return `<button type="button" class="card status-card" data-status="${escapeHtml(key)}" aria-expanded="false" aria-controls="statusDetail"><span class="status-card-copy"><strong class="status-card-title">${escapeHtml(x.title)}</strong><span class="status-card-text">${escapeHtml(x.text)}</span></span><span class="status-card-action">내용 보기 <span aria-hidden="true">→</span></span></button>`}).join('');
  statusCards.addEventListener('click',event=>{const button=event.target.closest('.status-card');if(!button)return;if(button.getAttribute('aria-expanded')==='true'){closeStatusDetail();return}renderStatusDetail(button.dataset.status,d)});
}
// Canonical public activity-history filter labels/order.
const timelineCategoryLabel=value=>String(value||'').trim()==='비대위 활동'?'비대위 활동이력':String(value||'').trim();
const cats=['전체','비대위 활동이력','장기현안','정부·대학','후보대학 선정'];
el('timelineFilters').innerHTML=cats.map((c,i)=>`<button data-cat="${escapeHtml(c)}" class="${i===0?'active':''}">${escapeHtml(c)}</button>`).join('');
const render=cat=>{const rows=cat==='전체'?d.timeline:d.timeline.filter(x=>timelineCategoryLabel(x.category)===cat);el('timelineList').innerHTML=rows.map(x=>`<article class="timeline-item" data-event-date="${escapeHtml(x.date)}"><div class="timeline-date">${escapeHtml(x.date)}</div><div><h3>${escapeHtml(x.title)}</h3><p>${escapeHtml(x.summary)}</p><div class="chips"><span class="chip">${escapeHtml(timelineCategoryLabel(x.category))}</span><span class="chip">${escapeHtml(x.evidence)}</span></div>${evidenceBlock(x)}</div></article>`).join('')};
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
const officialDetailCategory=item=>{
  const corpus=[item.publisher,item.subtype,item.title].filter(Boolean).join(' ');
  if(/비대위|대책위|당사자|공식입장|기자회견문/.test(corpus))return'비대위·당사자';
  if(/국립목포대학교|목포대|순천대|대학교|대학/.test(corpus))return'대학';
  if(/국회|법원|교육부|보건복지부|정부|전라남도|전남|목포시|지자체|시청|도청/.test(corpus))return'정부·지자체·국회';
  return'기타 공식기록';
};
const newsDetailCategory=item=>{
  const corpus=[item.publisher,item.subtype,item.title].filter(Boolean).join(' ');
  if(/일지|경과/.test(corpus))return'경과·일지';
  if(/기자회견|집회|현장|행사/.test(corpus))return'현장·행사 보도';
  if(/인터뷰|기고|해설|분석|쟁점/.test(corpus))return'해설·분석';
  return'일반보도';
};
for(const item of materialItems){
  item.detailCategory=item.category==='공식자료'?officialDetailCategory(item):item.category==='관련보도'?newsDetailCategory(item):'시민·온라인자료';
}
const MATERIAL_DETAIL_CATS={
  '관련보도':['전체','일반보도','경과·일지','현장·행사 보도','해설·분석'],
  '공식자료':['전체','정부·지자체·국회','대학','비대위·당사자','기타 공식기록']
};
const materialFilters=el('materialFilters'),materialList=el('materialList');
let renderMaterialsForStatus=null;
let activeMaterialTopCategory='관련보도';
if(materialFilters&&materialList){
  const renderMaterialFilters=topCategory=>{
    activeMaterialTopCategory=topCategory;
    const categories=MATERIAL_DETAIL_CATS[topCategory]||['전체'];
    materialFilters.innerHTML=categories.map((cat,i)=>`<button data-material-detail="${escapeHtml(cat)}" class="${i===0?'active':''}">${escapeHtml(cat)}</button>`).join('');
    materialFilters.setAttribute('aria-label',(topCategory==='관련보도'?'관련보도':'공식기록')+' 세부 분류');
    const label=el('statusMaterialFilterLabel');if(label)label.textContent=(topCategory==='관련보도'?'관련보도':'공식기록')+' 세부 분류';
  };
  const renderMaterials=(topCategory,detailCategory='전체')=>{
    const rows=materialItems.filter(item=>item.category===topCategory&&(detailCategory==='전체'||item.detailCategory===detailCategory)).slice().sort((a,b)=>String(b.date).localeCompare(String(a.date)));
    materialList.innerHTML=rows.length?rows.map(item=>`<article class="material-item"><div class="material-date">${escapeHtml(item.date||'날짜 확인 중')}</div><div><h3><a href="${safeUrl(item.url)}" target="_blank" rel="noopener noreferrer">${escapeHtml(item.title)}</a></h3>${item.summary?'<p>'+escapeHtml(item.summary)+'</p>':''}<div class="public-post-meta"><span class="source-type">${escapeHtml(item.detailCategory)}</span><span class="source-type">${escapeHtml(item.subtype)}</span>${item.publisher?'<span class="source-type">'+escapeHtml(item.publisher)+'</span>':''}${item.verification?'<span class="verify-state">'+escapeHtml(item.verification)+'</span>':''}</div></div></article>`).join(''):'<p class="muted">해당 분류에 표시할 자료가 없습니다.</p>';
  };
  renderMaterialsForStatus=topCategory=>{renderMaterialFilters(topCategory);renderMaterials(topCategory,'전체')};
  showStatusTab(activeStatusTab);
  materialFilters.addEventListener('click',event=>{const button=event.target.closest('button[data-material-detail]');if(!button)return;[...materialFilters.children].forEach(x=>x.classList.remove('active'));button.classList.add('active');renderMaterials(activeMaterialTopCategory,button.dataset.materialDetail)});
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


let activeStatusTab='timeline';
function showStatusTab(tab){
  const key=['timeline','news','official'].includes(tab)?tab:'timeline';
  activeStatusTab=key;
  document.querySelectorAll('[data-status-tab]').forEach(button=>{const active=button.dataset.statusTab===key;button.classList.toggle('active',active);button.setAttribute('aria-selected',active?'true':'false')});
  const timeline=el('timeline'),materials=el('materials');
  if(timeline)timeline.hidden=key!=='timeline';
  if(materials)materials.hidden=key==='timeline';
  if(key!=='timeline'){
    const isNews=key==='news';
    if(el('statusMaterialEyebrow'))el('statusMaterialEyebrow').textContent=isNews?'RELATED NEWS':'OFFICIAL RECORD';
    if(el('statusMaterialTitle'))el('statusMaterialTitle').textContent=isNews?'관련보도':'공식기록';
    if(el('statusMaterialNote'))el('statusMaterialNote').textContent=isNews?'활동이력과 중복되지 않는 관련보도를 원문 출처와 함께 표시합니다.':'정부·국회·법원·지자체·대학·비대위 등 공식 주체의 기록을 원문 출처와 함께 표시합니다.';
    renderMaterialsForStatus?.(isNews?'관련보도':'공식자료');
  }
}
el('statusTabs')?.addEventListener('click',event=>{const button=event.target.closest('[data-status-tab]');if(button)showStatusTab(button.dataset.statusTab)});
const viewAliases={status:'status',monitor:'status',organization:'organization',records:'status',timeline:'status',materials:'status',news:'status','public-posts':'status',notices:'notices',voices:'voices',channels:'channels',finance:'finance'};
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
  if(key==='status')showStatusTab(activeStatusTab);
  if(key){
    const first=document.querySelector('[data-view-section="'+CSS.escape(key)+'"]');
    first?.scrollIntoView({block:'start'});
  }else window.scrollTo({top:0});
}
function syncViewFromLocation(){
  const raw=location.hash.replace(/^#/,'');
  if(raw.includes('ekodi_token=')){showView(new URLSearchParams(location.search).get('compose')==='notice'?'notices':'',{updateHash:false});return}
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

const NOTICE_SESSION_KEY='sb-renzehysxirjilvdxacv-auth-token';
let publicNotices=[];
function noticeToken(){try{const raw=localStorage.getItem(NOTICE_SESSION_KEY)||'';if(!raw)return'';const parsed=JSON.parse(raw);const session=parsed?.currentSession||parsed?.session||parsed;const access=String(session?.access_token||'');const expires=Number(session?.expires_at||0);return access&&(!expires||expires>Math.floor(Date.now()/1000)+30)?access:''}catch{return''}}
async function consumeNoticeHandoff(){
  const params=new URLSearchParams(location.hash.replace(/^#/,''));
  const tokenHash=params.get('ekodi_token');if(!tokenHash)return false;
  try{
    const response=await fetch('/api/seonammedi/admin/auth/exchange',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({token_hash:tokenHash,type:params.get('ekodi_type')||'email'}),cache:'no-store'});
    const data=await response.json().catch(()=>({}));
    if(!response.ok||!data.access_token)throw new Error(data.error_description||data.msg||data.error||'login_handoff_failed');
    localStorage.setItem(NOTICE_SESSION_KEY,JSON.stringify({access_token:data.access_token,refresh_token:data.refresh_token||'',expires_at:Number(data.expires_at||0)||Math.floor(Date.now()/1000)+Number(data.expires_in||3600),user:data.user||null}));
    return true;
  }finally{
    history.replaceState(null,'',location.pathname+location.search+'#notices');
  }
}
function noticeLoginUrl(){const u=new URL('https://ekodi.kr/auth/');u.searchParams.set('site','portal');u.searchParams.set('direct','1');u.searchParams.set('return_to',location.origin+'/seonammedi/?compose=notice#notices');return u.href}
function noticePermalink(id){return location.origin+'/seonammedi/?notice='+encodeURIComponent(id)+'#notices'}
function noticeDate(item){const raw=item.publishedAt||item.updatedAt||'';return raw?new Date(raw).toLocaleDateString('ko-KR',{timeZone:'Asia/Seoul'}):''}
function noticeCard(item){const image=item.imageUrl?'<img src="'+escapeHtml(item.imageUrl)+'" alt="" loading="lazy">':'';return '<article class="notice-item" data-notice-id="'+item.id+'"><a class="notice-open" href="'+noticePermalink(item.id)+'">'+image+'<div><h3>'+escapeHtml(item.title||'공지')+(item.pinned?'<span class="notice-pin">중요</span>':'')+'</h3><p>'+escapeHtml(item.body||'')+'</p><small>'+escapeHtml(noticeDate(item))+'</small></div></a></article>'}
function showNoticeDetail(item){
  const detail=el('noticeDetail');if(!detail)return;const images=(item.imageUrls?.length?item.imageUrls:(item.imageUrl?[item.imageUrl]:[])).map(url=>'<img src="'+escapeHtml(url)+'" alt="" class="notice-detail-image" loading="lazy">').join('');
  const mine=noticeToken()&&String(item.createdBy||'').toLowerCase()===String(JSON.parse(localStorage.getItem('ekodi.supabase.session')||'{}')?.user?.email||'').toLowerCase();
  detail.innerHTML='<button type="button" class="notice-back">목록</button><div class="notice-detail-images">'+images+'</div><h3>'+escapeHtml(item.title||'공지')+'</h3><p>'+escapeHtml(item.body||'')+'</p><small>'+escapeHtml(noticeDate(item))+'</small><div class="notice-detail-actions"><button type="button" class="notice-share">공유</button>'+(mine?'<button type="button" class="notice-delete">삭제</button>':'')+'</div>';
  detail.hidden=false;el('noticeList').hidden=true;
  detail.querySelector('.notice-back')?.addEventListener('click',()=>{detail.hidden=true;el('noticeList').hidden=false;history.replaceState(null,'',location.pathname+'#notices')});
  detail.querySelector('.notice-share')?.addEventListener('click',async()=>{const url=noticePermalink(item.id);try{if(navigator.share)await navigator.share({title:item.title||'공지',text:item.body||'',url});else{await navigator.clipboard.writeText(url);alert('게시물 링크를 복사했습니다.')}}catch{}});
  detail.querySelector('.notice-delete')?.addEventListener('click',async()=>{if(!confirm('이 게시물을 삭제하시겠습니까?'))return;const response=await fetch('/api/seonammedi/notices/'+item.id,{method:'DELETE',headers:{authorization:'Bearer '+noticeToken()},cache:'no-store'});if(response.ok){history.replaceState(null,'',location.pathname+'#notices');detail.hidden=true;el('noticeList').hidden=false;await loadNotices()}else alert('삭제하지 못했습니다.')});
}
function renderFeaturedNotice(rows){
  const host=el('homeSpotlight');if(!host)return;const now=Date.now(),recent=[...rows].sort((a,b)=>String(b.publishedAt||b.updatedAt||'').localeCompare(String(a.publishedAt||a.updatedAt||'')));
  const activeEvents=recent.filter(item=>item.kind==='event'&&(!item.eventEnd||new Date(item.eventEnd).getTime()>=now));
  const priority=recent.filter(item=>item.featured&&item.kind!=='event'),latestNotices=recent.filter(item=>item.kind!=='event');
  const selected=[];for(const item of [...activeEvents,...priority,...latestNotices])if(!selected.some(x=>x.id===item.id))selected.push(item);const items=selected.slice(0,4);
  host.hidden=!items.length;host.innerHTML=items.map(item=>'<a class="spotlight-card" href="'+noticePermalink(item.id)+'">'+(item.imageUrl?'<img src="'+escapeHtml(item.imageUrl)+'" alt="" loading="eager">':'<span class="spotlight-placeholder">공지</span>')+'<span class="spotlight-copy"><small>'+(item.kind==='event'?'행사·일정':'최근 게시글')+'</small><strong>'+escapeHtml(item.title||'공지')+'</strong><em>게시글 보기</em></span></a>').join('');
  document.querySelector('.hero')?.classList.toggle('has-spotlight',items.length>0);
}
async function loadNotices(){
  const host=el('noticeList');if(!host)return;
  try{
    const response=await fetch('/api/seonammedi/notices',{cache:'no-store'});const data=await response.json().catch(()=>({}));
    if(!response.ok||!data.ok)throw new Error(data.message||'공지 목록을 불러오지 못했습니다.');
    publicNotices=Array.isArray(data.items)?data.items:[];host.innerHTML=publicNotices.length?publicNotices.map(noticeCard).join(''):'<p class="muted">등록된 공지가 없습니다.</p>';renderFeaturedNotice(publicNotices);
    const wanted=Number(new URLSearchParams(location.search).get('notice')||0);const selected=publicNotices.find(item=>item.id===wanted);if(selected){showView('notices');showNoticeDetail(selected)}
  }catch(error){host.innerHTML='<p class="muted">'+escapeHtml(error.message||'공지 목록을 불러오지 못했습니다.')+'</p>'}
}
let noticeSelectedFiles=[];
function renderNoticeImagePreview(){const host=el('noticeImagePreview');if(!host)return;host.innerHTML=noticeSelectedFiles.map((file,index)=>'<div><img src="'+URL.createObjectURL(file)+'" alt=""><button type="button" data-remove-image="'+index+'" aria-label="사진 삭제">삭제</button></div>').join('');host.querySelectorAll('[data-remove-image]').forEach(button=>button.addEventListener('click',()=>{noticeSelectedFiles.splice(Number(button.dataset.removeImage),1);renderNoticeImagePreview()}))}
el('noticeImages')?.addEventListener('change',event=>{noticeSelectedFiles=[...event.target.files].slice(0,5);if(event.target.files.length>5)alert('사진은 최대 5장까지 등록할 수 있습니다.');renderNoticeImagePreview()});
const noticeWriteButton=el('noticeWriteButton'),noticeCompose=el('noticeComposeForm');
noticeWriteButton?.addEventListener('click',()=>{if(!noticeToken()){location.assign(noticeLoginUrl());return}noticeCompose.hidden=false;noticeWriteButton.hidden=true;noticeCompose.querySelector('input[name="title"]')?.focus()});
el('noticeComposeCancel')?.addEventListener('click',()=>{noticeCompose.hidden=true;noticeWriteButton.hidden=false});
noticeCompose?.addEventListener('submit',async event=>{
  event.preventDefault();const message=el('noticeComposeMessage'),token=noticeToken();if(!token){location.assign(noticeLoginUrl());return}
  const form=new FormData(noticeCompose);form.delete('images');for(const file of noticeSelectedFiles)form.append('images',file,file.name);message.textContent='게시 중입니다…';
  try{const response=await fetch('/api/seonammedi/notices',{method:'POST',headers:{authorization:'Bearer '+token},body:form,cache:'no-store'});const data=await response.json().catch(()=>({}));if(!response.ok)throw new Error(data.error||'게시하지 못했습니다.');noticeCompose.reset();noticeSelectedFiles=[];renderNoticeImagePreview();noticeCompose.hidden=true;noticeWriteButton.hidden=false;message.textContent='게시했습니다.';await loadNotices();const item=publicNotices.find(row=>row.id===Number(data.id));if(item){history.replaceState(null,'',noticePermalink(item.id));showNoticeDetail(item)}}catch(error){message.textContent=error.message||'게시하지 못했습니다.'}
});
async function initNoticeFlow(){
  const compose=new URLSearchParams(location.search).get('compose')==='notice';
  let handoffError='';
  try{await consumeNoticeHandoff()}catch(error){handoffError=error?.message||'로그인 연결에 실패했습니다.'}
  if(compose)showView('notices');
  if(compose&&noticeToken()){noticeCompose.hidden=false;noticeWriteButton.hidden=true;noticeCompose.querySelector('input[name="title"]')?.focus()}
  else if(compose&&handoffError){const message=el('noticeComposeMessage');if(message)message.textContent='로그인 연결에 실패했습니다. 다시 로그인해 주세요.'}
  await loadNotices();
}
initNoticeFlow();

const channelPlatformLabel=value=>({all:'전체',youtube:'YouTube',instagram:'Instagram',facebook:'Facebook',tiktok:'TikTok',blog:'블로그',website:'웹사이트',other:'기타'})[String(value||'').toLowerCase()]||'채널';
const channelCategoryLabel=value=>({official:'공식','related-org':'관련기관',media:'미디어',civic:'시민·단체',other:'기타'})[String(value||'').toLowerCase()]||'관련';
const channelEmbedPolicy=platform=>({youtube:'embed',instagram:'recent-embed',facebook:'preview',tiktok:'provider-embed',blog:'preview',website:'preview',other:'preview'})[String(platform||'').toLowerCase()]||'preview';
const channelPreviewEmbedUrl=(policy,data={})=>{
  if(policy==='embed')return safeUrl(data.embedUrl||'');
  if(policy==='recent-embed'){
    const latest=Array.isArray(data.recentItems)?data.recentItems[0]:null;
    return safeUrl(latest?.embedUrl||data.embedUrl||'');
  }
  if(policy==='provider-embed')return safeUrl(data.embedUrl||'');
  return '#';
};
let publicChannels=[];
let channelPreviewSeq=0;
let activeChannelPlatform='all';
const CHANNEL_PLATFORM_TABS=Object.freeze([
  ['all','전체'],
  ['facebook','Facebook'],
  ['instagram','Instagram'],
  ['tiktok','TikTok'],
  ['youtube','YouTube']
]);
function renderChannelFallback(item,data={}){
  const host=el('channelPreviewFallback');if(!host)return;
  const title=escapeHtml(data.title||item.name||'관련 채널');
  const description=escapeHtml(data.description||item.note||'등록된 공개 채널입니다.');
  const image=safeUrl(data.image||'');
  const platform=channelPlatformLabel(item.platform);
  const recentItems=(Array.isArray(data.recentItems)?data.recentItems:[]).filter(row=>safeUrl(row?.url)!=='#').slice(0,6);
  const recentHtml=recentItems.length
    ?'<div class="channel-recent-list"><strong>최근 공개 콘텐츠</strong><div>'+recentItems.map((row,index)=>'<a href="'+safeUrl(row.url)+'" target="_blank" rel="noopener noreferrer"><span>'+escapeHtml(row.type==='reel'?'릴스':row.type==='video'?'영상':'게시물')+'</span><b>'+escapeHtml(row.label||('최근 콘텐츠 '+(index+1)))+'</b><small>'+escapeHtml(platform)+'에서 보기 →</small></a>').join('')+'</div></div>'
    :'';
  const policy=channelEmbedPolicy(item.platform);
  const hint=policy==='embed'
    ?'최신 공개 영상을 사이트 안에서 바로 재생합니다. 재생이 제한되면 원문 채널로 연결합니다.'
    :policy==='recent-embed'
      ?'최근 공개 게시물을 자동으로 확인하며, 직접 표시가 제한되면 원문 링크로 안전하게 전환합니다.'
      :policy==='provider-embed'
        ?'플랫폼이 허용하는 콘텐츠는 사이트 안에서 표시하고, 프로필 전체 삽입이 제한되면 공개 요약과 원문 링크를 제공합니다.'
        :'외부 서비스의 전체 화면 삽입이 제한되는 경우 공개 채널 정보와 원문 링크를 안전하게 표시합니다.';
  host.innerHTML='<div class="channel-preview-fallback-content"><div class="channel-preview-summary">'+(image!=='#'?'<img src="'+image+'" alt="" loading="lazy">':'')+'<div><span class="source-type">'+escapeHtml(platform)+'</span><h4>'+title+'</h4><p>'+description+'</p><small>'+escapeHtml(hint)+'</small></div></div>'+recentHtml+'</div>';
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
  el('publicChannelAccounts')?.querySelectorAll('[data-channel-index]').forEach(button=>{
    const active=Number(button.dataset.channelIndex)===index;
    button.classList.toggle('active',active);
    button.setAttribute('aria-selected',active?'true':'false');
    button.tabIndex=active?0:-1;
  });
  let providerPreview=null;
  if(['instagram','youtube','facebook','tiktok'].includes(platform)){
    try{
      const response=await fetch('/api/seonammedi/channels/'+encodeURIComponent(item.id)+'/preview',{cache:'no-store'});
      const body=await response.json().catch(()=>({}));
      if(response.ok&&body.ok)providerPreview=body.preview||null;
    }catch{}
  }
  if(seq!==channelPreviewSeq)return;
  const embedUrl=channelPreviewEmbedUrl(policy,providerPreview||{});
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
function channelsForPlatform(platform){
  return platform==='all'?publicChannels:publicChannels.filter(item=>String(item.platform||'').toLowerCase()===platform);
}
function renderChannelAccounts(platform){
  const host=el('publicChannelAccounts'),preview=el('channelPreview');if(!host)return;
  const rows=channelsForPlatform(platform);
  if(!rows.length){
    host.innerHTML='<div class="channel-empty"><strong>'+escapeHtml(channelPlatformLabel(platform))+' 채널 준비 중</strong><span>관리자에서 계정 URL을 등록하고 사이트 표시를 켜면 이곳에 나타납니다.</span></div>';
    if(preview)preview.hidden=true;
    return;
  }
  host.innerHTML=rows.map((item,rowIndex)=>{
    const index=publicChannels.indexOf(item);
    return '<button type="button" class="channel-account'+(rowIndex===0?' active':'')+'" role="tab" aria-selected="'+(rowIndex===0?'true':'false')+'" tabindex="'+(rowIndex===0?'0':'-1')+'" data-channel-index="'+index+'"><span>'+escapeHtml(channelPlatformLabel(item.platform))+'</span><strong>'+escapeHtml(item.name||'관련 채널')+'</strong><small>'+escapeHtml(item.official?'공식 확인':channelCategoryLabel(item.category))+'</small></button>';
  }).join('');
  showChannelPreview(publicChannels.indexOf(rows[0]));
}
function renderChannelPlatformTabs(){
  const host=el('publicChannelTabs');if(!host)return;
  const known=new Set(CHANNEL_PLATFORM_TABS.map(([key])=>key));
  const extras=[...new Set(publicChannels.map(item=>String(item.platform||'other').toLowerCase()).filter(key=>!known.has(key)))];
  const tabs=[...CHANNEL_PLATFORM_TABS,...extras.map(key=>[key,channelPlatformLabel(key)])];
  host.innerHTML=tabs.map(([key,label],index)=>'<button type="button" class="channel-tab'+(index===0?' active':'')+'" role="tab" aria-selected="'+(index===0?'true':'false')+'" tabindex="'+(index===0?'0':'-1')+'" data-channel-platform="'+escapeHtml(key)+'"><strong>'+escapeHtml(label)+'</strong><span>'+channelsForPlatform(key).length+'</span></button>').join('');
}
function activateChannelPlatform(platform){
  activeChannelPlatform=platform||'all';
  const host=el('publicChannelTabs');
  host?.querySelectorAll('[data-channel-platform]').forEach(button=>{
    const active=button.dataset.channelPlatform===activeChannelPlatform;
    button.classList.toggle('active',active);
    button.setAttribute('aria-selected',active?'true':'false');
    button.tabIndex=active?0:-1;
  });
  renderChannelAccounts(activeChannelPlatform);
}
async function loadChannels(){
  const host=el('publicChannelTabs');if(!host)return;
  try{
    const response=await fetch('/api/seonammedi/channels',{cache:'no-store'});
    const data=await response.json().catch(()=>({}));
    if(!response.ok||!data.ok)throw new Error(data.message||'채널 목록을 불러오지 못했습니다.');
    publicChannels=(Array.isArray(data.items)?data.items:[]).filter(item=>safeUrl(item.url)!=='#');
    renderChannelPlatformTabs();
    host.onclick=event=>{const button=event.target.closest('[data-channel-platform]');if(button)activateChannelPlatform(button.dataset.channelPlatform)};
    host.onkeydown=event=>{
      const buttons=[...host.querySelectorAll('[data-channel-platform]')];if(!buttons.length||!['ArrowLeft','ArrowRight','Home','End'].includes(event.key))return;
      event.preventDefault();
      const current=Math.max(0,buttons.findIndex(button=>button.getAttribute('aria-selected')==='true'));
      const next=event.key==='Home'?0:event.key==='End'?buttons.length-1:(current+(event.key==='ArrowRight'?1:-1)+buttons.length)%buttons.length;
      activateChannelPlatform(buttons[next].dataset.channelPlatform);buttons[next]?.focus();
    };
    const accounts=el('publicChannelAccounts');
    if(accounts){
      accounts.onclick=event=>{const button=event.target.closest('[data-channel-index]');if(button)showChannelPreview(Number(button.dataset.channelIndex))};
      accounts.onkeydown=event=>{
        const buttons=[...accounts.querySelectorAll('[data-channel-index]')];if(!buttons.length||!['ArrowLeft','ArrowRight','Home','End'].includes(event.key))return;
        event.preventDefault();
        const current=Math.max(0,buttons.findIndex(button=>button.getAttribute('aria-selected')==='true'));
        const next=event.key==='Home'?0:event.key==='End'?buttons.length-1:(current+(event.key==='ArrowRight'?1:-1)+buttons.length)%buttons.length;
        const index=Number(buttons[next].dataset.channelIndex);showChannelPreview(index);buttons[next]?.focus();
      };
    }
    activateChannelPlatform('all');
  }catch(error){
    publicChannels=[];
    host.innerHTML='<span class="muted">'+escapeHtml(error.message||'채널 목록을 불러오지 못했습니다.')+'</span>';
    const accounts=el('publicChannelAccounts');if(accounts)accounts.innerHTML='';
    const preview=el('channelPreview');if(preview)preview.hidden=true;
  }
}
loadChannels();
