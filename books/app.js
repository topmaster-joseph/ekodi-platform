const grid=document.querySelector('#book-grid');
const template=document.querySelector('#book-template');
const menuButton=document.querySelector('.menu-button');
const nav=document.querySelector('#site-nav');

document.querySelector('#year').textContent=new Date().getFullYear();

menuButton?.addEventListener('click',()=>{
  const open=nav.classList.toggle('open');
  menuButton.setAttribute('aria-expanded',String(open));
});

nav?.querySelectorAll('a').forEach(a=>a.addEventListener('click',()=>{
  nav.classList.remove('open');
  menuButton?.setAttribute('aria-expanded','false');
}));

function linkFor(label,url){
  if(!url)return Object.assign(document.createElement('span'),{textContent:`${label} · 준비 중`});
  const a=document.createElement('a');
  a.href=url;
  a.textContent=`${label} ↗`;
  a.target='_blank';
  a.rel='noopener noreferrer';
  return a;
}

function joinFormat(format){
  return Array.isArray(format)?format.join(' · '):(format||'');
}

async function loadBooks(){
  try{
    const res=await fetch('/books.json',{cache:'no-store'});
    if(!res.ok)throw new Error(`HTTP ${res.status}`);
    const data=await res.json();
    const books=Array.isArray(data.books)?data.books:[];
    if(!books.length){
      grid.innerHTML='<p class="notice">첫 출간 도서를 준비하고 있습니다.</p>';
      return;
    }

    for(const book of books){
      const node=template.content.cloneNode(true);
      node.querySelector('.book-series').textContent=book.series||'EKODI ORIGINAL';
      node.querySelector('.book-cover-title').textContent=book.coverTitle||book.title;
      node.querySelector('.book-cover-type').textContent=book.publicationType||'MONOGRAPH';
      node.querySelector('.book-catalog').textContent=book.catalogNo||book.id;
      node.querySelector('.book-status').textContent=book.status||'Forthcoming';
      node.querySelector('.book-type').textContent=book.publicationType||'MONOGRAPH';
      node.querySelector('.book-title').textContent=book.title;
      node.querySelector('.book-subtitle').textContent=book.subtitle||'';
      node.querySelector('.book-abstract').textContent=book.abstract||book.subtitle||'';
      node.querySelector('.book-author').textContent=book.author||'';
      node.querySelector('.book-discipline').textContent=book.discipline||'';
      node.querySelector('.book-language').textContent=book.languageLabel||book.language||'';
      node.querySelector('.book-format').textContent=joinFormat(book.format);
      node.querySelector('.book-edition').textContent=book.edition||'';
      node.querySelector('.book-series-record').textContent=book.series||'';
      node.querySelector('.book-citation').textContent=book.citation||`${book.author}. 『${book.title}』. EKODI BOOKS.`;
      const links=node.querySelector('.book-links');
      links.append(
        linkFor('Google Play Books',book.links?.google),
        linkFor('Amazon',book.links?.amazon),
        linkFor('국내 서점',book.links?.korea)
      );
      grid.append(node);
    }
  }catch(error){
    console.error(error);
    grid.innerHTML='<p class="notice">도서 목록을 불러오지 못했습니다. 잠시 후 다시 확인해 주세요.</p>';
  }
}

loadBooks();
