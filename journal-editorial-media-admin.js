// Private photographic review workspace. Never grants public rights or publication.
const API='/api/journal/editorial/media';
const make=(tag,text)=>{const n=document.createElement(tag);if(text!=null)n.textContent=text;return n};
const value=(form,name)=>String(form.elements.namedItem(name)?.value||'').trim();

async function reencodeWebp(file){
  if(!['image/jpeg','image/png','image/webp'].includes(file?.type)||file.size>8*1024*1024)
    throw new Error('JPEG, PNG, WebP만 사용하며 원본은 8MB 이하이어야 합니다.');
  const bitmap=await createImageBitmap(file);
  try{
    if(bitmap.width<1||bitmap.height<1||bitmap.width*bitmap.height>24_000_000)
      throw new Error('사진 해상도가 너무 큽니다.');
    const scale=Math.min(1,1600/Math.max(bitmap.width,bitmap.height));
    const canvas=document.createElement('canvas');
    canvas.width=Math.max(1,Math.round(bitmap.width*scale));
    canvas.height=Math.max(1,Math.round(bitmap.height*scale));
    const context=canvas.getContext('2d');
    if(!context)throw new Error('이미지를 안전하게 변환할 수 없습니다.');
    context.drawImage(bitmap,0,0,canvas.width,canvas.height);
    // Browser redraw strips original EXIF, GPS and other embedded metadata.
    const photo=await new Promise(resolve=>canvas.toBlob(resolve,'image/webp',.83));
    if(!photo||photo.type!=='image/webp'||photo.size>2*1024*1024)
      throw new Error('사진 변환 실패 또는 2MB를 초과했습니다.');
    const bytes=new Uint8Array(await photo.arrayBuffer());
    let binary='';
    for(let i=0;i<bytes.length;i+=8192)
      binary+=String.fromCharCode(...bytes.subarray(i,Math.min(bytes.length,i+8192)));
    return btoa(binary);
  }finally{bitmap.close?.()}
}
export function mountPrivateJournalMedia(host,{token,getSlug,hasSavedDraft}){
  if(!host||!token)return null;
  host.className='journal-private-media';
  host.innerHTML=
    '<h3>비공개 사진 보관함</h3>'+
    '<p>기존 에코디 공유 드라이브에 원본을 보관합니다. 저작권·초상권·개인정보 검토와 별도의 발행 승인 전에는 공개되지 않습니다.</p>'+
    '<form data-media-form class="journal-editorial-form" autocomplete="off">'+
      '<label class="full">사진 선택 (JPEG·PNG·WebP, 최대 8MB) <input name="photo" type="file" accept="image/jpeg,image/png,image/webp" required></label>'+
      '<label class="full">사진 대체텍스트 <input name="alt" required maxlength="200" placeholder="실제로 나타나는 내용을 설명"></label>'+
      '<label>촬영·저작권 표시 <input name="credit" required maxlength="150"></label>'+
      '<label>사진 설명 <input name="caption" maxlength="500"></label>'+
      '<label class="full journal-media-consent"><input name="rightsAttested" type="checkbox" required> 업로드 권한이 있는 사진이며, 인물·미성년자·개인정보가 포함된 경우 필요한 동의를 확인했습니다. (공개 승인은 아님)</label>'+
    '</form>'+
    '<div class="journal-editorial-actions"><button type="button" data-media-upload disabled>비공개 사진 업로드</button></div>'+
    '<p data-media-status role="status">먼저 서버에 비공개 원고 초안을 저장하세요.</p>'+
    '<div data-media-gallery class="journal-media-gallery" aria-label="비공개 사진 검토 목록"></div>';
  const style=make('style');
  style.textContent=
    '.journal-private-media{margin-top:28px;padding-top:16px;border-top:1px solid #d1d6d1}'+
    '.journal-media-consent{display:flex!important;flex-direction:row!important;align-items:flex-start;gap:10px}'+
    '.journal-media-consent input{width:auto!important;flex-shrink:0;margin-top:6px}'+
    '.journal-media-gallery{display:grid;grid-template-columns:repeat(auto-fill,minmax(190px,1fr));gap:14px}'+
    '.journal-private-photo{margin:0;min-width:0;border:1px solid #d1d6d1;border-radius:10px;padding:7px}'+
    '.journal-private-photo img{width:100%;height:150px;object-fit:cover;background:#eef1ee}'+
    '.journal-private-photo figcaption{font-size:12px;overflow-wrap:anywhere;line-height:1.6}';
  host.prepend(style);
  const form=host.querySelector('[data-media-form]');
  const status=host.querySelector('[data-media-status]');
  const button=host.querySelector('[data-media-upload]');
  const gallery=host.querySelector('[data-media-gallery]');
  const privateUrls=new Set();
  let generation=0,busy=false,uploadReady=false,listedSlug='';
  const revoke=()=>{for(const u of privateUrls)URL.revokeObjectURL(u);privateUrls.clear()};
  const request=(url,opts={})=>fetch(url,{
    ...opts,credentials:'same-origin',cache:'no-store',
    headers:{authorization:'Bearer '+token,...(opts.headers||{})}
  });
  const refresh=async()=>{
    const serial=++generation,slug=String(getSlug?.()||'').trim();
    listedSlug=slug;
    revoke();gallery.replaceChildren();
    uploadReady=false;button.disabled=true;
    if(!/^[a-z0-9][a-z0-9-]{2,79}$/.test(slug)||!hasSavedDraft?.(slug)){
      status.textContent='먼저 서버에 비공개 원고 초안을 저장하세요.';
      return;
    }
    status.textContent='비공개 사진 보관함을 확인하고 있습니다.';
    try{
      const response=await request(API+'?slug='+encodeURIComponent(slug));
      if(!response.ok)throw new Error('보관함 준비 실패');
      const data=await response.json();
      if(serial!==generation)return;
      uploadReady=data.uploadReady===true;
      button.disabled=!uploadReady;
      status.textContent=uploadReady?'저작권·초상권 검토 전 모든 사진은 비공개 상태입니다.':
        '원본 보관소가 준비되지 않아 업로드하지 않습니다.';
      const photos=Array.isArray(data.media)?data.media:[];
      if(!photos.length)gallery.append(make('p','비공개 사진이 없습니다.'));
      for(const photo of photos){
        if(serial!==generation)return;
        const fig=make('figure');
        fig.className='journal-private-photo';
        const image=make('img');image.alt=photo.alt||'비공개 검토 사진';image.loading='lazy';
        const caption=make('figcaption',(photo.alt||'')+' · '+(photo.credit||'')+' · 권리 검토 대기');
        fig.append(image,caption);gallery.append(fig);
        if(uploadReady&&typeof photo.previewPath==='string'&&photo.previewPath.startsWith(API+'/')){
          request(photo.previewPath).then(async response=>{
            if(!response.ok)throw new Error('read_denied');
            const blob=await response.blob();
            if(blob.type!=='image/webp'||blob.size>2*1024*1024)throw new Error('untrusted_image');
            if(serial!==generation)return;
            const objectUrl=URL.createObjectURL(blob);
            privateUrls.add(objectUrl);image.src=objectUrl;
          }).catch(()=>{if(serial===generation)image.alt='사진 읽기 권한 확인 필요'});
        }
      }
    }catch{if(serial===generation)status.textContent='사진 API 연결을 확인할 수 없습니다. 공개 저널에는 영향이 없습니다.'}
  };
  button.addEventListener('click',async()=>{
    const slug=String(getSlug?.()||'').trim();
    if(busy||!uploadReady||slug!==listedSlug||!hasSavedDraft?.(slug))return;
    const file=form.elements.namedItem('photo').files?.[0];
    const alt=value(form,'alt'),credit=value(form,'credit'),caption=value(form,'caption');
    if(!file||alt.length<5||alt.length>200||!credit||credit.length>150||
       !form.elements.namedItem('rightsAttested').checked){
      status.textContent='사진·대체텍스트·저작권 표시·동의 확인이 필요합니다.';
      return;
    }
    busy=true;button.disabled=true;
    try{
      status.textContent='이미지의 위치정보 등을 제거하고 안전한 WebP로 변환합니다.';
      const contentBase64=await reencodeWebp(file);
      status.textContent='에코디 비공개 저장소에 업로드 중입니다.';
      const response=await request(API,{
        method:'POST',headers:{'content-type':'application/json',accept:'application/json'},
        body:JSON.stringify({draftSlug:slug,alt,credit,caption,rightsAttested:true,contentBase64})
      });
      const data=await response.json().catch(()=>({}));
      if(!response.ok)throw new Error(data.error||'비공개 사진 저장 실패');
      if(data.media?.rightsStatus!=='pending')throw new Error('검토 상태가 일치하지 않습니다.');
      form.reset();
      await refresh();
      status.textContent='비공개 사진 저장 완료 · 외부 공개와 권리 승인은 수행하지 않았습니다.';
    }catch(error){status.textContent='사진 업로드 실패: '+error.message}
    finally{busy=false;button.disabled=!uploadReady}
  });
  return {refresh,dispose:revoke};
}
