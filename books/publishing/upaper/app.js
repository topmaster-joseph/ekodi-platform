const $ = (s) => document.querySelector(s);
const modeButtons = [...document.querySelectorAll('[data-mode]')];
const desktopPanel = $('#desktopPanel');
const mobilePanel = $('#mobilePanel');
const modeBadge = $('#modeBadge');
const bookSelect = $('#bookSelect');
const summary = $('#summary');
const fieldCards = $('#fieldCards');
let catalog = [];
let currentBook = null;
let forcedMode = 'auto';

function detectedMode(){
  const coarse = matchMedia('(pointer: coarse)').matches;
  const narrow = matchMedia('(max-width: 760px)').matches;
  const ua = navigator.userAgent || '';
  return /Android|iPhone|iPad|Mobile/i.test(ua) || (coarse && narrow) ? 'mobile' : 'desktop';
}
function effectiveMode(){ return forcedMode === 'auto' ? detectedMode() : forcedMode; }
function applyMode(){
  const mode = effectiveMode();
  desktopPanel.hidden = mode !== 'desktop';
  mobilePanel.hidden = mode !== 'mobile';
  modeBadge.textContent = mode === 'mobile' ? '모바일 빠른입력' : '웹/PC 자동입력';
  modeButtons.forEach(b => b.classList.toggle('active', b.dataset.mode === forcedMode));
}
modeButtons.forEach(b => b.addEventListener('click', () => { forcedMode = b.dataset.mode; applyMode(); }));

function normalizedBook(book){
  const priceText = book?.editions?.googleKoreanBilingual?.price || '';
  const price = String(priceText).replace(/[^0-9]/g,'') || '8900';
  return {
    title: book.title || '', subtitle: book.subtitle || '', author: book.author || '',
    publisher: '에코디서점', description: book.abstract || '', price,
    keywords: ['에코디언','에클레시아','코이노니아','디아스포라','희년'].join(', '),
    isbn: book?.identifiers?.isbnEbook || '', edition: book.edition || '',
    cover: book.coverImage || '', detailUrl: book.detailUrl || ''
  };
}
function packageText(meta){
  return [
    ['제목',meta.title],['부제',meta.subtitle],['저자',meta.author],['출판사',meta.publisher],
    ['가격',meta.price ? `${meta.price}원` : ''],['ISBN',meta.isbn || '미발급/확인 필요'],
    ['키워드',meta.keywords],['책소개',meta.description]
  ].map(([k,v])=>`${k}: ${v}`).join('\n\n');
}
async function copyText(text, button){
  try{ await navigator.clipboard.writeText(text); button.textContent='복사됨'; setTimeout(()=>button.textContent='복사',1200); }
  catch{ window.prompt('복사하세요', text); }
}
function render(){
  if(!currentBook) return;
  const meta = normalizedBook(currentBook);
  summary.innerHTML = [
    ['제목',meta.title],['저자',meta.author],['출판사',meta.publisher],['가격',`${meta.price}원`],['상태',currentBook?.editions?.domesticAggregator?.status || '준비 중']
  ].map(([k,v])=>`<div class="row"><span class="key">${escapeHtml(k)}</span><strong>${escapeHtml(v)}</strong></div>`).join('');
  const fields = [
    ['제목',meta.title],['부제',meta.subtitle],['저자',meta.author],['출판사',meta.publisher],['가격',meta.price],['키워드',meta.keywords],['책소개',meta.description]
  ];
  fieldCards.innerHTML = fields.map(([label,value],i)=>`<div class="field-card"><div><div class="label">${escapeHtml(label)}</div><div class="value">${escapeHtml(value)}</div></div><button type="button" data-copy="${i}">복사</button></div>`).join('');
  fieldCards.querySelectorAll('[data-copy]').forEach((btn)=>btn.addEventListener('click',()=>copyText(fields[Number(btn.dataset.copy)][1],btn)));
}
function escapeHtml(v){ return String(v ?? '').replace(/[&<>"']/g, c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }

$('#copyDesktopPackage').addEventListener('click', async (e)=>{
  if(currentBook) await copyText(packageText(normalizedBook(currentBook)), e.currentTarget);
});
$('#sharePackage').addEventListener('click', async ()=>{
  if(!currentBook) return;
  const text = packageText(normalizedBook(currentBook));
  if(navigator.share){
    try{ await navigator.share({title:`UPaper 등록 · ${currentBook.title}`,text}); return; }catch{}
  }
  await navigator.clipboard.writeText(text).catch(()=>{});
  alert('전체 등록정보를 클립보드에 복사했습니다.');
});

async function load(){
  applyMode();
  try{
    const res = await fetch('/books.json',{cache:'no-store'});
    if(!res.ok) throw new Error('catalog');
    const data = await res.json();
    catalog = data.books || [];
    bookSelect.innerHTML = catalog.map((b,i)=>`<option value="${i}">${escapeHtml(b.title)}</option>`).join('');
    currentBook = catalog[0] || null;
    bookSelect.addEventListener('change',()=>{ currentBook=catalog[Number(bookSelect.value)] || catalog[0]; render(); });
    render();
  }catch{
    summary.innerHTML='<p>도서 데이터를 불러오지 못했습니다. 에코디서점 출판 스튜디오에서 도서 정보를 먼저 확인해 주세요.</p>';
  }
}
matchMedia('(max-width: 760px)').addEventListener?.('change',()=>{ if(forcedMode==='auto') applyMode(); });
load();
