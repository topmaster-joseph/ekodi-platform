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
async function load(){const r=await fetch('/seonam-medi/data.json',{cache:'no-store'});if(!r.ok)throw new Error('data');const d=await r.json();window.__SEONAM_MEDI_DATA=d;
el('lastUpdated').textContent='최종 업데이트 '+d.updatedAt;
el('statusCards').innerHTML=d.status.map(x=>`<article class="card"><h3>${x.title}</h3><p>${x.text}</p></article>`).join('');
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
    if(!response.ok||!data.ok)throw new Error(data.message||'점검 상태를 불러오지 못했습니다.');
    const run=data.lastRun;
    badge.textContent=run?.completed_at?'사이트 자동점검: '+new Date(run.completed_at).toLocaleString('ko-KR',{timeZone:'Asia/Seoul',month:'numeric',day:'numeric',hour:'2-digit',minute:'2-digit'}):'사이트 자동점검: 첫 실행 대기';
    summary.textContent=run?('최근 점검 '+(run.status==='ok'?'정상':run.status==='partial'?'일부 확인':'확인 필요')+' · 출처 '+run.sources_checked+'개 · 신규 '+run.new_items+'건 · 사진·영상 근거 후보 '+Number(data.mediaCandidateCount||0)+'건'):'첫 자동점검은 매일 08:00에 실행됩니다.';
    const rows=(data.items||[]).slice(0,12);window.__SEONAM_MONITOR_ITEMS=data.items||[];attachMonitorMedia(window.__SEONAM_MONITOR_ITEMS);
    list.innerHTML=rows.length?rows.map(item=>`<article class="source"><a href="${safeUrl(item.resolved_url||item.url)}" target="_blank" rel="noopener noreferrer">${escapeHtml(item.title||'')}</a><small>${escapeHtml(item.publisher||'출처 확인 중')} · 자동수집 보도${item.media_type?' · '+(item.media_type==='video'?'영상 근거 후보':'사진 근거 후보'):''} · 원문 확인 필요</small></article>`).join(''):'<p class="muted">최근 7일 내 새로 수집된 보도가 없습니다.</p>';
  }catch(error){
    badge.textContent='사이트 자동점검: 준비 중';
    summary.textContent=error.message||'점검 상태를 불러오지 못했습니다.';
    list.innerHTML='';
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
