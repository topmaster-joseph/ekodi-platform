const cfg=window.EKODI_MY_CONFIG||{};
const API='https://api.ekodi.kr/api/entitlements';
const VENDOR=new URL('./vendor/',import.meta.url).toString();
const HISTORY_KEY='ekodi.presentation.recent.v1';
const NOTE_PREFIX='ekodi.presentation.note.v1:';
const $=selector=>document.querySelector(selector);
const state={catalog:[],tier:'free',caps:{},session:null,deck:null,index:0,activeAdapter:null};
const coreDefaults={
  'presentation.open':true,'presentation.pptx':true,'presentation.pdf':true,'presentation.docx':true,
  'presentation.hwp':true,'presentation.spreadsheet':true,'presentation.text':true,'presentation.image':true,
  'presentation.fullscreen':true,'presentation.history':true,'presentation.speaker-notes':true,
  'presentation.multi-file':false,'presentation.max-file-mb':25,'presentation.max-units':150,'presentation.max-recent':5,
};
function cap(id,fallback=false){const value=state.caps[id]?.value;return value===undefined?(coreDefaults[id]??fallback):value}
function setStatus(message,tone=''){$('#uploadStatus').textContent=message;$('#uploadStatus').className=`status ${tone}`.trim()}
function busy(on,text='파일을 읽는 중입니다.'){$('#busy').hidden=!on;$('#busyText').textContent=text}
function escapeHtml(value){return String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))}
function extOf(file){return String(file?.name||'').split('.').pop()?.toLowerCase()||''}
function fileCapability(file){const ext=extOf(file);if(ext==='pptx')return'presentation.pptx';if(ext==='pdf')return'presentation.pdf';if(ext==='docx')return'presentation.docx';if(['hwp','hwpx'].includes(ext))return'presentation.hwp';if(['xlsx','xls','csv'].includes(ext))return'presentation.spreadsheet';if(['txt','md','markdown','html','htm'].includes(ext))return'presentation.text';if(String(file?.type||'').startsWith('image/'))return'presentation.image';return''}
async function loadEntitlements(){
  try{
    const catalogResponse=await fetch(`${API}/catalog`,{cache:'no-store'});const catalogData=await catalogResponse.json();
    state.catalog=Array.isArray(catalogData.catalog)?catalogData.catalog:[];
    for(const item of state.catalog)state.caps[item.id]={value:item.defaults?.[0],source:'tier:free'};
  }catch{for(const [id,value] of Object.entries(coreDefaults))state.caps[id]={value,source:'fallback:free'}}
  if(cfg.dataEnabled&&cfg.supabaseUrl&&cfg.supabasePublishableKey){
    try{
      const {createClient}=await import('https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm');
      const sb=createClient(cfg.supabaseUrl,cfg.supabasePublishableKey,{auth:{persistSession:true,detectSessionInUrl:false}});
      const {data}=await sb.auth.getSession();state.session=data.session||null;
      if(state.session){
        const workspace=new URLSearchParams(location.search).get('workspace')||'';
        const query=workspace?`?workspace=${encodeURIComponent(workspace)}`:'';
        const response=await fetch(`${API}/me${query}`,{headers:{authorization:`Bearer ${state.session.access_token}`},cache:'no-store'});
        if(response.ok){const data=await response.json();state.tier=data.tier||'free';state.caps=data.capabilities||state.caps}
      }
    }catch(error){console.warn('[Presentation] entitlement session',error)}
  }
  renderEntitlementUi();renderRecent();
}
function renderEntitlementUi(){
  $('#tierBadge').textContent=String(state.tier||'free').toUpperCase();
  const mb=Number(cap('presentation.max-file-mb',25)),units=Number(cap('presentation.max-units',150));
  $('#limitText').textContent=`파일당 ${mb}MB · 최대 ${units.toLocaleString()}개 단위${cap('presentation.multi-file')?' · 여러 파일 통합 가능':''}`;
  const rows=[['PPTX','presentation.pptx'],['PDF','presentation.pdf'],['DOCX','presentation.docx'],['HWP/HWPX','presentation.hwp'],['XLSX/CSV','presentation.spreadsheet'],['TXT/MD/HTML','presentation.text'],['IMAGE','presentation.image']];
  $('#formatGrid').innerHTML=rows.map(([label,id])=>`<span class="${cap(id)?'':'locked'}">${escapeHtml(label)}</span>`).join('');
  $('#notesPanel').hidden=!cap('presentation.speaker-notes');
}
function sanitizeHtml(input){
  const doc=new DOMParser().parseFromString(String(input||''),'text/html');
  doc.querySelectorAll('script,iframe,object,embed,form,input,button,meta,link').forEach(node=>node.remove());
  doc.body.querySelectorAll('*').forEach(node=>{for(const attr of [...node.attributes]){const name=attr.name.toLowerCase(),value=attr.value.trim().toLowerCase();if(name.startsWith('on')||name==='srcdoc'||((name==='href'||name==='src')&&value.startsWith('javascript:'))||(name==='src'&&!value.startsWith('data:')&&!value.startsWith('blob:')))node.removeAttribute(attr.name)}});
  return doc.body.innerHTML;
}
function markdownToHtml(md){
  const lines=String(md||'').replace(/\r\n/g,'\n').split('\n');let html='',list=false;
  const close=()=>{if(list){html+='</ul>';list=false}};
  for(const raw of lines){const line=raw.trimEnd();if(!line.trim()){close();continue}let m;if((m=line.match(/^(#{1,3})\s+(.+)$/))){close();html+=`<h${m[1].length}>${escapeHtml(m[2])}</h${m[1].length}>`;continue}if((m=line.match(/^[-*]\s+(.+)$/))){if(!list){html+='<ul>';list=true}html+=`<li>${escapeHtml(m[1])}</li>`;continue}close();html+=`<p>${escapeHtml(line)}</p>`}close();return html;
}
function textToUnits(text,title='문서'){
  const clean=String(text||'').replace(/\r/g,'').trim();if(!clean)return[{title,html:'<p>표시할 내용이 없습니다.</p>'}];
  const blocks=clean.split(/\n{2,}/).filter(Boolean);const units=[];let bucket=[];let chars=0;
  for(const block of blocks){if(chars+block.length>900&&bucket.length){units.push({title,html:bucket.map(v=>`<p>${escapeHtml(v).replace(/\n/g,'<br>')}</p>`).join('')});bucket=[];chars=0}bucket.push(block);chars+=block.length}
  if(bucket.length)units.push({title,html:bucket.map(v=>`<p>${escapeHtml(v).replace(/\n/g,'<br>')}</p>`).join('')});return units;
}
function htmlToUnits(html,title='문서'){
  const safe=sanitizeHtml(html),doc=new DOMParser().parseFromString(safe,'text/html'),units=[];let current=[];let currentTitle=title;
  const flush=()=>{if(!current.length)return;units.push({title:currentTitle,html:current.map(node=>node.outerHTML||escapeHtml(node.textContent)).join('')});current=[]};
  for(const node of [...doc.body.children]){if(/^H[1-3]$/.test(node.tagName)&&current.length){flush();currentTitle=(node.textContent||title).trim()}current.push(node.cloneNode(true));if((current.map(n=>n.textContent||'').join('').length)>1100)flush()}
  flush();return units.length?units:textToUnits(doc.body.textContent||'',title);
}
const scriptLoads=new Map();
function loadScript(src,ready){
  if(ready?.())return Promise.resolve();if(scriptLoads.has(src))return scriptLoads.get(src);
  const task=new Promise((resolve,reject)=>{const script=document.createElement('script');script.src=src;script.async=true;script.onload=()=>ready&&!ready()?reject(new Error(`${src} 초기화 실패`)):resolve();script.onerror=()=>reject(new Error(`${src} 로드 실패`));document.head.append(script)});
  scriptLoads.set(src,task);return task;
}
function unitAdapter(file,format,units){
  return{file,format,count:units.length,async render(index,host){host.innerHTML='';const unit=units[index]||units[0];const slide=document.createElement('article');slide.className='doc-slide';slide.innerHTML=`${unit.title?`<h2>${escapeHtml(unit.title)}</h2>`:''}${sanitizeHtml(unit.html)}`;host.append(slide)},deactivate(){},destroy(){}};
}
async function pptxAdapter(file){
  const mod=await import(`${VENDOR}pptx-renderer-1.2.4.js`),buffer=await file.arrayBuffer();
  const files=await mod.parseZip(buffer,mod.RECOMMENDED_ZIP_LIMITS),presentation=mod.buildPresentation(files);let viewer=null;
  return{file,format:'PPTX',count:presentation.slides?.length||0,async render(index,host){if(!viewer){host.innerHTML='';viewer=new mod.PptxViewer(host,{fitMode:'contain',lazyMedia:true,lazySlides:true,pdfjs:false});viewer.load(presentation)}await viewer.renderSlide(index)},deactivate(){viewer?.destroy();viewer=null},destroy(){viewer?.destroy();viewer=null}};
}
async function pdfAdapter(file){
  const pdfjs=await import(`${VENDOR}pdf-6.3.289.mjs`);pdfjs.GlobalWorkerOptions.workerSrc=`${VENDOR}pdf.worker-6.3.289.mjs`;
  const documentTask=pdfjs.getDocument({data:new Uint8Array(await file.arrayBuffer())}),pdf=await documentTask.promise;
  return{file,format:'PDF',count:pdf.numPages,async render(index,host){host.innerHTML='';const page=await pdf.getPage(index+1),base=page.getViewport({scale:1});const width=Math.max(320,host.clientWidth-36),height=Math.max(320,host.clientHeight-36),scale=Math.min(width/base.width,height/base.height,2);const viewport=page.getViewport({scale}),canvas=document.createElement('canvas'),ctx=canvas.getContext('2d');canvas.width=Math.ceil(viewport.width);canvas.height=Math.ceil(viewport.height);host.append(canvas);await page.render({canvasContext:ctx,viewport}).promise},deactivate(){},destroy(){pdf.destroy?.();documentTask.destroy?.()}};
}
async function docxAdapter(file){
  await loadScript(`${VENDOR}mammoth-1.12.3.min.js`,()=>Boolean(window.mammoth));
  const buffer=await file.arrayBuffer(),result=await window.mammoth.convertToHtml({arrayBuffer:buffer});
  let units=htmlToUnits(result.value,file.name.replace(/\.[^.]+$/,''));
  if(!units.length){const raw=await window.mammoth.extractRawText({arrayBuffer:buffer});units=textToUnits(raw.value,file.name)}
  return unitAdapter(file,'DOCX',units);
}
async function hwpAdapter(file){
  const mod=await import(`${VENDOR}hwpxjs-0.4.0.mjs`),bytes=new Uint8Array(await file.arrayBuffer()),title=file.name.replace(/\.[^.]+$/,'');
  if(extOf(file)==='hwp')return unitAdapter(file,'HWP',textToUnits(await mod.hwpToText(bytes),title));
  const reader=new mod.default();await reader.loadFromArrayBuffer(bytes.buffer);let html='';
  try{html=await reader.extractHtml({paragraphTag:'p',renderImages:true,renderTables:true,renderStyles:false,embedImages:true})}catch{html=''}
  if(html)return unitAdapter(file,'HWPX',htmlToUnits(html,title));
  return unitAdapter(file,'HWPX',textToUnits(await reader.extractText(),title));
}
async function sheetAdapter(file){
  await loadScript(`${VENDOR}xlsx-0.18.5.min.js`,()=>Boolean(window.XLSX));
  const workbook=window.XLSX.read(await file.arrayBuffer(),{type:'array'}),sheets=workbook.SheetNames.map(name=>({name,rows:window.XLSX.utils.sheet_to_json(workbook.Sheets[name],{header:1,raw:false,defval:''})}));
  return{file,format:extOf(file).toUpperCase(),count:sheets.length,async render(index,host){host.innerHTML='';const sheet=sheets[index],article=document.createElement('article');article.className='sheet-slide';const rows=sheet.rows.slice(0,50),cols=Math.min(18,Math.max(1,...rows.map(row=>row.length)));article.innerHTML=`<h2>${escapeHtml(sheet.name)}</h2><table><tbody>${rows.map(row=>`<tr>${Array.from({length:cols},(_,i)=>`<td>${escapeHtml(row[i]??'')}</td>`).join('')}</tr>`).join('')}</tbody></table>${sheet.rows.length>50?`<p>화면에는 첫 50행을 표시합니다. 전체 ${sheet.rows.length.toLocaleString()}행</p>`:''}`;host.append(article)},deactivate(){},destroy(){}};
}
async function textAdapter(file){
  const text=await file.text(),ext=extOf(file),title=file.name.replace(/\.[^.]+$/,'');
  if(['html','htm'].includes(ext))return unitAdapter(file,'HTML',htmlToUnits(text,title));
  if(['md','markdown'].includes(ext))return unitAdapter(file,'MARKDOWN',htmlToUnits(markdownToHtml(text),title));
  return unitAdapter(file,'TEXT',textToUnits(text,title));
}
async function imageAdapter(file){
  const url=URL.createObjectURL(file);return{file,format:'IMAGE',count:1,async render(_index,host){host.innerHTML='';const img=document.createElement('img');img.className='presentation-image';img.alt=file.name;img.src=url;host.append(img)},deactivate(){},destroy(){URL.revokeObjectURL(url)}};
}
async function buildAdapter(file){
  const ext=extOf(file);if(ext==='pptx')return pptxAdapter(file);if(ext==='pdf')return pdfAdapter(file);if(ext==='docx')return docxAdapter(file);if(['hwp','hwpx'].includes(ext))return hwpAdapter(file);if(['xlsx','xls','csv'].includes(ext))return sheetAdapter(file);if(['txt','md','markdown','html','htm'].includes(ext))return textAdapter(file);if(String(file.type||'').startsWith('image/'))return imageAdapter(file);throw new Error(`${file.name}: 지원하지 않는 파일 형식입니다.`)
}
function validateFiles(files){
  if(!files.length)throw new Error('발표할 파일을 선택해 주세요.');if(!cap('presentation.open'))throw new Error('현재 계정에서는 바로 발표 기능을 사용할 수 없습니다.');
  if(files.length>1&&!cap('presentation.multi-file'))throw new Error('여러 파일 통합 발표는 현재 회원등급에서 사용할 수 없습니다. 파일을 하나씩 발표해 주세요.');
  const maxBytes=Number(cap('presentation.max-file-mb',25))*1024*1024;
  for(const file of files){const capability=fileCapability(file);if(!capability)throw new Error(`${file.name}: 지원하지 않는 파일 형식입니다.`);if(!cap(capability))throw new Error(`${file.name}: 현재 회원등급에서 이 형식을 사용할 수 없습니다.`);if(file.size>maxBytes)throw new Error(`${file.name}: 파일 크기가 ${cap('presentation.max-file-mb')}MB 한도를 초과합니다.`)}
}
async function createDeck(files){
  validateFiles(files);const adapters=[];for(const file of files){busy(true,`${file.name} 읽는 중`);adapters.push(await buildAdapter(file))}
  const count=adapters.reduce((sum,item)=>sum+item.count,0);if(!count)throw new Error('발표할 내용을 찾지 못했습니다.');if(count>Number(cap('presentation.max-units',150)))throw new Error(`발표 단위가 ${cap('presentation.max-units')}개 한도를 초과합니다.`);
  const ranges=[];let cursor=0;for(const adapter of adapters){ranges.push({adapter,start:cursor,end:cursor+adapter.count-1});cursor+=adapter.count}
  return{id:files.map(file=>`${file.name}:${file.size}:${file.lastModified}`).join('|'),title:files.length===1?files[0].name:`${files[0].name} 외 ${files.length-1}개`,format:[...new Set(adapters.map(item=>item.format))].join(' + '),count,adapters,ranges,async render(index,host){const range=ranges.find(item=>index>=item.start&&index<=item.end);if(!range)return;if(state.activeAdapter&&state.activeAdapter!==range.adapter)state.activeAdapter.deactivate?.();state.activeAdapter=range.adapter;await range.adapter.render(index-range.start,host)},destroy(){for(const adapter of adapters)adapter.destroy?.()}};
}
async function showIndex(index){
  if(!state.deck)return;state.index=Math.min(state.deck.count-1,Math.max(0,index));busy(true,`${state.index+1} / ${state.deck.count} 표시 중`);
  try{await state.deck.render(state.index,$('#stageInner'));$('#counter').textContent=`${state.index+1} / ${state.deck.count}`;$('#prev').disabled=state.index===0;$('#next').disabled=state.index===state.deck.count-1}
  finally{busy(false)}
}
function recentRows(){try{const rows=JSON.parse(localStorage.getItem(HISTORY_KEY)||'[]');return Array.isArray(rows)?rows:[]}catch{return[]}}
function saveRecent(deck){
  if(!cap('presentation.history'))return;const row={title:deck.title,format:deck.format,count:deck.count,openedAt:new Date().toISOString()},max=Math.max(1,Number(cap('presentation.max-recent',5)));const rows=[row,...recentRows().filter(item=>item.title!==row.title)].slice(0,max);localStorage.setItem(HISTORY_KEY,JSON.stringify(rows));renderRecent()
}
function renderRecent(){
  const host=$('#recentList');if(!cap('presentation.history')){host.innerHTML='<p>현재 회원등급에서는 최근 발표 기록을 저장하지 않습니다.</p>';return}const rows=recentRows().slice(0,Number(cap('presentation.max-recent',5)));
  host.innerHTML=rows.length?rows.map(row=>`<div class="recent-item"><div><strong>${escapeHtml(row.title)}</strong><br><small>${escapeHtml(row.format)} · ${Number(row.count||0)}개 단위</small></div><small>${new Date(row.openedAt).toLocaleString('ko-KR')}</small></div>`).join(''):'<p>아직 기록이 없습니다.</p>';
}
function noteKey(){return state.deck?NOTE_PREFIX+encodeURIComponent(state.deck.id):''}
function loadNotes(){const key=noteKey();$('#speakerNotes').value=key?localStorage.getItem(key)||'':''}
function saveNotes(){const key=noteKey();if(key&&cap('presentation.speaker-notes'))localStorage.setItem(key,$('#speakerNotes').value.slice(0,12000))}
async function openFiles(list){
  const files=[...list];setStatus('파일을 확인하고 있습니다.');busy(true);
  try{state.deck?.destroy?.();state.activeAdapter=null;state.deck=await createDeck(files);state.index=0;$('#deckTitle').textContent=state.deck.title;$('#formatLabel').textContent=state.deck.format;$('#uploadPanel').hidden=true;$('#presenter').hidden=false;loadNotes();saveRecent(state.deck);await showIndex(0);setStatus('발표 준비 완료','ok')}
  catch(error){console.error('[Presentation]',error);setStatus(error.message||'발표를 준비하지 못했습니다.','error');$('#uploadPanel').hidden=false;$('#presenter').hidden=true}
  finally{busy(false)}
}
function resetDeck(){state.deck?.destroy?.();state.deck=null;state.activeAdapter=null;state.index=0;$('#stageInner').innerHTML='';$('#presenter').hidden=true;$('#uploadPanel').hidden=false;$('#fileInput').value='';setStatus('원본은 발표를 위해 서버에 업로드하지 않습니다.')}
async function toggleFullscreen(){
  if(!cap('presentation.fullscreen'))return setStatus('현재 회원등급에서는 전체화면 발표를 사용할 수 없습니다.','error');
  if(!document.fullscreenElement){await document.documentElement.requestFullscreen?.();document.body.classList.add('presentation-fullscreen')}else await document.exitFullscreen?.();
}
$('#fileInput').addEventListener('change',event=>{if(event.target.files?.length)void openFiles(event.target.files)});
$('#dropZone').addEventListener('keydown',event=>{if(event.key==='Enter'||event.key===' '){event.preventDefault();$('#fileInput').click()}});
for(const type of ['dragenter','dragover'])$('#dropZone').addEventListener(type,event=>{event.preventDefault();$('#dropZone').classList.add('drag')});
for(const type of ['dragleave','drop'])$('#dropZone').addEventListener(type,event=>{event.preventDefault();$('#dropZone').classList.remove('drag')});
$('#dropZone').addEventListener('drop',event=>{if(event.dataTransfer?.files?.length)void openFiles(event.dataTransfer.files)});
$('#prev').addEventListener('click',()=>void showIndex(state.index-1));$('#next').addEventListener('click',()=>void showIndex(state.index+1));
$('#newDeck').addEventListener('click',resetDeck);$('#fullscreen').addEventListener('click',()=>void toggleFullscreen());
$('#speakerNotes').addEventListener('input',()=>{clearTimeout(window.__ekodiPresentationNoteTimer);window.__ekodiPresentationNoteTimer=setTimeout(saveNotes,300)});
document.addEventListener('fullscreenchange',()=>{document.body.classList.toggle('presentation-fullscreen',Boolean(document.fullscreenElement));if(state.deck)void showIndex(state.index)});
document.addEventListener('keydown',event=>{if(!state.deck||event.target.matches('textarea,input,select'))return;if(['ArrowRight','PageDown',' '].includes(event.key)){event.preventDefault();void showIndex(state.index+1)}else if(['ArrowLeft','PageUp'].includes(event.key)){event.preventDefault();void showIndex(state.index-1)}else if(event.key.toLowerCase()==='f'){event.preventDefault();void toggleFullscreen()}else if(event.key==='Escape'&&!document.fullscreenElement)resetDeck()});
window.addEventListener('beforeunload',()=>{saveNotes();state.deck?.destroy?.()});
await loadEntitlements();
