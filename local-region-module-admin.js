function clientMain(){
  const host=document.querySelector('[data-local-region-content-admin]');
  if(!host)return;
  const moduleId=document.querySelector('main[data-ekodi-local-module]')?.dataset.ekodiLocalModule||'';
  const form=host.querySelector('[data-content-form]');
  const list=host.querySelector('[data-content-admin-list]');
  const result=host.querySelector('[data-content-result]');
  const reset=host.querySelector('[data-content-reset]');
  const token=()=>sessionStorage.getItem('ekodi-auth-token')||(()=>{try{return JSON.parse(sessionStorage.getItem('ekodi-region-admin-session')||'null')?.accessToken||''}catch{return''}})();
  const el=(tag,className,text)=>{const node=document.createElement(tag);if(className)node.className=className;if(text!==undefined)node.textContent=String(text);return node};
  async function api(pathname,options={}){
    const headers={...(options.headers||{})};const auth=token();if(auth)headers.authorization='Bearer '+auth;if(options.body&&!headers['content-type'])headers['content-type']='application/json';
    const response=await fetch(pathname,{...options,headers,cache:'no-store'});const data=await response.json().catch(()=>({}));if(!response.ok)throw new Error(data.error||data.code||('http_'+response.status));return data;
  }
  function resetForm(){form.reset();form.elements.itemId.value='';form.elements.kind.value='item';form.elements.status.value='active';form.elements.visibility.value='public';form.elements.sortOrder.value='0';result.textContent=''}
  function fill(item){
    const f=form.elements;
    f.itemId.value=item.id||'';f.kind.value=item.kind||'item';f.title.value=item.title||'';f.summary.value=item.summary||'';f.status.value=item.status||'active';f.visibility.value=item.visibility||'public';f.startsOn.value=item.startsOn||'';f.endsOn.value=item.endsOn||'';f.location.value=item.location||'';f.contactText.value=item.contactText||'';f.targetUrl.value=item.targetUrl||'';f.sortOrder.value=String(item.sortOrder||0);
    scrollTo({top:form.getBoundingClientRect().top+scrollY-90,behavior:'smooth'});
  }
  function render(data){
    list.replaceChildren();
    for(const item of data.items||[]){
      const row=el('article','content-item');
      const head=el('div','content-item__head');head.append(el('strong','',item.title),el('span','status',(item.visibility||'private')+' · '+(item.status||'')));row.append(head);
      const meta=[item.kind,item.startsOn,item.endsOn,item.location].filter(Boolean).join(' · ');if(meta)row.append(el('p','content-item__meta',meta));if(item.summary)row.append(el('p','content-item__summary',item.summary));
      const actions=el('div','content-actions');
      const edit=el('button','mini','수정');edit.type='button';edit.addEventListener('click',()=>fill(item));
      const archive=el('button','mini danger','보관');archive.type='button';archive.disabled=item.visibility==='archived';archive.addEventListener('click',async()=>{if(!confirm('이 정보를 보관처리하시겠습니까? 공개화면에서는 숨겨지고 감사이력은 유지됩니다.'))return;try{await api('/api/local-operations/cheonggye/modules/'+encodeURIComponent(moduleId)+'/actions',{method:'POST',body:JSON.stringify({action:'archive_item',itemId:item.id})});await load()}catch(error){result.textContent=error.message}});
      actions.append(edit,archive);row.append(actions);list.append(row);
    }
    if(!list.children.length)list.append(el('div','content-empty','등록된 운영정보가 없습니다.'));
  }
  async function load(){const data=await api('/api/local-operations/cheonggye/modules/'+encodeURIComponent(moduleId)+'/admin');render(data);return data}
  form.addEventListener('submit',async event=>{
    event.preventDefault();result.textContent='저장 중…';const f=form.elements;const itemId=Number(f.itemId.value||0);
    const payload={action:itemId?'update_item':'create_item',itemId,kind:f.kind.value,title:f.title.value,summary:f.summary.value,status:f.status.value,visibility:f.visibility.value,startsOn:f.startsOn.value,endsOn:f.endsOn.value,location:f.location.value,contactText:f.contactText.value,targetUrl:f.targetUrl.value,sortOrder:Number(f.sortOrder.value||0)};
    try{await api('/api/local-operations/cheonggye/modules/'+encodeURIComponent(moduleId)+'/actions',{method:'POST',body:JSON.stringify(payload)});result.textContent='저장되었습니다.';resetForm();await load()}catch(error){result.textContent=error.message}
  });
  reset.addEventListener('click',resetForm);
  function ready(event){
    const access=event?.detail||document.documentElement.__EKODI_REGION_ACCESS__;
    const delegated=access?.delegatedOperator;
    if(delegated&&Array.isArray(delegated.moduleIds)&&!delegated.moduleIds.includes(moduleId)){host.hidden=true;return}
    host.hidden=false;resetForm();load().catch(error=>{list.replaceChildren(el('div','content-empty',error.message))});
  }
  document.addEventListener('ekodi:region-access-ready',ready,{once:true});if(document.documentElement.__EKODI_REGION_ACCESS__)ready({detail:document.documentElement.__EKODI_REGION_ACCESS__});
}
export function localRegionModuleAdminScript(){
  return new Response('('+clientMain.toString()+')();',{headers:{'content-type':'text/javascript; charset=utf-8','cache-control':'no-store','x-content-type-options':'nosniff'}});
}
