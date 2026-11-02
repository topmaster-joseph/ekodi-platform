(() => {
  const endpoint='/api/partner-news/public?tenant=ekodi-church&service=church&limit=6';
  const cacheKey='ekodi:church:partner-news:v1';
  const host=document.getElementById('partner-news-feed');
  const status=document.getElementById('partner-news-status');
  const section=document.getElementById('partner-news');
  if(!host||!section)return;

  const COPY={
    'ko-KR':{nav:'협력소식',title:'함께 걷는 이들의 소식',intro:'에코디교회와 함께 섬기고 배우며 협력하는 기관·단체의 소식 가운데 확인·승인된 내용만 나눕니다.',overview:'협력 소식',overviewSmall:'함께하는 기관·단체의 이야기',loading:'협력 소식 확인 중',empty:'공개된 협력 소식이 준비되면 이곳에 안내합니다.',error:'협력 소식을 지금 불러오지 못했습니다. 잠시 후 다시 확인해 주세요.',count:n=>`공개된 협력 소식 ${n}건`,source:'원문 보기'},
    en:{nav:'Partners',title:'News from those who walk with us',intro:'We share only reviewed and approved updates from organizations and communities serving and learning with EKODI Church.',overview:'Partner news',overviewSmall:'Stories from organizations walking with us',loading:'Checking partner news',empty:'Approved partner news will appear here.',error:'Partner news is temporarily unavailable. Please check again later.',count:n=>`${n} published partner updates`,source:'Source'},
    'zh-CN':{nav:'合作消息',title:'同行伙伴的消息',intro:'这里只分享与 EKODI Church 一同服事、学习和合作的机构与团体中已经审核并批准的消息。',overview:'合作消息',overviewSmall:'同行机构与团体的故事',loading:'正在查看合作消息',empty:'已批准的合作消息将在这里显示。',error:'暂时无法加载合作消息，请稍后再试。',count:n=>`已发布 ${n} 条合作消息`,source:'查看来源'},
    ja:{nav:'協力ニュース',title:'共に歩む仲間からのお知らせ',intro:'EKODI Church と共に仕え、学び、協力する団体から、確認・承認済みのお知らせだけを共有します。',overview:'協力ニュース',overviewSmall:'共に歩む団体のストーリー',loading:'協力ニュースを確認中',empty:'承認された協力ニュースをここに掲載します。',error:'協力ニュースを読み込めません。しばらくしてから再度ご確認ください。',count:n=>`公開済み ${n} 件`,source:'出典'},
    my:{nav:'မိတ်ဖက်သတင်း',title:'အတူလျှောက်လှမ်းသူများ၏ သတင်း',intro:'EKODI Church နှင့်အတူ အမှုဆောင်၊ သင်ယူ၊ ပူးပေါင်းနေသော အဖွဲ့အစည်းများ၏ စိစစ်အတည်ပြုပြီးသော သတင်းများကိုသာ မျှဝေပါသည်။',overview:'မိတ်ဖက်သတင်း',overviewSmall:'အတူလျှောက်လှမ်းသော အဖွဲ့အစည်းများ၏ အကြောင်း',loading:'မိတ်ဖက်သတင်း စစ်ဆေးနေသည်',empty:'အတည်ပြုပြီးသော မိတ်ဖက်သတင်းများကို ဤနေရာတွင် ဖော်ပြပါမည်။',error:'မိတ်ဖက်သတင်းကို ယခုမရနိုင်ပါ။ နောက်မှ ပြန်စစ်ပါ။',count:n=>`ထုတ်ပြန်ထားသော သတင်း ${n} ခု`,source:'မူရင်း'},
    kac:{nav:'Partner news',title:'News from partners walking with us',intro:'Only reviewed and approved updates from organizations serving, learning and collaborating with EKODI Church are shown here.',overview:'Partner news',overviewSmall:'Stories from partner organizations',loading:'Checking partner news',empty:'Approved partner news will appear here.',error:'Partner news is temporarily unavailable.',count:n=>`${n} published partner updates`,source:'Source'},
    vi:{nav:'Tin đối tác',title:'Tin từ những người đồng hành',intro:'Chúng tôi chỉ chia sẻ những tin đã được kiểm tra và phê duyệt từ các tổ chức, cộng đồng cùng phục vụ, học hỏi và hợp tác với EKODI Church.',overview:'Tin đối tác',overviewSmall:'Câu chuyện từ các tổ chức đồng hành',loading:'Đang kiểm tra tin đối tác',empty:'Tin đối tác đã được phê duyệt sẽ xuất hiện tại đây.',error:'Hiện chưa thể tải tin đối tác. Vui lòng thử lại sau.',count:n=>`${n} tin đối tác đã công khai`,source:'Nguồn'},
    mn:{nav:'Хамтын мэдээ',title:'Бидэнтэй хамт алхагсдын мэдээ',intro:'EKODI Church-тэй хамт үйлчилж, суралцаж, хамтран ажилладаг байгууллага, нийгэмлэгийн зөвхөн хянаж баталсан мэдээг хуваалцана.',overview:'Хамтын мэдээ',overviewSmall:'Хамтран ажиллагч байгууллагуудын түүх',loading:'Хамтын мэдээг шалгаж байна',empty:'Баталгаажсан хамтын мэдээ энд гарна.',error:'Хамтын мэдээг одоогоор ачаалж чадсангүй. Дараа дахин шалгана уу.',count:n=>`Нийтэлсэн ${n} мэдээ`,source:'Эх сурвалж'},
    id:{nav:'Kabar mitra',title:'Kabar dari mereka yang berjalan bersama kami',intro:'Kami hanya membagikan kabar yang telah ditinjau dan disetujui dari organisasi dan komunitas yang melayani, belajar, dan bekerja sama dengan EKODI Church.',overview:'Kabar mitra',overviewSmall:'Cerita dari organisasi yang berjalan bersama',loading:'Memeriksa kabar mitra',empty:'Kabar mitra yang telah disetujui akan tampil di sini.',error:'Kabar mitra belum dapat dimuat. Silakan coba lagi nanti.',count:n=>`${n} kabar mitra dipublikasikan`,source:'Sumber'},
  };
  const rawLocale=document.documentElement.lang||'ko-KR';
  const locale=COPY[rawLocale]?rawLocale:(rawLocale==='ko'?'ko-KR':'en');
  const copy=COPY[locale];

  const nav=document.querySelector('#main-nav a[href="#partner-news"]');
  if(nav)nav.textContent=copy.nav;
  const overview=document.querySelector('.overview-grid a[href="#partner-news"]');
  if(overview){const strong=overview.querySelector('strong'),small=overview.querySelector('small');if(strong)strong.textContent=copy.overview;if(small)small.textContent=copy.overviewSmall}
  const heading=section.querySelector('#partner-news-title');
  const intro=section.querySelector('.partner-news-head > div:last-child > p');
  if(heading)heading.textContent=copy.title;
  if(intro)intro.textContent=copy.intro;
  setStatus(copy.loading);

  if(locale!=='ko-KR'){
    host.innerHTML=`<p class="partner-news-empty">${copy.empty}</p>`;
    status.textContent=copy.empty;
    return;
  }

  const esc=value=>String(value??'').replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
  function sourceLink(item){
    if(!item.sourceUrl)return '';
    return `<a class="partner-news-source" href="${esc(item.sourceUrl)}" target="_blank" rel="noreferrer noopener">${copy.source} ↗</a>`;
  }
  function card(item){
    const date=esc(item.publishedOn||String(item.publishedAt||'').slice(0,10));
    const summary=esc(item.summary||item.body||'');
    const image=item.imageUrl?`<div class="partner-news-image"><img src="${esc(item.imageUrl)}" alt="" loading="lazy" referrerpolicy="no-referrer"></div>`:'';
    return `<article class="partner-news-card reveal">
      ${image}
      <div class="partner-news-card-body">
        <div class="partner-news-meta"><span>${esc(item.partnerName)}</span>${date?`<time datetime="${date}">${date}</time>`:''}</div>
        <h3>${esc(item.title)}</h3>
        ${summary?`<p>${summary}</p>`:''}
        ${sourceLink(item)}
      </div>
    </article>`;
  }
  function setStatus(message,visible=true){
    if(!status)return;
    status.textContent=message||'';
    status.hidden=!visible;
  }
  function readCache(){
    try{const cached=JSON.parse(localStorage.getItem(cacheKey)||'null');return Array.isArray(cached?.items)?cached.items:null}catch{return null}
  }
  function writeCache(items){
    try{localStorage.setItem(cacheKey,JSON.stringify({savedAt:Date.now(),items}))}catch{}
  }
  function render(items){
    const published=(Array.isArray(items)?items:[]).filter(item=>item&&item.status==='PUBLISHED');
    if(!published.length){
      host.innerHTML=`<p class="partner-news-empty">${copy.empty}</p>`;
      setStatus(copy.empty);
      return;
    }
    host.innerHTML=published.map(card).join('');
    setStatus(copy.count(published.length));
  }
  async function load(){
    try{
      const response=await fetch(endpoint,{headers:{accept:'application/json'},cache:'no-store',credentials:'omit'});
      if(!response.ok)throw new Error(`HTTP ${response.status}`);
      const data=await response.json();
      if(data?.contract?.publicState!=='PUBLISHED')throw new Error('publication contract mismatch');
      writeCache(data.items);
      render(data.items);
    }catch(error){
      console.warn('EKODI Church partner news unavailable',error);
      const cached=readCache();
      if(cached?.length){
        render(cached);
        setStatus('',false);
      }else{
        host.innerHTML=`<p class="partner-news-empty" role="status">${copy.error}</p>`;
        setStatus('',false);
      }
    }
  }
  load();
})();
