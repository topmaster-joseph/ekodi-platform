// Church public notices + key dates; existing tenant-scoped EKODI Board is the sole CRUD owner.
// Never treat a generic community post as an official church notice or dated event.
(() => {
  'use strict';
  const BASE='/ekodichurch/board/api';
  const KEY='sb-renzehysxirjilvdxacv-auth-token';
  const DB='https://renzehysxirjilvdxacv.supabase.co/rest/v1/church_worship_materials';
  const PUBLISHABLE='sb_publishable_0QjB0WzZbjrd-FJ5D5cR7A_xUkXyOY_';
  const notices=[...document.querySelectorAll('[data-church-notices]')];
  const schedules=[...document.querySelectorAll('[data-church-schedule]')];
  if (!notices.length&&!schedules.length) return;
  const detail=Boolean(document.querySelector('[data-church-public-page]'));
  const kind=document.body.dataset.churchPublicPage||'';
  const manageRoot=document.querySelector('[data-church-public-manage]');
  let managerToken='',allPosts=[],currentRows=[];

  const el=(tag,className,text)=>{
    const result=document.createElement(tag);
    if(className)result.className=className;
    if(text!==undefined)result.textContent=String(text);
    return result;
  };
  const localDay=()=>{
    const parts=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Seoul',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(new Date());
    const value=type=>parts.find(x=>x.type===type)?.value||'';
    return [value('year'),value('month'),value('day')].join('-');
  };
  const dateText=date=>{
    if(!/^\d{4}-\d{2}-\d{2}$/.test(String(date)))return '';
    return new Date(date+'T12:00:00+09:00').toLocaleDateString('ko-KR',{month:'long',day:'numeric',weekday:'short',timeZone:'Asia/Seoul'});
  };
  async function getJson(url,options={}){
    const response=await fetch(url,{cache:'no-store',credentials:'same-origin',...options});
    if(!response.ok)throw new Error('서버 응답 '+response.status);
    return response.json();
  }
  const failure=(root,message)=>{
    root.replaceChildren(el('p','church-public-empty',message));
  };
  function noticeRow(post,compact){
    const row=el('article','church-public-item church-public-notice');
    const textWrap=el('div');
    const anchor=el('a','church-public-link',post.title);
    anchor.href='/ekodichurch/notices/?post='+encodeURIComponent(post.id);
    const time=el('time','',dateText(String(post.createdAt||'').slice(0,10)));
    textWrap.append(anchor,time);
    if(!compact)textWrap.append(el('p','church-public-excerpt',String(post.body||'').slice(0,180)));
    row.append(textWrap);
    if(managerToken&&detail&&kind==='notices'){
      const edit=el('button','church-public-edit','수정');
      edit.type='button';edit.addEventListener('click',()=>editRecord(post));
      row.append(edit);
    }
    return row;
  }
  function renderNotices(){
    const posts=allPosts.filter(post=>post.categoryId==='notice').sort((a,b)=>String(b.createdAt||'').localeCompare(String(a.createdAt||'')));
    const selectedId=new URLSearchParams(location.search).get('post');
    for(const root of notices){
      const limit=Math.max(1,Math.min(100,Number(root.dataset.limit)||3));
      root.replaceChildren();
      if(!posts.length){failure(root,'등록된 공지사항이 없습니다.');continue;}
      if(detail&&selectedId){
        const post=posts.find(x=>String(x.id)===selectedId);
        if(post){
          const back=el('a','church-public-back','공지사항 목록으로');back.href='/ekodichurch/notices/';
          root.append(back);
          const item=el('article','church-public-notice-detail');
          item.append(el('h2','',post.title),el('time','',dateText(String(post.createdAt||'').slice(0,10))));
          const body=el('p','church-public-body',post.body);
          item.append(body);root.append(item);
          continue;
        }
        failure(root,'해당 공지사항을 찾을 수 없습니다.');continue;
      }
      for(const post of posts.slice(0,limit))root.append(noticeRow(post,!detail));
    }
  }
  function parseSchedulePost(post){
    if(post?.categoryId!=='schedule')return null;
    try{
      const data=JSON.parse(post.body);
      if(!/^\d{4}-\d{2}-\d{2}$/.test(data.date)||!/^\d{2}:\d{2}$/.test(data.time)||!data.venue)return null;
      return {id:'board-'+post.id,postId:post.id,date:data.date,time:data.time,venue:String(data.venue).slice(0,120),description:String(data.description||'').slice(0,1200),title:post.title,href:'/ekodichurch/schedule/',source:'board'};
    }catch{return null;}
  }
  const sunday=()=>{
    const today=localDay();
    const date=new Date(today+'T00:00:00Z');
    date.setUTCDate(date.getUTCDate()+(7-date.getUTCDay())%7);
    return date.toISOString().slice(0,10);
  };
  async function getWorship(){
    const qs=new URLSearchParams({select:'service_type,service_date,service_name,service_time,title,scripture,is_published',is_published:'eq.true',service_date:'gte.'+localDay(),order:'service_date.asc',limit:'20'});
    try{
      const rows=await getJson(DB+'?'+qs,{headers:{apikey:PUBLISHABLE,accept:'application/json'}});
      return (Array.isArray(rows)?rows:[]).filter(row=>/^\d{4}-\d{2}-\d{2}$/.test(row.service_date)).map(row=>({
        id:'worship-'+row.service_date+'-'+String(row.service_type||''),date:row.service_date,
        time:/^\d{2}:\d{2}/.test(row.service_time||'')?row.service_time.slice(0,5):'11:00',
        title:String(row.service_name||'주일모임'),venue:'에코디교회',
        description:String(row.title||row.scripture||''),href:'/ekodichurch/#weekly-worship',source:'worship'
      }));
    }catch{return [];}
  }
  // Reuse the existing read-only Church/Mission public schedule federation.
  // Only safe first-party Church/Mission links are rendered.
  async function getFederatedSchedules(){
    const data=await getJson(BASE+'/shared-schedules',{signal:AbortSignal.timeout(9000)});
    if(data?.ok!==true||data.mode!=='published-read-only'||!Array.isArray(data.items))
      throw new Error('federated_schedule_unavailable');
    const allowedUrl=url=>/^\/(?:ekodichurch|ekodimission)(?:\/|\?|$)/.test(String(url||''));
    return data.items.filter(item=>item&&['ekodichurch','ekodimission'].includes(item.source)&&
      /^\d{4}-\d{2}-\d{2}$/.test(item.date)&&/^([01]\d|2[0-3]):[0-5]\d$/.test(item.time)&&
      item.date>=localDay()&&allowedUrl(item.url)).map(item=>{
        const postId=item.source==='ekodichurch'?Number(String(item.url).match(/^\/ekodichurch\/board\/post\/(\d+)/)?.[1]||0):0;
        return {id:'shared-'+item.source+'-'+String(item.id||item.date),
          postId,date:item.date,time:item.time,title:String(item.title||'주요일정'),
          venue:String(item.venue||'에코디교회'),
          description:String(item.sourceLabel||''),href:item.url,
          source:postId?'board':item.source};
      });
  }
  async function getSaturday(){
    try{
      const response=await getJson('/ekodimission/board/api/saturday');
      const m=response?.meeting;
      if(!m||m.status!=='scheduled'||!/^\d{4}-\d{2}-\d{2}$/.test(m.date)||m.date<localDay())return null;
      return {id:'mission-sat-'+m.date,date:m.date,time:/^\d{2}:\d{2}$/.test(m.time||'')?m.time:'11:00',title:'에코디선교회 토요모임',venue:String(m.venue||'에코디교회'),description:String(m.title||''),href:'/ekodimission/',source:'mission'};
    }catch{return null;}
  }
  function scheduleRow(item,compact){
    const row=el('article','church-public-item church-public-schedule');
    const date=el('div','church-public-date');
    date.append(el('strong','',dateText(item.date)),el('span','',item.time));
    const copy=el('div','church-public-item-body');
    const link=el('a','church-public-link',item.title);
    link.href=item.href;
    copy.append(link,el('p','',item.venue));
    if(!compact&&item.description)copy.append(el('small','',item.description));
    row.append(date,copy);
    if(managerToken&&detail&&kind==='schedule'&&item.source==='board'){
      const button=el('button','church-public-edit','수정');
      button.type='button';
      button.addEventListener('click',()=>editRecord(allPosts.find(p=>p.id===item.postId)));
      row.append(button);
    }
    return row;
  }
  function renderSchedules(){
    for(const root of schedules){
      root.replaceChildren();
      if(!currentRows.length){failure(root,'공개된 주요 일정이 없습니다.');continue;}
      const limit=Math.max(1,Math.min(100,Number(root.dataset.limit)||3));
      for(const item of currentRows.slice(0,limit))root.append(scheduleRow(item,!detail));
    }
  }
  async function loadData(){
    const [postsResult,worshipResult,saturdayResult,federatedResult]=await Promise.allSettled([
      getJson(BASE+'/posts'),getWorship(),getSaturday(),getFederatedSchedules()
    ]);
    if(postsResult.status==='fulfilled'&&Array.isArray(postsResult.value?.items)){
      allPosts=postsResult.value.items;
    }else{
      for(const root of notices)failure(root,'공지사항을 불러오지 못했습니다. 다시 시도해 주세요.');
    }
    if(postsResult.status==='fulfilled')renderNotices();
    const today=localDay();
    const churchEvents=allPosts.map(parseSchedulePost).filter(Boolean).filter(x=>x.date>=today);
    const published=worshipResult.status==='fulfilled'?worshipResult.value:[];
    const Saturday=saturdayResult.status==='fulfilled'?saturdayResult.value:null;
    const regularSunday={id:'regular-sunday',date:sunday(),time:'11:00',title:'주일모임',venue:'에코디교회',description:'매주 일요일 정기 예배',href:'/ekodichurch/#worship',source:'regular'};
    const shared=federatedResult.status==='fulfilled'?federatedResult.value:null;
    const upcoming=[...(Array.isArray(shared)?shared:churchEvents),...published,
      ...(Array.isArray(shared)?[]:(Saturday?[Saturday]:[]))];
    if(!upcoming.some(item=>item.date===regularSunday.date&&item.title.includes('주일')))upcoming.push(regularSunday);
    const unique=new Map();
    upcoming.sort((a,b)=>(a.date+'T'+a.time).localeCompare(b.date+'T'+b.time)).forEach(item=>{
      const key=[item.date,item.time,item.title].join('|');
      if(!unique.has(key))unique.set(key,item);
    });
    currentRows=[...unique.values()].slice(0,100);
    renderSchedules();
  }
  function findToken(){
    try{
      const raw=localStorage.getItem(KEY)||sessionStorage.getItem(KEY);
      if(!raw)return '';
      const data=JSON.parse(raw);
      return data?.access_token||data?.currentSession?.access_token||'';
    }catch{return '';}
  }
  const authHeaders=()=>({'authorization':'Bearer '+managerToken,'content-type':'application/json'});
  async function mutation(url,method,data){
    const response=await fetch(BASE+url,{method,credentials:'same-origin',cache:'no-store',headers:authHeaders(),body:JSON.stringify(data)});
    const payload=await response.json().catch(()=>({}));
    if(!response.ok||!payload.ok)throw new Error(payload.error||'게시하지 못했습니다.');
    return payload;
  }
  let currentEdit=null,form=null,status=null;
  function editRecord(post){
    if(!post||!form)return;
    currentEdit=post;
    form.querySelector('[name="title"]').value=post.title||'';
    const value=form.querySelector('[name="body"]');
    if(kind==='notices')value.value=post.body||'';
    else{
      const parsed=parseSchedulePost(post);
      if(!parsed)return;
      form.querySelector('[name="date"]').value=parsed.date;
      form.querySelector('[name="time"]').value=parsed.time;
      form.querySelector('[name="venue"]').value=parsed.venue;
      value.value=parsed.description;
    }
    form.querySelector('button[type="submit"]').textContent='수정 저장';
    manageRoot.scrollIntoView({behavior:'smooth',block:'center'});
  }
  async function ensureCategory(){
    const categories=await getJson(BASE+'/categories');
    if(categories.items?.some(x=>x.category_id=== (kind==='notices'?'notice':'schedule')))return;
    await mutation('/categories','PUT',{categoryId:kind==='notices'?'notice':'schedule',name:kind==='notices'?'공지사항':'주요일정',sortOrder:kind==='notices'?10:20});
  }
  function enableEditor(){
    if(!manageRoot||!['notices','schedule'].includes(kind))return;
    manageRoot.hidden=false;
    const heading=el('h2','',kind==='notices'?'공지사항 관리':'주요일정 관리');
    const tip=el('p','','에코디교회 게시판 관리자에게만 편집 권한이 있습니다.');
    form=el('form','church-public-form');
    const field=(tag,name,label,attrs={})=>{
      const wrap=el('label','church-public-field');
      wrap.append(el('span','',label));
      const input=el(tag);input.name=name;input.required=true;
      for(const [key,value] of Object.entries(attrs))input.setAttribute(key,value);
      wrap.append(input);form.append(wrap);return input;
    };
    field('input','title','제목',{maxlength:'200'});
    if(kind==='schedule'){
      field('input','date','날짜',{type:'date'});
      field('input','time','시간',{type:'time'});
      field('input','venue','장소',{maxlength:'120'});
    }
    const body=field('textarea','body',kind==='notices'?'공지 내용':'일정 상세 내용',{maxlength:'12000',rows:'5'});
    if(kind==='schedule')body.required=false;
    const actions=el('div','church-public-form-actions');
    const save=el('button','church-public-save','등록하기');save.type='submit';
    const reset=el('button','church-public-reset','새 글 작성');reset.type='button';
    reset.addEventListener('click',()=>{currentEdit=null;form.reset();save.textContent='등록하기';status.textContent='';});
    const remove=el('button','church-public-delete','삭제');remove.type='button';
    remove.addEventListener('click',async()=>{
      if(!currentEdit||!window.confirm('선택한 글을 삭제하시겠습니까?'))return;
      try{status.textContent='삭제 중...';await mutation('/posts/'+currentEdit.id,'DELETE',{});currentEdit=null;form.reset();save.textContent='등록하기';status.textContent='삭제했습니다.';await loadData();}
      catch(error){status.textContent=error.message;}
    });
    actions.append(save,reset,remove);form.append(actions);
    status=el('p','church-public-status');status.setAttribute('role','status');
    form.addEventListener('submit',async ev=>{
      ev.preventDefault();
      const values=new FormData(form);
      const title=String(values.get('title')||'').trim();
      const content=String(values.get('body')||'').trim();
      let text=content;
      if(kind==='schedule'){
        const date=String(values.get('date')||''),time=String(values.get('time')||''),venue=String(values.get('venue')||'').trim();
        if(date<localDay()){status.textContent='지난 날짜를 새 주요 일정으로 등록할 수 없습니다.';return;}
        text=JSON.stringify({date,time,venue,description:content});
      }
      try{
        status.textContent='저장 중...';await ensureCategory();
        const payload={title,body:text,categoryId:kind==='notices'?'notice':'schedule'};
        await mutation('/posts'+(currentEdit?'/'+currentEdit.id:''),currentEdit?'PATCH':'POST',payload);
        currentEdit=null;form.reset();save.textContent='등록하기';status.textContent='게시했습니다.';await loadData();
      }catch(error){status.textContent=error.message;}
    });
    manageRoot.append(heading,tip,form,status);
  }
  async function checkManager(){
    if(!manageRoot)return;
    const token=findToken();
    if(!token)return;
    try{
      const result=await getJson(BASE+'/me',{headers:{authorization:'Bearer '+token}});
      if(result.authenticated!==true||!['owner','admin','moderator'].includes(result.role))return;
      managerToken=token;enableEditor();renderNotices();renderSchedules();
    }catch{/* fail closed: public reader never sees write controls */}
  }
  loadData().then(checkManager);
})();
