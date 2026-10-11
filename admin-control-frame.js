(() => {
  'use strict';
  // A failed iframe may still dispatch "load" with an empty document when
  // blocked by CSP/X-Frame-Options. Never disguise that as a working Control UI.
  const frame=document.getElementById('adminControlFrame');
  const notice=document.getElementById('adminControlFrameNotice');
  if(!frame||!notice)return;
  function reportFailure(){
    notice.hidden=false;
    frame.classList.add('admin-control-frame-unavailable');
    frame.setAttribute('aria-hidden','true');
    document.documentElement.dataset.ekodiControlEmbedded='unavailable';
  }
  function reportSuccess(){
    notice.hidden=true;
    frame.classList.remove('admin-control-frame-unavailable');
    frame.removeAttribute('aria-hidden');
    document.documentElement.dataset.ekodiControlEmbedded='ready';
  }
  frame.addEventListener('error',()=>{
    if(frame.getAttribute('src'))reportFailure();
  });
  frame.addEventListener('load',()=>{
    if(!frame.getAttribute('src'))return;
    try{
      // The canonical Control frame is same-origin and must carry this form.
      const documentRoot=frame.contentDocument;
      if(documentRoot?.getElementById('commandForm') &&
         documentRoot?.querySelector('#authBanner'))reportSuccess();
      else reportFailure();
    }catch{
      reportFailure();
    }
  });
})();
