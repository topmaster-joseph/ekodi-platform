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
  // Keep the compact administrator menu under its performance budget:
  // the existing navigation emits section events, and this small module
  // owns only the integrated Control panel's visibility and iframe lifecycle.
  const panel=document.getElementById('adminControlHome');
  const activateSection=section=>{
    if(!panel)return;
    const home=section==='command-home';
    panel.classList.toggle('hidden-panel',!home);
    panel.hidden=!home;
    if(home&&frame.dataset.src&&!frame.hasAttribute('src')){
      frame.setAttribute('src',frame.dataset.src);
    }
  };
  window.addEventListener('ekodi-admin-section-changed',event=>{
    activateSection(event?.detail?.section);
  });
  window.addEventListener('ekodi-admin-ready',()=>{
    activateSection(window.EKODIAdminPanels?.current?.()||'command-home');
  });
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
