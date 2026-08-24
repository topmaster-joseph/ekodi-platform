const API='https://api.ekodi.kr';
const parts=location.pathname.split('/').filter(Boolean);
const slug=parts[0]==='store'&&parts[1]?decodeURIComponent(parts[1]):new URLSearchParams(location.search).get('store');
const nameEl=document.querySelector('#storeName');
const descEl=document.querySelector('#storeDescription');
const logoEl=document.querySelector('#storeLogo');
const grid=document.querySelector('#bookGrid');
const statusEl=document.querySelector('#status');
function esc(value=''){return String(value).replace(/[&<>'"]/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[ch]));}
function money(value){return Number(value||0)?`${Number(value).toLocaleString('ko-KR')}원`:'가격 문의';}
async function load(){
  if(!slug){nameEl.textContent='서점 주소가 없습니다.';statusEl.textContent='에코디서점에서 서점을 선택해 주세요.';return;}
  try{
    const response=await fetch(`${API}/api/books/public/stores/${encodeURIComponent(slug)}`);
    const data=await response.json().catch(()=>({}));
    if(!response.ok)throw new Error(data.error||'서점을 불러오지 못했습니다.');
    document.title=`${data.store.name} · 에코디서점`;
    nameEl.textContent=data.store.name;descEl.textContent=data.store.description||'책과 생각이 머무는 작은 온라인 서점입니다.';
    if(data.store.logoUrl){const img=document.createElement('img');img.className='logo';img.alt='';img.src=data.store.logoUrl;logoEl.append(img);}
    grid.innerHTML=data.books.length?data.books.map(book=>`<article class="book"><div class="cover">${book.coverImage?`<img src="${esc(book.coverImage)}" alt="${esc(book.title)} 표지" loading="lazy">`:'BOOK'}</div><div class="copy"><h3>${esc(book.title)}</h3><div class="meta">${esc(book.author)}${book.subtitle?` · ${esc(book.subtitle)}`:''}</div><p class="desc">${esc(book.description||'')}</p><div class="buy"><strong>${money(book.priceKrw)}</strong>${book.buyUrl?`<a href="${esc(book.buyUrl)}" rel="noopener">구매하기</a>`:'<span>준비 중</span>'}</div></div></article>`).join(''):'<p>아직 공개된 책이 없습니다.</p>';
    statusEl.textContent='';
  }catch(error){nameEl.textContent='서점을 열 수 없습니다.';statusEl.textContent=error.message;}
}
load();
