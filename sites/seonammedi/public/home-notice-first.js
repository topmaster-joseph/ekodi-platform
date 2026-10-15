// Public notice preview; no placeholder articles or organization entries.
(async function(){
  const host=document.getElementById('homeNoticeFirst');
  if(!host)return;
  try{
    const response=await fetch('/api/seonammedi/notices',{cache:'no-store'});
    if(!response.ok)return;
    const data=await response.json();
    if(!data.ok||!Array.isArray(data.items))return;
    const items=data.items.filter(x=>x&&x.id&&x.title&&x.kind!=='event'&&x.visibility!=='private')
      .sort((a,b)=>String(b.publishedAt||b.updatedAt||'').localeCompare(String(a.publishedAt||a.updatedAt||''))).slice(0,6);
    if(!items.length)return;
    const heading=document.createElement('h2');heading.textContent='공지사항';host.append(heading);
    for(const item of items){
      const a=document.createElement('a');a.className='notice-first-row';
      a.href='/seonammedi/notices/'+encodeURIComponent(item.id);
      const title=document.createElement('strong');title.textContent=item.title;
      const time=document.createElement('time');const raw=item.publishedAt||item.updatedAt;
      if(raw&&!Number.isNaN(Date.parse(raw))){time.dateTime=raw;time.textContent=new Intl.DateTimeFormat('ko-KR',{timeZone:'Asia/Seoul',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(raw));}
      a.append(title,time);host.append(a);
    }
    const more=document.createElement('a');more.className='notice-first-more';more.href='/seonammedi/board/notices';more.textContent='공지사항 더보기 →';host.append(more);
    host.hidden=false;
    // The legacy featured notice block duplicates this same feed.
    const spotlight=document.getElementById('homeSpotlight');
    if(spotlight)spotlight.hidden=true;
    new MutationObserver(()=>{if(spotlight)spotlight.hidden=true;}).observe(spotlight||host,{attributes:true,attributeFilter:['hidden']});
  }catch(error){console.warn('Notice preview unavailable',error);}
})();
