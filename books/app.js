const API='https://api.ekodi.kr';
const grid=document.querySelector('#book-grid');
const template=document.querySelector('#book-template');
const menuButton=document.querySelector('.menu-button');
const nav=document.querySelector('#site-nav');

document.querySelector('#year').textContent=new Date().getFullYear();
menuButton?.addEventListener('click',()=>{const open=nav.classList.toggle('open');menuButton.setAttribute('aria-expanded',String(open));});
nav?.querySelectorAll('a').forEach(a=>a.addEventListener('click',()=>{nav.classList.remove('open');menuButton?.setAttribute('aria-expanded','false');}));

function installPublishingEntry(){
  if(nav&&!nav.querySelector('a[href="/publishing/"]')){
    const link=document.createElement('a');link.href='/publishing/';link.textContent='Publishing';
    const ekodi=nav.querySelector('a[href^="https://ekodi.kr"]');
    if(ekodi)nav.insertBefore(link,ekodi);else nav.append(link);
  }
  if(!document.querySelector('#publishing-service-callout')){
    const method=document.querySelector('#method');
    if(method){
      const section=document.createElement('section');section.id='publishing-service-callout';section.className='section shell';
      const head=document.createElement('div');head.className='section-head ruled';
      const titleWrap=document.createElement('div');
      const kicker=document.createElement('p');kicker.className='kicker';kicker.textContent='PUBLISHING SERVICE';
      const title=document.createElement('h2');title.textContent='출판상담과 출판대행';titleWrap.append(kicker,title);
      const copy=document.createElement('div');
      const p=document.createElement('p');p.textContent='상담만, EPUB만, 유통만 선택할 수 있습니다. 한 권 단위 요금과 기능별 가격을 공개하고 필요한 범위만 맡깁니다.';
      const link=document.createElement('a');link.href='/publishing/';link.className='text-link';link.textContent='출판상담 · 요금 보기 ↗';
      copy.append(p,link);head.append(titleWrap,copy);section.append(head);method.insertAdjacentElement('afterend',section);
    }
  }
}

function linkFor(label,url,status){if(!url){const span=document.createElement('span');span.textContent=status?`${label} · ${status}`:`${label} · 준비 중`;return span;}const a=document.createElement('a');a.href=url;a.textContent=`${label} ↗`;a.target='_blank';a.rel='noopener noreferrer';return a;}
function joinFormat(format){return Array.isArray(format)?format.join(' · '):(format||'');}
function seriesLabel(book){if(!book.series)return'EKODI ORIGINAL';return book.seriesNumber?`${book.series} · ${book.seriesNumber}`:book.series;}
function absoluteUrl(path){if(!path)return'https://books.ekodi.kr/';try{return new URL(path,'https://books.ekodi.kr/').href}catch{return'https://books.ekodi.kr/';}}
function distributionRow(label,detail,state){const row=document.createElement('div');row.className='distribution-row';const copy=document.createElement('div');const strong=document.createElement('strong');const small=document.createElement('small');strong.textContent=label;small.textContent=detail||'';copy.append(strong,small);const status=document.createElement('span');status.className='distribution-state';status.textContent=state||'준비 중';row.append(copy,status);return row;}

function injectStructuredData(data,books){const graph=[{'@type':'Organization','@id':'https://books.ekodi.kr/#publisher',name:data.publisher||'EKODI BOOKS',url:'https://books.ekodi.kr/'},{'@type':'WebSite','@id':'https://books.ekodi.kr/#website',name:'EKODI BOOKS',url:'https://books.ekodi.kr/',publisher:{'@id':'https://books.ekodi.kr/#publisher'},inLanguage:'ko-KR'}];books.forEach(book=>{graph.push({'@type':'Book',name:book.title,alternateName:book.editions?.amazonEnglish?.title||undefined,description:book.abstract||book.subtitle||undefined,author:{'@type':'Person',name:book.author},publisher:{'@id':'https://books.ekodi.kr/#publisher'},bookFormat:'https://schema.org/EBook',inLanguage:Array.isArray(book.language)?book.language:[book.language||'ko'],identifier:book.identifiers?.googleBooks||book.identifiers?.isbnEbook||undefined,image:book.coverImage?absoluteUrl(book.coverImage):undefined,isPartOf:book.series?{'@type':'BookSeries',name:book.series,position:book.seriesNumber||undefined}:undefined,url:absoluteUrl(book.detailUrl||'/#catalog')});});const script=document.createElement('script');script.type='application/ld+json';script.textContent=JSON.stringify({'@context':'https://schema.org','@graph':graph});document.head.append(script);}

