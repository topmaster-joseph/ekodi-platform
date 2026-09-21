const el=id=>document.getElementById(id);
const money=n=>typeof n==='number'?new Intl.NumberFormat('ko-KR',{style:'currency',currency:'KRW',maximumFractionDigits:0}).format(n):'자료 입력 전';
const safeUrl=value=>{try{const u=new URL(String(value||''));return u.protocol==='https:'?u.href:'#'}catch{return'#'}};
const mediaLabel=item=>item.type==='video'?'영상':item.type==='photo'?'사진':'자료';
const evidenceBlock=item=>{
  const evidence=(item.links||[]).map(link=>`<a class="evidence-link" href="${safeUrl(link.url)}" target="_blank" rel="noopener noreferrer"><span>근거자료</span>${link.label||link.source||'원문 보기'}</a>`).join('');
  const media=(item.media||[]).map(media=>`<a class="media-link media-${media.type||'source'}" href="${safeUrl(media.url)}" target="_blank" rel="noopener noreferrer"><span>${mediaLabel(media)}</span><strong>${media.label||'관련 자료 보기'}</strong><small>${[media.source,media.date].filter(Boolean).join(' · ')}</small></a>`).join('');
  return evidence||media?`<div class="evidence-row">${evidence}${media}</div>`:'';
};
async function load(){const r=await fetch('/seonam-med/data.json',{cache:'no-store'});if(!r.ok)throw new Error('data');const d=await r.json();
el('lastUpdated').textContent='최종 업데이트 '+d.updatedAt;
el('statusCards').innerHTML=d.status.map(x=>`<article class="card"><h3>${x.title}</h3><p>${x.text}</p></article>`).join('');
const cats=['전체',...new Set(d.timeline.map(x=>x.category))];
el('timelineFilters').innerHTML=cats.map((c,i)=>`<button data-cat="${c}" class="${i===0?'active':''}">${c}</button>`).join('');
const render=cat=>{const rows=cat==='전체'?d.timeline:d.timeline.filter(x=>x.category===cat);el('timelineList').innerHTML=rows.map(x=>`<article class="timeline-item"><div class="timeline-date">${x.date}</div><div><h3>${x.title}</h3><p>${x.summary}</p><div class="chips"><span class="chip">${x.category}</span><span class="chip">${x.evidence}</span></div>${evidenceBlock(x)}</div></article>`).join('')};
render('전체');el('timelineFilters').addEventListener('click',e=>{const b=e.target.closest('button');if(!b)return;[...el('timelineFilters').children].forEach(x=>x.classList.remove('active'));b.classList.add('active');render(b.dataset.cat)});
el('sourceList').innerHTML=d.sources.map(s=>`<article class="source"><a href="${safeUrl(s.url)}" target="_blank" rel="noopener noreferrer">${s.title}</a><small>${s.publisher} · ${s.date} · ${s.kind}</small></article>`).join('');
el('raised').textContent=money(d.finance.raised);el('spent').textContent=money(d.finance.spent);el('balance').textContent=money(d.finance.balance)}
load().catch(()=>{el('lastUpdated').textContent='데이터를 불러오지 못했습니다.'});
