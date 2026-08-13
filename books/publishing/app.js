const API='https://api.ekodi.kr';
const menuButton=document.querySelector('.menu-button');
const nav=document.querySelector('#site-nav');
const packageGrid=document.querySelector('#packageGrid');
const serviceGrid=document.querySelector('#serviceGrid');
const form=document.querySelector('#consultationForm');
const formStatus=document.querySelector('#formStatus');

document.querySelector('#year').textContent=new Date().getFullYear();
menuButton?.addEventListener('click',()=>{const open=nav.classList.toggle('open');menuButton.setAttribute('aria-expanded',String(open));});
nav?.querySelectorAll('a').forEach(a=>a.addEventListener('click',()=>{nav.classList.remove('open');menuButton?.setAttribute('aria-expanded','false');}));

const fallbackServices=[
  {code:'digital-start',category:'package',name:'DIGITAL START',description:'전자책 한 권을 가장 작은 비용으로 출간하기 위한 기본 패키지입니다.',pricingModel:'fixed',unitLabel:'1권',priceKrw:290000,comparePriceKrw:340000,included:['EPUB 3 제작','기본 메타데이터','유통채널 1곳','출간 체크리스트'],note:'원고 교정·맞춤표지 제외'},
  {code:'distribute',category:'package',name:'DISTRIBUTE',description:'전자책 제작과 기본 표지, 주요 채널 등록을 한 번에 묶습니다.',pricingModel:'fixed',unitLabel:'1권',priceKrw:490000,comparePriceKrw:620000,included:['EPUB 3 제작','템플릿형 표지','서지 정리','유통채널 최대 3곳'],note:'개별 구매 대비 묶음 단가 절감'},
  {code:'publish-pro',category:'package',name:'PUBLISH PRO',description:'원고 진단부터 전자·인쇄 마스터와 유통까지 연결하는 출판대행 패키지입니다.',pricingModel:'from',unitLabel:'1권',priceKrw:890000,comparePriceKrw:1070000,included:['심층상담','원고 구조 점검','EPUB 3','인쇄용 PDF','맞춤표지','서지·식별자','유통채널 최대 3곳','런칭용 기본 이미지'],note:'전문 교정교열·번역·대량인쇄는 별도'},
  {code:'series-partner',category:'package',name:'SERIES / INSTITUTION',description:'연구소·교회·기관의 연속간행물과 시리즈를 반복 가능한 출판 체계로 구축합니다.',pricingModel:'quote',unitLabel:'프로젝트',priceKrw:0,comparePriceKrw:0,included:['시리즈 규격','반복 워크플로우','메타데이터 표준','다권 유통'],note:'범위 확인 후 견적'},
  {code:'consult-fit',category:'consultation',name:'출판 적합성 빠른상담',description:'원고 상태와 목표 채널을 확인하고 가장 작은 실행 단위를 제안합니다.',pricingModel:'fixed',unitLabel:'20분',priceKrw:0,comparePriceKrw:0,included:[],note:'온라인 1회'},
  {code:'consult-deep',category:'consultation',name:'심층 출판상담',description:'원고 구조·독자·판형·전자책·유통 전략을 함께 설계합니다.',pricingModel:'fixed',unitLabel:'60분',priceKrw:50000,comparePriceKrw:0,included:[],note:'14일 이내 대행 계약 시 상담료 전액 차감'},
  {code:'ebook-build',category:'production',name:'EPUB 3 제작',description:'일반 텍스트 중심 원고를 리플로어블 EPUB 3로 제작·검수합니다.',pricingModel:'from',unitLabel:'1권',priceKrw:150000,comparePriceKrw:0,included:[],note:'복잡한 표·수식·다국어 조판은 별도'},
  {code:'print-master',category:'production',name:'인쇄용 PDF 마스터',description:'POD·소량인쇄를 위한 내지와 출력용 PDF 마스터를 제작합니다.',pricingModel:'from',unitLabel:'1권',priceKrw:150000,comparePriceKrw:0,included:[],note:'고난도 편집·도판은 별도'},
  {code:'cover-template',category:'design',name:'표지 디자인 · 템플릿형',description:'정돈된 편집 체계를 활용해 빠르게 제작합니다.',pricingModel:'fixed',unitLabel:'1종',priceKrw:120000,comparePriceKrw:0,included:[],note:'원본 이미지 구매비 별도'},
  {code:'cover-custom',category:'design',name:'표지 디자인 · 맞춤형',description:'책의 논지와 독자층에 맞춰 독립적인 비주얼 콘셉트를 설계합니다.',pricingModel:'from',unitLabel:'1종',priceKrw:250000,comparePriceKrw:0,included:[],note:'촬영·일러스트 외주비 별도'},
  {code:'metadata-id',category:'distribution',name:'서지·식별자 등록대행',description:'ISBN·상품 메타데이터·기본 서지정보를 정리해 등록 업무를 지원합니다.',pricingModel:'fixed',unitLabel:'1권',priceKrw:50000,comparePriceKrw:0,included:[],note:'제3자 실비가 있으면 별도'},
  {code:'channel-setup',category:'distribution',name:'유통채널 등록대행',description:'준비된 파일과 메타데이터를 지정 플랫폼에 등록합니다.',pricingModel:'fixed',unitLabel:'채널 1곳',priceKrw:50000,comparePriceKrw:0,included:[],note:'플랫폼 계정·정산정보는 권리자가 보유'}
];

