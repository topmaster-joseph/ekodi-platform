// EKODI Church keeps its own schedule board but reads approved public Mission dates.
(()=>{
  'use strict';
  const root=document.querySelector('[data-church-shared-schedules]');
  if(!root)return;
  const list=root.querySelector('[data-church-schedules-list]');
  const escUrl=value=>/^\/(?:ekodichurch|ekodimission)(?:\/|\?|$)/.test(value||'')?value:'';
  const add=(tag,cls='',text='')=>{
    const item=document.createElement(tag);
    if(cls)item.className=cls;
    if(text)item.textContent=text;
    return item;
  };
  const fmt=date=>/^\d{4}-\d{2}-\d{2}$/.test(date||'')?date.replace(/-/g,'.'):'';
  const labelTime=value=>{
    const [h,m]=String(value||'').split(':').map(Number);
    return Number.isInteger(h)&&Number.isInteger(m)?(h>=12?'오후 ':'오전 ')+(h%12||12)+':'+String(m).padStart(2,'0'):'';
  };
  function paint(items){
    list.replaceChildren();
    if(!items.length){list.append(add('li','church-shared-empty','예정된 공개 일정이 없습니다.'));return}
    for(const event of items.slice(0,Math.min(7,Math.max(1,Number(root.dataset.limit)||7)))){
      const url=escUrl(event.url);
      if(!url)continue;
      const row=add('li'),link=add('a','church-shared-link',event.title||'일정 보기');
      link.href=url;
      const meta=add('span','church-shared-meta',[
        event.sourceLabel,fmt(event.date),labelTime(event.time),event.venue
      ].filter(Boolean).join(' · '));
      row.append(link,meta);list.append(row);
    }
    if(!list.childElementCount)list.append(add('li','church-shared-empty','예정된 공개 일정이 없습니다.'));
  }
  async function load(){
    try{
      const response=await fetch('/ekodichurch/board/api/shared-schedules',{
        credentials:'same-origin',headers:{accept:'application/json'},
        cache:'no-store',signal:AbortSignal.timeout(9000)
      });
      const data=response.ok?await response.json().catch(()=>null):null;
      if(data?.ok!==true||data.mode!=='published-read-only'||!Array.isArray(data.items))
        throw new Error('schedule_service_unavailable');
      const items=data.items.filter(x=>x&&['ekodichurch','ekodimission'].includes(x.source)&&
        /^\d{4}-\d{2}-\d{2}$/.test(x.date)&&/^([01]\d|2[0-3]):[0-5]\d$/.test(x.time)&&escUrl(x.url));
      paint(items);
      const saturday=items.find(x=>x.source==='ekodimission'&&x.kind==='recurring-meeting');
      if(saturday){
        const target=document.querySelector('#worship .schedule>div:nth-child(2) strong');
        if(target)target.textContent='이번 주 토요일 '+labelTime(saturday.time);
      }
    }catch{
      list.replaceChildren(add('li','church-shared-empty','현재 일정을 불러오지 못했습니다. 잠시 후 다시 확인해 주세요.'));
    }
  }
  document.addEventListener('visibilitychange',()=>{if(!document.hidden)void load()});
  window.addEventListener('focus',()=>{void load()});
  void load();
})();