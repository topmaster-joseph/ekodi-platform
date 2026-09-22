function clientMain(){
  const root=document.documentElement;
  const host=document.querySelector('[data-forest-admin-root]');
  if(!host)return;
  const recordForm=host.querySelector('[data-forest-record-form]');
  const projectForm=host.querySelector('[data-forest-project-form]');
  const list=host.querySelector('[data-forest-admin-list]');
  const result=host.querySelector('[data-forest-result]');
  const projectResult=host.querySelector('[data-forest-project-result]');
  const resetButton=host.querySelector('[data-forest-reset]');
  const token=()=>sessionStorage.getItem('ekodi-auth-token')||(()=>{try{return JSON.parse(sessionStorage.getItem('ekodi-region-admin-session')||'null')?.accessToken||''}catch{return''}})();
  const categoryLabels={administration:'행정협의',research:'자료조사',field:'현장활동',participation:'주민참여',campus:'목포대',forest:'산림활동',commerce:'상권연계',media:'언론·홍보'};
  const statusLabels={completed:'완료',in_progress:'진행중',planned:'예정',waiting:'회신·대기'};
  const el=(tag,className,text)=>{const node=document.createElement(tag);if(className)node.className=className;if(text!==undefined)node.textContent=String(text);return node};
  async function api(pathname,options={}){
    const headers={...(options.headers||{})};const auth=token();if(auth)headers.authorization='Bearer '+auth;if(options.body&&!headers['content-type'])headers['content-type']='application/json';
    const response=await fetch(pathname,{...options,headers,cache:'no-store'});const data=await response.json().catch(()=>({}));if(!response.ok)throw new Error(data.error||data.code||('http_'+response.status));return data;
  }
  function parseEvidence(value){
    return String(value||'').split(/\r?\n/).map(line=>line.trim()).filter(Boolean).slice(0,12).map(line=>{const [label,...rest]=line.split('|');return{label:label.trim().slice(0,120),url:rest.join('|').trim().slice(0,600)}}).filter(item=>item.label);
  }
  function evidenceText(items){return (Array.isArray(items)?items:[]).map(item=>item.url?(item.label+'|'+item.url):item.label).join('\n')}
  function organizations(value){return String(value||'').split(',').map(v=>v.trim()).filter(Boolean).slice(0,20)}
  function resetRecord(){recordForm.reset();recordForm.elements.recordId.value='';recordForm.elements.occurredOn.value=new Date().toISOString().slice(0,10);result.textContent=''}
  function fillRecord(item){
    recordForm.elements.recordId.value=item.id||'';
    recordForm.elements.occurredOn.value=item.occurredOn||'';
    recordForm.elements.status.value=item.status||'completed';
    recordForm.elements.category.value=item.category||'administration';
    recordForm.elements.visibility.value=item.visibility||'public';
    recordForm.elements.title.value=item.title||'';
    recordForm.elements.summary.value=item.summary||'';
    recordForm.elements.organizations.value=(item.organizations||[]).join(', ');
    recordForm.elements.place.value=item.place||'';
    recordForm.elements.evidence.value=evidenceText(item.evidence);
    recordForm.elements.nextAction.value=item.nextAction||'';
    scrollTo({top:recordForm.getBoundingClientRect().top+scrollY-90,behavior:'smooth'});
  }
  function render(data){
    const project=data.project||{};
    projectForm.elements.phase.value=project.phase||'';
    projectForm.elements.statusText.value=project.statusText||'';
    projectForm.elements.nextStep.value=project.nextStep||'';
    list.replaceChildren();
    for(const item of data.records||[]){
      const row=el('article','record-row');
      const top=el('div','record-row__top');top.append(el('strong','',item.title),el('span','',item.occurredOn+' · '+(item.visibility==='public'?'공개':item.visibility==='private'?'비공개':'보관')));
      row.append(top);
      row.append(el('p','',[categoryLabels[item.category]||item.category,statusLabels[item.status]||item.status,item.place].filter(Boolean).join(' · ')));
      if(item.summary)row.append(el('p','',item.summary));
      const actions=el('div','record-actions');
      const edit=el('button','mini','수정');edit.type='button';edit.addEventListener('click',()=>fillRecord(item));
      const archive=el('button','mini danger','보관');archive.type='button';archive.disabled=item.visibility==='archived';archive.addEventListener('click',async()=>{if(!confirm('이 기록을 보관처리하시겠습니까? 공개화면에서는 숨겨지고 감사이력은 유지됩니다.'))return;try{await api('/api/local-operations/cheonggye/projects/forest/actions',{method:'POST',body:JSON.stringify({action:'archive_record',recordId:item.id})});await load()}catch(error){result.textContent=error.message}});
      actions.append(edit,archive);row.append(actions);list.append(row);
    }
    if(!list.children.length)list.append(el('div','loading','등록된 이력이 없습니다.'));
  }
  async function load(){const data=await api('/api/local-operations/cheonggye/projects/forest/admin');render(data);return data}
  recordForm.addEventListener('submit',async event=>{
    event.preventDefault();result.textContent='저장 중…';
    const f=recordForm.elements;const recordId=Number(f.recordId.value||0);
    const payload={action:recordId?'update_record':'create_record',recordId,occurredOn:f.occurredOn.value,status:f.status.value,category:f.category.value,visibility:f.visibility.value,title:f.title.value,summary:f.summary.value,organizations:organizations(f.organizations.value),place:f.place.value,evidence:parseEvidence(f.evidence.value),nextAction:f.nextAction.value};
    try{await api('/api/local-operations/cheonggye/projects/forest/actions',{method:'POST',body:JSON.stringify(payload)});result.textContent='저장되었습니다.';resetRecord();await load()}catch(error){result.textContent=error.message}
  });
  projectForm.addEventListener('submit',async event=>{
    event.preventDefault();projectResult.textContent='저장 중…';const f=projectForm.elements;
    try{await api('/api/local-operations/cheonggye/projects/forest/actions',{method:'POST',body:JSON.stringify({action:'update_project',phase:f.phase.value,statusText:f.statusText.value,nextStep:f.nextStep.value})});projectResult.textContent='저장되었습니다.';await load()}catch(error){projectResult.textContent=error.message}
  });
  resetButton.addEventListener('click',resetRecord);
  function ready(event){
    const access=event?.detail||root.__EKODI_REGION_ACCESS__;const capabilities=new Set(access?.capabilities||[]);
    if(!(access?.platform||capabilities.has('*')||capabilities.has('tenant.operations.manage'))){host.hidden=true;return}
    host.hidden=false;resetRecord();load().catch(error=>{list.replaceChildren(el('div','loading',error.message))});
  }
  document.addEventListener('ekodi:region-access-ready',ready,{once:true});if(root.__EKODI_REGION_ACCESS__)ready({detail:root.__EKODI_REGION_ACCESS__});
}
export function localRegionForestAdminScript(){
  return new Response('('+clientMain.toString()+')();',{headers:{'content-type':'text/javascript; charset=utf-8','cache-control':'no-store','x-content-type-options':'nosniff'}});
}
