/* EKODI Business Card Studio — local-only print production, no server writes */
'use strict';
(function(){
const $=id=>document.getElementById(id);
const STORE={
  bbq:{title:'비비큐 무안청계점',kind:'store',name:'박은희',phone:'061 453 8295',bank:'신한 110 248 100718',url:'https://ekodi.kr/bbqcg'},
  pizza:{title:'피자마루 목포대점',kind:'store',name:'박은희',phone:'061 453 8295',bank:'신한 110 248 100718',url:'https://ekodi.kr/pizzamaru'},
  cgma:{title:'청계면상인회',kind:'association',name:'정찬균',role:'회장',phone:'010 3501 8542',business:'자담치킨&피자마루',email:'cgma4989@gmail.com',bank:'신한 100 037 318876',url:'http://cgma.or.kr'}
};
const MISSION={title:'에코디선교회',name:'정찬균',phone:'010 3501 8542',url:'https://ekodi.kr/mission'};
let active='bbq', qrData='', qrSource='', renderSerial=0;
const enc=s=>String(s===null||s===undefined?'':s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&apos;'}[c]));
const input=(key,label,value)=>'<label for="field-'+key+'">'+label+'<input id="field-'+key+'" data-field="'+key+'" value="'+enc(value)+'" maxlength="120" spellcheck="false"></label>';
function setStatus(msg,error){$('status').textContent=msg;$('status').style.color=error?'#a22d2d':'#40634d';}
function validUrl(s){try{const u=new URL(String(s));return ['http:','https:'].includes(u.protocol)&&!!u.hostname&&!u.username&&!u.password&&u.href.length<=500}catch{return false}}
function validated(){const c=STORE[active];if(!c.title.trim()||!c.name.trim()||!c.phone.trim()||!c.bank.trim())return '필수 정보에 빈 값이 있습니다.';if(!validUrl(c.url))return 'QR 목적지 주소를 올바른 http(s) URL로 입력하세요.';if(active!=='cgma'&&!validUrl(MISSION.url))return '선교회 홈페이지 주소를 확인하세요.';if(active==='cgma'&&!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(c.email))return '전자우편 주소를 확인하세요.';return '';}
function fields(){const c=STORE[active], store=c.kind==='store';const f=[];
f.push(input('title','상호 / 단체명',c.title));
f.push(input('name',store?'성명':'회장 성명',c.name));
f.push(input('phone','전화번호',c.phone));
if(!store){f.push(input('business','전화번호 옆 설명',c.business));f.push(input('email','전자우편',c.email));}
f.push(input('bank',store?'매장 계좌번호':'회비계좌',c.bank));
f.push(input('url','QR 목적지 URL (명함에는 표시하지 않음)',c.url));
if(store){f.push('<hr style="border:0;border-top:1px solid #dfebe1;width:100%;margin:6px 0"><strong style="font-size:12px">공통 뒷면 · 에코디선교회</strong>');f.push(input('mission.name','대표 성명',MISSION.name));f.push(input('mission.phone','대표 전화번호',MISSION.phone));f.push(input('mission.url','선교회 홈페이지',MISSION.url));}
$('details').innerHTML=f.join('');
$('details').querySelectorAll('[data-field]').forEach(field=>field.addEventListener('input',()=>{
  if(field.dataset.field.startsWith('mission.'))MISSION[field.dataset.field.split('.')[1]]=field.value;else c[field.dataset.field]=field.value;
  $('approve').checked=false;updateActions();scheduleRender();
}));}
function head(){const c=STORE[active];$('cardHeading').textContent=c.title;$('cardNote').textContent=active==='cgma'?'연락처 · 슬로건 양면 인쇄':'매장 앞면 · 에코디선교회 뒷면';document.querySelectorAll('[data-card]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.card===active)));}
function openSvg(){return '<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="940" height="540" viewBox="0 0 940 540" role="img"><defs><linearGradient id="sun" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#fffef8"/><stop offset=".75" stop-color="#f4f0da"/><stop offset="1" stop-color="#eedb9f"/></linearGradient><linearGradient id="burgundy" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#730f21"/><stop offset="1" stop-color="#3f0713"/></linearGradient><linearGradient id="pine" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#1d613f"/><stop offset="1" stop-color="#103b2c"/></linearGradient></defs>';}
function txt(x,y,s,z=30,color='#26382f',weight=650,extra=''){return '<text x="'+x+'" y="'+y+'" font-family="Noto Sans KR,Malgun Gothic,Apple SD Gothic Neo,sans-serif" font-size="'+z+'" font-weight="'+weight+'" fill="'+color+'" '+extra+'>'+enc(s)+'</text>';}
function rect(x,y,w,h,color,rx=0,attr=''){return '<rect x="'+x+'" y="'+y+'" width="'+w+'" height="'+h+'" rx="'+rx+'" fill="'+color+'" '+attr+'/>';}
function circle(cx,cy,r,color,attr=''){return '<circle cx="'+cx+'" cy="'+cy+'" r="'+r+'" fill="'+color+'" '+attr+'/>';}
function path(d,fill,extra=''){return '<path d="'+d+'" fill="'+fill+'" '+extra+'/>';}
function qrArt(x,y,size){let str=rect(x-9,y-9,size+18,size+18,'#ffffff',12,'stroke="#d7e7d8" stroke-width="2"');str+=qrData?'<image x="'+x+'" y="'+y+'" width="'+size+'" height="'+size+'" href="'+qrData+'"/>':txt(x+20,y+size/2,'QR 생성 중',21);return str;}
function guides(){return $('guides').checked ? rect(20,20,900,500,'none',0,'stroke="#e9a340" stroke-width="2.5" stroke-dasharray="10 8"')+rect(50,50,840,440,'none',0,'stroke="#21a4cb" stroke-width="2" stroke-dasharray="5 6"'):'';}
function frog(x,y,scale=1,wave=false){let a='<g transform="translate('+x+' '+y+') scale('+scale+')">';
a+=circle(84,69,67,'#84cb79','stroke="#18442c" stroke-width="6"');a+=circle(43,16,25,'#8bd384','stroke="#18442c" stroke-width="5"');a+=circle(125,16,25,'#8bd384','stroke="#18442c" stroke-width="5"');a+=circle(43,18,12,'#fff')+circle(125,18,12,'#fff')+circle(45,18,7,'#172f2e')+circle(126,18,7,'#172f2e');a+=circle(38,82,18,'#ade4a3')+circle(131,82,18,'#ade4a3');a+=path('M69 99 Q84 112 100 99','none','stroke="#24492e" stroke-width="5" stroke-linecap="round"');a+=rect(52,132,66,71,'#fff',14,'stroke="#1a432d" stroke-width="5"');a+=path(wave?'M55 151 L10 111 L-11 125 L46 177':'M55 151 L23 187 L37 201 L65 174','#88cf7d','stroke="#18442c" stroke-width="5"');a+=path('M115 153 L145 180 L127 196 L105 174','#88cf7d','stroke="#18442c" stroke-width="5"');a+=rect(68,200,19,20,'#85cb80',6,'stroke="#1a432d" stroke-width="3"')+rect(91,200,19,20,'#85cb80',6,'stroke="#1a432d" stroke-width="3"');a+=path('M105 5 l18 -9 l24 2 l-4 13 l-38 5z','#ffcf47','stroke="#31502c" stroke-width="4"');return a+'</g>';}
function storeFront(c,pizza){const red=!pizza;let s=openSvg();s+=rect(0,0,940,540,'#fffbf1');s+=rect(0,0,940,187,red?'url(#burgundy)':'url(#pine)');s+=path('M0 165 Q300 215 620 169 T940 165 L940 205 L0 205Z',red?'#f6c16c':'#dc6b4b');s+=path('M0 170 Q290 223 640 175 T940 168 L940 202 L0 202Z','#fffaf0');
s+=red?'<g opacity=".45">'+circle(820,73,93,'#f4a25c')+path('M790 181 Q815 102 835 80 Q865 122 851 173Z','#e35f28')+'</g>':'<g opacity=".2">'+circle(820,90,100,'#f2bd62')+circle(885,75,54,'#e65c40')+'</g>';
s+=txt(64,131,c.title,64,red?'#fff9ee':'#fbf5e8',850);
s+=path('M63 148 Q315 169 570 145','none','stroke="'+(red?'#f1c46d':'#f7ad73')+'" stroke-width="7" stroke-linecap="round"');
s+=txt(70,229,'상호',26,'#8c4d30',750)+txt(223,229,c.title,31,'#242d27',760);
s+=txt(70,291,'전화번호',26,'#8c4d30',750)+txt(223,291,c.phone,34,'#242d27',750);
s+=txt(70,353,'계좌번호',26,'#8c4d30',750)+txt(223,353,c.bank,30,'#242d27',720);
s+=txt(70,416,'성명',26,'#8c4d30',750)+txt(223,416,c.name,34,'#242d27',750);
s+=path('M65 243 H646 M65 306 H646 M65 368 H646','none','stroke="#e8d5c1" stroke-width="2"');
s+=qrArt(708,242,171);s+=txt(794,451,'홈페이지 QR',25,red?'#7c2333':'#176b44',800,'text-anchor="middle"');
s+=path('M0 495 Q300 520 575 480 T940 504 L940 540 L0 540Z',red?'#8c1226':'#146440');s+=path('M0 509 Q330 536 580 494 T940 506','none','stroke="'+(red?'#e5b65b':'#cc725a')+'" stroke-width="12"');
s+='</svg>';return s;}
function missionBack(){let s=openSvg();s+=rect(0,0,940,540,'url(#sun)');s+=circle(754,378,100,'#f6d88d','opacity=".6"');s+=path('M0 445 Q170 335 355 420 T690 395 T940 400 L940 540 L0 540Z','#bbd7aa');s+=path('M0 476 Q190 414 377 469 T710 443 T940 462 L940 540 L0 540Z','#6b9f76');s+=path('M0 509 Q180 470 379 515 T940 495 L940 540 L0 540Z','#22683b');
s+=circle(220,226,92,'#e2eecb');s+=path('M169 240 Q184 185 219 224 Q254 180 276 243 L251 280 Q222 300 194 277Z','#3e8e57');s+=circle(191,214,14,'#376c47')+circle(250,214,14,'#376c47')+circle(221,197,15,'#477b40');s+=rect(213,135,17,76,'#e3ae32')+rect(187,154,70,16,'#e3ae32');s+=txt(221,354,'EKODI MISSION',29,'#31734b',750,'text-anchor="middle" letter-spacing="4"');s+=path('M391 108 V419','none','stroke="#779e7f" stroke-width="3"');
s+=txt(420,158,MISSION.title,70,'#184c36',850);
s+=txt(422,214,'복음과 일상을 연결하는 선교공동체',30,'#3c513a',650);
s+=path('M421 231 Q645 245 879 227','none','stroke="#6a9b51" stroke-width="4"');
s+=txt(422,290,'대표 '+MISSION.name,41,'#283b2d',750);
s+=txt(422,348,MISSION.phone,42,'#283b2d',740);
s+=txt(422,406,MISSION.url.replace(/^https?:\/\//,''),33,'#284f39',700);
s+=rect(853,373,12,87,'#6a5c2b')+rect(827,394,62,11,'#6a5c2b');s+='</svg>';return s;}
function cgmaFront(c){let s=openSvg();s+=rect(0,0,940,540,'#fffefa');s+=path('M0 0 H940 V85 Q660 28 440 90 T0 80Z','#f0f8e8');s+=path('M0 0 H325 Q161 55 0 113Z','#54a951');s+=txt(65,126,'청계면 상인회',75,'#247a35',850);s+=frog(733,45,.78,true);
s+=txt(70,209,c.name+' '+(c.role||'회장'),39,'#1c2e27',800);
s+=txt(70,261,c.phone,39,'#1c2e27',800);s+=txt(364,261,'('+c.business+')',25,'#303b30',680);
s+=path('M66 288 H876','none','stroke="#e89d4f" stroke-width="5"');
s+=txt(70,351,'홈페이지',30,'#337b3e',780)+txt(258,351,c.url,30,'#222d28',650);
s+=txt(70,406,'전자우편',30,'#337b3e',780)+txt(258,406,c.email,28,'#222d28',650);
s+=txt(70,463,'회비계좌',30,'#337b3e',780)+txt(258,463,c.bank,29,'#222d28',720);
s+=qrArt(715,322,143);s+=path('M0 510 Q430 480 700 516 T940 499 L940 540 L0 540Z','#64a34b');s+='</svg>';return s;}
function cgmaBack(){let s=openSvg();s+=rect(0,0,940,540,'#fffefe');s+=path('M0 0 H940 V65 Q760 27 543 52 T0 53Z','#e8f8e6');s+=txt(470,167,'청춘이 계속되는 거리',77,'#19549e',900,'text-anchor="middle"');s+=txt(470,176,'',10);
s+=path('M123 195 Q470 211 824 188','none','stroke="#6fc3ea" stroke-width="9" stroke-linecap="round"');
s+=txt(460,348,'청계면 상인회',79,'#173c8f',900,'text-anchor="middle"');
s+=frog(100,284,.87,false)+frog(736,270,.87,true);
s+=path('M0 480 Q220 450 490 482 T940 474 L940 540 L0 540Z','#31a9df');s+=path('M0 514 Q315 502 600 515 T940 509 L940 540 L0 540Z','#1b85c3');
s+='</svg>';return s;}
function makeArt(side,showGuides){const c=STORE[active];let svg=(active==='cgma'?(side==='front'?cgmaFront(c):cgmaBack()):(side==='front'?storeFront(c,active==='pizza'):missionBack()));if(showGuides)svg=svg.replace('</svg>',guides()+'</svg>');return svg;}
function updateActions(){const good=$('approve').checked&&!validated()&&!!qrData&&qrSource===STORE[active].url;
$('download').disabled=!good;$('request').disabled=!good;
$('vendor').setAttribute('aria-disabled',String(!good));
if(!good&&$('approve').checked)setStatus(validated()||'QR코드 생성이 완료되지 않았습니다.',true);
}
async function generateQr(url){const box=$('qrPreview');box.innerHTML='';qrData='';qrSource='';
if(!validUrl(url))return;
if(typeof window.QRCode!=='function'){setStatus('QR코드 생성 라이브러리를 불러오지 못했습니다. 인쇄 파일은 생성하지 않습니다.',true);return;}
try{new QRCode(box,{text:url,width:280,height:280,correctLevel:QRCode.CorrectLevel.M});await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));
const canvas=box.querySelector('canvas');const image=box.querySelector('img');
if(canvas&&canvas.width>0)qrData=canvas.toDataURL('image/png');else if(image&&image.src.startsWith('data:image/'))qrData=image.src;
if(qrData)qrSource=url;else throw Error('QR 이미지가 없습니다');}
catch(e){setStatus('QR코드 생성에 실패했습니다. 다시 확인하세요.',true);}}
async function render(){const sequence=++renderSerial;const c=STORE[active];$('qrText').textContent=c.url;
await generateQr(c.url);if(sequence!==renderSerial)return;
$('frontPreview').innerHTML=makeArt('front',true);$('backPreview').innerHTML=makeArt('back',true);
updateActions();if(!validated())setStatus('양면 검토 후 PDF를 생성하세요.',false);else setStatus(validated(),true);}
let scheduled=false;function scheduleRender(){if(scheduled)return;scheduled=true;requestAnimationFrame(()=>{scheduled=false;render();});}
function urlToJpeg(svg){return new Promise((resolve,reject)=>{const img=new Image();img.onload=()=>{try{const canvas=document.createElement('canvas');canvas.width=1110;canvas.height=638;const ctx=canvas.getContext('2d');ctx.fillStyle='#fff';ctx.fillRect(0,0,1110,638);ctx.drawImage(img,0,0,1110,638);const data=canvas.toDataURL('image/jpeg',.96);resolve(Uint8Array.from(atob(data.split(',')[1]),c=>c.charCodeAt(0)));}catch(e){reject(e)}};img.onerror=()=>reject(Error('명함 인쇄 이미지로 변환하지 못했습니다.'));img.src='data:image/svg+xml;charset=utf-8,'+encodeURIComponent(svg);});}
function pdfBytes(images){const encoder=new TextEncoder(), chunks=[], offsets=[0];let length=0;const push=s=>{const b=typeof s==='string'?encoder.encode(s):s;chunks.push(b);length+=b.length};
const pageW=(94*72/25.4).toFixed(5),pageH=(54*72/25.4).toFixed(5);
const objects=[
  '<< /Type /Catalog /Pages 2 0 R >>',
  '<< /Type /Pages /Kids [3 0 R 4 0 R] /Count 2 >>',
  '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 '+pageW+' '+pageH+'] /Resources << /XObject << /Im1 5 0 R >> >> /Contents 7 0 R >>',
  '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 '+pageW+' '+pageH+'] /Resources << /XObject << /Im2 6 0 R >> >> /Contents 8 0 R >>'
];
push('%PDF-1.4\n%EKODI\n');
for(let i=1;i<=8;i++){offsets[i]=length;push(i+' 0 obj\n');if(i<=4){push(objects[i-1]+'\n');}
if(i===5||i===6){const img=images[i-5];push('<< /Type /XObject /Subtype /Image /Width 1110 /Height 638 /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length '+img.length+' >>\nstream\n');push(img);push('\nendstream\n');}
if(i===7||i===8){const command='q '+pageW+' 0 0 '+pageH+' 0 0 cm /Im'+(i===7?1:2)+' Do Q\n';push('<< /Length '+encoder.encode(command).length+' >>\nstream\n'+command+'endstream\n');}push('endobj\n');}
const start=length;push('xref\n0 9\n0000000000 65535 f \n');for(let i=1;i<=8;i++)push(String(offsets[i]).padStart(10,'0')+' 00000 n \n');
push('trailer\n<< /Size 9 /Root 1 0 R >>\nstartxref\n'+start+'\n%%EOF');const merged=new Uint8Array(length);let p=0;for(const ch of chunks){merged.set(ch,p);p+=ch.length;}return merged;}
async function download(){if($('download').disabled)return;const button=$('download');button.disabled=true;setStatus('인쇄용 PDF를 생성합니다.');try{
  const [a,b]=await Promise.all([urlToJpeg(makeArt('front',false)),urlToJpeg(makeArt('back',false))]);const bytes=pdfBytes([a,b]);
  if(bytes.length<40000)throw Error('생성된 PDF 크기가 비정상적입니다.');
  const blob=new Blob([bytes],{type:'application/pdf'}),link=document.createElement('a'),objectUrl=URL.createObjectURL(blob);
  link.href=objectUrl;link.download='EKODI-'+active+'-94x54mm-double-sided.pdf';document.body.append(link);link.click();link.remove();
  setTimeout(()=>URL.revokeObjectURL(objectUrl),15000);setStatus('PDF 다운로드를 요청했습니다. 실제 파일을 열어 양면·글자·QR을 검토한 뒤 인쇄업체에 업로드하세요.');
}catch(e){setStatus('인쇄 파일 생성 실패: '+e.message,true);}finally{updateActions();}}
function request(){if($('request').disabled)return;const c=STORE[active],subject='[에코디 명함 인쇄 요청] '+c.title,body=[
'인쇄 요청 초안 (메일 발송 전에는 접수되지 않습니다.)','명함: '+c.title,'수량: '+$('quantity').value+'매','양면: '+(active==='cgma'?'상인회 연락처 / 청춘이 계속되는 거리':'매장 / 에코디선교회'),
'사이즈: 90×50mm 완성 / 94×54mm 작업','후가공: '+$('finish').value,'QR 목적지: '+c.url,'',
'※ 다운로드한 인쇄용 PDF 파일을 메일에 직접 첨부하고 검토 후 발송해 주세요.','※ 견적·배송·결제는 별도 확정입니다.'].join('\n');
const href='mailto:ekodibiz@gmail.com?subject='+encodeURIComponent(subject)+'&body='+encodeURIComponent(body);
setStatus('메일 작성 창을 열었습니다. PDF를 첨부하고 발송해야 인쇄 요청이 전달됩니다.');window.location.href=href;}
document.querySelectorAll('[data-card]').forEach(b=>b.addEventListener('click',()=>{active=b.dataset.card;head();fields();$('approve').checked=false;updateActions();render();}));
$('approve').addEventListener('change',updateActions);
$('guides').addEventListener('change',()=>{$('frontPreview').innerHTML=makeArt('front',true);$('backPreview').innerHTML=makeArt('back',true);});
$('download').addEventListener('click',download);$('request').addEventListener('click',request);
$('vendor').addEventListener('click',e=>{if($('vendor').getAttribute('aria-disabled')==='true'){e.preventDefault();setStatus('먼저 양면과 QR 정보를 검토·승인해 주세요.',true);}});
head();fields();render();
})();