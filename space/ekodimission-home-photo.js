(()=>{
  'use strict';
  const container=document.querySelector('[data-mission-public-photo]');
  if(!container)return;
  const image=container.querySelector('[data-mission-public-photo-image]');
  const fallback=container.querySelector('[data-mission-photo-fallback]');
  const caption=container.querySelector('[data-mission-public-photo-caption]');
  // Only first-party photos exposed by the consent-controlled public archive.
  const approvedPath=/^\/ekodimission\/media\/[0-9a-f-]{36}$/i;
  const archives=[
    {key:'261003-autumn-community-trip',label:'가을 공동체 여행'},
    {key:'260926-chuseok-open-table',label:'열린식탁'}
  ];
  async function load(){
    for(const activity of archives){
      try{
        const result=await fetch('/ekodimission/activities/'+activity.key+'/archive',{
          headers:{accept:'text/html'},credentials:'omit',cache:'no-store'
        });
        if(!result.ok)continue;
        const doc=new DOMParser().parseFromString(await result.text(),'text/html');
        // Server emits this class only for approved ekodi_storage photo rows.
        for(const photo of doc.querySelectorAll('img.activity-result-photo[src]')){
          const url=new URL(photo.getAttribute('src')||'',location.origin);
          if(url.origin!==location.origin||!approvedPath.test(url.pathname)||url.search||url.hash)continue;
          const probe=new Image();
          probe.src=url.href;
          try{await probe.decode()}catch{continue}
          if(probe.naturalWidth<640||probe.naturalHeight<360)continue;
          image.src=url.href;
          image.alt=activity.label+'에서 촬영한 공개 승인된 실제 활동 사진';
          image.hidden=false;
          fallback.hidden=true;
          caption.textContent='에코디선교회 실제 활동사진 · '+activity.label;
          caption.hidden=false;
          return;
        }
      }catch{
        // Keep the editorial fallback if the archive/photo is unavailable.
      }
    }
  }
  void load();
})();