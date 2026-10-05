(()=>{
  const root=document.body;
  if(!root?.hasAttribute('data-activity-archive'))return;
  const activityKey=String(root.dataset.activityKey||'').trim();
  const form=document.querySelector('[data-media-submit]');
  const status=document.querySelector('[data-media-status]');
  const list=document.querySelector('[data-media-list]');
  const token=()=>{try{return sessionStorage.getItem('ekodi-auth-token')||''}catch{return''}};
  const setStatus=(message,state='')=>{if(!status)return;status.textContent=message;status.dataset.state=state};
  const text=(value)=>String(value??'').replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
  const mediaApi='/ekodimission/api/activities/'+encodeURIComponent(activityKey)+'/media';

  form?.addEventListener('submit',async event=>{
    event.preventDefault();
    if(!form.reportValidity())return;
    const submit=form.querySelector('button[type="submit"]');
    const data=new FormData(form);
    const payload={
      url:String(data.get('url')||'').trim(),
      title:String(data.get('title')||'').trim(),
      name:String(data.get('name')||'').trim(),
      type:String(data.get('type')||'other')
    };
    submit.disabled=true;setStatus('등록하고 있습니다.');
    try{
      const response=await fetch(mediaApi,{method:'POST',headers:{'content-type':'application/json','accept':'application/json'},credentials:'same-origin',body:JSON.stringify(payload)});
      const result=await response.json().catch(()=>({}));
      if(!response.ok||!result.ok)throw new Error(result.message||'등록하지 못했습니다.');
      setStatus('등록되었습니다. 같은 링크가 이미 있으면 하나로 정리됩니다.','success');
      form.reset();
      location.reload();
    }catch(error){
      setStatus(error?.message||'등록하지 못했습니다. 잠시 후 다시 시도해 주세요.','error');
      submit.disabled=false;
    }
  });

  async function enableAdminActions(){
    const auth=token();if(!auth)return;
    try{
      const me=await fetch('/ekodimission/api/admin/me',{headers:{authorization:'Bearer '+auth,accept:'application/json'},credentials:'same-origin'}).then(r=>r.ok?r.json():null);
      if(!me?.ok||!me?.permissions?.media)return;
      document.querySelectorAll('[data-media-card][data-media-id]').forEach(card=>{
        if(card.querySelector('[data-media-hide]'))return;
        const button=document.createElement('button');
        button.type='button';button.className='button secondary';button.dataset.mediaHide='';button.textContent='이 항목 숨기기';
        button.addEventListener('click',async()=>{
          if(button.disabled)return;
          button.disabled=true;
          try{
            const response=await fetch('/ekodimission/api/admin/activity-rpc',{
              method:'POST',
              headers:{authorization:'Bearer '+auth,'content-type':'application/json',accept:'application/json'},
              credentials:'same-origin',
              body:JSON.stringify({rpc:'activity_admin_hide_media_link',args:{
                p_workspace_slug:'ekodimission',p_activity_key:activityKey,p_media_id:String(card.dataset.mediaId||''),p_hidden:true
              }})
            });
            const result=await response.json().catch(()=>({}));
            if(!response.ok||!result.ok)throw new Error(result.message||'숨기지 못했습니다.');
            card.remove();
            if(!list?.querySelector('[data-media-card]')){
              const empty=document.createElement('article');empty.className='service-card';empty.innerHTML='<h2>표시할 결과가 없습니다.</h2><p>참여자가 새 링크를 등록하면 여기에 나타납니다.</p>';list?.append(empty);
            }
          }catch(error){
            alert(error?.message||'숨기지 못했습니다.');
            button.disabled=false;
          }
        });
        card.append(button);
      });
    }catch{}
  }
  enableAdminActions();
})();