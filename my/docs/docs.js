import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm';
import { createHwpxBlob, editorToHwpxBlocks, importHwpx } from './hwpx.js';

const cfg=window.EKODI_MY_CONFIG||{};
const enabled=Boolean(cfg.dataEnabled&&cfg.supabaseUrl&&cfg.supabasePublishableKey);
const sb=enabled?createClient(cfg.supabaseUrl,cfg.supabasePublishableKey,{auth:{detectSessionInUrl:true,persistSession:true}}):null;
const authUrl=cfg.authUrl||'https://ekodi.kr/auth/?site=my';
const AI_URL=enabled?`${cfg.supabaseUrl}/functions/v1/document-ai-api`:'';
const LOCAL_KEY='ekodi.docs.v1';
const $=s=>document.querySelector(s);
const editor=$('#editor'),titleInput=$('#titleInput'),docList=$('#docList'),saveState=$('#saveState');
let session=null,cloudDocs=[],localDocs=[],versions=[],current={id:'',cloudId:'',sourceFormat:'ekodi',updatedAt:new Date().toISOString()};
const pageParams=new URLSearchParams(location.search),requestedDocId=pageParams.get('doc')||'',readOnlyView=pageParams.get('view')==='1';
let requestedDocOpened=false;
let savedRange=null,selectedText='',aiOperation='proofread',lastAiTarget=null,saveTimer=null,draggedBlock=null,fileDragDepth=0;

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
  doc.querySelectorAll('script,style,iframe,object,embed,form,input,button,meta,link,[data-ekodi-drag-handle]').forEach(node=>node.remove());
  doc.body.querySelectorAll('*').forEach(node=>{
    for(const attr of [...node.attributes]){
      const name=attr.name.toLowerCase(),value=attr.value.trim().toLowerCase();
      if(name.startsWith('on')||name==='srcdoc'||((name==='href'||name==='src')&&value.startsWith('javascript:')))node.removeAttribute(attr.name);
      if(name==='style'||name==='draggable'||name==='data-ekodi-block')node.removeAttribute(attr.name);
    }
    node.classList.remove('ekodi-doc-block','ekodi-block-dragging','ekodi-drop-before','ekodi-drop-after');
    if(!node.className)node.removeAttribute('class');
  });
  return doc.body.innerHTML;
}
function editorPlainText(){
  const clone=editor.cloneNode(true);clone.querySelectorAll('[data-ekodi-drag-handle]').forEach(node=>node.remove());return (clone.innerText||clone.textContent||'').trim();
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
function decorateBlocks(){
  for(const block of [...editor.children]){
    block.dataset.ekodiBlock='true';block.classList.add('ekodi-doc-block');
    if(['TABLE','UL','OL'].includes(block.tagName)){block.draggable=true;block.title='드래그하여 블록 이동';continue}
    if(!block.querySelector(':scope > [data-ekodi-drag-handle]')){const handle=document.createElement('span');handle.dataset.ekodiDragHandle='true';handle.contentEditable='false';handle.draggable=true;handle.tabIndex=0;handle.setAttribute('role','button');handle.setAttribute('aria-label','이 블록 이동');handle.title='드래그하여 이동';block.prepend(handle)}
  }
}
function ensureEditorVisible({focus=false}={}){editor.hidden=false;editor.removeAttribute('aria-hidden');editor.classList.add('document-ready');const wrap=$('#pageWrap');if(wrap){wrap.classList.add('has-document');wrap.scrollTop=0}if(!editor.innerHTML.trim())editor.innerHTML='<p><br></p>';decorateBlocks();updateMeta();if(focus)editor.focus()}
function setEditorHtml(html,{fallbackText='',focus=false}={}){const safe=sanitizeHtml(html);editor.innerHTML=safe||plainToHtml(fallbackText);if(!editorPlainText()&&String(fallbackText||'').trim())editor.innerHTML=plainToHtml(fallbackText);ensureEditorVisible({focus});return editorPlainText().length}
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
function updateMeta(){const text=editorPlainText().replace(/\s+/g,' ').trim();$('#wordCount').textContent=`${text.length.toLocaleString()}자`;$('#updatedAt').textContent=humanTime(current.updatedAt);$('#formatBadge').textContent=String(current.sourceFormat||'EKODI').toUpperCase()}
function newDocument(){
  current={id:localId(),cloudId:'',sourceFormat:'ekodi',updatedAt:nowIso()};titleInput.value='제목 없는 문서';setEditorHtml('<h1>새 문서</h1><p>내용을 입력하세요.</p>',{focus:true});persistLocal()
}
function openRow(row,cloud=false){
  current={id:cloud?`cloud-${row.id}`:row.id,cloudId:cloud?row.id:(row.cloud_id||''),sourceFormat:row.source_format||'ekodi',updatedAt:row.updated_at||nowIso()};
  titleInput.value=row.title||'제목 없는 문서';setEditorHtml(row.content_html||'<p><br></p>');renderList();captureSelection();if(!$('#versionPanel').hidden)void loadVersions()
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
  $('#historyToggle').disabled=!session;
  if(!session){versions=[];$('#versionPanel').hidden=true;}
}
async function authAction(){
  if(!enabled)return;
  if(!session){const target=new URL(authUrl);target.searchParams.set('return_to',location.href.split('#')[0]);location.assign(target.href);return}
  await sb.auth.signOut();session=null;cloudDocs=[];authUi();renderList();setState('로컬 자동저장');
}
async function loadCloud(){
  if(!session||!sb){cloudDocs=[];renderList();return}
  const {data,error}=await sb.from('document_files').select('id,title,content_html,source_format,workspace_key,source_storage_path,updated_at').order('updated_at',{ascending:false}).limit(60);
  if(error){console.error('document load',error);setState('계정 문서 불러오기 실패','error');return}
  cloudDocs=data||[];renderList();
  if(requestedDocId&&!requestedDocOpened){const row=cloudDocs.find(item=>String(item.id)===String(requestedDocId));if(row){requestedDocOpened=true;openRow(row,true)}}
}
function applyReadOnlyView(){
  if(!readOnlyView)return;
  editor.contentEditable='false';titleInput.readOnly=true;document.body.dataset.docsView='readonly';
  document.querySelectorAll('[data-command],#insertTable,#insertLink,#runAi,#applyAi,#appendAi,#saveCloud,#fileInput,#newDoc').forEach(node=>{node.disabled=true;node.setAttribute?.('aria-disabled','true')});
  setState('읽기 전용 웹 보기','ok');
}
async function saveCloud(version=true){
  if(!session||!sb){setState('로그인 후 계정 저장 가능','error');return}
  const snap=snapshotCurrent(),payload={owner_user_id:session.user.id,workspace_key:`personal:${session.user.id}`,title:snap.title,content_html:snap.content_html,source_format:snap.source_format,updated_at:nowIso()};
  setState('계정 저장 중…');
  if(current.cloudId&&version){
    const previous=cloudDocs.find(row=>row.id===current.cloudId);
    if(previous){
      const {error:versionError}=await sb.from('document_versions').insert({document_id:previous.id,owner_user_id:session.user.id,title:previous.title,content_html:previous.content_html,source_format:previous.source_format});
      if(versionError)console.warn('document version snapshot',versionError);
    }
  }
  let data,error;
  if(current.cloudId)({data,error}=await sb.from('document_files').update(payload).eq('id',current.cloudId).select('*').single());
  else({data,error}=await sb.from('document_files').insert(payload).select('*').single());
  if(error){console.error('document save',error);setState('계정 저장 실패','error');return}
  current.cloudId=data.id;current.id=`cloud-${data.id}`;current.updatedAt=data.updated_at;
  localDocs=localDocs.filter(row=>row.id!==snap.id);writeLocal();
  setState('계정에 저장됨','ok');await loadCloud();updateMeta();
  if(!$('#versionPanel').hidden)await loadVersions();
}

async function loadVersions(){
  const panel=$('#versionPanel'),list=$('#versionList');
  if(!session||!current.cloudId){versions=[];list.innerHTML='<p class="muted">계정에 저장한 문서를 선택하면 버전 이력이 표시됩니다.</p>';return}
  list.innerHTML='<p class="muted">버전 이력을 불러오는 중입니다.</p>';
  const {data,error}=await sb.from('document_versions').select('id,document_id,title,content_html,source_format,created_at').eq('document_id',current.cloudId).order('created_at',{ascending:false}).limit(30);
  if(error){console.error('document versions',error);list.innerHTML='<p class="muted">버전 이력을 불러오지 못했습니다.</p>';return}
  versions=data||[];
  list.innerHTML=versions.length?versions.map(row=>`<button class="version-item" data-version-id="${esc(row.id)}" type="button"><strong>${esc(humanTime(row.created_at))}</strong><small>${esc(row.title||'제목 없는 문서')}</small></button>`).join(''):'<p class="muted">아직 이전 버전이 없습니다. 계정 저장 시 직전 상태를 보관합니다.</p>';
  list.querySelectorAll('[data-version-id]').forEach(button=>button.addEventListener('click',()=>restoreVersion(button.dataset.versionId)));
  panel.hidden=false;
}
function restoreVersion(id){
  const row=versions.find(item=>String(item.id)===String(id));if(!row)return;
  titleInput.value=row.title||'제목 없는 문서';setEditorHtml(row.content_html||'<p><br></p>',{focus:true});current.sourceFormat=row.source_format||'ekodi';current.updatedAt=nowIso();persistLocal();setState('이전 버전을 불러옴 · 저장 전','ok');
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
  $('#aiResult').hidden=true;ensureEditorVisible({focus:true});persistLocal();
}
async function runAi(){
  if(!session){$('#aiStatus').textContent='AI 편집은 Google 로그인 후 사용할 수 있습니다. 직접 편집과 로컬 저장은 계속 가능합니다.';return}
  captureSelection();
  const source=selectedText||editorPlainText();if(!source){$('#aiStatus').textContent='편집할 내용이 없습니다.';return}
  const button=$('#runAi');button.disabled=true;$('#aiStatus').textContent='문맥을 읽고 편집 제안을 준비하고 있습니다.';
  lastAiTarget={selected:Boolean(selectedText),range:savedRange?savedRange.cloneRange():null};
  try{
    const response=await fetch(AI_URL,{method:'POST',headers:{authorization:`Bearer ${session.access_token}`,apikey:cfg.supabasePublishableKey,'content-type':'application/json'},body:JSON.stringify({operation:aiOperation,text:source,instruction:$('#aiInstruction').value,title:cleanTitle(titleInput.value),scope:selectedText?'selection':'document'})});
    const data=await response.json().catch(()=>({}));
    if(!response.ok)throw new Error(data?.message||data?.error||`AI ${response.status}`);
    $('#aiPreview').value=String(data.text||'').trim();$('#aiMode').textContent=data.providerMode==='ai'?'AI 결과':'보조 결과';$('#aiResult').hidden=false;
    const chunking=data.chunking||{};$('#aiStatus').textContent=chunking.automatic?`긴 문서를 ${Number(chunking.chunks||1)}개 구간으로 자동 편집했습니다. 제안을 확인한 뒤 적용하세요.`:'제안을 확인한 뒤 적용하거나 취소하세요.';
    const usage=data.usage||{},provider=data.provider||{};
    $('#aiQuota').textContent=usage.dailyLimit?`오늘 ${Number(usage.today||0)}/${Number(usage.dailyLimit)} · ${String(provider.id||'AI')} ${String(provider.model||'').trim()}`.trim():'AI 사용량이 기록되었습니다.';
  }catch(error){console.error('document ai',error);$('#aiStatus').textContent=`AI 제안을 만들지 못했습니다: ${error.message}`}
  finally{button.disabled=false}
}
let mammothPromise=null;
async function getMammoth(){
  if(window.mammoth)return window.mammoth;
  if(!mammothPromise)mammothPromise=new Promise((resolve,reject)=>{const script=document.createElement('script');script.src='https://cdn.jsdelivr.net/npm/mammoth@1.9.1/mammoth.browser.min.js';script.async=true;script.onload=()=>window.mammoth?resolve(window.mammoth):reject(new Error('DOCX 변환기를 초기화하지 못했습니다.'));script.onerror=()=>reject(new Error('DOCX 변환기를 불러오지 못했습니다.'));document.head.appendChild(script)});
  return mammothPromise;
}
async function importFile(file){
  const name=file.name||'문서',ext=(name.split('.').pop()||'').toLowerCase();let html='',format=ext||'txt',importedTitle='';
  if(ext==='docx'){
    const mammoth=await getMammoth();
    const buffer=await file.arrayBuffer(),result=await mammoth.convertToHtml({arrayBuffer:buffer});html=result.value;
    const probe=new DOMParser().parseFromString(String(html||''),'text/html').body.textContent?.trim()||'';
    if(!probe){const raw=await mammoth.extractRawText({arrayBuffer:buffer});html=plainToHtml(raw.value||'')}
  }else if(ext==='hwpx'){
    const result=await importHwpx(file);html=result.html;format=result.sourceFormat;importedTitle=result.title||'';
  }else{
    const text=await file.text();
    if(ext==='html'||ext==='htm')html=text;
    else if(ext==='md'||ext==='markdown')html=markdownToHtml(text);
    else html=plainToHtml(text);
  }
  current={id:localId(),cloudId:'',sourceFormat:format,updatedAt:nowIso()};titleInput.value=importedTitle||name.replace(/\.[^.]+$/,'')||'가져온 문서';
  const count=setEditorHtml(html,{focus:true});if(!count)throw new Error('문서 본문을 읽지 못했습니다. 파일을 HWPX 또는 DOCX로 다시 저장한 뒤 가져와 주세요.');persistLocal();setState(`가져오기 완료 · ${count.toLocaleString()}자`,'ok');
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
  if(kind==='hwpx'){try{const blob=await createHwpxBlob({title:cleanTitle(titleInput.value),blocks:editorToHwpxBlocks(editor)});downloadBlob(blob,`${name}.hwpx`)}catch(error){alert(`HWPX 내보내기 실패: ${error.message}`)}return}
  let text='',type='text/plain;charset=utf-8',ext=kind;
  if(kind==='html'){text=`<!doctype html><html lang="ko"><head><meta charset="utf-8"><title>${esc(cleanTitle(titleInput.value))}</title></head><body>${sanitizeHtml(editor.innerHTML)}</body></html>`;type='text/html;charset=utf-8'}
  else if(kind==='md'){text=htmlToMarkdown();type='text/markdown;charset=utf-8'}
  else{text=editorPlainText();ext='txt'}
  downloadBlob(new Blob([text],{type}),`${name}.${ext}`);
}
function exec(command,value=null){editor.focus();document.execCommand(command,false,value);scheduleSave()}
function insertTable(){
  const rows=Math.min(20,Math.max(1,Number(prompt('행 수','3')||0))),cols=Math.min(12,Math.max(1,Number(prompt('열 수','3')||0)));if(!rows||!cols)return;
  const html=`<table><tbody>${Array.from({length:rows},()=>`<tr>${Array.from({length:cols},()=>'<td><br></td>').join('')}</tr>`).join('')}</tbody></table><p><br></p>`;exec('insertHTML',html);
}
function insertLink(){const href=prompt('링크 주소','https://');if(href&&/^https?:\/\//i.test(href))exec('createLink',href)}
const IMPORT_EXTENSIONS=new Set(['txt','md','markdown','html','htm','docx','hwpx']);
function importExtension(file){return String(file?.name||'').split('.').pop()?.toLowerCase()||''}
function showDropOverlay(active){const overlay=$('#dropOverlay'),wrap=$('#pageWrap');if(overlay){overlay.hidden=!active;overlay.setAttribute('aria-hidden',String(!active))}wrap?.classList.toggle('drop-active',active)}
async function importDroppedFiles(files){const accepted=[...files].filter(file=>IMPORT_EXTENSIONS.has(importExtension(file)));if(!accepted.length){setState('지원되는 문서 파일을 놓아 주세요.','error');return}for(const file of accepted)await importFile(file);setState(`${accepted.length}개 문서 가져오기 완료`,'ok')}
function clearBlockIndicators(){editor.querySelectorAll('.ekodi-drop-before,.ekodi-drop-after').forEach(node=>node.classList.remove('ekodi-drop-before','ekodi-drop-after'))}
function finishBlockDrag(){if(draggedBlock)draggedBlock.classList.remove('ekodi-block-dragging');draggedBlock=null;clearBlockIndicators()}
document.addEventListener('selectionchange',captureSelection);
editor.addEventListener('input',()=>{updateMeta();scheduleSave()});
titleInput.addEventListener('input',scheduleSave);
$('#newDoc').addEventListener('click',newDocument);
$('#saveCloud').addEventListener('click',()=>void saveCloud(true));
$('#historyToggle').addEventListener('click',async()=>{
  const panel=$('#versionPanel');
  if(!session){panel.hidden=true;return}
  if(!panel.hidden){panel.hidden=true;return}
  panel.hidden=false;await loadVersions();
});
$('#authButton').addEventListener('click',()=>void authAction());
$('#fileInput').addEventListener('change',async e=>{const file=e.target.files?.[0];if(!file)return;try{await importFile(file)}catch(error){alert(`파일을 가져오지 못했습니다: ${error.message}`)}finally{e.target.value=''}});
const pageWrap=$('#pageWrap');
pageWrap?.addEventListener('dragenter',e=>{if(Array.from(e.dataTransfer?.types||[]).includes('Files')){e.preventDefault();showDropOverlay(true)}});
pageWrap?.addEventListener('dragover',e=>{if(Array.from(e.dataTransfer?.types||[]).includes('Files')){e.preventDefault();if(e.dataTransfer)e.dataTransfer.dropEffect='copy';showDropOverlay(true)}});
pageWrap?.addEventListener('dragleave',e=>{if(!pageWrap.contains(e.relatedTarget))showDropOverlay(false)});
pageWrap?.addEventListener('drop',async e=>{if(e.dataTransfer?.files?.length){e.preventDefault();showDropOverlay(false);try{await importDroppedFiles(e.dataTransfer.files)}catch(error){setState(`가져오기 실패: ${error.message}`,'error')}}});
editor.addEventListener('dragstart',e=>{const handle=e.target.closest?.('[data-ekodi-drag-handle]'),whole=e.target.closest?.('[data-ekodi-block][draggable="true"]');const block=handle?.parentElement||whole;if(!block||!editor.contains(block))return;draggedBlock=block;block.classList.add('ekodi-block-dragging');if(e.dataTransfer){e.dataTransfer.effectAllowed='move';e.dataTransfer.setData('text/x-ekodi-block','move')}});
editor.addEventListener('dragover',e=>{if(!draggedBlock)return;const target=e.target.closest?.('[data-ekodi-block]');if(!target||target===draggedBlock)return;e.preventDefault();clearBlockIndicators();const rect=target.getBoundingClientRect(),after=e.clientY>rect.top+rect.height/2;target.classList.add(after?'ekodi-drop-after':'ekodi-drop-before');if(e.dataTransfer)e.dataTransfer.dropEffect='move'});
editor.addEventListener('drop',e=>{if(!draggedBlock)return;const target=e.target.closest?.('[data-ekodi-block]');if(!target||target===draggedBlock){finishBlockDrag();return}e.preventDefault();const after=target.classList.contains('ekodi-drop-after');target.parentNode.insertBefore(draggedBlock,after?target.nextSibling:target);finishBlockDrag();persistLocal();setState('블록 이동 · 자동저장','ok')});
editor.addEventListener('dragend',finishBlockDrag);editor.addEventListener('blur',decorateBlocks);
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
  const {data}=await sb.auth.getSession();session=data.session;authUi();await loadCloud();applyReadOnlyView();
  sb.auth.onAuthStateChange(async(_event,next)=>{session=next;authUi();await loadCloud();applyReadOnlyView()});
}else authUi();
updateMeta();captureSelection();
