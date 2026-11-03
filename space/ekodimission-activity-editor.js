(()=>{
  'use strict';
  const endpoint='/ekodimission/api/activities/editor';
  const meEndpoint='/ekodimission/api/admin/me';
  const rows=[...document.querySelectorAll('[data-activity-list] [data-activity-item][data-activity-key]')];
  const detailKey=(()=>{
    const path=location.pathname.replace(/\/+$/,'');
    if(document.body.dataset.activityKey)return document.body.dataset.activityKey;
    if(path==='/ekodimission/apply/261003-autumn-trip')return '261003-autumn-community-trip';
    if(path==='/ekodimission/apply/260926-open-table')return '260926-chuseok-open-table';
    if(path==='/ekodimission/activities/261010-naju-yeongsan')return '261010-naju-yeongsan';
    const key=document.querySelector('[data-event-application] [name="eventKey"]')?.value||'';
    return /^[a-z0-9][a-z0-9-]{2,79}$/.test(key)?key:'';
  })();
  if(!rows.length&&!detailKey)return;
  const detailRoot=detailKey?document.querySelector('main .open-table-hero,main .sub-hero,main .event-hero,main .event-intro,main > section:first-of-type'):null;
  const editorHosts=new Map();
  for(const row of rows){
    const key=row.dataset.activityKey;
    if(!editorHosts.has(key))editorHosts.set(key,{root:row,kind:'row'});
  }
  if(detailKey&&detailRoot)editorHosts.set(detailKey,{root:detailRoot,kind:'detail'});
  let published=new Map();
  let authorizedToken='';
  let authorizing=false;
  const visibleControls=new Set();
  const token=()=>{
    try{return window.EKODIMissionAuth?.getToken?.()||sessionStorage.getItem('ekodi-auth-token')||''}
    catch{return ''}
  };
  const dateLabel=value=>{
    if(!/^\d{4}-\d{2}-\d{2}$/.test(value||''))return '';
    const [y,m,d]=value.split('-');
    return y+'년 '+Number(m)+'월 '+Number(d)+'일';
  };
  const editorValue=(key,root,kind)=>{
    const content=published.get(key);
    if(content)return content;
    const node=kind==='row'?root.querySelector('.mission-activity-row-copy'):root;
    const intro=kind==='row'?
      root.querySelector('.mission-activity-row-copy > p'):
      root.querySelector('.open-table-welcome,.open-table-slogan,.event-slogan,.sub-hero > p:last-child');
    const date=kind==='row'?root.querySelector('time')?.getAttribute('datetime')||'':'';
    return {
      key,
      title:node.querySelector('h3,h1')?.textContent?.trim()||'',
      summary:intro?.textContent?.trim()||'',
      venue:'',
      date:/^\d{4}-\d{2}-\d{2}$/.test(date)?date:'',
      time:'',
      revision:0
    };
  };
  function applyRow(row,content){
    if(!content)return;
    const title=row.querySelector('.mission-activity-row-copy h3');
    if(title)title.textContent=content.title;
    const summary=row.querySelector('.mission-activity-row-copy > p');
    if(summary)summary.textContent=content.summary||'';
    const meta=row.querySelector('.mission-activity-row-meta');
    if(meta){
      let label=meta.querySelector('[data-activity-edited-meta]');
      const parts=[content.date?dateLabel(content.date):'',content.time||'',content.venue||''].filter(Boolean);
      if(parts.length){
        // Suppress stale handwritten start-time labels when an override supplies a new schedule.
        if(content.date||content.time){
          for(const element of [...meta.children]){
            if(element!==label&&!element.hasAttribute('data-activity-edited-meta')&&/(?:오전|오후|AM|PM).*(?:시|:)/i.test(element.textContent||''))element.hidden=true;
          }
        }
        if(!label){label=document.createElement('span');label.dataset.activityEditedMeta='';meta.append(label)}
        label.textContent=parts.join(' · ');
      }else label?.remove();
    }
    const time=row.querySelector('time');
    if(time&&content.date){
      time.dateTime=content.date;
      const strong=time.querySelector('strong'),year=time.querySelector('span');
      if(strong)strong.textContent=content.date.slice(5).replace('-','.');
      if(year)year.textContent=content.date.slice(0,4);
      row.dataset.year=content.date.slice(0,4);
      row.dataset.month=content.date.slice(5,7);
    }
  }
  function applyDetail(root,content){
    if(!content)return;
    const title=root.querySelector('h1');if(title)title.textContent=content.title;
    const summary=root.querySelector('.open-table-welcome');
    if(summary)summary.textContent=content.summary||'';
    else{
      let note=root.querySelector('[data-activity-edited-summary]');
      if(!note){
        note=document.createElement('p');note.dataset.activityEditedSummary='';
        title?.insertAdjacentElement('afterend',note);
      }
      note.textContent=content.summary||'';
    }
    let meta=root.querySelector('[data-activity-edited-meta]');
    const parts=[dateLabel(content.date),content.time||'',content.venue||''].filter(Boolean);
    if(parts.length){
      if(!meta){
        meta=document.createElement('p');meta.dataset.activityEditedMeta='';
        meta.className='mission-inline-current-meta';
        (root.querySelector('.open-table-copy')||root).append(meta);
      }
      meta.textContent='최신 활동 안내 · '+parts.join(' · ');
    }else meta?.remove();
  }
  function applyContent(item){
    if(!item||!item.key)return;
    published.set(item.key,item);
    for(const row of rows)if(row.dataset.activityKey===item.key)applyRow(row,item);
    if(detailKey===item.key&&detailRoot)applyDetail(detailRoot,item);
  }
  async function fetchPublic(){
    try{
      const response=await fetch(endpoint,{headers:{accept:'application/json'},cache:'no-store',credentials:'same-origin'});
      const data=await response.json().catch(()=>null);
      if(!response.ok||!data?.ok||!Array.isArray(data.items))return false;
      published=new Map();
      for(const item of data.items){
        if(typeof item?.key==='string'&&typeof item.title==='string')applyContent(item);
      }
      return true;
    }catch{return false}
  }
  function clearEditors(){
    for(const node of visibleControls)node.remove();
    visibleControls.clear();
    document.querySelectorAll('[data-mission-activity-edit-panel]').forEach(panel=>panel.remove());
    authorizedToken='';
  }
  function showEdit(key,host){
    host.root.querySelector('[data-mission-activity-edit-panel]')?.remove();
    const value=editorValue(key,host.root,host.kind);
    const panel=document.createElement('section');
    panel.className='mission-inline-edit-panel';
    panel.dataset.missionActivityEditPanel='';
    panel.innerHTML='<form class="mission-inline-edit-form"><strong>활동 기본정보 수정</strong><div class="mission-inline-fields">'+
      '<label>제목<input name="title" maxlength="140" required></label>'+
      '<label>날짜<input name="date" type="date"></label>'+
      '<label>시간<input name="time" type="time"></label>'+
      '<label>장소<input name="venue" maxlength="180"></label>'+
      '<label class="mission-inline-wide">활동 소개<textarea name="summary" maxlength="1500" rows="3"></textarea></label>'+
      '</div><div class="mission-inline-actions"><button type="submit">저장</button><button type="button" data-cancel>취소</button>'+
      '<span role="status" aria-live="polite" data-edit-status></span></div></form>';
    const form=panel.querySelector('form');
    for(const field of ['title','date','time','venue','summary']){
      form.elements[field].value=String(value[field]||'');
    }
    host.root.append(panel);
    form.elements.title.focus();
    const status=panel.querySelector('[data-edit-status]');
    panel.querySelector('[data-cancel]').addEventListener('click',()=>panel.remove());
    form.addEventListener('submit',async event=>{
      event.preventDefault();
      if(!form.reportValidity())return;
      const active=token();
      if(!active||active!==authorizedToken){
        status.textContent='로그인 권한을 다시 확인해 주세요.';
        clearEditors();return;
      }
      const data={
        key,
        title:form.elements.title.value.trim(),
        date:form.elements.date.value,
        time:form.elements.time.value,
        venue:form.elements.venue.value.trim(),
        summary:form.elements.summary.value.trim(),
        expectedRevision:Number(value.revision)||0
      };
      if(data.time&&!data.date){status.textContent='시간을 입력하려면 날짜도 선택해 주세요.';return}
      const submit=form.querySelector('[type="submit"]');submit.disabled=true;status.textContent='저장 중…';
      try{
        const response=await fetch(endpoint,{
          method:'POST',
          headers:{'content-type':'application/json',authorization:'Bearer '+active},
          credentials:'same-origin',cache:'no-store',body:JSON.stringify(data)
        });
        const result=await response.json().catch(()=>null);
        if(token()!==active){clearEditors();return}
        if(!response.ok||!result?.ok){
          if(response.status===409){
            await fetchPublic();
            status.textContent='다른 관리자의 수정이 먼저 저장됐습니다. 취소 후 최신 내용을 확인해 주세요.';
          }else if(response.status===403||response.status===401){
            clearEditors();return;
          }else status.textContent='저장되지 않았습니다. 연결과 입력값을 확인해 주세요.';
          return;
        }
        applyContent(result.item);
        panel.remove();
        const note=host.root.querySelector('[data-activity-edit-saved]');
        if(note)note.textContent='저장 완료';
      }catch{status.textContent='저장되지 않았습니다. 연결을 확인해 주세요.'}
      finally{submit.disabled=false}
    });
  }
  function attach(key,host){
    if(host.root.querySelector('[data-mission-activity-edit]'))return;
    const where=host.kind==='row'?
      (host.root.querySelector('.mission-activity-row-actions')||host.root):
      (host.root.querySelector('.open-table-actions')||host.root.querySelector('.open-table-copy')||host.root);
    const button=document.createElement('button');
    button.type='button';button.textContent='기본정보 수정';
    button.className='mission-inline-edit-button';button.dataset.missionActivityEdit='';
    button.addEventListener('click',()=>showEdit(key,host));
    const saved=document.createElement('span');saved.dataset.activityEditSaved='';
    saved.className='mission-inline-saved';saved.setAttribute('role','status');
    where.append(button,saved);visibleControls.add(button);visibleControls.add(saved);
  }
  async function refreshAuth(){
    const access=token();
    if(!access){clearEditors();return}
    if(authorizing)return;
    if(authorizedToken===access)return;
    if(authorizedToken&&authorizedToken!==access)clearEditors();
    authorizing=true;
    try{
      const response=await fetch(meEndpoint,{headers:{authorization:'Bearer '+access,accept:'application/json'},cache:'no-store',credentials:'same-origin'});
      const me=await response.json().catch(()=>null);
      if(access!==token())return;
      if(!response.ok||!me?.ok||me?.permissions?.activities!==true){
        clearEditors();return;
      }
      authorizedToken=access;
      for(const [key,host] of editorHosts)attach(key,host);
    }catch{clearEditors()}
    finally{authorizing=false}
  }
  window.addEventListener('ekodi:mission-auth-changed',()=>{void refreshAuth()});
  window.addEventListener('ekodi:auth-success',()=>{void refreshAuth()});
  window.addEventListener('ekodi:auth-logout',clearEditors);
  window.addEventListener('pageshow',()=>{void refreshAuth()});
  window.addEventListener('focus',()=>{void refreshAuth()});
  document.addEventListener('visibilitychange',()=>{if(!document.hidden)void refreshAuth()});
  void fetchPublic();
  void refreshAuth();
})();
