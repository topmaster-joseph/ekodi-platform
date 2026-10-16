/* SeonamMedi sidebar schedule: public reading; server-authorized admin editing. */
(() => {
  'use strict';
  const API='/api/seonammedi';
  const WEEK=['월','화','수','목','금','토','일'];
  const localToday=()=>{
    const parts=new Intl.DateTimeFormat('en-US',{timeZone:'Asia/Seoul',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(new Date());
    const get=type=>parts.find(p=>p.type===type)?.value||'';
    return get('year')+'-'+get('month')+'-'+get('day');
  };
  const dateOf=value=>String(value||'').slice(0,10);
  const make=(tag,cls,content)=>{
    const element=document.createElement(tag);
    if(cls)element.className=cls;
    if(content!==undefined)element.textContent=String(content);
    return element;
  };
  const appendButton=(host,label,handler,cls='')=>{
    const button=make('button',cls,label);
    button.type='button';
    button.addEventListener('click',handler);
    host.append(button);
    return button;
  };
  function authToken(){
    try{
      const platform=sessionStorage.getItem('ekodi-auth-token');
      if(platform)return platform;
      const admin=JSON.parse(sessionStorage.getItem('ekodi-seonam-admin-session')||'null');
      if(admin?.accessToken&&(!admin.expiresAt||admin.expiresAt>Math.floor(Date.now()/1000)+30))return admin.accessToken;
      const raw=JSON.parse(localStorage.getItem('sb-renzehysxirjilvdxacv-auth-token')||'null');
      const session=raw?.currentSession||raw?.session||raw;
      if(session?.access_token&&(!session.expires_at||session.expires_at>Math.floor(Date.now()/1000)+30))return session.access_token;
    }catch{}
    return '';
  }
  function mount({newsBox,quick}){
    if(!newsBox||!quick||newsBox.dataset.calendarMounted==='true')return;
    newsBox.dataset.calendarMounted='true';
    newsBox.replaceChildren();
    quick.replaceChildren();
    newsBox.classList.add('seonam-calendar-card');
    quick.classList.add('seonam-calendar-details');

    let now=localToday();
    let selected=now,month=now.slice(0,7),events=[],admin=false,revision=0;
    let todayItems=[],todayRequestVersion=0,autoManagePending=new URLSearchParams(location.search).get('manage')==='schedule';
    const heading=make('div','seonam-calendar-heading');
    heading.append(make('h2','','주요일정'));
    const manage=appendButton(heading,'관리',async()=>{
      if(!authToken()){
        const target=new URL(location.href);
        target.searchParams.set('manage','schedule');
        const login=new URL('https://ekodi.kr/auth/');
        login.searchParams.set('site','seonammedi');
        login.searchParams.set('direct','1');
        login.searchParams.set('return_to',target.href);
        login.searchParams.set('purpose','seonammedi-board-admin');
        location.assign(login.href);
        return;
      }
      await checkAdmin();
      if(admin)editEvent(null);
      else status.textContent='일정 관리 권한이 없습니다. 관리자 계정으로 로그인해 주세요.';
    },'seonam-calendar-manage');
    manage.setAttribute('aria-label','주요일정 관리자 로그인 및 관리');
    const navigation=make('div','seonam-calendar-nav');
    const previous=appendButton(navigation,'‹',()=>navigate(-1),'seonam-calendar-arrow');
    previous.setAttribute('aria-label','이전 달');
    const current=make('strong','seonam-calendar-month');
    current.setAttribute('aria-live','polite');
    const next=appendButton(navigation,'›',()=>navigate(1),'seonam-calendar-arrow');
    next.setAttribute('aria-label','다음 달');
    const today=appendButton(navigation,'오늘',()=>{selected=localToday();month=selected.slice(0,7);load();},'seonam-calendar-today');
    // Calendar toolbar order: year/month, previous arrow, TODAY, next arrow.
    // Keeping today centered between the arrows also makes month selection clear.
    navigation.replaceChildren(current,previous,today,next);
    const week=make('div','seonam-calendar-week');
    WEEK.forEach(day=>week.append(make('span','',day)));
    const calendar=make('div','seonam-calendar-grid');
    calendar.setAttribute('role','group');
    calendar.setAttribute('aria-label','날짜 선택');
    const status=make('p','seonam-calendar-status');
    status.setAttribute('role','status');
    const todayAgenda=make('section','seonam-calendar-today-agenda');
    todayAgenda.hidden=true;
    todayAgenda.setAttribute('aria-label','오늘의 일정');
    const todayHeading=make('h3','seonam-calendar-today-heading','오늘의 일정');
    const todayList=make('div','seonam-calendar-today-events');
    todayList.setAttribute('aria-live','polite');
    todayAgenda.append(todayHeading,todayList);
    newsBox.append(heading,navigation,week,calendar,status,todayAgenda);

    const detailHeading=make('div','seonam-calendar-detail-heading');
    detailHeading.append(make('h2','','선택 날짜 일정'));
    const dayLabel=make('strong','seonam-calendar-selected');
    const eventList=make('div','seonam-calendar-events');
    eventList.setAttribute('aria-live','polite');
    quick.append(detailHeading,dayLabel,eventList);
    const form=make('form','seonam-calendar-form');
    form.hidden=true;
    const formTitle=make('h3','','일정 등록');
    const titleLabel=make('label','','일정명');
    const titleInput=make('input');
    titleInput.name='title';titleInput.required=true;titleInput.maxLength=180;titleLabel.append(titleInput);
    const startLabel=make('label','','시작 일시');
    const startInput=make('input');startInput.type='datetime-local';startInput.name='eventStart';startInput.required=true;startLabel.append(startInput);
    const endLabel=make('label','','종료 일시 (선택)');
    const endInput=make('input');endInput.type='datetime-local';endInput.name='eventEnd';endLabel.append(endInput);
    const bodyLabel=make('label','','일정 내용');
    const bodyInput=make('textarea');bodyInput.name='body';bodyInput.rows=4;bodyInput.maxLength=10000;bodyLabel.append(bodyInput);
    const controls=make('div','seonam-calendar-form-actions');
    const save=make('button','','저장');save.type='submit';
    appendButton(controls,'취소',()=>{form.hidden=true;feedback.textContent='';},'seonam-calendar-cancel');
    controls.prepend(save);
    const feedback=make('p','seonam-calendar-feedback');
    feedback.setAttribute('role','status');
    form.append(formTitle,titleLabel,startLabel,endLabel,bodyLabel,controls,feedback);
    quick.append(form);
    let editingId=null;

    const spansDay=(item,day)=>dateOf(item.eventStart)<=day&&dateOf(item.eventEnd||item.eventStart)>=day;
    const matches=day=>events.filter(item=>item.kind==='event'&&item.eventStart&&spansDay(item,day));
    const displayTime=value=>{
      const raw=String(value||'');
      return raw.length>=16?raw.slice(11,16):'';
    };
    function renderToday(){
      const date=localToday();
      const hits=todayItems.filter(item=>item.kind==='event'&&item.eventStart&&spansDay(item,date));
      todayList.replaceChildren();
      todayAgenda.hidden=hits.length===0;
      if(!hits.length)return;
      todayHeading.textContent='오늘의 일정 ('+Number(date.slice(5,7))+'월 '+Number(date.slice(8,10))+'일 · '+hits.length+'건)';
      for(const item of hits){
        const article=make('article','seonam-calendar-today-event');
        article.append(make('strong','',item.title||'일정'));
        const startTime=displayTime(item.eventStart);
        if(startTime){
          const endTime=item.eventEnd?displayTime(item.eventEnd):'';
          article.append(make('small','',startTime+(endTime?' ~ '+endTime:'')));
        }
        if(item.body)article.append(make('p','',item.body));
        todayList.append(article);
      }
    }
    async function refreshToday(){
      const date=localToday();
      const currentMonth=date.slice(0,7);
      const version=++todayRequestVersion;
      if(month===currentMonth){
        todayItems=events;
        renderToday();
        return;
      }
      try{
        const response=await fetch(API+'/calendar?month='+encodeURIComponent(currentMonth),{cache:'no-store'});
        const data=await response.json().catch(()=>({}));
        if(!response.ok||!data.ok)throw new Error('today_calendar_unavailable');
        if(version!==todayRequestVersion)return;
        todayItems=Array.isArray(data.items)?data.items.filter(item=>item&&item.kind==='event'&&item.eventStart):[];
      }catch{
        if(version!==todayRequestVersion)return;
        todayItems=[];
      }
      renderToday();
    }
    function renderDays(){
      now=localToday();
      current.textContent=month.replace('-','년 ')+'월';
      calendar.replaceChildren();
      const [year,n]=month.split('-').map(Number);
      const offset=(new Date(Date.UTC(year,n-1,1)).getUTCDay()+6)%7;
      const count=new Date(Date.UTC(year,n,0)).getUTCDate();
      for(let i=0;i<offset;i++){const blank=make('span','seonam-calendar-blank');blank.setAttribute('aria-hidden','true');calendar.append(blank);}
      for(let d=1;d<=count;d++){
        const day=month+'-'+String(d).padStart(2,'0');
        const hits=matches(day);
        const button=appendButton(calendar,String(d),()=>select(day),'seonam-calendar-day');
        button.setAttribute('aria-label',day+' 일정 '+hits.length+'건');
        button.setAttribute('aria-pressed',String(day===selected));
        if(day===now)button.classList.add('is-today');
        if(day===selected)button.classList.add('is-selected');
        if(hits.length){
          button.classList.add('has-events');
          const dot=make('span','seonam-calendar-dot',hits.length>9?'9+':String(hits.length));
          dot.setAttribute('aria-hidden','true');
          button.append(dot);
        }
      }
    }
    function renderSelected(){
      const [year,n,d]=selected.split('-').map(Number);
      const weekday=WEEK[(new Date(Date.UTC(year,n-1,d)).getUTCDay()+6)%7];
      dayLabel.textContent=year+'년 '+n+'월 '+d+'일 ('+weekday+')';
      eventList.replaceChildren();
      const hits=matches(selected);
      if(!hits.length){
        eventList.append(make('p','seonam-calendar-empty','등록된 일정이 없습니다.'));
        return;
      }
      for(const item of hits){
        const article=make('article','seonam-calendar-event');
        const title=make('strong','',item.title||'일정');
        const details=make('p','',item.body||'');
        const schedule=make('small','',dateOf(item.eventStart).replaceAll('-','.')+' '+displayTime(item.eventStart)+(item.eventEnd?' ~ '+dateOf(item.eventEnd).replaceAll('-','.')+' '+displayTime(item.eventEnd):''));
        article.append(title,schedule);
        if(item.body)article.append(details);
        if(admin){
          const tools=make('div','seonam-calendar-actions');
          appendButton(tools,'수정',()=>editEvent(item));
          appendButton(tools,'삭제',()=>removeEvent(item),'seonam-calendar-danger');
          article.append(tools);
        }
        eventList.append(article);
      }
    }
    function select(day){
      selected=day;
      form.hidden=true;
      renderDays();
      renderSelected();
    }
    function navigate(shift){
      const [year,n]=month.split('-').map(Number);
      const date=new Date(Date.UTC(year,n-1+shift,1));
      month=date.toISOString().slice(0,7);
      selected=month+'-01';
      form.hidden=true;
      load();
    }
    async function load(){
      const version=++revision;
      status.textContent='일정을 불러오는 중입니다.';
      try{
        const response=await fetch(API+'/calendar?month='+encodeURIComponent(month),{cache:'no-store'});
        const data=await response.json().catch(()=>({}));
        if(!response.ok||!data.ok)throw new Error('schedule_unavailable');
        if(version!==revision)return;
        events=Array.isArray(data.items)?data.items.filter(row=>row&&row.kind==='event'&&row.eventStart):[];
        status.textContent='';
      }catch{
        if(version!==revision)return;
        events=[];
        status.textContent='일정을 불러오지 못했습니다. 잠시 후 다시 시도해 주세요.';
      }
      renderDays();renderSelected();
      await refreshToday();
    }
    function editEvent(item){
      if(!admin)return;
      editingId=item?.id||null;
      formTitle.textContent=item?'일정 수정':'일정 등록';
      titleInput.value=item?.title||'';
      bodyInput.value=item?.body||'';
      startInput.value=String(item?.eventStart||selected+'T09:00').slice(0,16);
      endInput.value=String(item?.eventEnd||'').slice(0,16);
      feedback.textContent='';
      form.hidden=false;
      titleInput.focus();
    }
    async function authorizedRequest(path,options={}){
      const token=authToken();
      if(!token)throw new Error('관리자 인증이 필요합니다. 다시 로그인해 주세요.');
      const headers=new Headers(options.headers||{});
      headers.set('authorization','Bearer '+token);
      if(options.body)headers.set('content-type','application/json');
      const response=await fetch(path,{...options,headers,cache:'no-store'});
      const data=await response.json().catch(()=>({}));
      if(!response.ok||!data.ok)throw new Error(response.status===401||response.status===403?'관리자 권한을 확인해 주세요.':data.error||'저장에 실패했습니다.');
      return data;
    }
    async function checkAdmin(){
      const token=authToken();
      if(!token){admin=false;renderSelected();return false;}
      try{
        const response=await fetch(API+'/admin/me',{headers:{authorization:'Bearer '+token},cache:'no-store'});
        const data=await response.json().catch(()=>({}));
        admin=Boolean(response.ok&&data.ok&&data.permissions?.notices===true);
      }catch{admin=false;}
      if(!admin)form.hidden=true;
      renderSelected();
      if(autoManagePending){
        autoManagePending=false;
        const target=new URL(location.href);
        target.searchParams.delete('manage');
        history.replaceState(history.state,'',target.href);
        if(admin)editEvent(null);
        else status.textContent='일정 관리 권한이 없습니다. 관리자 계정으로 로그인해 주세요.';
      }
      return admin;
    }
    async function removeEvent(item){
      if(!admin||!item?.id||!confirm('이 일정을 삭제하시겠습니까?'))return;
      try{
        await authorizedRequest(API+'/admin/notices/'+encodeURIComponent(item.id),{method:'DELETE'});
        await load();
      }catch(error){status.textContent=error.message;}
    }
    form.addEventListener('submit',async event=>{
      event.preventDefault();
      if(!admin)return;
      if(endInput.value&&endInput.value<startInput.value){feedback.textContent='종료 일시는 시작 일시보다 빠를 수 없습니다.';return;}
      const original=events.find(item=>item.id===editingId);
      const payload={title:titleInput.value.trim(),body:bodyInput.value.trim(),status:'published',kind:'event',pinned:Boolean(original?.pinned),featured:Boolean(original?.featured),eventStart:startInput.value,eventEnd:endInput.value};
      if(!payload.title||!payload.eventStart){feedback.textContent='일정명과 시작 일시를 입력해 주세요.';return;}
      feedback.textContent='저장 중입니다…';save.disabled=true;
      try{
        await authorizedRequest(API+'/admin/notices'+(editingId?'/'+encodeURIComponent(editingId):''),{method:editingId?'PUT':'POST',body:JSON.stringify(payload)});
        selected=dateOf(payload.eventStart);month=selected.slice(0,7);
        form.hidden=true;await load();
      }catch(error){feedback.textContent=error.message;}
      finally{save.disabled=false;}
    });
    window.addEventListener('focus',()=>{checkAdmin();if(month===localToday().slice(0,7))load();else refreshToday();});
    window.addEventListener('storage',checkAdmin);
    document.addEventListener('seonammedi:auth-ready',checkAdmin);
    load();checkAdmin();
    // The home-page auth handoff completes asynchronously after deferred scripts load.
    setTimeout(checkAdmin,1800);
    // Check the Korean date every minute without causing a D1 read for
    // every active visitor each minute. Refresh public data at most every
    // fifteen minutes while a tab stays open; writes and focus refresh now.
    let lastBackgroundRefresh=Date.now();
    setInterval(()=>{
      const currentDate=localToday();
      if(currentDate!==now){
        now=currentDate;
        lastBackgroundRefresh=Date.now();
        if(month===now.slice(0,7))load();
        else {renderDays();refreshToday();}
        return;
      }
      if(Date.now()-lastBackgroundRefresh<15*60*1000)return;
      lastBackgroundRefresh=Date.now();
      if(month===now.slice(0,7))load();
      else refreshToday();
    },60000);
  }
  window.SeonamMediCalendar={mount};
})();
