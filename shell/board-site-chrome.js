/*
 * EKODI-PUBLIC-BOARD-SITE-CHROME-001
 * A public board inherits its parent site's real header, footer and public
 * styles; the board engine remains independent for its data and permissions.
 * A failed parent fetch never prevents board reading or writing.
 */
(function(){
  'use strict';
  const script=document.currentScript;
  const VERSION='v1';
  if(document.documentElement.dataset.ekodiBoardChrome===VERSION)return;
  const path=location.pathname;
  if(!/(?:^|\/)board(?:\/|$)|\/(?:notices|finance)(?:\/|$)/i.test(path))return;
  document.documentElement.dataset.ekodiBoardChrome='loading';
  function parentPath(){
    const explicit=(script?.dataset.ekodiBoardParentPath||'').trim();
    if(explicit.startsWith('/')&&!explicit.startsWith('//')&&!explicit.includes('\\')&&!/(?:^|\/)board(?:\/|$)/i.test(explicit))return explicit;
    const root=path.match(/^\/([a-z0-9-]+)\/(?:board|notices|finance)(?:\/|$)/i);
    return root?'/'+root[1]+'/':'/';
  }
  const home=new URL(parentPath(),location.origin);
  if(home.origin!==location.origin || home.pathname===location.pathname){
    document.documentElement.dataset.ekodiBoardChrome='fallback';
    return;
  }
  const isExternalOrSafe=(value)=>{
    try{const u=new URL(value,home);return ['https:','http:','mailto:','tel:'].includes(u.protocol)}catch{return false}
  };
  function normalizeUrls(root){
    for(const el of [root,...root.querySelectorAll('*')]){
      for(const attr of ['href','src','poster']){
        const value=el.getAttribute(attr);
        if(!value||value.startsWith('data:')||value.startsWith('blob:')||!isExternalOrSafe(value))continue;
        el.setAttribute(attr,new URL(value,home).href);
      }
      if(el.hasAttribute('srcset')){
        // Do not rewrite a complex srcset incorrectly; the original site keeps
        // its path-safe absolute srcsets and the clone drops unsafe relative ones.
        const value=el.getAttribute('srcset')||'';
        if(!value.split(',').every(part=>/^\s*https?:\/\//i.test(part)))el.removeAttribute('srcset');
      }
      el.removeAttribute('id'); // avoid duplicate IDs shadowing board forms
      for(const attr of Array.from(el.attributes)){
        if(attr.name.startsWith('on'))el.removeAttribute(attr.name);
      }
    }
    for(const active of root.querySelectorAll('[aria-current="page"],.active')){
      if(active.matches('a')){active.removeAttribute('aria-current');active.classList.remove('active')}
    }
    const current=new URL(location.href);
    for(const a of root.querySelectorAll('a[href]')){
      try{
        const target=new URL(a.href);
        if(target.origin===current.origin&&target.pathname.replace(/\/+$/,'')===current.pathname.replace(/\/+$/,'')){
          a.setAttribute('aria-current','page');
          a.classList.add('active');
        }
      }catch{}
    }
    return root;
  }
  function selectChrome(doc,tag){
    return doc.querySelector('body > '+tag+',body > .site-'+tag+',body > [role="'+(tag==='header'?'banner':'contentinfo')+'"],#app '+tag+',main ~ '+tag);
  }
  function importStyle(doc){
    for(const item of doc.querySelectorAll('head link[rel~="stylesheet"],head style')){
      if(item.tagName==='STYLE'){
        const copy=document.createElement('style');
        copy.setAttribute('data-ekodi-board-parent-style',VERSION);
        copy.textContent=item.textContent.slice(0,120000);
        document.head.append(copy);
      }else{
        const url=new URL(item.getAttribute('href')||'',home);
        if(url.protocol!=='https:'&&url.protocol!=='http:')continue;
        // Only styles belonging to the owning site's origin: no external fonts,
        // injected third-party resources or unrelated admin scripts.
        if(url.origin!==home.origin)continue;
        if(document.querySelector('link[data-ekodi-board-parent-style][href="'+CSS.escape(url.href)+'"]'))continue;
        const copy=document.createElement('link');
        copy.rel='stylesheet';
        copy.href=url.href;
        copy.setAttribute('data-ekodi-board-parent-style',VERSION);
        document.head.append(copy);
      }
    }
  }
  async function apply(){
    const controller=new AbortController();
    const cutoff=setTimeout(()=>controller.abort(),6500);
    try{
      const response=await fetch(home.href,{method:'GET',credentials:'same-origin',redirect:'follow',cache:'no-store',signal:controller.signal,headers:{accept:'text/html'}});
      if(!response.ok||!String(response.headers.get('content-type')||'').includes('text/html'))throw new Error('parent_unavailable');
      if(new URL(response.url).origin!==home.origin)throw new Error('parent_redirect_cross_origin');
      const html=(await response.text()).slice(0,360000);
      const source=new DOMParser().parseFromString(html,'text/html');
      const header=selectChrome(source,'header'),footer=selectChrome(source,'footer');
      if(!header||!footer)throw new Error('parent_chrome_missing');
      const parentHeader=normalizeUrls(document.importNode(header,true));
      const parentFooter=normalizeUrls(document.importNode(footer,true));
      parentHeader.setAttribute('data-ekodi-board-parent-header',VERSION);
      parentFooter.setAttribute('data-ekodi-board-parent-footer',VERSION);
      importStyle(source);
      const oldHeader=document.querySelector('body > header,[data-ekodi-board-chrome-placeholder="header"]');
      const oldFooter=document.querySelector('body > footer,[data-ekodi-board-chrome-placeholder="footer"]');
      if(oldHeader)oldHeader.replaceWith(parentHeader);
      else document.body.prepend(parentHeader);
      if(oldFooter)oldFooter.replaceWith(parentFooter);
      else document.body.append(parentFooter);
      document.documentElement.dataset.ekodiBoardChrome=VERSION;
      document.dispatchEvent(new CustomEvent('ekodi:board-site-chrome-ready',{detail:{version:VERSION}}));
    }catch{
      // Keep the initial server-rendered site link/header and footer visible.
      // No auth/board API failures or private diagnostic data are disclosed.
      document.documentElement.dataset.ekodiBoardChrome='fallback';
    }finally{
      clearTimeout(cutoff);
    }
  }
  void apply();
})();
