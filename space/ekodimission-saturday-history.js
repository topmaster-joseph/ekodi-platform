(()=>{
  'use strict';
  const section=document.querySelector('[data-mission-saturday-history]');
  if(!section)return;
  const year=section.querySelector('[data-saturday-history-year]');
  const month=section.querySelector('[data-saturday-history-month]');
  const list=section.querySelector('[data-saturday-history-list]');
  const more=section.querySelector('[data-saturday-history-more]');
  const status=section.querySelector('[data-saturday-history-status]');
  const endpoint='/ekodimission/board/api/saturday/history';
  let cursor='',generation=0,loading=false,yearsLoaded=false,observedDay='';
  const kstDay=()=>{
    const parts=new Intl.DateTimeFormat('en-US',{timeZone:'Asia/Seoul',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(new Date());
    const part=type=>parts.find(item=>item.type===type)?.value||'';
    return [part('year'),part('month'),part('day')].join('-');
  };
  const report=message=>{status.textContent=message};
  function createRow(meeting){
    const article=document.createElement('article');article.className='mission-activity-row mission-saturday-history-row';
    const time=document.createElement('time');time.dateTime=meeting.date;
    const strong=document.createElement('strong');strong.textContent=meeting.date.slice(5).replace('-', '.');
    const yearEl=document.createElement('span');yearEl.textContent=meeting.date.slice(0,4);
    time.append(strong,yearEl);
    const copy=document.createElement('div');copy.className='mission-activity-row-copy';
    const meta=document.createElement('div');meta.className='mission-activity-row-meta';
    const badge=document.createElement('span');badge.className='mission-status completed';
    badge.textContent=meeting.status==='cancelled'?'휴회': '지난 모임 일정';
    const when=document.createElement('span');
    const date=new Date(meeting.date+'T00:00:00Z');
    const day=date.toLocaleDateString('ko-KR',{timeZone:'UTC',month:'long',day:'numeric',weekday:'long'});
    when.textContent=day+' 오전 11시';
    const venue=document.createElement('span');venue.textContent=meeting.venue||'에코디교회';
    meta.append(badge,when,venue);
    const title=document.createElement('h3');title.textContent=meeting.title||'토요 성경토론과 함께하는 식사';
    const description=document.createElement('p');
    description.textContent=meeting.status==='cancelled'?'이 주의 정기모임은 휴회 일정으로 표시되어 있습니다.':'매주 토요일 · 성경토론과 식사 · 일정 기록';
    copy.append(meta,title,description);
    article.append(time,copy);
    return article;
  }
  async function load(reset=false){
    if(loading&&!reset)return;
    if(reset){cursor='';list.replaceChildren();more.hidden=true}
    const current=++generation;
    loading=true;more.disabled=true;
    const query=new URLSearchParams({year:year.value,month:month.value,limit:'12'});
    if(cursor)query.set('cursor',cursor);
    report('지난 토요모임 일정을 확인하고 있습니다.');
    try{
      const response=await fetch(endpoint+'?'+query,{headers:{accept:'application/json'},credentials:'same-origin',cache:'no-store',signal:AbortSignal.timeout(10000)});
      const data=await response.json().catch(()=>null);
      if(!response.ok||!data?.ok||!Array.isArray(data.items))throw new Error('지난 모임 목록을 불러오지 못했습니다.');
      if(current!==generation)return;
      if(!yearsLoaded){
        for(const value of data.years||[]){
          if(!/^\d{4}$/.test(value))continue;
          const option=document.createElement('option');option.value=value;option.textContent=value+'년';year.append(option);
        }
        yearsLoaded=true;
      }
      for(const meeting of data.items)list.append(createRow(meeting));
      if(!list.children.length){
        const empty=document.createElement('p');empty.className='mission-activity-empty';
        empty.textContent='선택한 기간에 지난 토요모임이 없습니다.';list.append(empty);
      }
      cursor=data.nextCursor||'';
      more.hidden=!cursor;
      report(cursor?'더 오래된 모임 일정도 확인할 수 있습니다.':'표시할 지난 모임 일정을 모두 확인했습니다.');
    }catch(error){
      if(current!==generation)return;
      report(error.message||'지난 모임을 불러오지 못했습니다. 다시 시도해 주세요.');
      if(!list.children.length){
        const empty=document.createElement('p');empty.className='mission-activity-empty';
        empty.textContent='현재 지난 모임 일정을 표시할 수 없습니다.';list.append(empty);
      }
    }finally{
      if(current===generation){loading=false;more.disabled=false}
    }
  }
  year.addEventListener('change',()=>{void load(true)});
  month.addEventListener('change',()=>{void load(true)});
  more.addEventListener('click',()=>{if(cursor)void load()});
  observedDay=kstDay();
  const refresh=()=>{const next=kstDay();if(next!==observedDay){observedDay=next;void load(true)}};
  const dayTimer=setInterval(refresh,60000);
  document.addEventListener('visibilitychange',()=>{if(!document.hidden)refresh()});
  window.addEventListener('focus',refresh);
  window.addEventListener('pagehide',()=>clearInterval(dayTimer),{once:true});
  void load();
})();