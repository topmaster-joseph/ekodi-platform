(()=>{
  // Deployment sync: keep the published language-visibility contract aligned with ekodi-space assets.
  const sourceLocale='ko-KR';
  // Redirect legacy year anchors formerly embedded in the news page.
  if(location.pathname.replace(/\/+$/,'')==='/ekodimission/stories'&&/^#history-20\d{2}$/.test(location.hash)){
    location.replace('/ekodimission/history'+location.hash);
    return;
  }
  const localeStorageKey='ekodi_user_locale';
  const localeCookieKey='ekodi_locale';
  const languageRegistryUrl='/shell/language-registry.json';
  const languageStatusUrl='/api/i18n/v1/status?service=mission';
  const languageCatalogUrl=locale=>`/api/i18n/v1/catalog?service=mission&locale=${encodeURIComponent(locale)}`;
  const contract=Object.freeze({
    version:3,
    release:'language-visibility-v1',
    links:Object.freeze([
      Object.freeze({href:'/ekodimission/devotion',label:'매일묵상'}),
      Object.freeze({href:'/ekodimission/activities',label:'활동'}),
      Object.freeze({href:'/ekodimission#saturday',label:'토요모임'}),
      Object.freeze({href:'/ekodimission/history',label:'연혁'}),
      Object.freeze({href:'/ekodimission/live',label:'라이브'}),
      Object.freeze({href:'/ekodimission/participate',label:'함께하기'}),
      Object.freeze({href:'/ekodimission/partners',label:'협력'}),
      Object.freeze({href:'/ekodimission/stories',label:'소식'}),
      Object.freeze({href:'/qtin/mission',label:'큐티인 신청'})
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
    const primaryIndices=new Set([0,1,2,5]);
    const current=location.pathname.replace(/\/+$/,'')||'/';
    const link=item=>{
      const a=document.createElement('a');
      a.href=item.href;a.textContent=item.label;
      const target=new URL(a.href,location.origin).pathname.replace(/\/+$/,'')||'/';
      if((current===target&&!(item.href.endsWith('#saturday')&&location.hash!=='#saturday'))||
         (target==='/ekodimission/activities'&&current.startsWith('/ekodimission/activities/'))){
        a.setAttribute('aria-current','page');
      }
      return a;
    };
    const links=contract.links.map(link);
    const primary=links.filter((a,index)=>primaryIndices.has(index));
    const secondary=links.filter((a,index)=>!primaryIndices.has(index));
    const dropdown=(className,label,items)=>{
      const details=document.createElement('details');details.className=className;
      const summary=document.createElement('summary');summary.textContent=label;
      const contents=document.createElement('div');contents.className='mission-nav-menu';
      contents.append(...items.map(link));details.append(summary,contents);
      details.addEventListener('keydown',e=>{if(e.key==='Escape'){details.open=false;summary.focus()}});
      document.addEventListener('click',e=>{if(details.open&&!details.contains(e.target))details.open=false});
      return details;
    };
    const more=document.createElement('details');
    more.className='mission-nav-more';
    const summary=document.createElement('summary');
    summary.textContent='더보기';
    summary.setAttribute('aria-label','추가 메뉴 열기');
    const popup=document.createElement('div');
    popup.className='mission-nav-menu';
    popup.append(...secondary);
    more.append(summary,popup);
    more.addEventListener('keydown',event=>{if(event.key==='Escape'){more.open=false;summary.focus()}});
    document.addEventListener('click',event=>{if(more.open&&!more.contains(event.target))more.open=false});
    const mobile=dropdown('mission-nav-mobile','메뉴',contract.links);
    const language=document.createElement('label');
    language.className='mission-language';
    language.dataset.missionLanguageControl='';
    language.hidden=true;
    language.setAttribute('title','언어 선택');
    const select=document.createElement('select');
    select.setAttribute('aria-label','언어 선택');
    select.innerHTML='<option value="ko-KR">한국어</option>';
    language.append(select);
    nav.replaceChildren(...primary,more,language);
    nav.insertBefore(mobile,language);
    return {nav,select};
  }
  // Keep the canonical Korean page and its accessible DOM free of English eyebrow text.
  // Create a label only for a published non-Korean locale before catalog translation.
  function syncDevotionEyebrow(locale){
    const heading=document.querySelector('main[data-mission-devotion] .dv-page-title');
    if(!heading)return;
    const old=heading.querySelector('[data-mission-devotion-eyebrow]');
    if(String(locale||'').toLowerCase().startsWith('ko')){old?.remove();return;}
    if(old)return;
    const eyebrow=document.createElement('small');
    eyebrow.dataset.missionDevotionEyebrow='';
    eyebrow.textContent='EKODI MISSION · DAILY DEVOTION';
    heading.insertBefore(eyebrow,heading.querySelector('h1'));
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
      const languageControl=select.closest('[data-mission-language-control]');
      if(languageControl)languageControl.hidden=available.length<=1;
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
      syncDevotionEyebrow(active);
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
      syncDevotionEyebrow(sourceLocale);
    }
  }

  const MISSION_LOGIN='/auth/?site=mission&return_to='+encodeURIComponent(location.origin==='https://ekodi.kr'&&location.pathname.startsWith('/ekodimission')?location.href:'https://ekodi.kr/ekodimission');
  const CENTRAL_AUTH_KEY='sb-renzehysxirjilvdxacv-auth-token';
  const SUPABASE_ORIGIN='https://renzehysxirjilvdxacv.supabase.co';
  const SUPABASE_PUBLIC_KEY='sb_publishable_0QjB0WzZbjrd-FJ5D5cR7A_xUkXyOY_';
  let verifiedToken='',authGeneration=0;
  const safeRead=(storage,key)=>{try{return storage.getItem(key)||''}catch{return''}};
  const centralSession=()=>{
    for(const store of [localStorage,sessionStorage]){
      try{
        const value=JSON.parse(safeRead(store,CENTRAL_AUTH_KEY)||'null');
        if(value?.access_token)return value;
      }catch{}
    }
    return null;
  };
  const candidateTokens=()=>[safeRead(sessionStorage,'ekodi-auth-token'),centralSession()?.access_token||'',window.EKODI_MY_AUTH?.getAccessToken?.()||''].filter((value,index,all)=>value&&all.indexOf(value)===index);
  function normalizeMissionFooter(){
    let footer=document.querySelector('.site-footer');
    if(!footer){
      // Dynamic photo/archive pages also inherit the same public footer.
      footer=document.createElement('footer');
      footer.className='site-footer';
      const content=document.createElement('div'),name=document.createElement('strong');
      const description=document.createElement('p'),meta=document.createElement('p');
      meta.className='footnote';
      content.append(name,description);
      footer.append(content,meta);
      document.body.append(footer);
    }
    const brand=footer.querySelector('strong');
    const description=footer.querySelector('div > p');
    const meta=footer.querySelector('.footnote');
    if(brand)brand.textContent='에코디선교회';
    if(description)description.textContent='말씀으로 만나고, 식탁으로 연결하며, 이웃과 함께하는 선교.';
    if(meta)meta.textContent='EKODI MISSION · ekodi.kr/ekodimission';
  }
  function mountDevotionAuthNextToAdmin(authRow, devotion){
    const renderer=devotion.querySelector('[data-ekodi-devotion]');
    if(!renderer)return;
    const mount=()=>{
      const adminBar=renderer.querySelector('.dv-adminbar');
      if(!adminBar)return false;
      let tools=renderer.querySelector('[data-mission-devotion-tools]');
      if(!tools){
        tools=document.createElement('div');
        tools.className='mission-devotion-tools';
        tools.dataset.missionDevotionTools='';
        // The existing admin controls keep their event handlers and their detail
        // views remain immediately beneath this common row.
        adminBar.before(tools);
      }
      tools.append(adminBar,authRow);
      return true;
    };
    // The shared devotional renderer is a module and usually mounts after this
    // deferred shell. Observe only until its own lower admin row appears.
    if(mount())return;
    const observer=new MutationObserver(()=>{
      if(mount())observer.disconnect();
    });
    observer.observe(renderer,{childList:true});
  }
  function mountMissionAuth(){
    const devotion=document.querySelector('main[data-mission-devotion]');
    const target=devotion||document.querySelector('.mission-site-header');
    if(!target)return null;
    const row=document.createElement('div');
    row.className='mission-auth-actions';
    row.dataset.autoI18nIgnore='';
    row.setAttribute('aria-label','로그인 상태');
    const state=document.createElement('span');
    state.className='mission-auth-state';state.dataset.missionAuthState='';
    state.setAttribute('role','status');state.setAttribute('aria-live','polite');
    state.textContent='';
    state.hidden=true;
    const login=document.createElement('a');login.href=MISSION_LOGIN;
    login.className='mission-auth-button';login.textContent='로그인';
    const logout=document.createElement('button');logout.type='button';
    logout.className='mission-auth-button';logout.hidden=true;logout.textContent='로그아웃';
    row.append(state,login,logout);
    target.append(row);
    if(devotion)mountDevotionAuthNextToAdmin(row,devotion);
    return {state,login,logout};
  }
  const missionAuthUi=mountMissionAuth();
  function missionAccountLabel(value){
    const raw=String(value||'').trim();
    const alias=/^identity\+([a-z0-9_-]+)\.[^@\s]+@ekodi\.kr$/i.exec(raw);
    if(alias){
      const labels={kakao:'카카오 계정',naver:'네이버 계정',google:'Google 계정',apple:'Apple 계정',daum:'다음 계정'};
      return labels[alias[1].toLowerCase()]||'연결 계정';
    }
    const local=raw.includes('@')?raw.split('@')[0]:raw;
    const name=local||'내 계정';
    return name.length>16?name.slice(0,15)+'…':name;
  }
  function paintMissionAuth(status,account=''){
    if(!missionAuthUi)return;
    const authenticated=status==='in';
    missionAuthUi.state.textContent=authenticated?missionAccountLabel(account):'';
    missionAuthUi.state.hidden=!authenticated;
    missionAuthUi.login.hidden=authenticated;
    missionAuthUi.logout.hidden=!authenticated;
  }
  async function refreshMissionAuth(){
    const epoch=++authGeneration;
    paintMissionAuth('checking');
    let unavailable=false;
    for(const token of candidateTokens()){
      try{
        const response=await fetch('/ekodimission/board/api/me',{headers:{authorization:'Bearer '+token,accept:'application/json'},cache:'no-store',credentials:'same-origin',signal:AbortSignal.timeout(6500)});
        if(!response.ok){if(response.status>=500)unavailable=true;continue}
        const data=await response.json();
        if(data.authenticated===true){
          if(epoch!==authGeneration)return '';
          verifiedToken=token;paintMissionAuth('in',data.account);
          window.dispatchEvent(new Event('ekodi:mission-auth-changed'));
          return verifiedToken;
        }
      }catch{unavailable=true}
    }
    if(epoch!==authGeneration)return '';
    verifiedToken='';paintMissionAuth(unavailable?'unavailable':'out');
    window.dispatchEvent(new Event('ekodi:mission-auth-changed'));
    return '';
  }
  async function missionLogout(){
    const platform=safeRead(sessionStorage,'ekodi-auth-token');
    const supabase=centralSession();
    // Revoke local capability and navigation immediately, before remote sign-out.
    verifiedToken='';++authGeneration;
    for(const store of [sessionStorage,localStorage]){
      try{store.removeItem(CENTRAL_AUTH_KEY)}catch{}
      try{store.removeItem('ekodi-auth-token')}catch{}
    }
    paintMissionAuth('out');
    if(missionAuthUi)missionAuthUi.logout.disabled=true;
    window.dispatchEvent(new Event('ekodi:auth-logout'));
    window.dispatchEvent(new Event('ekodi:mission-auth-changed'));
    try{
      if(platform)await fetch('/api/logout',{method:'POST',
        headers:{authorization:'Bearer '+platform},credentials:'same-origin',
        signal:AbortSignal.timeout(5000)}).catch(()=>null);
      if(supabase?.access_token)await fetch(SUPABASE_ORIGIN+'/auth/v1/logout',{method:'POST',
        headers:{apikey:SUPABASE_PUBLIC_KEY,authorization:'Bearer '+supabase.access_token},
        signal:AbortSignal.timeout(5000)}).catch(()=>null);
    }finally{if(missionAuthUi)missionAuthUi.logout.disabled=false}
  }
  missionAuthUi?.logout.addEventListener('click',()=>{void missionLogout()});
  window.EKODIMissionAuth=Object.freeze({loginUrl:MISSION_LOGIN,getToken:()=>verifiedToken,refresh:refreshMissionAuth,logout:missionLogout});
  normalizeMissionFooter();
  void refreshMissionAuth();
  window.addEventListener('ekodi:auth-success',()=>{void refreshMissionAuth()});
  window.addEventListener('focus',()=>{void refreshMissionAuth()});
  window.addEventListener('pageshow',()=>{void refreshMissionAuth()});
  window.addEventListener('storage',event=>{if(event.key===CENTRAL_AUTH_KEY)void refreshMissionAuth()});

// SITE-EVENT-SHARE-001: canonical invitation copy; never duplicate the URL.
function formatActivityShare(organization,activity,date,url,action='신청하기'){
  const clean=value=>String(value??'').replace(/[\r\n\t\u2028\u2029]+/g,' ').replace(/\s+/g,' ').trim();
  const org=clean(organization),cta=clean(action);
  let name=clean(activity);
  while(org&&(name===org||name.startsWith(org+' '))){
    name=name===org?'':name.slice(org.length).trim();
  }
  const match=clean(date).match(/^(\d{4})[-.](\d{1,2})[-.](\d{1,2})(?:\D|$)/);
  let dayLabel='';
  if(match){
    const yyyy=Number(match[1]),mm=Number(match[2]),dd=Number(match[3]);
    const day=new Date(Date.UTC(yyyy,mm-1,dd));
    if(day.getUTCFullYear()===yyyy&&day.getUTCMonth()===mm-1&&day.getUTCDate()===dd){
      const iso=String(yyyy).padStart(4,'0')+'-'+String(mm).padStart(2,'0')+'-'+String(dd).padStart(2,'0');
      dayLabel=iso+' ('+['일','월','화','수','목','금','토'][day.getUTCDay()]+')';
    }
  }
  // Event dates and CTA labels belong in their own positions, not repeated in the title.
  if(dayLabel){
    const iso=dayLabel.slice(0,10);
    name=name.replaceAll('('+iso+')','').replaceAll(iso,'')
      .replaceAll(iso.replaceAll('-','.'),'')
      .replace(/\([일월화수목금토]\)/g,' ').replace(/\s+/g,' ').trim();
  }
  while(cta&&(name===cta||name.endsWith(' '+cta))){
    name=name===cta?'':name.slice(0,-cta.length).trim();
  }
  const heading=[org,name,cta].filter(Boolean).join(' ');
  return [heading,dayLabel,clean(url)].filter(Boolean).join('\n');
}

  // Share only publicly visible activity pages and public archive rows.
  function mountMissionShares(){
    const buttonFor=(where,url,title,date='',action='자세히 보기')=>{
      if(!where)return;
      let button=where.querySelector('[data-mission-share-button]');
      if(button){Object.assign(button.dataset,{shareUrl:url,shareTitle:title,shareDate:date,shareAction:action});return}
      button=document.createElement('button');
      button.type='button';button.className='mission-share-button';
      button.dataset.missionShareButton='';Object.assign(button.dataset,{shareUrl:url,shareTitle:title,shareDate:date,shareAction:action});
      button.textContent='공유';button.setAttribute('aria-label',title+' 공유');
      const notice=document.createElement('span');
      notice.className='mission-share-note';notice.setAttribute('role','status');
      button.addEventListener('click',async()=>{
        const message=formatActivityShare('에코디선교회',button.dataset.shareTitle,button.dataset.shareDate,button.dataset.shareUrl,button.dataset.shareAction);
        if(navigator.share){
          try{await navigator.share({text:message});return}
          catch(error){if(error.name==='AbortError')return}
        }
        try{await navigator.clipboard.writeText(message);notice.textContent='링크 복사됨'}
        catch{
          let field=where.querySelector('.mission-share-fallback');
          if(!field){
            field=document.createElement('textarea');field.rows=3;field.className='mission-share-fallback';
            field.setAttribute('aria-label','공유 링크');where.append(field);
          }
          field.value=message;field.focus();field.select();
          try{
            if(document.execCommand('copy')){notice.textContent='링크 복사됨';field.remove()}
            else notice.textContent='선택한 링크를 복사하세요.';
          }catch{notice.textContent='선택한 링크를 복사하세요.'}
        }
      });
      where.append(button,notice);
    };
    const hashTitle=value=>{
      let hash=2166136261;
      for(const character of value){hash=Math.imul(hash^character.codePointAt(0),16777619)}
      return (hash>>>0).toString(36);
    };
    const renderRows=()=>{
      document.querySelectorAll('.mission-activity-row').forEach(row=>{
        const title=row.querySelector('h3')?.textContent?.trim()||'에코디선교회 활동';
        const date=row.dataset.meetingDate||row.querySelector('time')?.getAttribute('datetime')||'';
        let url='';
        if(row.dataset.meetingDate){
          url=location.origin+'/ekodimission/activities?meeting='+encodeURIComponent(date)+'#saturday-'+date;
        }else{
          if(!row.id)row.id='mission-activity-'+(row.dataset.activityKey||date.replace(/[^0-9]/g,'')+'-'+hashTitle(title));
          url=location.origin+'/ekodimission/activities#'+row.id;
        }
        let actions=row.querySelector('.mission-activity-row-actions');
        if(!actions){actions=document.createElement('div');actions.className='mission-activity-row-actions';row.append(actions)}
        buttonFor(actions,url,title,date,'자세히 보기');
      });
    };
    renderRows();
    let targetId='';
    try{targetId=decodeURIComponent(location.hash.slice(1))}catch{}
    if(targetId&&targetId.startsWith('mission-activity-')){
      document.getElementById(targetId)?.scrollIntoView({block:'center'});
    }
    const historyList=document.querySelector('[data-saturday-history-list]');
    if(historyList)new MutationObserver(renderRows).observe(historyList,{childList:true});
    const meeting=document.querySelector('[data-mission-saturday]');
    if(meeting){
      const slot=meeting.querySelector('.mission-saturday-feedback-head')||meeting.querySelector('.activity-copy');
      const update=()=>{
        const date=meeting.dataset.meetingDate;
        if(date)buttonFor(slot,location.origin+'/ekodimission?meeting='+encodeURIComponent(date)+'#saturday','토요모임',date,'신청하기');
      };
      new MutationObserver(update).observe(meeting,{attributes:true,attributeFilter:['data-meeting-date']});
      update();
    }
    if(/^\/ekodimission\/(?:activities\/|apply\/)/.test(location.pathname)||document.body.hasAttribute('data-activity-archive')){
      // Event templates use different hero variants; every public activity needs a share action.
      const hero=document.querySelector('main .sub-hero,main .event-hero,main .open-table-hero,main .event-intro,main > section:first-of-type')||document.querySelector('main');
      if(hero&&!hero.querySelector('[data-share-event], [data-mission-share-button]')){
        const slot=document.createElement('div');slot.className='mission-share-detail';
        // Preserve the two-column event hero and reuse existing event share controls.
        const host=hero.querySelector('.open-table-copy')||hero;
        host.append(slot);
        buttonFor(slot,location.origin+location.pathname,hero.querySelector('h1')?.textContent?.trim()||document.title,hero.querySelector('time[datetime]')?.getAttribute('datetime')||'',document.querySelector('[data-event-application]')?'신청하기':'자세히 보기');
      }
    }
  }
  // The Mission public shell owns navigation; the shared EKODI footer only
  // adds site-scoped visit statistics to its existing native footer. Keep the
  // serialized public HTML unchanged for the Mission ownership contract.
  function mountNativeFooterTraffic(){
    if(!/^\/ekodimission(?:\/|$)/.test(location.pathname))return;
    document.documentElement.dataset.ekodiShellSurface='public';
    if(window.__EKODI_USER_UI_FOOTER_BOOTED||document.querySelector('script[data-mission-footer-traffic]'))return;
    const beacon=document.createElement('script');
    beacon.src='https://ekodi.kr/shell/native-visit-beacon.js';
    beacon.async=false;
    beacon.dataset.missionFooterBeacon='shared';
    document.head.append(beacon);
    const script=document.createElement('script');
    script.src='https://ekodi.kr/shell/user-ui-footer.js';
    script.async=false;
    script.dataset.missionFooterTraffic='shared';
    document.head.append(script);
  }
  mountNativeFooterTraffic();
  mountMissionShares();

  const mounted=mountNavigation();
  void initLanguage(mounted?.select);
  // Private staff link: the platform API determines authority, never local UI state.
  let presenceCheck=0;
  async function checkPresenceStaff(){
    const version=++presenceCheck;
    const nav=mounted?.nav;
    if(!nav)return;
    nav.querySelectorAll('[data-mission-presence-admin]').forEach(item=>item.remove());
    let token='';
    try{token=sessionStorage.getItem('ekodi-auth-token')||window.EKODI_MY_AUTH?.getAccessToken?.()||''}catch{}
    if(!token)return;
    try{
      const response=await fetch('https://renzehysxirjilvdxacv.supabase.co/functions/v1/presence-attendance-api?tenant=ekodimission',{
        headers:{authorization:'Bearer '+token},cache:'no-store',signal:AbortSignal.timeout(7000)
      });
      if(!response.ok||version!==presenceCheck)return;
      const link=document.createElement('a');
      link.href='/ekodimission/presence';
      link.textContent='현장 출결';
      link.dataset.missionPresenceAdmin='';
      (nav.querySelector('.mission-nav-more .mission-nav-menu')||nav).append(link);
      const mobileMenu=nav.querySelector('.mission-nav-mobile .mission-nav-menu');
      if(mobileMenu)mobileMenu.append(link.cloneNode(true));
    }catch{}
  }
  void checkPresenceStaff();
  window.addEventListener('ekodi:auth-success',()=>void checkPresenceStaff());
  window.addEventListener('ekodi:auth-logout',()=>void checkPresenceStaff());
  window.addEventListener('focus',()=>void checkPresenceStaff());
  // Activity public pages hydrate editorial updates without adding a second site shell.
  const activityPage=location.pathname.replace(/\/+$/,'');
  if(activityPage==='/ekodimission/activities'||activityPage.startsWith('/ekodimission/activities/')||activityPage.startsWith('/ekodimission/apply/')){
    const script=document.createElement('script');
    script.src='/ekodimission/assets/activity-editor.js';
    script.defer=true;
    document.head.append(script);
  }
})();