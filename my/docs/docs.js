import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm';

const cfg=window.EKODI_MY_CONFIG||{};
const enabled=Boolean(cfg.dataEnabled&&cfg.supabaseUrl&&cfg.supabasePublishableKey);
const sb=enabled?createClient(cfg.supabaseUrl,cfg.supabasePublishableKey,{auth:{detectSessionInUrl:true,persistSession:true}}):null;
const authUrl=cfg.authUrl||'https://auth.ekodi.kr/?site=my';
const AI_URL=enabled?`${cfg.supabaseUrl}/functions/v1/document-ai-api`:'';
const LOCAL_KEY='ekodi.docs.v1';
const $=s=>document.querySelector(s);
const editor=$('#editor'),titleInput=$('#titleInput'),docList=$('#docList'),saveState=$('#saveState');
let session=null,cloudDocs=[],localDocs=[],current={id:'',cloudId:'',sourceFormat:'ekodi',updatedAt:new Date().toISOString()};
let savedRange=null,selectedText='',aiOperation='proofread',lastAiTarget=null,saveTimer=null;

const cleanTitle=v=>(String(v||'').trim()||'제목 없는 문서').slice(0,160);
const nowIso=()=>new Date().toISOString();
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'})[c]);
const slug=v=>(cleanTitle(v).normalize('NFKD').replace(/[^\w가-힣.-]+/g,'-').replace(/^-+|-+$/g,'').slice(0,80)||'ekodi-document');
function localId(){return `local-${crypto.randomUUID()}`}
function humanTime(value){const d=new Date(value||Date.now());return Number.isNaN(d.getTime())?'':d.toLocaleString('ko-KR',{month:'numeric',day:'numeric',hour:'2-digit',minute:'2-digit'})}
function setState(message,tone=''){saveState.textContent=message;saveState.dataset.tone=tone}
function plainToHtml(text){return String(text||'').replace(/\r\n/g,'\n').split(/\n{2,}/).map(block=>`<p>${esc(block).replace(/\n/g,'<br>')}</p>`).join('')||'<p><br></p>'}
function sanitizeHtml(input){
  const doc=new DOMParser().parseFromString(String(input||''),'text/html');
  doc.querySelectorAll('script,style,iframe,object,embed,form,input,button,meta,link').forEach(node=>node.remove());
  doc.body.querySelectorAll('*').forEach(node=>{
    for(const attr of [...node.attributes]){
      const name=attr.name.toLowerCase(),value=attr.value.trim().toLowerCase();
      if(name.startsWith('on')||name==='srcdoc'||((name==='href'||name==='src')&&value.startsWith('javascript:')))node.removeAttribute(attr.name);
      if(name==='style')node.removeAttribute('style');
    }
  });
  return doc.body.innerHTML;
}
function htmlToMarkdown(root=editor){
  const walk=node=>{
    if(node.nodeType===Node.TEXT_NODE)return node.textContent||'';
    if(node.nodeType!==Node.ELEMENT_NODE)return'';
    const tag=node.tagName.toLowerCase(),inner=[...node.childNodes].map(walk).join('');
    if(tag==='h1')return `# ${inner.trim()}\n\n`;
    if(tag==='h2')return `## ${inner.trim()}\n\n`;
    if(tag==='h3')return `### ${inner.trim()}\n\n`;
    if(tag==='strong'||tag==='b')return `**${inner}**`;
    if(tag==='em'||tag==='i')return `*${inner}*`;
    if(tag==='br')return'\n';
    if(tag==='li')return `- ${inner.trim()}\n`;
    if(tag==='blockquote')return inner.split('\n').filter(Boolean).map(v=>`> ${v}`).join('\n')+'\n\n';
    if(tag==='p'||tag==='div')return `${inner.trim()}\n\n`;
    if(tag==='a')return `[${inner}](${node.getAttribute('href')||''})`;
    if(tag==='table')return `${node.innerText.trim()}\n\n`;
    return inner;
  };
  return [...root.childNodes].map(walk).join('').replace(/\n{3,}/g,'\n\n').trim();
}
function markdownToHtml(md){
  const lines=String(md||'').replace(/\r\n/g,'\n').split('\n');let html='',list=null;
  const closeList=()=>{if(list){html+=`</${list}>`;list=null}};
  for(const raw of lines){
    const line=raw.trimEnd();
    if(!line.trim()){closeList();continue}
    let m;
    if((m=line.match(/^(#{1,3})\s+(.+)$/))){closeList();html+=`<h${m[1].length}>${esc(m[2])}</h${m[1].length}>`;continue}
    if((m=line.match(/^[-*]\s+(.+)$/))){if(list!=='ul'){closeList();list='ul';html+='<ul>'}html+=`<li>${esc(m[1])}</li>`;continue}
    if((m=line.match(/^\d+[.)]\s+(.+)$/))){if(list!=='ol'){closeList();list='ol';html+='<ol>'}html+=`<li>${esc(m[1])}</li>`;continue}
    if((m=line.match(/^>\s?(.+)$/))){closeList();html+=`<blockquote>${esc(m[1])}</blockquote>`;continue}
    closeList();html+=`<p>${esc(line)}</p>`;
  }
  closeList();return html||'<p><br></p>';
}
function readLocal(){try{const rows=JSON.parse(localStorage.getItem(LOCAL_KEY)||'[]');return Array.isArray(rows)?rows:[]}catch{return[]}}
function writeLocal(){localStorage.setItem(LOCAL_KEY,JSON.stringify(localDocs.slice(0,40)))}
function snapshotCurrent(){
  return {id:current.id||localId(),title:cleanTitle(titleInput.value),content_html:sanitizeHtml(editor.innerHTML),source_format:current.sourceFormat||'ekodi',updated_at:nowIso(),cloud_id:current.cloudId||''};
}
function persistLocal(){
  const snap=snapshotCurrent();current.id=snap.id;current.updatedAt=snap.updated_at;
  const ix=localDocs.findIndex(row=>row.id===snap.id);if(ix>=0)localDocs[ix]=snap;else localDocs.unshift(snap);
  writeLocal();setState('로컬 자동저장');renderList();updateMeta();
}
function scheduleSave(){clearTimeout(saveTimer);setState('저장 중…');saveTimer=setTimeout(()=>{persistLocal();if(session&&current.cloudId)void saveCloud(false)},700)}
function updateMeta(){const text=(editor.innerText||'').replace(/\s+/g,' ').trim();$('#wordCount').textContent=`${text.length.toLocaleString()}자`;$('#updatedAt').textContent=humanTime(current.updatedAt);$('#formatBadge').textContent=String(current.sourceFormat||'EKODI').toUpperCase()}
function newDocument(){
  current={id:localId(),cloudId:'',sourceFormat:'ekodi',updatedAt:nowIso()};titleInput.value='제목 없는 문서';editor.innerHTML='<h1>새 문서</h1><p>내용을 입력하세요.</p>';persistLocal();editor.focus()
}
function openRow(row,cloud=false){
  current={id:cloud?`cloud-${row.id}`:row.id,cloudId:cloud?row.id:(row.cloud_id||''),sourceFormat:row.source_format||'ekodi',updatedAt:row.updated_at||nowIso()};
  titleInput.value=row.title||'제목 없는 문서';editor.innerHTML=sanitizeHtml(row.content_html||'<p><br></p>');updateMeta();renderList();captureSelection()
}
function renderList(){
  const rows=[
    ...cloudDocs.map(row=>({...row,_cloud:true,_key:`cloud-${row.id}`})),
    ...localDocs.filter(row=>!row.cloud_id).map(row=>({...row,_cloud:false,_key:row.id}))
  ].sort((a,b)=>String(b.updated_at||'').localeCompare(String(a.updated_at||'')));
  if(!rows.length){docList.innerHTML='<div class="empty-docs">아직 저장된 문서가 없습니다.</div>';return}
  docList.innerHTML=rows.map(row=>`<button class="doc-item ${row._key===current.id?'active':''}" data-doc-key="${esc(row._key)}" type="button"><strong>${esc(row.title||'제목 없는 문서')}</strong><small>${row._cloud?'계정 저장':'이 브라우저'} · ${esc(humanTime(row.updated_at))}</small></button>`).join('');
  docList.querySelectorAll('[data-doc-key]').forEach(button=>button.addEventListener('click',()=>{
    const row=rows.find(item=>item._key===button.dataset.docKey);if(row)openRow(row,row._cloud);
  }));
}
async function handoff(){
  const p=new URLSearchParams(location.hash.slice(1)),token=p.get('ekodi_token');if(!token||!sb)return;
  const {error}=await sb.auth.verifyOtp({token_hash:token,type:p.get('ekodi_type')||'email'});
  history.replaceState({},document.title,location.pathname+location.search);if(error)throw error;
}
function authUi(){
  $('#authButton').textContent=session?'로그아웃':'Google로 시작';
  $('#libraryHint').textContent=session?'계정 저장은 내 EKODI 사용자 ID에 귀속됩니다. 로컬 자동저장도 함께 유지됩니다.':'로그인 전에는 이 브라우저에 안전하게 임시 저장합니다.';
  $('#saveCloud').disabled=!session;
}
async function authAction(){
  if(!enabled)return;
  if(!session){const target=new URL(authUrl);target.searchParams.set('return_to',location.href.split('#')[0]);location.assign(target.href);return}
  await sb.auth.signOut();session=null;cloudDocs=[];authUi();renderList();setState('로컬 자동저장');
}
async function loadCloud(){
  if(!session||!sb){cloudDocs=[];renderList();return}
  const {data,error}=await sb.from('document_files').select('id,title,content_html,source_format,workspace_key,updated_at').order('updated_at',{ascending:false}).limit(60);
  if(error){console.error('document load',error);setState('계정 문서 불러오기 실패','error');return}
  cloudDocs=data||[];renderList();
}
async function saveCloud(version=true){
  if(!session||!sb){setState('로그인 후 계정 저장 가능','error');return}
  const snap=snapshotCurrent(),payload={owner_user_id:session.user.id,workspace_key:`personal:${session.user.id}`,title:snap.title,content_html:snap.content_html,source_format:snap.source_format,updated_at:nowIso()};
  setState('계정 저장 중…');
  let data,error;
  if(current.cloudId)({data,error}=await sb.from('document_files').update(payload).eq('id',current.cloudId).select('*').single());
  else({data,error}=await sb.from('document_files').insert(payload).select('*').single());
  if(error){console.error('document save',error);setState('계정 저장 실패','error');return}
  current.cloudId=data.id;current.id=`cloud-${data.id}`;current.updatedAt=data.updated_at;
  localDocs=localDocs.filter(row=>row.id!==snap.id);writeLocal();
  if(version)await sb.from('document_versions').insert({document_id:data.id,owner_user_id:session.user.id,title:data.title,content_html:data.content_html,source_format:data.source_format});
  setState('계정에 저장됨','ok');await loadCloud();updateMeta();
}
function captureSelection(){
  const sel=window.getSelection();if(!sel||!sel.rangeCount){savedRange=null;selectedText='';return}
  const range=sel.getRangeAt(0),node=range.commonAncestorContainer;
  if(!editor.contains(node)&&node!==editor)return;
  savedRange=range.cloneRange();selectedText=sel.toString().trim();
  $('#selectionState').textContent=selectedText?`선택 ${selectedText.length}자`:'전체 문서';
}
function fragmentFromText(text){const frag=document.createDocumentFragment(),parts=String(text||'').replace(/\r\n/g,'\n').split('\n');parts.forEach((part,i)=>{if(i)frag.append(document.createElement('br'));frag.append(document.createTextNode(part))});return frag}
function applyAiText(mode='replace'){
  const text=$('#aiPreview').value.trim();if(!text)return;
  if(mode==='append'){editor.insertAdjacentHTML('beforeend',`<p>${esc(text).replace(/\n/g,'<br>')}</p>`)}
  else if(lastAiTarget?.selected&&lastAiTarget.range){
    const range=lastAiTarget.range;try{range.deleteContents();range.insertNode(fragmentFromText(text))}catch{editor.innerHTML=plainToHtml(text)}
  }else editor.innerHTML=plainToHtml(text);
  $('#aiResult').hidden=true;persistLocal();editor.focus();
}
async function runAi(){
  if(!session){$('#aiStatus').textContent='AI 편집은 Google 로그인 후 사용할 수 있습니다. 직접 편집과 로컬 저장은 계속 가능합니다.';return}
  captureSelection();
  const source=selectedText||(editor.innerText||'').trim();if(!source){$('#aiStatus').textContent='편집할 내용이 없습니다.';return}
  const button=$('#runAi');button.disabled=true;$('#aiStatus').textContent='문맥을 읽고 편집 제안을 준비하고 있습니다.';
  lastAiTarget={selected:Boolean(selectedText),range:savedRange?savedRange.cloneRange():null};
  try{
    const response=await fetch(AI_URL,{method:'POST',headers:{authorization:`Bearer ${session.access_token}`,apikey:cfg.supabasePublishableKey,'content-type':'application/json'},body:JSON.stringify({operation:aiOperation,text:source,instruction:$('#aiInstruction').value,title:cleanTitle(titleInput.value),scope:selectedText?'selection':'document'})});
    const data=await response.json().catch(()=>({}));
    if(!response.ok)throw new Error(data?.message||data?.error||`AI ${response.status}`);
    $('#aiPreview').value=String(data.text||'').trim();$('#aiMode').textContent=data.providerMode==='ai'?'AI 결과':'보조 결과';$('#aiResult').hidden=false;$('#aiStatus').textContent='제안을 확인한 뒤 적용하거나 취소하세요.';
  }catch(error){console.error('document ai',error);$('#aiStatus').textContent=`AI 제안을 만들지 못했습니다: ${error.message}`}
  finally{button.disabled=false}
}
async function importFile(file){
  const name=file.name||'문서',ext=(name.split('.').pop()||'').toLowerCase();let html='',format=ext||'txt';
  if(ext==='docx'){
    const mammoth=await import('https://cdn.jsdelivr.net/npm/mammoth@1.9.1/+esm');
    const buffer=await file.arrayBuffer(),result=await mammoth.convertToHtml({arrayBuffer:buffer});html=result.value;
  }else{
    const text=await file.text();
    if(ext==='html'||ext==='htm')html=text;
    else if(ext==='md'||ext==='markdown')html=markdownToHtml(text);
    else html=plainToHtml(text);
  }
  current={id:localId(),cloudId:'',sourceFormat:format,updatedAt:nowIso()};titleInput.value=name.replace(/\.[^.]+$/,'')||'가져온 문서';editor.innerHTML=sanitizeHtml(html);persistLocal();
}
function downloadBlob(blob,name){const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download=name;document.body.append(a);a.click();setTimeout(()=>{URL.revokeObjectURL(a.href);a.remove()},500)}
async function exportDocx(){
  const mod=await import('https://cdn.jsdelivr.net/npm/docx@8.5.0/+esm');
  const blocks=[];
  for(const el of [...editor.children]){
    const text=(el.innerText||el.textContent||'').trimEnd(),tag=el.tagName.toLowerCase();
    if(!text&&tag!=='p')continue;
    const opts={text};
    if(tag==='h1')opts.heading=mod.HeadingLevel.HEADING_1;
    else if(tag==='h2')opts.heading=mod.HeadingLevel.HEADING_2;
    else if(tag==='h3')opts.heading=mod.HeadingLevel.HEADING_3;
    blocks.push(new mod.Paragraph(opts));
  }
  const doc=new mod.Document({sections:[{properties:{},children:blocks.length?blocks:[new mod.Paragraph('')]}]});
  downloadBlob(await mod.Packer.toBlob(doc),`${slug(titleInput.value)}.docx`);
}
async function exportFile(kind){
  persistLocal();const name=slug(titleInput.value);
  if(kind==='pdf'){window.print();return}
  if(kind==='docx'){try{await exportDocx()}catch(error){alert(`DOCX 내보내기 실패: ${error.message}`)}return}
  let text='',type='text/plain;charset=utf-8',ext=kind;
  if(kind==='html'){text=`<!doctype html><html lang="ko"><head><meta charset="utf-8"><title>${esc(cleanTitle(titleInput.value))}</title></head><body>${sanitizeHtml(editor.innerHTML)}</body></html>`;type='text/html;charset=utf-8'}
  else if(kind==='md'){text=htmlToMarkdown();type='text/markdown;charset=utf-8'}
  else{text=editor.innerText||'';ext='txt'}
  downloadBlob(new Blob([text],{type}),`${name}.${ext}`);
}
function exec(command,value=null){editor.focus();document.execCommand(command,false,value);scheduleSave()}
function insertTable(){
  const rows=Math.min(20,Math.max(1,Number(prompt('행 수','3')||0))),cols=Math.min(12,Math.max(1,Number(prompt('열 수','3')||0)));if(!rows||!cols)return;
  const html=`<table><tbody>${Array.from({length:rows},()=>`<tr>${Array.from({length:cols},()=>'<td><br></td>').join('')}</tr>`).join('')}</tbody></table><p><br></p>`;exec('insertHTML',html);
}
function insertLink(){const href=prompt('링크 주소','https://');if(href&&/^https?:\/\//i.test(href))exec('createLink',href)}
document.addEventListener('selectionchange',captureSelection);
editor.addEventListener('input',()=>{updateMeta();scheduleSave()});
titleInput.addEventListener('input',scheduleSave);
$('#newDoc').addEventListener('click',newDocument);
$('#saveCloud').addEventListener('click',()=>void saveCloud(true));
$('#authButton').addEventListener('click',()=>void authAction());
$('#fileInput').addEventListener('change',async e=>{const file=e.target.files?.[0];if(!file)return;try{await importFile(file)}catch(error){alert(`파일을 가져오지 못했습니다: ${error.message}`)}finally{e.target.value=''}});
document.querySelectorAll('[data-command]').forEach(button=>button.addEventListener('click',()=>exec(button.dataset.command)));
$('#blockType').addEventListener('change',e=>exec('formatBlock',e.target.value));
$('#insertTable').addEventListener('click',insertTable);$('#insertLink').addEventListener('click',insertLink);
$('#exportToggle').addEventListener('click',()=>{$('#exportChoices').hidden=!$('#exportChoices').hidden});
document.querySelectorAll('[data-export]').forEach(button=>button.addEventListener('click',()=>{void exportFile(button.dataset.export);$('#exportChoices').hidden=true}));
document.querySelectorAll('[data-ai-operation]').forEach(button=>button.addEventListener('click',()=>{aiOperation=button.dataset.aiOperation;document.querySelectorAll('[data-ai-operation]').forEach(x=>x.classList.toggle('active',x===button))}));
$('#runAi').addEventListener('click',()=>void runAi());$('#applyAi').addEventListener('click',()=>applyAiText('replace'));$('#appendAi').addEventListener('click',()=>applyAiText('append'));$('#dismissAi').addEventListener('click',()=>{$('#aiResult').hidden=true});
localDocs=readLocal();if(localDocs.length)openRow(localDocs[0],false);else newDocument();
document.querySelector('[data-ai-operation="proofread"]').classList.add('active');
if(enabled){
  try{await handoff()}catch(error){console.error('document auth handoff',error)}
  const {data}=await sb.auth.getSession();session=data.session;authUi();await loadCloud();
  sb.auth.onAuthStateChange(async(_event,next)=>{session=next;authUi();await loadCloud()});
}else authUi();
updateMeta();captureSelection();