function money(service){
  if(service.pricingModel==='quote')return '별도견적';
  if(!Number(service.priceKrw||0))return '무료';
  const prefix=service.pricingModel==='from'?'부터 ':'';
  return `${prefix}${Number(service.priceKrw).toLocaleString('ko-KR')}원`;
}

function renderPackages(services){
  const packages=services.filter(item=>item.category==='package');
  packageGrid.textContent='';
  if(!packages.length){packageGrid.innerHTML='<p class="notice">현재 공개 중인 패키지가 없습니다.</p>';return;}
  packages.forEach((service,index)=>{
    const article=document.createElement('article');
    article.className=`price-card${service.code==='publish-pro'?' featured':''}`;
    const kicker=document.createElement('span');kicker.className='price-kicker';kicker.textContent=service.pricingModel==='quote'?'CUSTOM':'ONE-TIME PACKAGE';
    const title=document.createElement('h3');title.textContent=service.name;
    const desc=document.createElement('p');desc.textContent=service.description;
    const line=document.createElement('div');line.className='price-line';
    const strong=document.createElement('strong');strong.textContent=money(service);
    const small=document.createElement('small');small.textContent=service.unitLabel||'';
    line.append(strong,small);
    if(Number(service.comparePriceKrw||0)>Number(service.priceKrw||0)&&Number(service.priceKrw||0)>0){const compare=document.createElement('span');compare.className='price-compare';compare.textContent=`개별 기능 합계 ${Number(service.comparePriceKrw).toLocaleString('ko-KR')}원 기준`;line.append(compare);}
    const list=document.createElement('ul');(service.included||[]).forEach(item=>{const li=document.createElement('li');li.textContent=item;list.append(li);});
    const note=document.createElement('p');note.className='price-note';note.textContent=service.note||'';
    article.append(kicker,title,desc,line,list,note);packageGrid.append(article);
  });
}

function renderServices(services){
  const singles=services.filter(item=>item.category!=='package');
  serviceGrid.textContent='';
  singles.forEach(service=>{
    const article=document.createElement('article');article.className='service-price';
    const copy=document.createElement('div');
    const category=document.createElement('small');category.textContent=service.category.toUpperCase();
    const title=document.createElement('h3');title.textContent=service.name;
    const desc=document.createElement('p');desc.textContent=`${service.description}${service.note?` · ${service.note}`:''}`;
    copy.append(category,title,desc);
    const price=document.createElement('div');price.className='service-money';
    const strong=document.createElement('strong');strong.textContent=money(service);
    const unit=document.createElement('span');unit.textContent=service.unitLabel||'';
    price.append(strong,unit);article.append(copy,price);serviceGrid.append(article);
  });
}

async function loadPricing(){
  try{
    const response=await fetch(`${API}/api/books/public/config`,{cache:'no-store'});
    if(!response.ok)throw new Error(`HTTP ${response.status}`);
    const data=await response.json();
    const services=(data.services||[]).filter(item=>item.enabled!==false);
    renderPackages(services);renderServices(services);
    if(data.features?.pricing===false){document.querySelector('#pricing')?.setAttribute('hidden','');document.querySelector('.service-band')?.setAttribute('hidden','');}
    if(data.features?.consultation===false){document.querySelector('#consultation')?.setAttribute('hidden','');}
  }catch(error){console.warn('Publishing pricing API fallback',error);renderPackages(fallbackServices);renderServices(fallbackServices);}
}

form?.addEventListener('submit',async event=>{
  event.preventDefault();
  if(!form.checkValidity())return form.reportValidity();
  const button=form.querySelector('button[type="submit"]');
  const data=new FormData(form);
  const payload={};
  for(const key of ['name','email','phone','organization','inquiryType','manuscriptStage','lengthNote','budgetRange','desiredChannels','message'])payload[key]=String(data.get(key)||'').trim();
  button.disabled=true;formStatus.textContent='상담 신청을 접수하는 중입니다.';
  try{
    const response=await fetch(`${API}/api/books/inquiries`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(payload)});
    const result=await response.json().catch(()=>({}));
    if(!response.ok)throw new Error(result.error||'상담 신청을 접수하지 못했습니다.');
    form.reset();formStatus.textContent='접수되었습니다. 입력하신 이메일을 기준으로 상담 내용을 확인하겠습니다.';
  }catch(error){formStatus.textContent=error.message||'접수 중 오류가 발생했습니다. 잠시 후 다시 시도해 주세요.';}
  finally{button.disabled=false;}
});

loadPricing();