function clientMain(){
  const root=document.querySelector('[data-local-region-content-root]');
  if(!root)return;
  const moduleId=document.querySelector('main[data-ekodi-local-module]')?.dataset.ekodiLocalModule||'';
  const list=root.querySelector('[data-local-region-content-list]');
  const count=root.querySelector('[data-local-region-content-count]');
  const el=(tag,className,text)=>{const node=document.createElement(tag);if(className)node.className=className;if(text!==undefined)node.textContent=String(text);return node};
  function dateLabel(item){
    if(item.startsOn&&item.endsOn&&item.startsOn!==item.endsOn)return item.startsOn+' ~ '+item.endsOn;
    return item.startsOn||item.endsOn||'';
  }
  function render(data){
    list.replaceChildren();
    const items=Array.isArray(data.items)?data.items:[];
    if(count)count.textContent=items.length+'건';
    for(const item of items){
      const article=el('article','content-item');
      const head=el('div','content-item__head');
      head.append(el('span','card__tag',item.kind||'정보'),el('span','status',item.status||'active'));
      article.append(head,el('h3','',item.title));
      const meta=[dateLabel(item),item.location,item.contactText].filter(Boolean).join(' · ');
      if(meta)article.append(el('p','content-item__meta',meta));
      if(item.summary)article.append(el('p','content-item__summary',item.summary));
      if(item.targetUrl){
        const a=el('a','content-item__link','자세히 보기 →');a.href=item.targetUrl;a.rel='noopener';article.append(a);
      }
      list.append(article);
    }
    if(!items.length)list.append(el('div','content-empty','현재 공개된 정보가 없습니다. 운영자가 등록한 공개정보가 이곳에 표시됩니다.'));
  }
  fetch('/api/local-operations/cheonggye/modules/'+encodeURIComponent(moduleId),{cache:'no-store'})
    .then(async response=>{const data=await response.json().catch(()=>({}));if(!response.ok)throw new Error(data.error||data.code||('http_'+response.status));return data})
    .then(render)
    .catch(error=>{list.replaceChildren(el('div','content-empty',error.message));if(count)count.textContent='확인 필요'});
}
export function localRegionModulePublicScript(){
  return new Response('('+clientMain.toString()+')();',{headers:{'content-type':'text/javascript; charset=utf-8','cache-control':'no-store','x-content-type-options':'nosniff'}});
}