async function fetchCatalog(){
  try{
    const response=await fetch(`${API}/api/books/public/publications`,{cache:'no-store'});
    if(!response.ok)throw new Error(`API ${response.status}`);
    const data=await response.json();
    if(Array.isArray(data.books)&&data.books.length)return data;
  }catch(error){console.warn('Books API catalog fallback',error);}
  const response=await fetch('/books.json',{cache:'no-store'});
  if(!response.ok)throw new Error(`HTTP ${response.status}`);
  return response.json();
}

function renderBook(book){
  const node=template.content.cloneNode(true);const series=seriesLabel(book);const cover=node.querySelector('.publication-cover');
  cover.href=book.detailUrl||'/#catalog';cover.setAttribute('aria-label',`${book.title} 상세 보기`);
  node.querySelector('.book-series').textContent=series;node.querySelector('.book-cover-title').textContent=book.coverTitle||book.title;
  node.querySelector('.book-cover-type').textContent=book.publicationType||'MONOGRAPH';node.querySelector('.book-catalog').textContent=book.catalogNo||book.id;
  node.querySelector('.book-status').textContent=book.status||'Forthcoming';node.querySelector('.book-type').textContent=book.publicationType||'MONOGRAPH';
  node.querySelector('.book-title').textContent=book.title;node.querySelector('.book-subtitle').textContent=book.subtitle||'';node.querySelector('.book-abstract').textContent=book.abstract||book.subtitle||'';
  node.querySelector('.book-author').textContent=book.author||'';node.querySelector('.book-discipline').textContent=book.discipline||book.editorialField||'';
  node.querySelector('.book-language').textContent=book.languageLabel||book.language||'';node.querySelector('.book-format').textContent=joinFormat(book.format);
  node.querySelector('.book-edition').textContent=book.edition||'';node.querySelector('.book-series-record').textContent=series;
  const identifier=book.identifiers?.googleBooks||book.identifiers?.isbnEbook||book.identifiers?.amazonAsin||'';const citationBase=book.citation||`${book.author}. 『${book.title}』. EKODI BOOKS.`;
  node.querySelector('.book-citation').textContent=identifier?`${citationBase} · Identifier: ${identifier}`:citationBase;
  const detailLink=node.querySelector('.detail-link');detailLink.href=book.detailUrl||'/#catalog';detailLink.classList.add('text-link');
  const editions=book.editions||{};const dist=node.querySelector('.distribution-list');
  dist.append(distributionRow('Google Play Books',identifier||editions.googleKoreanBilingual?.price||'',book.distribution?.google),distributionRow('Amazon KDP',['English Edition',editions.amazonEnglish?.price].filter(Boolean).join(' · '),book.distribution?.amazon),distributionRow('국내 통합유통',editions.domesticAggregator?.provider?`${editions.domesticAggregator.provider} · 주요 서점 통합유통`:'',book.distribution?.korea));
  const links=node.querySelector('.book-links');links.append(linkFor('Google Play',book.links?.google,book.distribution?.google),linkFor('Amazon',book.links?.amazon,book.distribution?.amazon),linkFor('국내 서점',book.links?.korea,book.distribution?.korea));
  if(book.coverImage){const img=document.createElement('img');img.src=book.coverImage;img.alt=`${book.title} 표지`;img.loading='lazy';img.decoding='async';cover.classList.add('has-cover');cover.replaceChildren(img);}
  grid.append(node);
}

async function loadBooks(){
  installPublishingEntry();
  try{
    const data=await fetchCatalog();const books=Array.isArray(data.books)?data.books:[];
    if(!books.length){grid.innerHTML='<p class="notice">첫 출간 도서를 준비하고 있습니다.</p>';return;}
    grid.textContent='';injectStructuredData(data,books);books.forEach(renderBook);
  }catch(error){console.error(error);grid.innerHTML='<p class="notice">도서 목록을 불러오지 못했습니다. 잠시 후 다시 확인해 주세요.</p>';}
}

loadBooks();