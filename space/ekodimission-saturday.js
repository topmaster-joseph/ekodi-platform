(()=>{
  'use strict';
  const root=document.querySelector('[data-mission-saturday]');
  if(!root)return;
  const endpoint='/ekodimission/board/api/saturday';
  const form=root.querySelector('[data-mission-saturday-form]');
  const status=root.querySelector('[data-mission-saturday-status]');
  const replies=root.querySelector('[data-mission-saturday-replies]');
  const declined=root.querySelector('[data-mission-saturday-declined]');
  const publicJoinCount=root.querySelector('[data-mission-public-join-count]');
  const publicCancelCount=root.querySelector('[data-mission-public-cancel-count]');
  const dateText=root.querySelector('[data-mission-saturday-date]');
  const count=root.querySelector('[data-mission-saturday-count]');
  const commentCount=root.querySelector('[data-mission-saturday-comment-count]');
  const scriptureStatus=root.querySelector('[data-mission-saturday-scripture-status]');
  const scriptureLink=root.querySelector('[data-mission-saturday-scripture-link]');
  const login=root.querySelector('[data-mission-saturday-login]');
  const submit=form?.querySelector('button[type="submit"]');
  let meetingDate='',loading=0,editing=false;
  const token=()=>window.EKODIMissionAuth?.getToken?.()||'';
  const say=(message,state='')=>{
    if(!status)return;
    status.dataset.state=state;
    status.textContent=message;
  };
  // The Saturday API returns only consented public replies. Never mix private RSVP data
  // into the public name-only attendance lists or display message bodies/timestamps.
  function renderReplies(items){
    for(const [kind,container,countNode,emptyText] of [
      ['join',replies,publicJoinCount,'공개된 참여 명단이 없습니다.'],
      ['cancel',declined,publicCancelCount,'공개된 불참 명단이 없습니다.']
    ]){
      if(!container)continue;
      const names=items.filter(item=>item.attendance===kind&&typeof item.displayName==='string'&&item.displayName.trim());
      if(countNode)countNode.textContent=String(names.length);
      container.replaceChildren();
      if(!names.length){
        const empty=document.createElement('li');
        empty.textContent=emptyText;
        container.append(empty);
        continue;
      }
      for(const item of names){
        const row=document.createElement('li');
        row.textContent=item.displayName.trim();
        container.append(row);
      }
    }
  }
  function mountAttendanceTabs(){
    const wrapper=root.querySelector('[data-mission-attendance]');
    if(!wrapper)return;
    const tabs=[...wrapper.querySelectorAll('[data-mission-attendance-tab]')];
    const panels=[...wrapper.querySelectorAll('[data-mission-attendance-panel]')];
    const select=(kind)=>{
      for(const button of tabs){
        const active=button.dataset.missionAttendanceTab===kind;
        button.setAttribute('aria-selected',String(active));
        button.tabIndex=active?0:-1;
      }
      for(const panel of panels)panel.hidden=panel.dataset.missionAttendancePanel!==kind;
    };
    tabs.forEach((button,index)=>{
      button.addEventListener('click',()=>select(button.dataset.missionAttendanceTab));
      button.addEventListener('keydown',event=>{
        if(!['ArrowLeft','ArrowRight','Home','End'].includes(event.key))return;
        event.preventDefault();
        const next=event.key==='Home'?0:event.key==='End'?tabs.length-1:
          (index+(event.key==='ArrowRight'?1:-1)+tabs.length)%tabs.length;
        tabs[next].focus();tabs[next].click();
      });
    });
    select('join');
  }
  mountAttendanceTabs();
  function render(data){
    if(!data?.ok||!data.meeting?.date||!Array.isArray(data.replies))throw new Error('모임 안내를 확인하지 못했습니다.');
    meetingDate=data.meeting.date;
    const sharedDate=new URLSearchParams(location.search).get('meeting')||'';
    if(/^\d{4}-\d{2}-\d{2}$/.test(sharedDate)&&sharedDate!==meetingDate&&location.hash==='#saturday'){
      location.replace('/ekodimission/activities?meeting='+encodeURIComponent(sharedDate)+'#saturday-'+sharedDate);
      return;
    }
    const heading=document.getElementById('mission-next-event');
    if(heading){
      const day=new Intl.DateTimeFormat('en-US',{timeZone:'Asia/Seoul',weekday:'short'}).format(new Date());
      heading.textContent=day==='Sun'?'다음 토요모임':'이번 주 토요모임';
    }
    const day=new Date(meetingDate+'T00:00:00Z');
    if(!Number.isNaN(day.getTime()))dateText.textContent=day.toLocaleDateString('ko-KR',{timeZone:'UTC',month:'long',day:'numeric',weekday:'short'});
    // Display the one-off meeting time from the canonical event API, not the weekly default.
    const [hour,minute]=String(data.meeting.time||'11:00').split(':').map(Number);
    const meetingTime=(hour>=12?'오후 ':'오전 ')+(hour%12||12)+':'+String(minute||0).padStart(2,'0');
    if(String(data.meeting.time||'11:00')!=='11:00'){
      const heroTime=document.querySelector('.mission-home-photo-fallback p');
      if(heroTime)heroTime.textContent='이번 주 토요일 '+meetingTime+' · 성경토론과 식사';
    }
    const timeLabel=root.querySelector('.mission-saturday-date span:last-child');
    if(timeLabel)timeLabel.textContent=meetingTime;
    const timeFact=root.querySelector('.facts dd');
    if(timeFact)timeFact.textContent='토요일 '+meetingTime;
    const intro=root.querySelector('.activity-copy > p:not(.tag)');
    if(intro)intro.textContent='이번 주 토요일 '+meetingTime+', 에코디교회에서 성경을 읽고 토론하며 함께 식사합니다. 처음 오시는 분도 환영합니다.';
    root.dataset.meetingDate=meetingDate;
    const attendees=Number.isSafeInteger(data.summary?.plannedJoin)?data.summary.plannedJoin:
      data.replies.filter(item=>item.attendance==='join').length;
    const comments=Number.isSafeInteger(data.summary?.comments)?data.summary.comments:
      data.replies.filter(item=>String(item.body||'').trim()).length;
    if(count)count.textContent=String(attendees);
    if(commentCount)commentCount.textContent=String(comments);
    renderReplies(data.replies);
    const authenticated=data.me?.authenticated===true;
    if(form)form.hidden=!authenticated;
    if(login){
      login.hidden=authenticated||data.meeting.status!=='scheduled';
      // Return to the exact Mission meeting context after unified authentication.
      let returnUrl='https://ekodi.kr/ekodimission#saturday';
      if(location.origin==='https://ekodi.kr'&&location.pathname==='/ekodimission'){
        const destination=new URL(location.href);
        destination.hash='#saturday';
        returnUrl=destination.href;
      }
      login.href='/auth/?site=mission&return_to='+encodeURIComponent(returnUrl);
    }
    if(submit)submit.textContent='참여 신청 등록·수정';
    if(data.meeting.status!=='scheduled'){
      if(submit)submit.disabled=true;
      say('이번 주 모임은 일정이 변경되어 신청을 받지 않습니다.','error');
    }else if(submit)submit.disabled=false;
    const own=data.replies.find(item=>item.own);
    if(own&&!editing&&form){
      form.elements.displayName.value=own.displayName||'';
      form.elements.attendance.value=own.attendance||'join';
      form.elements.body.value=own.body||'';
      form.elements.publicConsent.checked=true;
      editing=true;
    }
  }
  async function loadScripture(date, current){
    if(!scriptureStatus||!scriptureLink)return;
    scriptureStatus.hidden=false;
    scriptureStatus.textContent='확인 중';
    scriptureLink.hidden=true;
    try{
      const response=await fetch('/api/public/scripture/common?date='+encodeURIComponent(date),{
        headers:{accept:'application/json'},cache:'no-store',signal:AbortSignal.timeout(9000)
      });
      const data=response.ok?await response.json().catch(()=>null):null;
      if(current!==loading||meetingDate!==date)return;
      if(data?.found===true&&data.status==='approved'&&typeof data.passage==='string'&&data.passage.trim()){
        scriptureLink.href='/bible/devotion/'+encodeURIComponent(date);
        scriptureLink.textContent=data.passage.trim();
        scriptureLink.hidden=false;
        scriptureStatus.hidden=true;
      }else scriptureStatus.textContent='본문 등록 전';
    }catch{
      if(current!==loading||meetingDate!==date)return;
      scriptureStatus.textContent='본문 확인 불가';
    }
  }
  async function load(){
    const current=++loading;
    const bearer=token();
    const headers={accept:'application/json'};
    if(bearer)headers.authorization='Bearer '+bearer;
    try{
      const response=await fetch(endpoint,{headers,credentials:'same-origin',cache:'no-store',signal:AbortSignal.timeout(9000)});
      const data=await response.json().catch(()=>null);
      if(!response.ok)throw new Error('참여 답글을 불러올 수 없습니다.');
      if(current===loading){render(data);void loadScripture(meetingDate,current);}
    }catch(error){
      if(current!==loading)return;
      if(form)form.hidden=true;
      if(login)login.hidden=Boolean(token());
      if(count)count.textContent='–';
      if(commentCount)commentCount.textContent='–';
      if(publicJoinCount)publicJoinCount.textContent='–';
      if(publicCancelCount)publicCancelCount.textContent='–';
      if(replies){replies.replaceChildren();const item=document.createElement('li');item.textContent='현재 공개 명단을 불러올 수 없습니다. 잠시 후 새로고침해 주세요.';replies.append(item);}
      if(declined)declined.replaceChildren();
      say(error.message||'답글 확인 중 오류가 발생했습니다.','error');
    }
  }
  form?.addEventListener('submit',async event=>{
    event.preventDefault();
    const bearer=token();
    if(!bearer){
      form.hidden=true;
      if(login)login.hidden=false;
      say('참여 신청은 로그인 후 가능합니다. 로그인 후 참여하기를 선택해 주세요.','error');
      return;
    }
    if(!form.reportValidity()||!meetingDate)return;
    const data=new FormData(form);
    const body={
      meetingDate,
      displayName:String(data.get('displayName')||'').trim(),
      attendance:String(data.get('attendance')||'join'),
      body:String(data.get('body')||'').trim(),
      publicConsent:data.get('publicConsent')==='on'
    };
    submit.disabled=true;say('참여 신청을 저장하고 있습니다.');
    try{
      const response=await fetch(endpoint,{method:'POST',
        headers:{'content-type':'application/json',accept:'application/json',authorization:'Bearer '+bearer},
        credentials:'same-origin',body:JSON.stringify(body),signal:AbortSignal.timeout(10000)});
      const saved=await response.json().catch(()=>null);
      if(!response.ok||!saved?.ok)throw new Error(saved?.error==='meeting_date_changed'?'모임 날짜가 바뀌었습니다. 새 날짜를 확인해 주세요.':saved?.error==='private_information_in_public_reply'?'공개 답글에 이메일이나 전화번호를 적지 말아 주세요.':saved?.error==='public_consent_required'?'공개 동의를 확인해 주세요.':'저장이 확인되지 않았습니다. 다시 시도해 주세요.');
      render(saved);
      say('이번 주 참여 신청이 저장되었습니다. 수정하려면 내용을 바꾸고 다시 등록해 주세요.','success');
    }catch(error){
      say(error.message||'저장이 완료되지 않았습니다.','error');
    }finally{submit.disabled=false}
  });
  window.addEventListener('ekodi:mission-auth-changed',()=>{void load()});
  window.addEventListener('ekodi:mission-participation-changed',()=>{void load()});
  window.addEventListener('ekodi:auth-logout',()=>{editing=false;if(form){form.reset()}void load()});
  // Current Saturday remains visible through Saturday 23:59:59 in Seoul.
  // On Sunday the RSVP window rolls to the following Saturday.
  const kstDay=()=>{
    const parts=new Intl.DateTimeFormat('en-US',{timeZone:'Asia/Seoul',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(new Date());
    const part=kind=>parts.find(item=>item.type===kind)?.value||'';
    return [part('year'),part('month'),part('day')].join('-');
  };
  let observedDay=kstDay();
  const refreshAfterDayChange=()=>{
    const nowDay=kstDay();
    if(nowDay===observedDay)return;
    observedDay=nowDay;editing=false;
    form?.reset();
    if(count)count.textContent='–';
    if(commentCount)commentCount.textContent='–';
    void load();
  };
  const rolloverTimer=setInterval(refreshAfterDayChange,60000);
  document.addEventListener('visibilitychange',()=>{if(!document.hidden)refreshAfterDayChange()});
  window.addEventListener('focus',refreshAfterDayChange);
  window.addEventListener('pagehide',()=>clearInterval(rolloverTimer),{once:true});
  void load();
})();
/* EKODI Mission: first-party official notices and verified upcoming schedules. */
(()=>{
  'use strict';
  const cards=[...(document.querySelectorAll?.('[data-mission-editorial]')||[])];
  if(!cards.length)return;
  const api='/ekodimission/board/api';
  const allowed=new Set(['mission-notice','mission-schedule']);
  const postsByKind=new Map();
  let manager=false,authGeneration=0;
  const token=()=>{try{return window.EKODIMissionAuth?.getToken?.()||''}catch{return''}};
  const today=()=>new Intl.DateTimeFormat('sv-SE',{timeZone:'Asia/Seoul',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
  const formatDate=date=>/^\d{4}-\d{2}-\d{2}$/.test(date||'')?date.slice(0,4)+'.'+date.slice(5,7)+'.'+date.slice(8,10):'';
  const make=(tag,className='',value='')=>{const e=document.createElement(tag);if(className)e.className=className;if(value)e.textContent=value;return e};
  async function readJson(url,options={}){
    const response=await fetch(url,{headers:{accept:'application/json'},credentials:'same-origin',cache:'no-store',signal:AbortSignal.timeout(9000),...options});
    const data=await response.json().catch(()=>null);
    if(!response.ok||!data)throw new Error('service_unavailable');
    return data;
  }
  function scheduleData(post){
    const lines=String(post?.body||'').replace(/\r/g,'').split('\n');
    const when=lines[0]?.match(/^일정:\s*(\d{4}-\d{2}-\d{2})\s+([01]\d|2[0-3]):([0-5]\d)$/);
    const place=lines[1]?.match(/^장소:\s*(.{1,160})$/);
    if(!when||!place)return null;
    const date=when[1],checked=new Date(date+'T00:00:00Z');
    if(Number.isNaN(checked.getTime())||checked.toISOString().slice(0,10)!==date)return null;
    return {date,time:when[2]+':'+when[3],venue:place[1].trim(),description:lines.slice(2).join('\n').trim()};
  }
  function showEditor(card,post=null){
    if(!manager)return;
    const kind=card.dataset.missionEditorial,form=card.querySelector('[data-mission-board-form]');
    if(!allowed.has(kind)||!form)return;
    card.dataset.editId=post?.id?String(post.id):'';
    form.reset();
    form.elements.title.value=post?.title||'';
    if(kind==='mission-schedule'){
      const fields=post?scheduleData(post):null;
      form.elements.date.value=fields?.date||'';
      form.elements.time.value=fields?.time||'';
      form.elements.venue.value=fields?.venue||'';
      form.elements.body.value=fields?.description||'';
    }else form.elements.body.value=post?.body||'';
    form.hidden=false;
    form.querySelector('[data-mission-board-form-status]').textContent='';
    form.elements.title.focus();
  }
  // Public calendar reuses the existing read-only schedule projection and manager actions.
  const scheduleCalendar={month:today().slice(0,7),selected:today(),items:[],error:''};
  function selectedScheduleDay(){
    draw('mission-schedule',scheduleCalendar.items.filter(item=>item.date===scheduleCalendar.selected),scheduleCalendar.error);
  }
  function renderScheduleCalendar(){
    const card=cards.find(c=>c.dataset.missionEditorial==='mission-schedule');
    const grid=card?.querySelector('[data-mission-calendar-days]');
    const label=card?.querySelector('[data-mission-calendar-month]');
    const selectedLabel=card?.querySelector('[data-mission-selected-label]');
    if(!grid||!label||!selectedLabel)return;
    const [year,month]=scheduleCalendar.month.split('-').map(Number);
    const firstWeekday=new Date(Date.UTC(year,month-1,1)).getUTCDay();
    const daysInMonth=new Date(Date.UTC(year,month,0)).getUTCDate();
    label.textContent=year+'년 '+month+'월';
    selectedLabel.textContent=formatDate(scheduleCalendar.selected)+' 일정';
    grid.replaceChildren();
    const counts=new Map();
    for(const item of scheduleCalendar.items){
      if(item.date?.startsWith(scheduleCalendar.month+'-')){
        const countsForDay=counts.get(item.date)||{total:0,church:0,mission:0};
        countsForDay.total+=1;
        if(item.source==='ekodichurch')countsForDay.church+=1;
        if(item.source==='ekodimission')countsForDay.mission+=1;
        counts.set(item.date,countsForDay);
      }
    }
    for(let i=0;i<firstWeekday;i++){
      const pad=make('span','mission-calendar-padding');
      pad.setAttribute('aria-hidden','true');grid.append(pad);
    }
    for(let day=1;day<=daysInMonth;day++){
      const iso=scheduleCalendar.month+'-'+String(day).padStart(2,'0');
      const count=counts.get(iso)||{total:0,church:0,mission:0};
      const button=make('button','mission-calendar-day',String(day));
      button.type='button';button.dataset.date=iso;
      button.setAttribute('aria-label',year+'년 '+month+'월 '+day+'일, 일정 '+count.total+'건, 교회 '+count.church+'건, 선교회 '+count.mission+'건');
      button.setAttribute('aria-pressed',String(iso===scheduleCalendar.selected));
      if(iso===today())button.classList.add('is-today');
      if(count.total)button.classList.add('has-event');
      if(count.church)button.classList.add('has-church-event');
      if(count.mission)button.classList.add('has-mission-event');
      button.addEventListener('click',()=>{
        scheduleCalendar.selected=iso;
        for(const dateButton of grid.querySelectorAll('button[data-date]')){
          dateButton.setAttribute('aria-pressed',String(dateButton.dataset.date===iso));
        }
        selectedLabel.textContent=formatDate(iso)+' 일정';
        selectedScheduleDay();
      });
      grid.append(button);
    }
  }
  function changeCalendarMonth(delta){
    const [y,m]=scheduleCalendar.month.split('-').map(Number);
    const next=new Date(Date.UTC(y,m-1+delta,1));
    scheduleCalendar.month=next.getUTCFullYear()+'-'+String(next.getUTCMonth()+1).padStart(2,'0');
    scheduleCalendar.selected=scheduleCalendar.month+'-01';
    renderScheduleCalendar();selectedScheduleDay();
  }
  function showScheduleCalendar(items,error=''){
    scheduleCalendar.items=[...items].sort((a,b)=>a.date.localeCompare(b.date)||String(a.time||'').localeCompare(String(b.time||''))||String(a.title||'').localeCompare(String(b.title||'')));
    scheduleCalendar.error=error;
    renderScheduleCalendar();selectedScheduleDay();
  }
  function draw(kind,items,error=''){
    const card=cards.find(c=>c.dataset.missionEditorial===kind);
    if(!card)return;
    const list=card.querySelector('[data-mission-board-items]');
    list.replaceChildren();
    if(!items.length){
      list.append(make('li','mission-home-board-empty',error||(kind==='mission-notice'?'등록된 공지사항이 없습니다.':'이 날짜에 등록된 일정이 없습니다.')));
      return;
    }
    for(const item of items.slice(0,kind==='mission-notice'?6:items.length)){
      const row=make('li'),link=make('a','',item.title);
      link.href=item.href||(item.id?'/ekodimission/board/post/'+encodeURIComponent(String(item.id)):'/ekodimission#saturday');
      const meta=make('small','mission-home-board-meta',item.meta||'');
      if(kind==='mission-schedule'&&['ekodichurch','ekodimission'].includes(item.source)){
        const sourceLabel=item.source==='ekodichurch'?'교회 일정':'선교회 일정';
        const source=make('span','mission-schedule-source mission-schedule-source-'+item.source,sourceLabel);
        row.append(source);
      }
      link.append(meta);row.append(link);
      if(manager&&item.post){
        const actions=make('div','mission-home-board-post-actions');
        const edit=make('button','','수정');edit.type='button';
        edit.setAttribute('aria-label',item.title+' 수정');
        edit.addEventListener('click',()=>showEditor(card,item.post));
        const remove=make('button','','삭제');remove.type='button';
        remove.setAttribute('aria-label',item.title+' 삭제');
        remove.addEventListener('click',()=>{void removePost(kind,item.post)});
        actions.append(edit,remove);row.append(actions);
      }
      list.append(row);
    }
    if(error)list.append(make('li','mission-home-board-empty',error));
  }
  async function readNotices(){
    const kind='mission-notice';
    try{
      const data=await readJson(api+'/posts?category='+kind);
      if(!Array.isArray(data.items))throw new Error('invalid_feed');
      const posts=data.items.filter(p=>p.categoryId===kind&&Number.isSafeInteger(p.id)&&p.id>0);
      postsByKind.set(kind,posts);
      draw(kind,posts.map(p=>({id:p.id,title:p.title,meta:formatDate(String(p.createdAt||'').slice(0,10)),post:p})));
    }catch{
      postsByKind.set(kind,[]);
      draw(kind,[],'공지사항을 불러오지 못했습니다.');
    }
  }
  async function readSchedule(){
    const kind='mission-schedule';
    let posts=[],meeting=null,error='';
    try{
      const data=await readJson(api+'/posts?category='+kind);
      if(!Array.isArray(data.items))throw new Error('invalid_feed');
      posts=data.items.filter(p=>p.categoryId===kind&&Number.isSafeInteger(p.id)&&p.id>0);
    }catch{error='등록된 일정을 확인하지 못했습니다.'}
    try{
      const data=await readJson(api+'/saturday');
      if(data.ok===true&&data.meeting?.status==='scheduled'&&/^\d{4}-\d{2}-\d{2}$/.test(data.meeting.date)){
        meeting=data.meeting;
      }
    }catch{if(!error)error='정기모임 일정을 확인하지 못했습니다.'}
    postsByKind.set(kind,posts);
    const upcoming=posts.map(post=>{
      const info=scheduleData(post);
      return info?{id:post.id,title:post.title,source:'ekodimission',meta:formatDate(info.date)+' '+info.time+' · '+info.venue,date:info.date,time:info.time,post}:null;
    }).filter(item=>item&&item.date>=today());
    if(meeting&&meeting.date>=today()&&!upcoming.some(item=>item.date===meeting.date&&item.title===meeting.title)){
      upcoming.push({id:0,title:meeting.title||'토요 성경토론과 식사',source:'ekodimission',meta:formatDate(meeting.date)+' '+String(meeting.time||'')+' · '+String(meeting.venue||'에코디교회'),date:meeting.date,time:meeting.time||'',post:null});
    }
    upcoming.sort((a,b)=>a.date.localeCompare(b.date)||a.time.localeCompare(b.time));
    try{
      const shared=await readJson(api+'/shared-schedules');
      if(shared.ok===true&&shared.mode==='published-read-only'&&Array.isArray(shared.items)){
        const owned=new Map(posts.map(post=>[post.id,post]));
        const items=shared.items.filter(item=>
          ['ekodichurch','ekodimission'].includes(item.source)&&
          /^\d{4}-\d{2}-\d{2}$/.test(item.date)&&item.date>=today()&&
          /^\/(ekodichurch|ekodimission)(\/|\?|$)/.test(item.url||''))
          .map(item=>({
            id:item.id,title:item.title,source:item.source,
            date:item.date,time:item.time,
            meta:formatDate(item.date)+' '+item.time+' · '+item.venue,
            href:item.url,post:item.source==='ekodimission'?owned.get(item.id)||null:null
          }));
        showScheduleCalendar(items,error&&manager?error:'');
        return;
      }
    }catch{ /* The local board and canonical Saturday remain independently usable. */ }
    showScheduleCalendar(upcoming,error);
  }
  async function removePost(kind,post){
    if(!manager||!post?.id||!window.confirm('이 게시글을 비공개 처리하시겠습니까?'))return;
    const bearer=token();
    if(!bearer)return;
    try{
      await readJson(api+'/posts/'+post.id,{method:'DELETE',headers:{authorization:'Bearer '+bearer,accept:'application/json'}});
      await (kind==='mission-notice'?readNotices():readSchedule());
    }catch{window.alert('삭제되지 않았습니다. 게시판 관리 권한을 확인해 주세요.')}
  }
  async function save(event,card){
    event.preventDefault();
    if(!manager)return;
    const form=card.querySelector('[data-mission-board-form]');
    if(!form.reportValidity())return;
    const kind=card.dataset.missionEditorial,bearer=token(),title=form.elements.title.value.trim();
    if(!bearer||!allowed.has(kind)||!title)return;
    let body=form.elements.body.value.trim();
    if(kind==='mission-schedule'){
      const date=form.elements.date.value,time=form.elements.time.value,venue=form.elements.venue.value.trim();
      if(!/^\d{4}-\d{2}-\d{2}$/.test(date)||!/^([01]\d|2[0-3]):[0-5]\d$/.test(time)||!venue)return;
      body='일정: '+date+' '+time+'\n장소: '+venue+'\n'+body;
    }
    if(!body)return;
    const status=form.querySelector('[data-mission-board-form-status]');
    const id=Number(card.dataset.editId||0);
    const submit=form.querySelector('[type=submit]');
    submit.disabled=true;status.textContent='저장 중입니다.';
    try{
      const data=await readJson(api+'/posts'+(id?'/'+id:''),{
        method:id?'PATCH':'POST',
        headers:{authorization:'Bearer '+bearer,'content-type':'application/json',accept:'application/json'},
        body:JSON.stringify({title,body,categoryId:kind})
      });
      if(data.ok!==true)throw new Error('save_failed');
      card.dataset.editId='';form.hidden=true;form.reset();
      await (kind==='mission-notice'?readNotices():readSchedule());
    }catch{status.textContent='저장되지 않았습니다. 권한 또는 연결을 확인해 주세요.'}
    finally{submit.disabled=false}
  }
  function refreshManagerVisibility(){
    for(const card of cards){
      const button=card.querySelector('[data-mission-board-create]');
      if(button)button.hidden=!manager;
      if(!manager){const form=card.querySelector('[data-mission-board-form]');if(form)form.hidden=true;}
    }
    const notices=postsByKind.get('mission-notice')||[];
    if(notices.length)draw('mission-notice',notices.map(p=>({id:p.id,title:p.title,meta:formatDate(String(p.createdAt||'').slice(0,10)),post:p})));
    void readSchedule();
  }
  async function refreshManager(){
    const current=++authGeneration,bearer=token();
    manager=false;
    refreshManagerVisibility();
    if(!bearer)return;
    try{
      const data=await readJson(api+'/me',{headers:{authorization:'Bearer '+bearer,accept:'application/json'}});
      if(current!==authGeneration||bearer!==token())return;
      manager=data.authenticated===true&&data.manage===true;
      refreshManagerVisibility();
    }catch{if(current===authGeneration)refreshManagerVisibility()}
  }
  for(const card of cards){
    const create=card.querySelector('[data-mission-board-create]');
    create?.addEventListener('click',()=>showEditor(card));
    card.querySelector('[data-mission-board-cancel]')?.addEventListener('click',()=>{card.querySelector('[data-mission-board-form]').hidden=true;});
    card.querySelector('[data-mission-board-form]')?.addEventListener('submit',event=>{void save(event,card)});
  }
  const calendarCard=cards.find(c=>c.dataset.missionEditorial==='mission-schedule');
  calendarCard?.querySelector('[data-mission-calendar-prev]')?.addEventListener('click',()=>changeCalendarMonth(-1));
  calendarCard?.querySelector('[data-mission-calendar-next]')?.addEventListener('click',()=>changeCalendarMonth(1));
  calendarCard?.querySelector('[data-mission-calendar-today]')?.addEventListener('click',()=>{
    scheduleCalendar.month=today().slice(0,7);scheduleCalendar.selected=today();
    renderScheduleCalendar();selectedScheduleDay();
  });
  window.addEventListener('ekodi:mission-auth-changed',()=>{void refreshManager()});
  window.addEventListener('ekodi:auth-logout',()=>{manager=false;refreshManagerVisibility()});
  void readNotices();
  void readSchedule();
  void refreshManager();
})();
