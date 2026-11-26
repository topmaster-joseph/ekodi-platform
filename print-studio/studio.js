/* EKODI Print Studio — offline-in-browser proofing only. No hidden order API, storage, or payment. */
'use strict';
(function () {
  const $ = (id) => document.getElementById(id);
  const items = Object.freeze({
    cards:{name:'명함',formats:[]},
    banners:{name:'현수막',formats:[['3000×900 mm',3000,900],['4000×900 mm',4000,900],['600×1800 mm',600,1800]]},
    flyers:{name:'전단지',formats:[['A4 210×297 mm',210,297],['A5 148×210 mm',148,210],['3단 100×210 mm (1면)',100,210]]},
    posters:{name:'포스터',formats:[['A3 297×420 mm',297,420],['A2 420×594 mm',420,594]]},
    stickers:{name:'스티커',formats:[['가로 60×40 mm',60,40],['정사각 50×50 mm',50,50],['원형 50×50 mm (사각 미리보기)',50,50]]},
    booklets:{name:'리플릿·책자',formats:[['A5 148×210 mm (표지 1면)',148,210],['A4 210×297 mm (표지 1면)',210,297]]}
  });
  const samples = {
    banners:['함께하는 우리 동네','지역과 사람이 이어지는 하루','일시 · 장소 · 문의 내용을 입력하세요'],
    flyers:['새로운 소식을 전합니다','알아두면 좋은 행사와 혜택','일시 · 내용 · 참여 방법을 적어 주세요'],
    posters:['함께하는 시간','누구나 참여할 수 있습니다','행사명 · 날짜 · 장소 · 참여 안내'],
    stickers:['고맙습니다','작은 마음을 담았습니다','상품 또는 단체 소개'],
    booklets:['우리의 이야기','작은 실천이 만드는 변화','책자 표지에 들어갈 문구를 입력하세요']
  };
  const part = location.pathname.replace(/\/+$/,'').split('/')[2] || 'banners';
  const category = items[part] ? part : 'banners';
  const product = items[category];
  document.querySelectorAll('[data-product]').forEach((a) => {
    if (a.dataset.product === category) a.setAttribute('aria-current','page');
  });
  if (category === 'cards') {
    $('cardHandoff').hidden = false;
    $('editor').hidden = true;
    document.title = '명함 · 에코디인쇄';
    return;
  }
  $('cardHandoff').hidden = true;
  $('editorTitle').textContent = product.name + ' 시안 작업';
  $('previewTitle').textContent = product.name + ' 미리보기';
  document.title = product.name + ' 시안 · 에코디인쇄';
  $('format').innerHTML = product.formats.map((f,i) =>
    '<option value="'+i+'">'+f[0]+'</option>').join('');
  const sample = samples[category];
  $('headline').value = sample[0];
  $('subtitle').value = sample[1];
  $('details').value = sample[2];
  let photoUrl = '';
  let approved = false;
  const escape = (v) => String(v ?? '').replace(/[&<>"']/g,(c)=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&apos;'}[c]));
  const clean = (v) => String(v ?? '').trim().replace(/\s+/g,' ').slice(0,220);
  const checkedColor = (v,fallback) => /^#[0-9a-fA-F]{6}$/.test(v) ? v : fallback;
  const wrap = (value,max,limit) => {
    const chars = Array.from(clean(value));
    const arr = [];
    for(let i=0;i<chars.length && arr.length<limit;i+=max) arr.push(chars.slice(i,i+max).join(''));
    return arr.length ? arr : [''];
  };
  function info() {
    const f = product.formats[Number($('format').value)] || product.formats[0];
    return {label:f[0],width:f[1],height:f[2],
      headline:clean($('headline').value),subtitle:clean($('subtitle').value),
      details:String($('details').value||'').trim().slice(0,220),
      contact:clean($('contact').value),
      background:checkedColor($('background').value,'#173e3d'),
      accent:checkedColor($('accent').value,'#f5d8a0'),
      quantity:Number($('quantity').value),finish:clean($('finish').value)};
  }
  function linesSvg(lines, y, dy, font, fill, weight) {
    return lines.map((line,i)=>'<text x="500" y="'+(y+i*dy).toFixed(1)+'" text-anchor="middle" font-family="Malgun Gothic,Noto Sans KR,Apple SD Gothic Neo,sans-serif" font-size="'+font.toFixed(1)+'" font-weight="'+weight+'" fill="'+fill+'">'+escape(line)+'</text>').join('');
  }
  function svgFor(d) {
    const h = Math.round(1000*d.height/d.width);
    const short = h<480, compact = h<950;
    const margin = short?28:50;
    const titleFont = Math.min(short?75:118,Math.max(38,h*.12));
    const subtitleFont = Math.min(45,Math.max(23,h*.045));
    const bodyFont = Math.min(40,Math.max(19,h*.037));
    const footerFont = Math.min(35,Math.max(19,h*.031));
    const titleLines = wrap(d.headline,short?19:(compact?14:12),3);
    const bodyLines = String(d.details).split(/\r?\n/).flatMap(v=>wrap(v,short?34:20,2)).slice(0,3);
    const titleY = h*(short?.34:.28);
    const titleStep=titleFont*1.3;
    const subtitleY= Math.max(h*(short?.61:.48),titleY+titleLines.length*titleStep+12);
    const bodyY= Math.max(h*(short?.75:.63),subtitleY+subtitleFont*1.55);
    const bodyStep=bodyFont*1.45;
    const image = photoUrl ? '<image href="'+photoUrl+'" x="0" y="0" width="1000" height="'+h+'" preserveAspectRatio="xMidYMid slice"/><rect width="1000" height="'+h+'" fill="#071b1c" opacity=".5"/>' : '';
    return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1000 '+h+'" width="'+d.width+'mm" height="'+d.height+'mm" role="img" aria-label="'+escape(product.name)+' 시안">'+
      '<rect width="1000" height="'+h+'" fill="'+d.background+'"/>'+image+
      '<rect x="'+margin+'" y="'+margin+'" width="'+(1000-margin*2)+'" height="'+Math.max(h-margin*2,10)+'" rx="'+(short?10:22)+'" fill="none" stroke="'+d.accent+'" stroke-width="3" opacity=".65"/>'+
      '<rect x="'+(500-(short?76:95))+'" y="'+(h*.12).toFixed(1)+'" width="'+(short?152:190)+'" height="'+(short?6:9)+'" rx="4" fill="'+d.accent+'"/>'+
      linesSvg(titleLines,titleY,titleStep,titleFont,'#ffffff',800)+
      linesSvg(wrap(d.subtitle,short?33:24,2),subtitleY,subtitleFont*1.35,subtitleFont,d.accent,650)+
      linesSvg(bodyLines,bodyY,bodyStep,bodyFont,'#ffffff',400)+
      '<line x1="'+(margin+16)+'" x2="'+(1000-margin-16)+'" y1="'+(h*.86).toFixed(1)+'" y2="'+(h*.86).toFixed(1)+'" stroke="'+d.accent+'" stroke-width="2" opacity=".8"/>'+
      linesSvg(wrap(d.contact,short?40:28,2),h*.93,footerFont*1.2,footerFont,'#ffffff',500)+
      '</svg>';
  }
  function status(message,isError=false) {
    $('status').textContent = message;
    $('status').style.color = isError ? '#a03535' : '#586f6a';
  }
  function refresh() {
    const d=info();
    $('dimensions').textContent = d.label;
    $('previewSvg').innerHTML=svgFor(d);
    approved=Boolean($('approve').checked);
    const valid=$('designForm').checkValidity() && d.headline.length>0 && Number.isInteger(d.quantity) && d.quantity>0 && d.quantity<=100000;
    $('requestQuote').disabled=!(approved && valid);
  }
  function changed() {
    $('approve').checked=false;
    refresh();
  }
  function saveSvg() {
    const d=info();
    const file=new Blob([svgFor(d)],{type:'image/svg+xml;charset=utf-8'});
    const target=URL.createObjectURL(file),anchor=document.createElement('a');
    anchor.href=target;anchor.download='EKODI-'+category+'-proof.svg';
    document.body.appendChild(anchor);anchor.click();anchor.remove();
    setTimeout(()=>URL.revokeObjectURL(target),1000);
    status('SVG 검토용 시안을 저장했습니다. 인쇄소 제출 전 글꼴·해상도·도련·CMYK를 확인하세요.');
  }
  function emailRequest() {
    const d=info();
    if (!$('approve').checked || !$('designForm').checkValidity() || !d.headline) {
      $('designForm').reportValidity();
      return status('정보 검토에 동의하고 필수 항목을 입력해 주세요.',true);
    }
    const body=[
      '[에코디인쇄 인쇄 견적 요청 · 주문 확정 아님]',
      '품목: '+product.name,'규격: '+d.label,'수량: '+d.quantity,
      '후가공: '+d.finish,'제목: '+d.headline,
      '요청자/단체명: '+clean($('requester').value),
      '회신 이메일: '+clean($('contactEmail').value),
      '',
      '검토용 SVG 또는 PDF 시안 파일을 이메일에 직접 첨부합니다.',
      '최종 인쇄 규격, 도련, 색상 및 견적은 업체 확인 후 승인합니다.',
      '이 이메일은 메일 앱을 열기 위한 초안이며 자동 발송되지 않습니다.'
    ].join('\n');
    const link='mailto:ekodibiz@gmail.com?subject='+encodeURIComponent('[에코디인쇄] '+product.name+' 견적 문의')+'&body='+encodeURIComponent(body);
    window.location.href=link;
    status('메일 앱에서 수신자와 첨부파일을 확인하고 직접 전송하세요. 주문·결제가 완료된 상태는 아닙니다.');
  }
  $('designForm').addEventListener('input',(event)=>{if(event.target.id!=='approve')changed();});
  $('designForm').addEventListener('change',(event)=>{if(event.target.id!=='approve')changed();});
  $('approve').addEventListener('change',refresh);
  $('exportSvg').addEventListener('click',saveSvg);
  $('printPdf').addEventListener('click',()=>window.print());
  $('requestQuote').addEventListener('click',emailRequest);
  $('photo').addEventListener('change',()=>{
    const f=$('photo').files && $('photo').files[0];
    photoUrl='';
    $('removePhoto').hidden=true;
    if(!f) return changed();
    if(!['image/png','image/jpeg'].includes(f.type)||f.size>5*1024*1024){
      $('photo').value='';
      status('JPG/PNG 사진 파일은 5MB 이하만 사용할 수 있습니다.',true);
      return changed();
    }
    const reader=new FileReader();
    reader.onload=()=>{
      if(typeof reader.result==='string' && /^data:image\/(png|jpeg);base64,/.test(reader.result)){
        photoUrl=reader.result;$('removePhoto').hidden=false;changed();
      }
    };
    reader.onerror=()=>status('사진을 읽지 못했습니다. 다른 파일을 선택해 주세요.',true);
    reader.readAsDataURL(f);
  });
  $('removePhoto').addEventListener('click',()=>{
    photoUrl='';$('photo').value='';$('removePhoto').hidden=true;changed();
  });
  refresh();
})();
