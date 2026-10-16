/* EKODI central category controls: external script for strict CSP. */
(function(){const categories={"활동이력":[{"href":"#committee-activity","label":"비대위 활동"},{"href":"#committee-activity/%EC%84%B1%EB%AA%85%C2%B7%EC%9E%85%EC%9E%A5%20%EB%B0%9C%ED%91%9C","label":"공식 성명·추진 경과"}],"관련소식":[{"href":"#timeline","label":"전체 소식"},{"href":"#timeline/%EC%8B%A0%EB%AC%B8","label":"신문·인터넷 언론"},{"href":"#timeline/%EB%B0%A9%EC%86%A1","label":"방송"}],"소통채널":[{"href":"#channels/facebook","label":"페이스북"},{"href":"#channels/instagram","label":"인스타그램"},{"href":"#channels/youtube","label":"유튜브"}]};const panel=document.getElementById('central-category-panel'),title=document.getElementById('central-category-title'),buttons=document.getElementById('central-category-buttons'),triggers=[...document.querySelectorAll('.ekodi-six-nav > a')].filter(t=>categories[t.textContent.trim()]).map(t=>{t.dataset.categoryMenu=t.textContent.trim();t.setAttribute('aria-controls','central-category-panel');t.setAttribute('aria-expanded','false');return t});
function categoryItems(name){
  // Mirror the live filter data instead of maintaining another, divergent filter list.
  if(name==='활동이력'||name==='관련소식'){
    const committee=name==='활동이력';
    const host=document.getElementById(committee?'committeeActivityFilters':'timelineFilters');
    const selector=committee?'button[data-committee-filter]':'button[data-cat]';
    const prefix=committee?'#committee-activity':'#timeline';
    const values=[...host?.querySelectorAll(selector)||[]]
      .map(button=>({value:String(committee?button.dataset.committeeFilter:button.dataset.cat||'').trim(),label:String(button.textContent||'').trim()}))
      .filter(item=>item.value&&item.label);
    if(values.length)return values.map(item=>({label:item.label,href:item.value==='전체'?prefix:prefix+'/'+encodeURIComponent(item.value)}));
  }
  return categories[name]||[];
}
function setTopic(name){
  document.body.dataset.seonammediCentralTopic=({활동이력:'committee',관련소식:'news',소통채널:'channels'})[name]||'';
}
function syncImageMode(){const subview=Boolean(document.querySelector('.hero')?.hidden);document.body.dataset.seonammediImageMode=!panel.hidden||subview?'inner':'home'}function close(){panel.hidden=true;setTopic('');triggers.forEach(t=>t.setAttribute('aria-expanded','false'));syncImageMode()}triggers.forEach(t=>t.addEventListener('click',function(e){e.preventDefault();const name=t.dataset.categoryMenu;if(!panel.hidden&&title.textContent===name){panel.scrollIntoView({block:"start",behavior:"smooth"});return}title.textContent=name;buttons.replaceChildren();categoryItems(name).forEach(item=>{const link=document.createElement('a');link.href=item.href;link.textContent=item.label;buttons.append(link)});setTopic(name);panel.hidden=false;triggers.forEach(x=>x.setAttribute('aria-expanded',String(x===t)));syncImageMode();if(name==='소통채널'){const first=buttons.querySelector('a[href="#channels/facebook"]');if(first){first.dispatchEvent(new MouseEvent('click',{bubbles:true,cancelable:true}));}}else{const social=document.getElementById('central-social-links');if(social)social.hidden=true}panel.scrollIntoView({block:'start',behavior:'smooth'})}));buttons.addEventListener('click',e=>{const link=e.target.closest('a');if(!link)return;buttons.querySelectorAll('a').forEach(a=>a.removeAttribute('aria-current'));link.setAttribute('aria-current','true');const href=link.getAttribute('href')||'';const social=document.getElementById('central-social-links'),socialLink=document.getElementById('central-social-link');if(title.textContent==='소통채널'&&social&&socialLink){social.hidden=false;const platform=href.split('/').pop();const urls={facebook:'https://www.facebook.com/groups/2299276407568855/posts/2317435212419641/',instagram:'https://www.instagram.com/wonokoh/',youtube:'https://www.youtube.com/@Mokpo-tv'};socialLink.href=urls[platform]||href;socialLink.textContent=link.textContent+' 원본 열기';socialLink.setAttribute('aria-label',link.textContent+' 채널 원본 열기');const embed=document.getElementById('central-social-embed'),fallback=document.getElementById('central-social-fallback');embed.replaceChildren();if(platform==='facebook'){embed.hidden=true;fallback.textContent='페이스북 게시물은 아래 원문 링크에서 확인할 수 있습니다.';}else if(platform==='instagram'){embed.hidden=true;fallback.textContent='인스타그램 프로필은 공식 임베드 대상이 아니므로 아래 원본 링크에서 사진과 게시물을 확인할 수 있습니다.';}else if(platform==='youtube'){embed.hidden=true;fallback.textContent='유튜브 채널 주소만으로는 영상 임베드를 생성할 수 없습니다. 아래 원본 링크에서 채널의 영상을 확인할 수 있습니다.';}else{embed.hidden=true;fallback.textContent='공개 게시물 주소가 등록되면 이곳에 내용을 표시합니다.';}}else if(social){social.hidden=true}if(!href.startsWith('#'))close()});document.querySelectorAll('.ekodi-six-nav > a:not([data-category-menu])').forEach(t=>t.addEventListener('click',close));window.addEventListener('hashchange',()=>{const topic=document.body.dataset.seonammediCentralTopic,hash=location.hash;if(topic==='committee'&&!hash.startsWith('#committee-activity')||topic==='news'&&!hash.startsWith('#timeline')||topic==='channels'&&!hash.startsWith('#channels'))close()});document.addEventListener('keydown',e=>{if(e.key==='Escape')close()})})();

/* Public direct links remain readable, but top-level Voices means write intent. */
(() => {
  const voiceLink=[...document.querySelectorAll('.ekodi-six-nav > a')]
    .find(a=>a.textContent.trim()==='시민의견');
  if(!voiceLink||!location.href)return;
  const target=new URL(voiceLink.href,location.href);
  if(target.origin!==location.origin||!/\/board\/voices\/?$/.test(target.pathname))return;
  target.searchParams.set('compose','1');
  voiceLink.href=target.href;
})();
