// 청계면상인회 전자서명 페이지. The token lives only in the URL fragment and is sent to the
// same-origin Control API in the x-ekodi-sign-token header. All text is rendered with textContent.
const API='/api/cgma/edocs/sign';
const SVG_NS='http://www.w3.org/2000/svg';
const app=document.getElementById('app');
const token=(location.hash||'').replace(/^#/,'').trim();
let view=null,fileUrl='';

function el(tag,{className='',text='',attrs={}}={},children=[]){
  const node=document.createElement(tag);
  if(className)node.className=className;
  if(text!=='')node.textContent=String(text);
  for(const [k,v] of Object.entries(attrs))node.setAttribute(k,v);
  for(const child of children)if(child)node.append(child);
  return node;
}
const kst=value=>{if(!value)return '';try{return new Date(value).toLocaleString('ko-KR',{timeZone:'Asia/Seoul',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit'})}catch{return String(value)}};
const kstDate=value=>{if(!value)return '';try{return new Date(value).toLocaleDateString('ko-KR',{timeZone:'Asia/Seoul',year:'numeric',month:'2-digit',day:'2-digit'})}catch{return String(value)}};
const size=n=>n>1048576?`${(n/1048576).toFixed(1)}MB`:`${Math.max(1,Math.round(n/1024))}KB`;
const STATUS={draft:'준비 중',in_progress:'서명 진행 중',completed:'서명 완료',cancelled:'취소됨'};

export function strokesSvg(strokes){
  const svg=document.createElementNS(SVG_NS,'svg');
  svg.setAttribute('viewBox','0 0 1000 400');svg.setAttribute('role','img');svg.setAttribute('aria-label','서명');
  for(const stroke of strokes||[]){
    if(!stroke.length)continue;
    const path=document.createElementNS(SVG_NS,'path');
    const d=stroke.length===1?`M${stroke[0][0]} ${stroke[0][1]}l0.1 0`:'M'+stroke.map(p=>`${p[0]} ${p[1]}`).join(' L');
    path.setAttribute('d',d);path.setAttribute('fill','none');path.setAttribute('stroke','#111');
    path.setAttribute('stroke-width','9');path.setAttribute('stroke-linecap','round');path.setAttribute('stroke-linejoin','round');
    svg.append(path);
  }
  return svg;
}

async function api(path='',options={}){
  const headers=new Headers(options.headers||{});
  headers.set('x-ekodi-sign-token',token);
  if(options.body){headers.set('content-type','application/json');headers.set('x-ekodi-edoc-request','1');}
  const response=await fetch(API+path,{cache:'no-store',credentials:'omit',...options,headers});
  if(path==='/file')return response;
  const data=await response.json().catch(()=>({}));
  if(!response.ok)throw Object.assign(new Error(data.error||`요청을 처리하지 못했습니다 (${response.status})`),{code:data.code||'',status:response.status});
  return data;
}

function notice(text,kind=''){const p=el('p',{className:'notice',text});if(kind)p.dataset.kind=kind;return p;}

function chain(){
  const list=el('ol',{className:'chain',attrs:{'aria-label':'서명 순서 (왼쪽부터)'}});
  for(const s of view.signers){
    const li=el('li',{},[el('span',{className:'step',text:`${s.seq}번째`}),el('strong',{text:s.role_title}),el('span',{text:s.signer_name}),
      el('small',{text:s.status==='signed'?`서명 ${kst(s.signed_at)}`:s.status==='active'?'지금 서명할 차례':'대기'})]);
    li.dataset.status=s.status;
    if(s.seq===view.me.seq)li.dataset.me='true';
    if(s.status==='signed'&&s.signature?.length)li.append(strokesSvg(s.signature));
    list.append(li);
  }
  return list;
}

async function openFile(){
  if(fileUrl)return fileUrl;
  const response=await api('/file');
  if(!response.ok)throw new Error('원본 파일을 열 수 없습니다.');
  fileUrl=URL.createObjectURL(await response.blob());
  return fileUrl;
}

function documentSection(){
  const d=view.document;
  const meta=el('dl',{className:'meta'},[
    el('dt',{text:'문서번호'}),el('dd',{text:d.doc_no}),el('dt',{text:'분류'}),el('dd',{text:d.category}),
    el('dt',{text:'상태'}),el('dd',{text:STATUS[d.status]||d.status}),
    d.summary?el('dt',{text:'요약'}):null,d.summary?el('dd',{text:d.summary}):null,
    el('dt',{text:'문서 지문'}),el('dd',{className:'hash',text:d.content_sha256,attrs:{title:'SHA-256: 내용이 한 글자라도 바뀌면 달라집니다'}}),
  ]);
  const section=el('section',{},[el('h2',{text:d.title}),meta]);
  if(d.content_kind==='text'){
    section.append(el('h2',{text:'문서 내용',attrs:{style:'margin-top:14px'}}),el('div',{className:'body-text',text:d.body_text}));
  }else{
    const holder=el('div');
    const open=el('button',{className:'no-print',text:`문서 열기 (${d.file_name}, ${size(d.file_size)})`,attrs:{type:'button'}});
    open.addEventListener('click',async()=>{
      open.disabled=true;
      try{
        const url=await openFile();
        holder.replaceChildren(d.file_mime==='application/pdf'?el('iframe',{className:'preview',attrs:{src:url,title:'문서 미리보기'}}):el('img',{className:'preview',attrs:{src:url,alt:d.title}}));
        const tab=el('button',{className:'no-print',text:'새 창에서 크게 보기',attrs:{type:'button'}});
        tab.addEventListener('click',()=>window.open(url,'_blank','noopener'));
        holder.append(el('div',{className:'row',attrs:{style:'margin-top:8px'}},[tab]));
      }catch(error){holder.replaceChildren(notice(error.message,'error'))}
      finally{open.disabled=false}
    });
    section.append(el('div',{className:'row',attrs:{style:'margin-top:12px'}},[open]),holder);
  }
  return section;
}

function signaturePad(){
  const canvas=el('canvas',{attrs:{width:'1000',height:'400','aria-label':'서명 입력란'}});
  const ctx=canvas.getContext('2d');
  ctx.lineWidth=9;ctx.lineCap='round';ctx.lineJoin='round';ctx.strokeStyle='#111';
  let strokes=[],current=null;
  const point=event=>{const r=canvas.getBoundingClientRect();return [Math.round(Math.min(1000,Math.max(0,(event.clientX-r.left)*1000/r.width))),Math.round(Math.min(400,Math.max(0,(event.clientY-r.top)*400/r.height)))];};
  canvas.addEventListener('pointerdown',event=>{event.preventDefault();canvas.setPointerCapture(event.pointerId);current=[point(event)];strokes.push(current);ctx.beginPath();ctx.moveTo(...current[0]);ctx.lineTo(current[0][0]+.1,current[0][1]);ctx.stroke();});
  canvas.addEventListener('pointermove',event=>{if(!current)return;const p=point(event),last=current[current.length-1];if(Math.abs(p[0]-last[0])+Math.abs(p[1]-last[1])<3)return;if(current.length>=1500)return;current.push(p);ctx.beginPath();ctx.moveTo(...last);ctx.lineTo(...p);ctx.stroke();});
  const end=()=>{current=null;};
  canvas.addEventListener('pointerup',end);canvas.addEventListener('pointercancel',end);canvas.addEventListener('pointerleave',end);
  const clear=()=>{strokes=[];ctx.clearRect(0,0,1000,400);};
  return {canvas,clear,strokes:()=>strokes.filter(s=>s.length).slice(0,80),points:()=>strokes.reduce((n,s)=>n+s.length,0)};
}

function signForm(){
  const me=view.me;
  const agree=el('input',{attrs:{type:'checkbox',id:'agree'}});
  const name=el('input',{attrs:{type:'text',id:'signedName',autocomplete:'name',placeholder:me.signer_name,maxlength:'30'}});
  const pad=signaturePad();
  const clear=el('button',{text:'서명 지우기',attrs:{type:'button'}});
  clear.addEventListener('click',pad.clear);
  const submit=el('button',{className:'primary',text:'서명하기',attrs:{type:'button'}});
  const message=el('div');
  submit.addEventListener('click',async()=>{
    message.replaceChildren();
    if(!agree.checked)return message.append(notice('문서 내용을 확인했다는 항목에 체크해 주세요.','error'));
    if(!name.value.trim())return message.append(notice('성명을 입력해 주세요.','error'));
    if(pad.points()<8)return message.append(notice('서명란에 서명을 그려 주세요.','error'));
    submit.disabled=true;
    try{
      const result=await api('',{method:'POST',body:JSON.stringify({agree:true,signed_name:name.value.trim(),signature:pad.strokes(),content_sha256:view.document.content_sha256})});
      await load(result.completed?'서명이 완료되었습니다. 모든 서명이 끝나 문서가 확정되었습니다.':'서명이 완료되었습니다. 다음 순서 서명자가 서명할 수 있게 되었습니다.');
    }catch(error){message.append(notice(error.message,'error'));submit.disabled=false;}
  });
  return el('section',{className:'no-print'},[
    el('h2',{text:`${me.role_title} ${me.signer_name} 님, 서명해 주세요`}),
    el('label',{className:'agree',attrs:{for:'agree'}},[agree,el('span',{text:'위 문서의 내용을 모두 확인했으며, 이 내용에 서명합니다.'})]),
    el('label',{text:'성명 (지정된 서명자 성명과 같게 입력)',attrs:{for:'signedName'}}),name,
    el('label',{text:'서명 (손가락이나 마우스로 그려 주세요)'}),
    el('div',{className:'pad-wrap'},[pad.canvas,el('span',{className:'pad-hint',text:'여기에 서명'})]),
    el('div',{className:'row',attrs:{style:'margin-top:10px'}},[clear,submit]),
    el('p',{text:'서명 일시는 제출 시점의 서버 시각으로 자동 입력됩니다.',attrs:{style:'font-size:13px;color:#5b6b69;margin:10px 0 0'}}),
    message,
  ]);
}

function certificate(){
  const d=view.document;
  const grid=el('div',{className:'cert-sign'});
  for(const s of view.signers){
    grid.append(el('div',{},[el('strong',{text:`${s.seq}. ${s.role_title}`}),el('span',{text:` ${s.signed_name||s.signer_name}`}),
      s.signature?.length?strokesSvg(s.signature):null,el('small',{text:`확인일: ${kstDate(s.signed_at)}`}),el('br'),el('small',{text:kst(s.signed_at)})]));
  }
  const print=el('button',{className:'no-print',text:'서명 확인서 인쇄 · PDF 저장',attrs:{type:'button'}});
  print.addEventListener('click',()=>window.print());
  return el('section',{},[el('h2',{text:'서명 확인서'}),
    el('p',{text:`${d.doc_no} 「${d.title}」 문서는 ${kst(d.completed_at)}에 모든 서명자(${view.signers.length}명)의 순차 서명이 완료되었습니다.`}),
    grid,el('p',{className:'hash',text:`문서 지문(SHA-256) ${d.content_sha256}`}),el('div',{className:'row'},[print])]);
}

function render(flash=''){
  const nodes=[];
  if(flash)nodes.push(notice(flash,'ok'));
  const d=view.document,me=view.me;
  if(d.status==='cancelled')nodes.push(notice(`이 문서는 취소되었습니다.${d.cancel_reason?` (사유: ${d.cancel_reason})`:''}`,'error'));
  else if(d.status==='completed')nodes.push(notice('모든 서명이 완료된 문서입니다.','ok'));
  else if(me.status==='signed')nodes.push(notice(`${kst(me.signed_at)}에 서명하셨습니다. 다른 서명자의 서명을 기다리고 있습니다.`,'ok'));
  else if(view.link_expired)nodes.push(notice('서명 링크 유효기간이 지났습니다. 관리자에게 새 링크를 요청해 주세요.','error'));
  else if(view.waiting_for){
    nodes.push(notice(`서명 순서는 왼쪽부터입니다. 앞 순서(${view.waiting_for.role_title} ${view.waiting_for.signer_name})의 서명이 끝나면 이 링크에서 바로 서명하실 수 있습니다.`));
  }
  nodes.push(el('section',{},[el('h2',{text:'서명 순서'}),chain()]));
  nodes.push(documentSection());
  if(view.can_sign)nodes.push(signForm());
  if(view.waiting_for){const again=el('button',{className:'no-print',text:'서명 차례 다시 확인',attrs:{type:'button'}});again.addEventListener('click',()=>load());nodes.push(el('div',{className:'row'},[again]));}
  if(d.status==='completed')nodes.push(certificate());
  app.replaceChildren(...nodes);
}

async function load(flash=''){
  try{view=await api();render(flash);}
  catch(error){app.replaceChildren(notice(error.message||'서명 정보를 불러오지 못했습니다.','error'));}
}

if(!/^[A-Za-z0-9_-]{43}$/.test(token))app.replaceChildren(notice('서명 링크가 올바르지 않습니다. 받으신 링크 전체를 다시 열어 주세요.','error'));
else load();
