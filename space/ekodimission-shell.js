(()=>{
  const sourceLocale='ko-KR';
  const localeStorageKey='ekodi_user_locale';
  const localeCookieKey='ekodi_locale';
  const languageRegistryUrl='/shell/language-registry.json';
  const languageStatusUrl='/api/i18n/v1/status?service=mission';
  const languageCatalogUrl=locale=>`/api/i18n/v1/catalog?service=mission&locale=${encodeURIComponent(locale)}`;
  const contract=Object.freeze({
    version:3,
    links:Object.freeze([
      Object.freeze({href:'/ekodimission/activities',label:'활동'}),
      Object.freeze({href:'/ekodimission/live',label:'라이브'}),
      Object.freeze({href:'/ekodimission/participate',label:'함께하기'}),
      Object.freeze({href:'/ekodimission/partners',label:'협력'}),
      Object.freeze({href:'/ekodimission/stories',label:'소식'})
    ]),
    language:Object.freeze({
      sourceLocale,
      registry:languageRegistryUrl,
      status:languageStatusUrl,
      visibility:'published-only'
    })
  });
  window.EKODI_MISSION_NAVIGATION_CONTRACT=contract;
  const normalizedText=value=>String(value||'').replace(/\s+/g,' ').trim();
  const safeStorageGet=key=>{try{return localStorage.getItem(key)||''}catch{return''}};
  const readLocaleCookie=()=>{try{const prefix=`${localeCookieKey}=`;const item=document.cookie.split(';').map(v=>v.trim()).find(v=>v.startsWith(prefix));return item?decodeURIComponent(item.slice(prefix.length)):''}catch{return''}};
  const persistLocale=locale=>{
    try{localStorage.setItem(localeStorageKey,locale)}catch{}
    try{document.cookie=`${localeCookieKey}=${encodeURIComponent(locale)}; Path=/; Max-Age=31536000; SameSite=Lax; Secure`}catch{}
  };
  const languageNotice=message=>{
    let notice=document.querySelector('[data-mission-language-notice]');
    if(!notice){
      notice=document.createElement('div');
      notice.dataset.missionLanguageNotice='';
      notice.setAttribute('role','status');
      notice.setAttribute('aria-live','polite');
      document.body.append(notice);
    }
    notice.textContent=message;
    notice.hidden=false;
    clearTimeout(languageNotice.timer);
    languageNotice.timer=setTimeout(()=>{notice.hidden=true},3200);
  };
  const excludedTranslationNode=node=>{
    const parent=node?.parentElement;
    return !parent||Boolean(parent.closest('script,style,noscript,template,svg,code,pre,[data-mission-language-control],[data-auto-i18n-ignore]'));
  };
  const applyCatalogItems=items=>{
    if(!items||typeof items!=='object'||!document.body)return;
    const walker=document.createTreeWalker(document.body,NodeFilter.SHOW_TEXT);
    let node;
    while((node=walker.nextNode())){
      if(excludedTranslationNode(node))continue;
      const original=String(node.nodeValue||''),key=normalizedText(original),translated=typeof items[key]==='string'?items[key].trim():'';
      if(!translated||translated===key)continue;
      const leading=original.match(/^\s*/)?.[0]||'',trailing=original.match(/\s*$/)?.[0]||'';
      node.nodeValue=`${leading}${translated}${trailing}`;
    }
    for(const element of document.querySelectorAll('[placeholder],[title],[aria-label],[alt]')){
      if(element.closest('[data-mission-language-control],[data-auto-i18n-ignore]'))continue;
      for(const name of ['placeholder','title','aria-label','alt']){
        const original=element.getAttribute(name);
        if(!original)continue;
        const translated=typeof items[normalizedText(original)]==='string'?items[normalizedText(original)].trim():'';
        if(translated&&translated!==original)element.setAttribute(name,translated);
      }
    }
  };
  function mountNavigation(){
    const nav=document.querySelector('[data-mission-nav]');
    if(!nav)return null;
    const links=contract.links.map(item=>{
      const a=document.createElement('a');
      a.href=item.href;
      a.textContent=item.label;
      return a;
    });
    const current=location.pathname.replace(/\/+$/,'')||'/';
    for(const a of links){
      const target=new URL(a.href,location.origin).pathname.replace(/\/+$/,'')||'/';
      if(current===target||(target==='/ekodimission/activities'&&current.startsWith('/ekodimission/activities/')))a.setAttribute('aria-current','page');
    }
    const language=document.createElement('label');
    language.className='mission-language';
    language.dataset.missionLanguageControl='';
    language.setAttribute('title','언어 선택');
    const select=document.createElement('select');
    select.setAttribute('aria-label','언어 선택');
    select.innerHTML='<option value="ko-KR">한국어</option>';
    language.append(select);
    nav.replaceChildren(...links,language);
    return {nav,select};
  }
  async function initLanguage(select){
    if(!select)return;
    try{
      const [registryResponse,statusResponse]=await Promise.all([
        fetch(languageRegistryUrl,{headers:{accept:'application/json'},cache:'no-store'}),
        fetch(languageStatusUrl,{headers:{accept:'application/json'},cache:'no-store'})
      ]);
      if(!registryResponse.ok||!statusResponse.ok)throw new Error('language_metadata_unavailable');
      const registry=await registryResponse.json();
      const status=await statusResponse.json();
      const languages=Array.isArray(registry.languages)?registry.languages:[];
      const published=new Set(Array.isArray(status.publishedLocales)?status.publishedLocales:[sourceLocale]);
      published.add(sourceLocale);
      const aliases=new Map();
      for(const item of languages){
        aliases.set(String(item.locale||'').toLowerCase(),item.locale);
        for(const alias of item.aliases||[])aliases.set(String(alias).toLowerCase(),item.locale);
      }
      const normalize=value=>aliases.get(String(value||'').trim().toLowerCase())||'';
      const available=languages.filter(item=>published.has(item.locale));
      if(!available.some(item=>item.locale===sourceLocale))available.unshift({locale:sourceLocale,short:'한국어',label:'한국어'});
      select.replaceChildren(...available.map(item=>{
        const option=document.createElement('option');
        option.value=item.locale;
        option.textContent=item.short||item.label||item.locale;
        option.title=item.label||item.locale;
        return option;
      }));
      const params=new URL(location.href).searchParams;
      const requested=normalize(params.get('lang')||readLocaleCookie()||safeStorageGet(localeStorageKey)||navigator.language)||sourceLocale;
      const active=published.has(requested)?requested:sourceLocale;
      if(requested!==active){
        const cleanUrl=new URL(location.href);
        cleanUrl.searchParams.delete('lang');
        history.replaceState(history.state,'',cleanUrl);
        languageNotice('현재 제공되는 언어로 표시합니다.');
      }
      select.value=active;
      document.documentElement.lang=active;
      if(active!==sourceLocale){
        const catalogResponse=await fetch(languageCatalogUrl(active),{headers:{accept:'application/json'},cache:'no-store'});
        if(catalogResponse.ok){
          const catalog=await catalogResponse.json();
          applyCatalogItems(catalog.items||{});
        }
      }
      select.addEventListener('change',()=>{
        const next=select.value;
        if(!published.has(next)){select.value=active;return}
        persistLocale(next);
        const nextUrl=new URL(location.href);
        if(next===sourceLocale)nextUrl.searchParams.delete('lang');
        else nextUrl.searchParams.set('lang',next);
        location.assign(nextUrl.toString());
      });
    }catch{
      select.replaceChildren(Object.assign(document.createElement('option'),{value:sourceLocale,textContent:'한국어'}));
      select.value=sourceLocale;
      document.documentElement.lang=sourceLocale;
    }
  }
  const mounted=mountNavigation();
  void initLanguage(mounted?.select);
})();