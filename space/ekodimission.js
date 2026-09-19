(()=>{
  const eventSlug='260926-chuseok-open-table';
  const applicationRecordKey='260926-chuseok-open-table';
  const url=`https://ekodi.kr/ekodimission/activities/${eventSlug}`;
  const api=`/ekodimission/api/activities/${applicationRecordKey}/applications`;
  const invite=`이번 추석, 함께 밥 먹을 사람이 필요하다면 에코디 열린식탁으로 오세요. 국적과 나이, 신앙과 관계없이 누구나 환영합니다. 2026년 9월 26일 토요일 오후 3시, 목포대 후문에서 기다리겠습니다. ${url}`;
  const languageRegistryUrl='/shell/language-registry.json';
  const languageStatusUrl='/api/i18n/v1/status?service=mission';
  const languageCatalogUrl=locale=>`/api/i18n/v1/catalog?service=mission&locale=${encodeURIComponent(locale)}`;
  const sourceLocale='ko-KR';
  const localeStorageKey='ekodi_user_locale';
  const localeCookieKey='ekodi_locale';
  const canonicalNav=[
    ['/ekodimission/activities','활동'],
    ['/ekodimission/live','라이브'],
    ['/ekodimission/participate','함께하기'],
    ['/ekodimission/partners','협력'],
    ['/ekodimission/stories','소식']
  ];
  const normalizedText=value=>String(value||'').replace(/\s+/g,' ').trim();
  function syncMissionHeader(){
    const nav=document.querySelector('.site-header nav[aria-label="주요 메뉴"]');if(!nav)return;
    let language=nav.querySelector('[data-mission-language-control]');
    if(!language){
      language=document.createElement('label');language.className='mission-language';language.dataset.missionLanguageControl='';
      const label=document.createElement('span');label.textContent='언어';
      const select=document.createElement('select');select.setAttribute('aria-label','언어');select.innerHTML='<option value="ko-KR">한국어</option>';
      language.append(label,select);
    }
    const links=canonicalNav.map(([href,label])=>{const a=document.createElement('a');a.href=href;a.textContent=label;return a;});
    const current=location.pathname.replace(/\/+$/,'')||'/';
    for(const a of links){
      const target=new URL(a.href,location.origin).pathname.replace(/\/+$/,'')||'/';
      if(current===target||(target==='/ekodimission/activities'&&current.startsWith('/ekodimission/activities/')))a.setAttribute('aria-current','page');
    }
    nav.replaceChildren(...links,language);
  }
  function readLocaleCookie(){
    try{const prefix=`${localeCookieKey}=`;const item=document.cookie.split(';').map(v=>v.trim()).find(v=>v.startsWith(prefix));return item?decodeURIComponent(item.slice(prefix.length)):''}catch{return''}
  }
  function persistLocale(locale){
    try{localStorage.setItem(localeStorageKey,locale)}catch{}
    try{document.cookie=`${localeCookieKey}=${encodeURIComponent(locale)}; Path=/; Max-Age=31536000; SameSite=Lax; Secure`}catch{}
  }
  function languageNotice(message){
    let notice=document.querySelector('[data-mission-language-notice]');
    if(!notice){notice=document.createElement('div');notice.dataset.missionLanguageNotice='';notice.setAttribute('role','status');notice.setAttribute('aria-live','polite');document.body.append(notice);}
    notice.textContent=message;notice.hidden=false;clearTimeout(languageNotice.timer);languageNotice.timer=setTimeout(()=>{notice.hidden=true},3200);
  }
  function excludedTranslationNode(node){
    const parent=node?.parentElement;return !parent||Boolean(parent.closest('script,style,noscript,template,svg,code,pre,[data-mission-language-control],[data-auto-i18n-ignore]'));
  }
  function applyCatalogItems(items){
    if(!items||typeof items!=='object'||!document.body)return;
    const walker=document.createTreeWalker(document.body,NodeFilter.SHOW_TEXT);let node;
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
        const original=element.getAttribute(name);if(!original)continue;
        const translated=typeof items[normalizedText(original)]==='string'?items[normalizedText(original)].trim():'';
        if(translated&&translated!==original)element.setAttribute(name,translated);
      }
    }
  }
  async function initMissionLanguage(){
    const control=document.querySelector('[data-mission-language-control]'),select=control?.querySelector('select');if(!select)return;
    try{
      const [registryResponse,statusResponse]=await Promise.all([
        fetch(languageRegistryUrl,{headers:{accept:'application/json'},cache:'no-store'}),
        fetch(languageStatusUrl,{headers:{accept:'application/json'},cache:'no-store'})
      ]);
      if(!registryResponse.ok||!statusResponse.ok)throw new Error('language_metadata_unavailable');
      const registry=await registryResponse.json(),status=await statusResponse.json();
      const languages=Array.isArray(registry.languages)?registry.languages:[],published=new Set(Array.isArray(status.publishedLocales)?status.publishedLocales:[sourceLocale]);
      published.add(sourceLocale);
      const aliases=new Map();
      for(const item of languages){aliases.set(String(item.locale||'').toLowerCase(),item.locale);for(const alias of item.aliases||[])aliases.set(String(alias).toLowerCase(),item.locale);}
      const normalize=value=>aliases.get(String(value||'').trim().toLowerCase())||'';
      select.replaceChildren(...languages.map(item=>{
        const option=document.createElement('option');option.value=item.locale;option.disabled=!published.has(item.locale);
        option.textContent=`${item.short||item.label||item.locale}${option.disabled?' · 준비 중':''}`;option.title=option.disabled?'번역 준비 중':(item.label||item.locale);return option;
      }));
      const params=new URL(location.href).searchParams;
      const requested=normalize(params.get('lang')||readLocaleCookie()||localStorage.getItem(localeStorageKey)||navigator.language)||sourceLocale;
      const active=published.has(requested)?requested:sourceLocale;
      if(requested!==active){
        const cleanUrl=new URL(location.href);cleanUrl.searchParams.delete('lang');history.replaceState(history.state,'',cleanUrl);
        languageNotice('선택한 언어는 준비 중입니다. 현재 한국어로 표시합니다.');
      }
      select.value=active;document.documentElement.lang=active;
      if(active!==sourceLocale){
        const catalogResponse=await fetch(languageCatalogUrl(active),{headers:{accept:'application/json'},cache:'no-store'});
        if(catalogResponse.ok){const catalog=await catalogResponse.json();applyCatalogItems(catalog.items||{});}
      }
      select.addEventListener('change',()=>{
        const next=select.value;if(!published.has(next)){select.value=active;return;}
        persistLocale(next);const nextUrl=new URL(location.href);
        if(next===sourceLocale)nextUrl.searchParams.delete('lang');else nextUrl.searchParams.set('lang',next);
        location.assign(nextUrl.toString());
      },{once:false});
    }catch{
      select.replaceChildren(Object.assign(document.createElement('option'),{value:sourceLocale,textContent:'한국어'}));select.value=sourceLocale;
    }
  }
  syncMissionHeader();
  void initMissionLanguage();
  const shareStatus=m=>document.querySelectorAll('[data-share-status]').forEach(el=>el.textContent=m);
  async function copy(v,m){try{await navigator.clipboard.writeText(v)}catch{const t=document.createElement('textarea');t.value=v;document.body.append(t);t.select();document.execCommand('copy');t.remove()}shareStatus(m)}
  document.addEventListener('click',async e=>{
    if(e.target.closest('[data-share-event]')){if(navigator.share){try{await navigator.share({title:'2026 에코디 추석 열린식탁',text:'빈자리를 식탁으로, 낯선 이를 이웃으로.',url});shareStatus('공유 창을 열었습니다.')}catch(err){if(err?.name!=='AbortError')await copy(url,'행사 링크를 복사했습니다.')}}else await copy(url,'행사 링크를 복사했습니다.');return}
    if(e.target.closest('[data-copy-invite]'))await copy(invite,'초대문을 복사했습니다.');
  });
  const form=document.querySelector('[data-event-application]');if(!form)return;
  const status=form.querySelector('[data-application-status]');const submit=form.querySelector('button[type="submit"]');
  form.addEventListener('submit',async e=>{
    e.preventDefault();status.textContent='';status.dataset.state='';
    if(!form.reportValidity())return;
    const data=new FormData(form);
    const payload={name:String(data.get('name')||'').trim(),phone:String(data.get('phone')||'').trim(),email:String(data.get('email')||'').trim(),partySize:Number(data.get('partySize')||1),language:String(data.get('language')||'ko'),dietary:String(data.get('dietary')||'').trim(),note:String(data.get('note')||'').trim(),photoConsent:data.get('photoConsent')==='on',privacyConsent:data.get('privacyConsent')==='on',website:String(data.get('website')||'')};
    submit.disabled=true;submit.textContent='신청 중…';status.textContent='신청을 저장하고 있습니다.';
    try{
      const response=await fetch(api,{method:'POST',headers:{'content-type':'application/json','accept':'application/json'},body:JSON.stringify(payload),credentials:'same-origin'});
      const result=await response.json().catch(()=>({}));
      if(!response.ok||!result.ok)throw new Error(result.message||'신청을 저장하지 못했습니다.');
      status.dataset.state='success';status.textContent='신청이 완료되었습니다. 같은 연락처로 다시 신청하면 내용이 업데이트됩니다.';
      submit.textContent='신청 완료';
    }catch(error){status.dataset.state='error';status.textContent=error?.message||'신청을 저장하지 못했습니다. 잠시 후 다시 시도해 주세요.';submit.disabled=false;submit.textContent='다시 신청하기';}
  });
})();
