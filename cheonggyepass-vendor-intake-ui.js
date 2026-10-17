function clientMain(){
  const root=document.querySelector('[data-pass-vendor-intake]');
  if(!root)return;
  const status=root.querySelector('[data-pass-intake-status]');
  const form=root.querySelector('[data-pass-intake-form]');
  const list=root.querySelector('[data-pass-intake-list]');
  const delivery=form.elements.delivery;
  const uploadField=form.querySelector('[data-pass-zip]');
  const setText=(node,value)=>{node.textContent=String(value??'')};
  const token=()=>{
    const platform=sessionStorage.getItem('ekodi-auth-token');
    if(platform)return platform;
    try{return JSON.parse(sessionStorage.getItem('ekodi-region-admin-session')||'null')?.accessToken||''}catch{return''}
  };
  function renderFields(){
    const mode=delivery.value;
    form.querySelector('[data-pass-github]').hidden=mode!=='github_pr';
    form.querySelector('[data-pass-zip-field]').hidden=mode!=='zip';
    form.querySelector('[data-pass-api]').hidden=mode!=='external_api';
  }
  async function api(path,init={}){
    const auth=token();if(!auth)throw new Error('로그인 인증정보가 없습니다. 다시 로그인하세요.');
    const headers=new Headers(init.headers||{});
    headers.set('authorization','Bearer '+auth);
    headers.set('x-ekodi-intake-request','1');
    if(init.body&&!(init.body instanceof ArrayBuffer))headers.set('content-type','application/json');
    const resp=await fetch(path,{...init,headers,cache:'no-store',credentials:'same-origin'});
    const data=await resp.json().catch(()=>({}));
    if(!resp.ok)throw new Error(data.error||data.code||'요청이 실패했습니다.');
    return data;
  }
  const el=(tag,cls,txt)=>{
    const node=document.createElement(tag);if(cls)node.className=cls;
    if(txt!==undefined)setText(node,txt);return node;
  };
  const labels={github_pr:'GitHub PR',zip:'ZIP 격리보관',external_api:'외부 API'};
  const states={submitted:'접수됨',quarantined:'ZIP 격리보관',review_pending:'검수 대기',approved_for_testing:'테스트 후보',rejected:'반려'};
  function addSafeLink(parent,url,text){
    try{
      const u=new URL(url);
      if(u.protocol!=='https:'||u.username||u.password)return;
      const a=el('a','',text);a.href=u.href;a.target='_blank';a.rel='noopener noreferrer';parent.append(a);
    }catch{}
  }
  async function refresh(){
    const result=await api('/api/cheonggyepass/vendor-intake');
    list.replaceChildren();
    for(const item of result.items||[]){
      const block=el('article','pass-submission');
      block.append(el('strong','',item.vendorName+' · '+(labels[item.delivery]||item.delivery)));
      block.append(el('p','muted',(states[item.status]||item.status)+' · '+item.createdAt+(item.uploaded?' · ZIP 업로드됨':'')));
      if(item.actorEmail)block.append(el('small','muted','제출자: '+item.actorEmail));
      if(item.sourceUrl)addSafeLink(block,item.sourceUrl,'제출된 PR 확인 ↗');
      if(item.documentationUrl)addSafeLink(block,item.documentationUrl,'API 문서 확인 ↗');
      if(item.apiBaseUrl)block.append(el('small','muted','API 주소: '+item.apiBaseUrl));
      if(item.artifactSha256)block.append(el('small','muted','파일 SHA-256: '+item.artifactSha256));
      if(result.canReview&&['submitted','quarantined','review_pending'].includes(item.status)){
        const controls=el('div','pass-review');
        const select=el('select');select.setAttribute('aria-label','검토 상태');
        const eligible=item.delivery==='zip'?['review_pending','rejected']:['review_pending','approved_for_testing','rejected'];
        for(const key of eligible){const option=el('option','',states[key]);option.value=key;select.append(option)}
        const note=el('input');note.type='text';note.maxLength=300;note.placeholder='검토 사유 (5자 이상)';note.setAttribute('aria-label','검토 사유');
        const save=el('button','','검토 저장');save.type='button';
        save.addEventListener('click',async()=>{
          save.disabled=true;
          try{
            await api('/api/cheonggyepass/vendor-intake/'+encodeURIComponent(item.id)+'/review',
              {method:'POST',body:JSON.stringify({status:select.value,note:note.value})});
            setText(status,'검토 이력이 저장되었습니다. 실제 운영 배포는 별도 오케스트레이터 승인 대상입니다.');
            await refresh();
          }catch(err){setText(status,err.message)}finally{save.disabled=false}
        });
        controls.append(select,note,save);block.append(controls);
      }
      list.append(block);
    }
    if(!(result.items||[]).length)list.append(el('p','muted','접수된 외부업체 제안이 없습니다.'));
    const help=root.querySelector('[data-pass-upload-availability]');
    setText(help,result.uploadEnabled?'ZIP 격리 업로드가 준비되었습니다. 파일은 자동 실행되지 않습니다.':'ZIP 격리 저장소는 미연결 상태입니다. 접수 등록은 가능하지만 파일 전송은 저장소 연결 후 진행합니다.');
    return result;
  }
  delivery.addEventListener('change',renderFields);
  form.addEventListener('submit',async event=>{
    event.preventDefault();
    const button=form.querySelector('[type=submit]');button.disabled=true;
    try{
      const mode=delivery.value;
      const payload={delivery:mode,vendorName:form.elements.vendorName.value.trim()};
      if(mode==='github_pr'){
        payload.sourceUrl=form.elements.sourceUrl.value.trim();
        const sha=form.elements.sourceRef.value.trim();if(sha)payload.sourceRef=sha;
      }
      if(mode==='external_api'){
        payload.apiBaseUrl=form.elements.apiBaseUrl.value.trim();
        payload.documentationUrl=form.elements.documentationUrl.value.trim();
        payload.capabilities=['health',...form.elements.capabilities.value.split(',').map(v=>v.trim()).filter(Boolean)];
      }
      const file=uploadField.files?.[0];
      if(mode==='zip'&&(!file||file.size>8*1024*1024||!file.name.toLowerCase().endsWith('.zip')))
        throw new Error('8MB 이하의 ZIP 파일을 선택하세요.');
      setText(status,'제출 정보를 검증하고 있습니다.');
      const result=await api('/api/cheonggyepass/vendor-intake',{
        method:'POST',headers:{'idempotency-key':crypto.randomUUID()},body:JSON.stringify(payload)
      });
      if(mode==='zip'){
        const auth=token();
        const response=await fetch('/api/cheonggyepass/vendor-intake/'+encodeURIComponent(result.item.id)+'/upload',{
          method:'POST',headers:{authorization:'Bearer '+auth,'x-ekodi-intake-request':'1','content-type':'application/zip'},
          body:file,credentials:'same-origin',cache:'no-store'
        });
        const body=await response.json().catch(()=>({}));
        if(!response.ok)throw new Error(body.error||'ZIP 격리보관에 실패했습니다.');
      }
      setText(status,'접수가 기록되었습니다. 보안 검사와 운영 승인 전까지 코드는 실행되지 않습니다.');
      form.reset();renderFields();await refresh();
    }catch(err){setText(status,err.message)}
    finally{button.disabled=false}
  });
  function ready(){
    root.hidden=false;renderFields();
    refresh().catch(err=>setText(status,err.message));
  }
  if(document.documentElement.dataset.regionAuthReady==='1')ready();
  else document.addEventListener('ekodi:region-access-ready',ready,{once:true});
}
export function cheonggyePassVendorIntakeScript(){
  return new Response('('+clientMain.toString()+')();',{
    headers:{
      'content-type':'text/javascript; charset=utf-8',
      'cache-control':'no-store','x-content-type-options':'nosniff',
    },
  });
}
