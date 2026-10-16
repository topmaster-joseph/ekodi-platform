// Central category tabs on standalone SeonamMedi boards; no credential handling.
(() => {
  const panel=document.getElementById('central-category-panel');
  const template=document.getElementById('central-category-link-contract');
  const buttons=document.getElementById('central-category-buttons');
  const title=document.getElementById('central-category-title');
  if(!panel||!template||!buttons||!title)return;
  const entries=Array.from(template.content.querySelectorAll('a'));
  const groups={
    '소통채널':['페이스북','인스타그램','유튜브']
  };
  document.querySelectorAll('.site-header nav [data-category-menu]').forEach(trigger=>{
    trigger.addEventListener('click',event=>{
      const key=trigger.dataset.categoryMenu;
      const labels=groups[key]||[];
      if(!labels.length)return;
      event.preventDefault();
      const alreadyOpen=!panel.hidden&&title.textContent===key;
      panel.hidden=alreadyOpen;
      document.querySelectorAll('.site-header nav [data-category-menu]').forEach(a=>a.setAttribute('aria-expanded',String(a===trigger&&!alreadyOpen)));
      if(alreadyOpen)return;
      title.textContent=key;
      buttons.replaceChildren();
      for(const label of labels){
        const source=entries.find(a=>a.textContent.trim()===label);
        if(!source)continue;
        const a=document.createElement('a');
        a.href=source.href;
        a.textContent=label;
        buttons.appendChild(a);
      }
      panel.scrollIntoView({block:'nearest'});
    });
  });
})();

// Shared, image-free navigation layout for the public home and independent boards.
// This does not change authorization, persistence, existing menus or form handlers.
(() => {
  if (document.documentElement.dataset.seonamVisualInitialized === '1') return;
  const main = document.querySelector('body > main');
  const header = document.querySelector('body > header.site-header');
  if (!main || !header) return;
  document.documentElement.dataset.seonamVisualInitialized = '1';

  const base = location.pathname.startsWith('/seonammedi/') ? '/seonammedi/' : '/';
  const entries = [
    {key:'notices',label:'공지',href:base+'board/notices'},
    {key:'committee',label:'활동이력',href:base+'#committee-activity'},
    {key:'timeline',label:'관련소식',href:base+'#timeline'},
    {key:'channels',label:'소통채널',href:base+'#channels'},
    {key:'voices',label:'시민의견',href:base+'board/voices'},
    {key:'organization',label:'조직',href:base+'#organization'}
  ];
  const el = (tag, className, value) => {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (value != null) node.textContent = value;
    return node;
  };
  const link = (label, href) => {
    const node = el('a', '', label);
    node.href = href;
    return node;
  };

  // The original campaign poster is the only main image, on the home route.
  // Inner routes remain content-first; do not inject a shared stock photo.

  const left=el('aside','seonam-visual-left');
  left.setAttribute('aria-label','사이트 바로가기');
  const leftNav=el('nav','seonam-visual-side-nav');
  leftNav.setAttribute('aria-label','소통센터 메뉴');
  for(const item of entries){
    const anchor=link(item.label,item.href);
    anchor.dataset.seonamVisualKey=item.key;
    leftNav.append(anchor);
  }
  left.append(leftNav);
  const campaign=el('div','seonam-visual-side-card');
  campaign.append(
    el('strong','','함께 만들어가는 건강한 미래'),
    el('p','','국립의대 설립과 지역 의료의 미래를 위한 소식과 의견을 모읍니다.'),
    link('시민의견 바로가기 →',base+'board/voices')
  );
  left.append(campaign);

  const right=el('aside','seonam-visual-right');
  right.setAttribute('aria-label','공지와 관련 바로가기');
  const newsBox=el('section','seonam-visual-info-card');
  newsBox.append(el('h2','','최근 공지'));
  const recent=el('ul','seonam-visual-recent-notices');
  recent.append(el('li','','공지를 불러오는 중입니다.'));
  newsBox.append(recent,link('전체 공지 보기 →',base+'board/notices'));
  const quick=el('section','seonam-visual-info-card');
  quick.append(el('h2','','관련 바로가기'));
  const quickNav=el('nav','seonam-visual-quick');
  quickNav.setAttribute('aria-label','관련 바로가기');
  quickNav.append(
    link('공지사항',base+'board/notices'),
    link('활동이력',base+'#committee-activity'),
    link('관련소식',base+'#timeline'),
    link('시민의견 등록',base+'board/voices')
  );
  quick.append(quickNav);
  right.append(newsBox,quick);

  const content=el('div','seonam-visual-content');
  while(main.firstChild) content.append(main.firstChild);
  // Standalone boards render their category tabs next to the header; move that
  // existing node into the center column without recreating it or its listeners.
  const outsideCategory=document.querySelector('body > #central-category-panel');
  if(outsideCategory)content.prepend(outsideCategory);
  main.classList.add('seonam-visual-layout');
  main.append(left,content,right);
  // The original campaign image has a protected full-width, uncropped
  // presentation contract. Keep it below the overview rather than shrink
  // it into the center column or change its source bytes.
  const preservedCampaign=content.querySelector(':scope > .campaign-hero');
  if(preservedCampaign)header.insertAdjacentElement('afterend',preservedCampaign);
  document.body.classList.add('seonam-visual-ready');

  function active(){
    const path=location.pathname,hash=decodeURIComponent(location.hash||'');
    if(path.includes('/board/notices'))return 'notices';
    if(path.includes('/board/voices'))return 'voices';
    if(hash.startsWith('#committee-activity'))return 'committee';
    if(hash.startsWith('#timeline'))return 'timeline';
    if(hash.startsWith('#channels'))return 'channels';
    if(hash.startsWith('#organization'))return 'organization';
    return '';
  }
  function updateActive(){
    const selected=active();
    for(const anchor of leftNav.querySelectorAll('a[data-seonam-visual-key]')){
      if(anchor.dataset.seonamVisualKey===selected)anchor.setAttribute('aria-current','page');
      else anchor.removeAttribute('aria-current');
    }
  }
  updateActive();
  window.addEventListener('hashchange',updateActive);
  window.addEventListener('popstate',updateActive);

  // Read-only public API: never replace actual posts with design-sample records.
  fetch(base+'board/api/notices',{method:'GET',cache:'no-store'})
    .then(r=>{if(!r.ok)throw new Error('notice-api');return r.json();})
    .then(data=>{
      recent.replaceChildren();
      const items=Array.isArray(data.items)?data.items.slice(0,5):[];
      if(!items.length){recent.append(el('li','','등록된 공지가 없습니다.'));return;}
      for(const item of items){
        if(!item || !item.title || !Number.isSafeInteger(Number(item.id))) continue;
        const li=el('li');
        li.append(link(String(item.title),base+'board/notices?id='+encodeURIComponent(item.id)));
        recent.append(li);
      }
      if(!recent.children.length)recent.append(el('li','','등록된 공지가 없습니다.'));
    })
    .catch(()=>recent.replaceChildren(el('li','','전체 공지에서 최신 소식을 확인해 주세요.')));
})();
