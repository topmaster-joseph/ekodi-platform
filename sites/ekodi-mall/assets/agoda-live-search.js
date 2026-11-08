// Agoda Affiliate Lite public UI. No credentials, session IDs or direct provider calls.
(() => {
 const root=document.querySelector('#agodaLiveSearch');if(!root)return;
 const $=s=>root.querySelector(s),api='/ekodimall/api/api/public/agoda';
 const form=$('#agodaLiveForm'),region=$('#agodaCity'),checkIn=$('#agodaCheckIn'),checkOut=$('#agodaCheckOut'),adults=$('#agodaAdults'),status=$('#agodaLiveStatus'),grid=$('#agodaLiveGrid');
 const buttons=[...document.querySelectorAll('[data-agoda-view]')],livePanel=$('#agodaLivePanel'),verified=document.querySelector('#agodaVerifiedPanel');
 const node=(tag,cl,val)=>{const n=document.createElement(tag);if(cl)n.className=cl;if(val!==undefined)n.textContent=String(val);return n};
 const iso=day=>{const d=new Date();d.setHours(12,0,0,0);d.setDate(d.getDate()+day);return [d.getFullYear(),String(d.getMonth()+1).padStart(2,'0'),String(d.getDate()).padStart(2,'0')].join('-')};
 checkIn.value=iso(1);checkOut.value=iso(2);checkIn.min=iso(0);checkOut.min=iso(1);
 function tabs(which){
  buttons.forEach(b=>{const active=b.dataset.agodaView===which;b.setAttribute('aria-selected',String(active));b.tabIndex=active?0:-1});
  livePanel.hidden=which!=='live';if(verified)verified.hidden=which!=='verified';
 }
 buttons.forEach(b=>b.addEventListener('click',()=>tabs(b.dataset.agodaView)));tabs('live');
 const request=async url=>{const r=await fetch(url,{method:'GET',headers:{accept:'application/json'},credentials:'omit'});const j=await r.json().catch(()=>({}));if(!r.ok)throw Error('SOURCE_NOT_READY');return j};
 const allowImage=v=>{try{const u=new URL(String(v));return u.protocol==='https:'&&(u.hostname==='agoda.net'||u.hostname.endsWith('.agoda.net'))?u.href:''}catch{return''}};
 const allowBooking=v=>{try{const u=new URL(String(v));return u.protocol==='https:'&&u.hostname==='www.agoda.com'&&u.pathname==='/partners/partnersearch.aspx'&&u.searchParams.getAll('cid').length===1&&u.searchParams.get('cid')==='1980072'&&u.searchParams.getAll('tag').length===1&&u.searchParams.get('tag')==='ekodi_mall_stay'?u.href:''}catch{return''}};
 function render(data){
  grid.replaceChildren();
  const list=Array.isArray(data?.hotels)?data.hotels.slice(0,30):[];
  for(const hotel of list){
   const url=allowBooking(hotel.landingUrl);if(!url||!hotel.hotelId||!hotel.name)continue;
   const card=node('article','agoda-live-card'),visual=node('div','agoda-live-image'),image=allowImage(hotel.imageUrl);
   if(image){const img=document.createElement('img');img.src=image;img.loading='lazy';img.decoding='async';img.alt=String(hotel.name);visual.append(img)}
   else visual.append(node('span','','사진 준비 중'));
   const content=node('div','agoda-live-copy');content.append(node('small','','Agoda · 공식 API 조회'),node('h3','',hotel.name));
   const meta=[];
   if(typeof hotel.starRating==='number')meta.push(String(hotel.starRating)+'성급');
   if(typeof hotel.reviewScore==='number')meta.push('이용자 평점 '+String(hotel.reviewScore));
   if(meta.length)content.append(node('p','agoda-live-meta',meta.join(' · ')));
   const price=typeof hotel.nightlyRateKrw==='number'&&hotel.nightlyRateKrw>0?'조회된 1박 요금 약 '+hotel.nightlyRateKrw.toLocaleString('ko-KR')+'원':'가격은 아고다에서 확인';
   content.append(node('p','agoda-live-price',price));
   const link=node('a','btn primary','아고다에서 예약 확인');link.href=url;link.target='_blank';link.rel='noopener noreferrer sponsored';
   content.append(link);card.append(visual,content);grid.append(card);
  }
  status.textContent=grid.children.length?String(grid.children.length)+'개 숙소 · '+data.checkInDate+'~'+data.checkOutDate+' · 최종 가격과 예약 가능 여부는 아고다에서 확인하세요.':'해당 조건에 확인된 숙소가 없습니다. 다른 일정으로 검색해 주세요.';
 }
 async function search(){
  if(!region.value){status.textContent='조회 가능한 지역 정보가 아직 없습니다.';return}
  grid.replaceChildren();status.textContent='공식 아고다 숙소정보를 확인하고 있습니다.';
  const qs=new URLSearchParams({cityId:region.value,checkInDate:checkIn.value,checkOutDate:checkOut.value,adults:adults.value});
  try{render(await request(api+'/search?'+qs.toString()))}
  catch{status.textContent='아고다 실시간 숙소 데이터를 불러오지 못했습니다. 위쪽 공식 검색 링크로 이동해 확인할 수 있습니다.'}
 }
 form.addEventListener('submit',e=>{e.preventDefault();void search()});
 request(api+'/status').then(d=>{
  region.replaceChildren();
  if(!d.available||!Array.isArray(d.cities)||!d.cities.length){status.textContent='공식 숙소 데이터 자동연동 승인 및 설정을 기다리고 있습니다. 그동안 위쪽 아고다 제휴 검색을 이용할 수 있습니다.';return}
  for(const city of d.cities){const o=node('option','',city.name);o.value=String(city.id);region.append(o)}
  for(const field of form.elements)field.disabled=false;
  void search();
 }).catch(()=>{status.textContent='숙소 데이터 서버가 아직 준비되지 않았습니다. 위쪽 아고다 공식 검색을 이용해 주세요.'});
})();
