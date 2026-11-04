(() => {
  const path=location.pathname.toLowerCase();
  const org=path.startsWith('/ekodichurch')?'church':path.startsWith('/ekodimission')?'mission':'';
  if(!org)return;
  const main=document.querySelector('main');
  if(!main || document.getElementById('ekodi-sosik-site-feed'))return;
  const host=document.createElement('section');host.id='ekodi-sosik-site-feed';host.style.cssText='max-width:1100px;margin:24px auto;padding:18px;border:1px solid #d7e5e8;border-radius:14px;background:#fcfefe;color:#234452';
  const title=document.createElement('h2');title.textContent='최근 사역소식';title.style.cssText='font-size:1.35rem;margin:0 0 10px';
  const hint=document.createElement('p');hint.textContent='공개와 본인 동의가 승인된 소식만 표시됩니다.';hint.style.fontSize='.95rem';
  const list=document.createElement('div');list.style.cssText='display:grid;gap:12px;grid-template-columns:repeat(auto-fit,minmax(min(100%,260px),1fr))';
  const status=document.createElement('p');status.textContent='사역소식 확인 중입니다.';status.setAttribute('role','status');
  const link=document.createElement('a');link.href='/sosik/?org='+org;link.textContent='사역소식 더 보기';link.style.cssText='display:inline-block;margin-top:14px;color:#146a78;text-decoration:underline';
  host.append(title,hint,status,list,link);
  main.append(host);
  fetch('/api/sosik/feed?org='+org,{cache:'no-store'})
    .then(res=>res.ok?res.json():Promise.reject(new Error('소식 조회 오류')))
    .then(data=>{
      if(!Array.isArray(data.items))throw new Error('사역소식 데이터 오류');
      status.textContent=data.items.length?'승인된 공개 사역소식 '+data.items.length+'건':'공개 승인된 사역소식이 아직 없습니다.';
      for(const item of data.items.slice(0,6)){
        const card=document.createElement('article');card.style.cssText='padding:14px;border:1px solid #d7e5e8;border-radius:12px;background:#fff';
        if(item.photoKeys?.[0]){
          const img=document.createElement('img');img.src='/api/sosik/media?key='+encodeURIComponent(item.photoKeys[0]);img.loading='lazy';img.alt='공개 승인된 활동 사진';img.style.cssText='width:100%;height:140px;object-fit:cover;border-radius:9px';card.append(img);
        }
        const date=document.createElement('small');date.textContent=item.date+' · '+(item.organization==='joint'?'공동':org==='church'?'교회':'선교회');
        const h=document.createElement('h3');h.textContent=item.title;h.style.cssText='font-size:1.06rem;margin:6px 0';
        const p=document.createElement('p');p.textContent=(item.body||'').slice(0,250);p.style.cssText='line-height:1.7;word-break:keep-all;overflow-wrap:break-word';
        card.append(date,h,p);list.append(card);
      }
    }).catch(()=>{status.textContent='현재 사역소식을 불러올 수 없습니다. 통합 소식 페이지에서 확인할 수 있습니다.';});
})();