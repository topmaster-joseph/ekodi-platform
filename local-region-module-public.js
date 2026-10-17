
function discoveryMain(){
  const root=document.querySelector('[data-local-region-discovery-root]');
  if(!root)return;
  const input=root.querySelector('[data-discovery-query]');
  const buttons=[...root.querySelectorAll('[data-discovery-filter]')];
  const status=root.querySelector('[data-discovery-status]');
  const results=root.querySelector('[data-discovery-results]');
  const modules=[
    ['directory','기관·단체'],['commerce','상점·상권'],
    ['events','행사·프로그램'],['jobs','일자리'],['sharing','나눔'],
    ['broadcast','지역 소식'],['proposals','참여·제안']
  ];
  const moduleLabel=Object.fromEntries(modules);
  let category='all',items=[],failed=0;
  const el=(tag,klass,value)=>{const node=document.createElement(tag);if(klass)node.className=klass;if(value!==undefined)node.textContent=String(value);return node};
  function safeUrl(value){
    try{
      const raw=String(value||'').trim();
      if(!raw||raw.startsWith('//'))return null;
      const url=new URL(raw,location.origin);
      if(!['https:','http:'].includes(url.protocol))return null;
      if(!/^https?:\/\//i.test(raw)&&!raw.startsWith('/'))return null;
      return url.href;
    }catch{return null}
  }
  function normalize(value){return String(value||'').normalize('NFKC').toLocaleLowerCase('ko-KR').replace(/\s+/g,' ').trim()}
  function render(){
    const keyword=normalize(input.value);
    const filtered=items.filter(item=>{
      if(category!=='all'&&item.module!==category)return false;
      if(!keyword)return true;
      return normalize([item.title,item.summary,item.location,item.kind,item.label].join(' ')).includes(keyword);
    });
    results.replaceChildren();
    const limit=50;
    for(const item of filtered.slice(0,limit)){
      const article=el('article','discover-result');
      article.append(el('strong','',item.title));
      if(item.summary)article.append(el('p','',item.summary));
      const meta=[item.label,item.location,item.startsOn].filter(Boolean).join(' · ');
      if(meta)article.append(el('small','',meta));
      const href=safeUrl(item.targetUrl);
      if(href){
        const link=el('a','','원문·제공처에서 보기 ↗');
        link.href=href;link.target='_blank';link.rel='noopener noreferrer';article.append(link);
      }else{
        const link=el('a','','관련 지역서비스 보기 →');
        link.href='/cheonggye/'+encodeURIComponent(item.module);article.append(link);
      }
      results.append(article);
    }
    if(!filtered.length)results.append(el('p','discover-note',items.length?'검색 조건에 맞는 공개정보가 없습니다.':'아직 등록된 공개정보가 없습니다. 아래 공식 정보원에서 원본을 확인할 수 있습니다.'));
    status.textContent=filtered.length+'건의 공개정보'+(filtered.length>limit?' (최신 50건 표시)':'')+(failed?' · 일부 서비스 연결 지연':'');
  }
  buttons.forEach(button=>button.addEventListener('click',()=>{
    category=button.dataset.discoveryFilter;
    buttons.forEach(other=>other.setAttribute('aria-pressed',String(other===button)));
    render();
  }));
  input.addEventListener('input',render);
  Promise.allSettled(modules.map(async ([module,label])=>{
    const response=await fetch('/api/local-operations/cheonggye/modules/'+encodeURIComponent(module),{cache:'no-store',credentials:'omit'});
    if(!response.ok)throw new Error('Public API '+response.status);
    const data=await response.json();
    if(!Array.isArray(data.items))throw new Error('Invalid public response');
    return data.items.filter(item=>item&&typeof item.title==='string'&&item.title.trim()).map(item=>({
      module,label,title:item.title,summary:item.summary||'',location:item.location||'',
      startsOn:item.startsOn||'',kind:item.kind||'',targetUrl:item.targetUrl||''
    }));
  })).then(groups=>{
    const seen=new Set();
    for(const group of groups){
      if(group.status!=='fulfilled'){failed++;continue}
      for(const item of group.value){
        const url=safeUrl(item.targetUrl);
        const key=url?'url:'+normalize(url.replace(/#.*$/,'')):'title:'+normalize([item.title,item.startsOn,item.location].join('|'));
        if(seen.has(key))continue;
        seen.add(key);items.push(item);
      }
    }
    items.sort((a,b)=>String(b.startsOn).localeCompare(String(a.startsOn)));
    render();
  });
}

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
  return new Response('('+clientMain.toString()+')();('+discoveryMain.toString()+')();',{headers:{'content-type':'text/javascript; charset=utf-8','cache-control':'no-store','x-content-type-options':'nosniff'}});
}
