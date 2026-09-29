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
let latestNotices=[];
const statusSourceRows=(rows,emptyText)=>rows.length?rows.map(s=>'<article class="source status-source"><a href="'+safeUrl(s.url)+'" target="_blank" rel="noopener noreferrer">'+escapeHtml(s.title||'자료')+'</a><small>'+escapeHtml([s.publisher,s.date,s.kind].filter(Boolean).join(' · '))+'</small></article>').join(''):'<p class="muted">'+escapeHtml(emptyText)+'</p>';
const renderStatusDetail=(key,d)=>{
  const panel=el('statusDetail');if(!panel)return;
  let label='CURRENT STATUS',title='',description='',body='',target='#status',targetLabel='관련 내용 보기';
  if(key==='official'){
    const approved=((latestMonitorData&&latestMonitorData.items)||[]).filter(s=>s.review_state==='published_official').map(s=>({title:s.title,url:s.resolved_url||s.url,publisher:s.publisher,date:kstDate(s.published_at||s.first_seen_at),kind:'관리자 승인 · 공식기록'}));
    const rows=[...approved,...(d.sources||[]).filter(s=>/(공식|당사자)/.test(String(s.kind||'')))].slice(0,8);
    label='OFFICIAL RECORD';title='공식 기록';description='정부·지자체·대학·비대위 등 자료의 주체와 성격을 구분해 원문 기준으로 확인할 수 있습니다.';
    body='<div class="status-detail-list">'+statusSourceRows(rows,'현재 연결된 공식 자료가 없습니다.')+'</div>';target='#news';targetLabel='공식자료 영역 보기';
  }else if(key==='news'){
    const approved=((latestMonitorData&&latestMonitorData.items)||[]).filter(s=>s.review_state==='published_news').map(s=>({title:s.title,url:s.resolved_url||s.url,publisher:s.publisher,date:kstDate(s.published_at||s.first_seen_at),kind:'관리자 승인 · 관련보도'}));
    const raw=[...approved,...(d.sources||[]).filter(s=>/(보도|언론|공식|당사자)/.test(String(s.kind||'')))];
    const seen=new Set(),rows=raw.filter(s=>{const key=String(s.url||'').replace(/[?#].*$/,'')||String(s.title||'').replace(/\s+/g,' ').trim().toLowerCase();if(!key||seen.has(key))return false;seen.add(key);return true}).slice(0,8);
    label='RELATED NEWS & SOURCES';title='관련보도·자료';description='같은 사건의 자료와 보도를 중복 없이 묶어 확인하고 원문으로 이동할 수 있습니다.';
    body='<div class="status-detail-list">'+statusSourceRows(rows,'현재 연결된 관련 보도가 없습니다.')+'</div>';target='#news';targetLabel='관련기사 전체 보기';
  }else if(key==='notice'){
    const rows=latestNotices.filter(x=>x.pinned).slice(0,8);label='IMPORTANT NOTICE';title='주요공지';description='관리자가 주요공지로 지정한 내용을 확인할 수 있습니다.';body=rows.length?'<div class="status-detail-list">'+rows.map(x=>'<article class="source"><strong>'+escapeHtml(x.title||'공지')+'</strong><small>'+escapeHtml(managedDate(x.publishedAt||x.updatedAt))+'</small><p>'+escapeHtml(x.body||'')+'</p></article>').join('')+'</div>':'<p class="muted">현재 등록된 주요공지가 없습니다.</p>';target='#notices';targetLabel='공지 전체 보기';
  }else if(key==='daily'){
    const run=latestMonitorData&&latestMonitorData.lastRun;
    const rows=((latestMonitorData&&latestMonitorData.items)||[]).slice(0,6);
    const summary=run?('최근 점검 '+(run.status==='ok'?'정상':run.status==='partial'?'일부 확인':'확인 필요')+' · 출처 '+Number(run.sources_checked||0)+'개 · 신규 '+Number(run.new_items||0)+'건 · 사진·영상 근거 후보 '+Number((latestMonitorData&&latestMonitorData.mediaCandidateCount)||0)+'건'):'자동점검 상태를 불러오는 중입니다.';
    label='DAILY CHECK';title='일일 점검';description='EKODI가 공개 자료를 확인해 새 항목과 근거자료 후보를 수집하고, 원문 확인이 필요한 상태를 구분해 표시합니다.';
    body='<div class="monitor-summary status-monitor-summary">'+escapeHtml(summary)+'</div><div class="status-detail-list">'+statusSourceRows(rows.map(item=>({title:item.title||'수집 자료',url:item.resolved_url||item.url,publisher:item.publisher||'출처 확인 중',date:kstDate(item.published_at||item.media_published_at||item.first_seen_at),kind:'자동수집 · 원문 확인 필요'})),'최근 수집된 새 자료가 없습니다.')+'</div>';target='#monitor';targetLabel='일일점검 전체 보기';
  }else{
    const item=(d.status||[]).find(x=>x.key===key);title=item?.title||'현재 진행상황';description=item?.text||'';
  }
  panel.innerHTML='<div class="status-detail-head"><div><p class="eyebrow">'+escapeHtml(label)+'</p><h3>'+escapeHtml(title)+'</h3></div><a class="status-detail-link" href="'+target+'">'+escapeHtml(targetLabel)+'</a></div><p class="status-detail-description">'+escapeHtml(description)+'</p>'+body;
  panel.hidden=false;
  el('statusCards')?.querySelectorAll('.status-card').forEach(button=>button.setAttribute('aria-expanded',button.dataset.status===key?'true':'false'));
};
const closeStatusDetail=()=>{const panel=el('statusDetail');if(panel)panel.hidden=true;el('statusCards')?.querySelectorAll('.status-card').forEach(button=>button.setAttribute('aria-expanded','false'))};
const refreshStatusDetail=()=>{const active=el('statusCards')?.querySelector('.status-card[aria-expanded="true"]');if(active&&window.__SEONAM_MEDI_DATA)renderStatusDetail(active.dataset.status,window.__SEONAM_MEDI_DATA)};
async function load(){const r=await fetch('/seonam-medi/data.json',{cache:'no-store'});if(!r.ok)throw new Error('data');const d=await r.json();window.__SEONAM_MEDI_DATA=d;
el('lastUpdated').textContent='최종 업데이트 '+d.updatedAt;
const statusCards=el('statusCards');
const baseStatus=d.status.filter((x,i)=>(x.key||['official','news','daily'][i])!=='daily').map((x,i)=>{const key=x.key||['official','news'][i];return key==='news'?{...x,title:'관련보도·자료',text:'같은 사건의 공식자료와 관련보도를 묶어 핵심내용과 원문 링크를 확인합니다.'}:x});
const statusItems=[...baseStatus,{key:'notice',title:'주요공지',text:'중요한 안내와 공지를 확인합니다.'}];
statusCards.innerHTML=statusItems.map((x,i)=>{const key=x.key||['official','news','daily'][i]||('status-'+i);return `<button type="button" class="card status-card" data-status="${escapeHtml(key)}" aria-expanded="false" aria-controls="statusDetail"><span class="status-card-copy"><strong class="status-card-title">${escapeHtml(x.title)}</strong><span class="status-card-text">${escapeHtml(x.text)}</span></span><span class="status-card-action">내용 보기 <span aria-hidden="true">→</span></span></button>`}).join('');
statusCards.addEventListener('click',event=>{const button=event.target.closest('.status-card');if(!button)return;if(button.getAttribute('aria-expanded')==='true'){closeStatusDetail();return}renderStatusDetail(button.dataset.status,d)});
const cats=['전체',...new Set(d.timeline.map(x=>x.category))];
el('timelineFilters').innerHTML=cats.map((c,i)=>`<button data-cat="${c}" class="${i===0?'active':''}">${c}</button>`).join('');
const render=cat=>{const rows=cat==='전체'?d.timeline:d.timeline.filter(x=>x.category===cat);el('timelineList').innerHTML=rows.map(x=>`<article class="timeline-item" data-event-date="${x.date}"><div class="timeline-date">${x.date}</div><div><h3>${x.title}</h3><p>${x.summary}</p><div class="chips"><span class="chip">${x.category}</span><span class="chip">${x.evidence}</span></div>${evidenceBlock(x)}</div></article>`).join('')};
render('전체');el('timelineFilters').addEventListener('click',e=>{const b=e.target.closest('button');if(!b)return;[...el('timelineFilters').children].forEach(x=>x.classList.remove('active'));b.classList.add('active');render(b.dataset.cat);attachMonitorMedia(window.__SEONAM_MONITOR_ITEMS||[])});
el('sourceList').innerHTML=d.sources.map(s=>`<article class="source"><a href="${safeUrl(s.url)}" target="_blank" rel="noopener noreferrer">${s.title}</a><small>${s.publisher} · ${s.date} · ${s.kind}</small></article>`).join('');
el('raised').textContent=money(d.finance.raised);el('spent').textContent=money(d.finance.spent);el('balance').textContent=money(d.finance.balance)}
const siteReady=load().catch(()=>{el('lastUpdated').textContent='데이터를 불러오지 못했습니다.'});
async function loadMonitor(){
  const badge=el('monitorBadge'),summary=el('monitorSummary'),list=el('monitorList');
  try{
    const response=await fetch('/api/seonam-medi/monitor',{cache:'no-store'});
    const data=await response.json().catch(()=>({}));
    latestMonitorData=data;
    if(!response.ok||!data.ok)throw new Error(data.message||'점검 상태를 불러오지 못했습니다.');
    const run=data.lastRun;
    badge.textContent=run?.completed_at?'사이트 자동점검: '+new Date(run.completed_at).toLocaleString('ko-KR',{timeZone:'Asia/Seoul',month:'numeric',day:'numeric',hour:'2-digit',minute:'2-digit'}):'사이트 자동점검: 첫 실행 대기';
    if(summary)summary.textContent=run?('최근 점검 '+(run.status==='ok'?'정상':run.status==='partial'?'일부 확인':'확인 필요')+' · 출처 '+run.sources_checked+'개 · 신규 '+run.new_items+'건 · 사진·영상 근거 후보 '+Number(data.mediaCandidateCount||0)+'건'):'첫 자동점검은 매일 08:00에 실행됩니다.';
    const rows=(data.items||[]).slice(0,12);window.__SEONAM_MONITOR_ITEMS=data.items||[];attachMonitorMedia(window.__SEONAM_MONITOR_ITEMS);
    if(list)list.innerHTML=rows.length?rows.map(item=>`<article class="source"><a href="${safeUrl(item.resolved_url||item.url)}" target="_blank" rel="noopener noreferrer">${escapeHtml(item.title||'')}</a><small>${escapeHtml(item.publisher||'출처 확인 중')} · 자동수집 보도${item.media_type?' · '+(item.media_type==='video'?'영상 근거 후보':'사진 근거 후보'):''} · 원문 확인 필요</small></article>`).join(''):'<p class="muted">최근 7일 내 새로 수집된 보도가 없습니다.</p>';
    refreshStatusDetail();
  }catch(error){
    latestMonitorData=null;
    badge.textContent='사이트 자동점검: 준비 중';
    if(summary)summary.textContent=error.message||'점검 상태를 불러오지 못했습니다.';
    if(list)list.innerHTML='';
    refreshStatusDetail();
  }
}
siteReady.finally(()=>loadMonitor());


const voiceForm=el('voiceForm');
if(voiceForm)voiceForm.addEventListener('submit',async event=>{
  event.preventDefault();
  const status=el('voiceStatus');const form=new FormData(voiceForm);
  const payload={category:form.get('category'),name:form.get('name'),contact:form.get('contact'),message:form.get('message'),website:form.get('website'),publicConsent:form.get('publicConsent')==='on',privacyConsent:form.get('privacyConsent')==='on'};
  status.textContent='접수 중…';
  try{const response=await fetch('/api/seonam-medi/voices',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(payload)});const body=await response.json().catch(()=>({}));if(!response.ok)throw new Error(body.message||'접수하지 못했습니다.');status.textContent=body.message||'접수되었습니다.';voiceForm.reset()}catch(error){status.textContent=error.message||'접수하지 못했습니다.'}
});


function managedDate(value){if(!value)return'';try{return new Intl.DateTimeFormat('ko-KR',{timeZone:'Asia/Seoul',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(value))}catch{return''}}
function publicEmpty(textValue){const p=document.createElement('p');p.className='muted';p.textContent=textValue;return p}
async function loadPublicManagedContent(){
  const noticeHost=el('noticePublicList'),channelHost=el('channelPublicList');
  const [noticeResult,channelResult]=await Promise.allSettled([
    fetch('/api/seonam-medi/notices',{cache:'no-store'}).then(async response=>response.ok?response.json():Promise.reject(new Error('notices'))),
    fetch('/api/seonam-medi/channels',{cache:'no-store'}).then(async response=>response.ok?response.json():Promise.reject(new Error('channels')))
  ]);
  if(noticeHost){
    latestNotices=noticeResult.status==='fulfilled'&&Array.isArray(noticeResult.value?.items)?noticeResult.value.items:[];
    noticeHost.replaceChildren();
    if(noticeResult.status!=='fulfilled'||!Array.isArray(noticeResult.value?.items)||!noticeResult.value.items.length){
      noticeHost.append(publicEmpty('등록된 공지가 없습니다.'));
    }else{
      for(const item of noticeResult.value.items){
        const article=document.createElement('article');article.className='notice-card';
        const head=document.createElement('div');head.className='notice-head';
        const title=document.createElement('h3');title.textContent=item.title||'공지';
        const meta=document.createElement('div');meta.className='notice-meta';
        if(item.pinned){const badge=document.createElement('span');badge.className='notice-pin';badge.textContent='상단고정';meta.append(badge)}
        const date=document.createElement('time');date.textContent=managedDate(item.publishedAt||item.updatedAt);meta.append(date);
        head.append(title,meta);article.append(head);
        if(item.body){const body=document.createElement('p');body.className='notice-body';body.textContent=item.body;article.append(body)}
        noticeHost.append(article);
      }
    }
  }
  refreshStatusDetail();
  if(channelHost){
    channelHost.replaceChildren();
    if(channelResult.status!=='fulfilled'||!Array.isArray(channelResult.value?.items)||!channelResult.value.items.length){
      channelHost.append(publicEmpty('등록된 관련 채널이 없습니다.'));
    }else{
      const platformLabel={youtube:'YouTube',instagram:'Instagram',facebook:'Facebook',blog:'블로그',website:'웹사이트',other:'기타'};
      const categoryLabel={official:'공식채널','related-org':'관련기관',media:'언론·자료',civic:'시민·단체',other:'기타'};
      for(const item of channelResult.value.items){
        const article=document.createElement('article');article.className='channel-card';
        const top=document.createElement('div');top.className='channel-card-top';
        const labels=document.createElement('div');labels.className='channel-labels';
        const platform=document.createElement('span');platform.textContent=platformLabel[item.platform]||item.platform||'채널';labels.append(platform);
        const category=document.createElement('span');category.textContent=categoryLabel[item.category]||'기타';labels.append(category);
        if(item.official){const official=document.createElement('span');official.className='official';official.textContent='공식';labels.append(official)}
        top.append(labels);
        const link=document.createElement('a');link.href=safeUrl(item.url);link.target='_blank';link.rel='noopener noreferrer';link.textContent=item.name||'채널 보기';
        article.append(top,link);
        if(item.note){const note=document.createElement('p');note.textContent=item.note;article.append(note)}
        channelHost.append(article);
      }
    }
  }
}
loadPublicManagedContent().catch(()=>{});

async function loadCivicContent(){
  try{
    const response=await fetch('/api/seonam-medi/content',{cache:'no-store'});
    const data=await response.json().catch(()=>({}));
    if(!response.ok||!data.ok)throw new Error('content');
    const notices=el('noticePublicList');
    if(notices)notices.innerHTML=(data.notices||[]).length?(data.notices||[]).map(item=>'<article class="source notice-public-item">'+(item.pinned?'<span class="chip">상단고정</span>':'')+'<strong>'+escapeHtml(item.title)+'</strong>'+(item.body?'<p>'+escapeHtml(item.body)+'</p>':'')+'<small>'+escapeHtml(kstDate(item.publishedAt||item.updatedAt))+'</small></article>').join(''):'<p class="muted">등록된 공지가 없습니다.</p>';
    const channels=el('channelPublicList');
    if(channels){
      const labels={youtube:'YouTube',instagram:'Instagram',facebook:'Facebook',blog:'블로그',website:'웹사이트',other:'기타'};
      const cats={official:'공식채널','related-org':'관련기관',media:'언론·자료',civic:'시민·단체',other:'기타'};
      channels.innerHTML=(data.channels||[]).length?(data.channels||[]).map(item=>'<a class="channel-card" href="'+safeUrl(item.url)+'" target="_blank" rel="noopener noreferrer"><div class="channel-meta"><span>'+escapeHtml(labels[item.platform]||item.platform)+'</span><span>'+escapeHtml(cats[item.category]||item.category)+'</span>'+(item.official?'<span>공식</span>':'')+'</div><strong>'+escapeHtml(item.name)+'</strong><small>'+escapeHtml(item.note||'원문 채널 보기')+'</small></a>').join(''):'<p class="muted">등록된 채널이 없습니다.</p>';
    }
  }catch{
    if(el('noticePublicList'))el('noticePublicList').innerHTML='<p class="muted">공지를 불러오지 못했습니다.</p>';
    if(el('channelPublicList'))el('channelPublicList').innerHTML='<p class="muted">채널을 불러오지 못했습니다.</p>';
  }
}
loadCivicContent();
