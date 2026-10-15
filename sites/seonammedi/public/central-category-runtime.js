/* EKODI central category controls: external script for strict CSP. */
(function(){const categories={"활동이력":[{"href":"#committee-activity","label":"비대위 활동"},{"href":"#committee-activity/%EC%84%B1%EB%AA%85%C2%B7%EC%9E%85%EC%9E%A5%20%EB%B0%9C%ED%91%9C","label":"공식 성명·추진 경과"}],"관련소식":[{"href":"#timeline","label":"전체 소식"},{"href":"#timeline/%EC%8B%A0%EB%AC%B8","label":"신문·인터넷 언론"},{"href":"#timeline/%EB%B0%A9%EC%86%A1","label":"방송"}],"소통채널":[{"href":"#channels/facebook","label":"페이스북"},{"href":"#channels/instagram","label":"인스타그램"},{"href":"#channels/youtube","label":"유튜브"}],"공지":[{"href":"board/notices","label":"공지사항"},{"href":"minutes/","label":"회의록"},{"href":"board/finance","label":"회계"}]};const panel=document.getElementById('central-category-panel'),title=document.getElementById('central-category-title'),buttons=document.getElementById('central-category-buttons'),triggers=[...document.querySelectorAll('.ekodi-six-nav > a')].filter(t=>categories[t.textContent.trim()]).map(t=>{t.dataset.categoryMenu=t.textContent.trim();t.setAttribute('aria-controls','central-category-panel');t.setAttribute('aria-expanded','false');return t});
const noticePreview=document.getElementById('central-category-preview');
async function renderNoticePreview(){
  if(!noticePreview)return;
  noticePreview.hidden=false;
  noticePreview.replaceChildren();
  const head=document.createElement('div');
  head.className='central-category-preview-head';
  const heading=document.createElement('h3');
  heading.textContent='최근 공지사항';
  const all=document.createElement('a');
  all.href='board/notices';
  all.textContent='전체 공지 보기';
  head.append(heading,all);
  noticePreview.append(head);
  const message=document.createElement('p');
  message.className='central-category-preview-message';
  message.textContent='공지사항을 불러오는 중입니다.';
  noticePreview.append(message);
  try{
    // Public notices live in the independent board; the legacy notices API is empty.
    const response=await fetch('/board/api/notices',{cache:'no-store'});
    if(!response.ok)throw new Error('notice_list_unavailable');
    const data=await response.json();
    if(data.ok!==true||!Array.isArray(data.items))throw new Error('notice_list_invalid');
    if(noticePreview.hidden||title.textContent!=='공지')return;
    const entries=data.items.filter(item=>item&&item.status==='published'&&item.id!=null&&String(item.title||'').trim())
      .sort((a,b)=>String(b.createdAt||b.updatedAt||'').localeCompare(String(a.createdAt||a.updatedAt||''))).slice(0,6);
    if(!entries.length){message.textContent='현재 공개된 공지사항이 없습니다.';return}
    const list=document.createElement('div');
    list.className='central-category-preview-list';
    for(const item of entries){
      const row=document.createElement('a');
      row.className='central-category-preview-row';
      row.href='board/notices?id='+encodeURIComponent(String(item.id));
      const name=document.createElement('span');
      name.textContent=String(item.title);
      const date=document.createElement('time');
      const created=new Date(item.createdAt||item.updatedAt||'');
      if(Number.isFinite(created.getTime())){
        date.dateTime=created.toISOString();
        date.textContent=created.toLocaleDateString('ko-KR',{timeZone:'Asia/Seoul'});
      }
      row.append(name,date);
      list.append(row);
    }
    message.replaceWith(list);
  }catch(error){
    if(!noticePreview.hidden&&title.textContent==='공지')message.textContent='공지 목록을 불러올 수 없습니다. 전체 공지 보기에서 확인해 주세요.';
  }
}
function syncImageMode(){const subview=Boolean(document.querySelector('.hero')?.hidden);document.body.dataset.seonammediImageMode=!panel.hidden||subview?'inner':'home'}function close(){panel.hidden=true;if(noticePreview)noticePreview.hidden=true;triggers.forEach(t=>t.setAttribute('aria-expanded','false'));syncImageMode()}triggers.forEach(t=>t.addEventListener('click',function(e){e.preventDefault();const name=t.dataset.categoryMenu;if(!panel.hidden&&title.textContent===name){panel.scrollIntoView({block:"start",behavior:"smooth"});return}title.textContent=name;buttons.replaceChildren();(categories[name]||[]).forEach(item=>{const link=document.createElement('a');link.href=item.href;link.textContent=item.label;buttons.append(link)});panel.hidden=false;triggers.forEach(x=>x.setAttribute('aria-expanded',String(x===t)));syncImageMode();if(noticePreview){noticePreview.hidden=name!=='공지';if(name==='공지')renderNoticePreview()}if(name==='소통채널'){const first=buttons.querySelector('a[href="#channels/facebook"]');if(first){first.dispatchEvent(new MouseEvent('click',{bubbles:true,cancelable:true}));}}else{const social=document.getElementById('central-social-links');if(social)social.hidden=true}panel.scrollIntoView({block:'start',behavior:'smooth'})}));buttons.addEventListener('click',e=>{const link=e.target.closest('a');if(!link)return;buttons.querySelectorAll('a').forEach(a=>a.removeAttribute('aria-current'));link.setAttribute('aria-current','true');const href=link.getAttribute('href')||'';const social=document.getElementById('central-social-links'),socialLink=document.getElementById('central-social-link');if(title.textContent==='소통채널'&&social&&socialLink){social.hidden=false;const platform=href.split('/').pop();const urls={facebook:'https://www.facebook.com/groups/2299276407568855/posts/2317435212419641/',instagram:'https://www.instagram.com/wonokoh/',youtube:'https://www.youtube.com/@Mokpo-tv'};socialLink.href=urls[platform]||href;socialLink.textContent=link.textContent+' 원본 열기';socialLink.setAttribute('aria-label',link.textContent+' 채널 원본 열기');const embed=document.getElementById('central-social-embed'),fallback=document.getElementById('central-social-fallback');embed.replaceChildren();if(platform==='facebook'){const frame=document.createElement('iframe');frame.title='페이스북 공개 게시물';frame.loading='lazy';frame.referrerPolicy='strict-origin-when-cross-origin';frame.setAttribute('allow','encrypted-media');frame.src='https://www.facebook.com/plugins/post.php?href='+encodeURIComponent(urls.facebook)+'&show_text=true&width=500';embed.append(frame);embed.hidden=false;fallback.textContent='게시물 공개 범위 또는 페이스북 정책에 따라 미리보기가 표시되지 않을 수 있습니다.';}else if(platform==='instagram'){embed.hidden=true;fallback.textContent='인스타그램 프로필은 공식 임베드 대상이 아니므로 아래 원본 링크에서 사진과 게시물을 확인할 수 있습니다.';}else if(platform==='youtube'){embed.hidden=true;fallback.textContent='유튜브 채널 주소만으로는 영상 임베드를 생성할 수 없습니다. 아래 원본 링크에서 채널의 영상을 확인할 수 있습니다.';}else{embed.hidden=true;fallback.textContent='공개 게시물 주소가 등록되면 이곳에 내용을 표시합니다.';}}else if(social){social.hidden=true}if(!href.startsWith('#'))close()});document.querySelectorAll('.ekodi-six-nav > a:not([data-category-menu])').forEach(t=>t.addEventListener('click',close));document.addEventListener('keydown',e=>{if(e.key==='Escape')close()})})();
