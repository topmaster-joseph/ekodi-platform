const JSZIP_URL='https://cdn.jsdelivr.net/npm/jszip@3.10.1/+esm';
export const HWPX_MIMETYPE='application/hwp+zip';
export const HWPX_CONTRACT='ekodi.hwpx.v1';
export const HWPX_ROUNDTRIP_CONTRACT='ekodi.hwpx.roundtrip.v2';
const MAX_HWPX_BYTES=20*1024*1024;
const MAX_SECTION_CHARS=8*1024*1024;

const esc=value=>String(value??'').replace(/[&<>"']/g,char=>({
  '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&apos;'
})[char]);
const strip=value=>String(value??'').replace(/\u0000/g,'').trim();
const now=()=>new Date().toISOString();

async function zipCtor(provided){
  if(provided)return provided;
  const mod=await import(JSZIP_URL);
  return mod.default||mod;
}

export function editorToHwpxBlocks(root){
  const rows=[];
  for(const element of [...root.children]){
    const tag=element.tagName.toLowerCase();
    if(tag==='table'){
      for(const tr of element.querySelectorAll('tr')){
        rows.push({type:'paragraph',text:[...tr.children].map(cell=>(cell.innerText||'').trim()).join('\t')});
      }
      continue;
    }
    const text=(element.innerText||element.textContent||'').trimEnd();
    if(tag==='h1')rows.push({type:'heading1',text});
    else if(tag==='h2')rows.push({type:'heading2',text});
    else if(tag==='h3')rows.push({type:'heading3',text});
    else if(tag==='ul')for(const li of element.querySelectorAll(':scope > li'))rows.push({type:'paragraph',text:`• ${(li.innerText||'').trim()}`});
    else if(tag==='ol'){
      let index=1;
      for(const li of element.querySelectorAll(':scope > li'))rows.push({type:'paragraph',text:`${index++}. ${(li.innerText||'').trim()}`});
    }else if(tag==='blockquote')rows.push({type:'paragraph',text:`“${text}”`});
    else rows.push({type:'paragraph',text});
  }
  return rows.length?rows:[{type:'paragraph',text:''}];
}

function contentHpf(title){
  return `<?xml version="1.0" encoding="UTF-8"?>
<opf:package xmlns:opf="http://www.idpf.org/2007/opf" xmlns:dc="http://purl.org/dc/elements/1.1/" version="1.0">
<opf:metadata><dc:title>${esc(title)}</dc:title><dc:creator>EKODI Docs AI</dc:creator><dc:date>${esc(now())}</dc:date><dc:language>ko-KR</dc:language></opf:metadata>
<opf:manifest><opf:item id="header" href="header.xml" media-type="application/xml"/><opf:item id="section0" href="section0.xml" media-type="application/xml"/></opf:manifest>
<opf:spine><opf:itemref idref="section0"/></opf:spine>
</opf:package>`;
}

function headerXml(){
  return `<?xml version="1.0" encoding="UTF-8"?>
<hh:head xmlns:hh="http://www.hancom.co.kr/hwpml/2011/head" xmlns:hc="http://www.hancom.co.kr/hwpml/2011/core" version="1.5" secCnt="1">
<hh:beginNum page="1" footnote="1" endnote="1" pic="1" tbl="1" equation="1"/>
<hh:refList>
<hh:fontfaces itemCnt="7">
${['HANGUL','LATIN','HANJA','JAPANESE','OTHER','SYMBOL','USER'].map(lang=>`<hh:fontface lang="${lang}" fontCnt="1"><hh:font id="0" face="함초롬바탕" type="TTF" isEmbedded="0"/></hh:fontface>`).join('')}
</hh:fontfaces>
<hh:borderFills itemCnt="1"><hh:borderFill id="1" threeD="0" shadow="0" centerLine="NONE" breakCellSeparateLine="0"/></hh:borderFills>
<hh:charProperties itemCnt="4">
${[1000,1800,1500,1200].map((height,id)=>`<hh:charPr id="${id}" height="${height}" textColor="#000000" shadeColor="none" useFontSpace="0" useKerning="0" symMark="NONE" borderFillIDRef="0"><hh:fontRef hangul="0" latin="0" hanja="0" japanese="0" other="0" symbol="0" user="0"/><hh:ratio hangul="100" latin="100" hanja="100" japanese="100" other="100" symbol="100" user="100"/><hh:spacing hangul="0" latin="0" hanja="0" japanese="0" other="0" symbol="0" user="0"/><hh:relSz hangul="100" latin="100" hanja="100" japanese="100" other="100" symbol="100" user="100"/><hh:offset hangul="0" latin="0" hanja="0" japanese="0" other="0" symbol="0" user="0"/>${id?'<hh:bold/>':''}<hh:underline type="NONE" shape="SOLID" color="#000000"/><hh:strikeout shape="NONE" color="#000000"/><hh:outline type="NONE"/><hh:shadow type="NONE" color="#C0C0C0" offsetX="10" offsetY="10"/></hh:charPr>`).join('')}
</hh:charProperties>
<hh:tabProperties itemCnt="1"><hh:tabPr id="0" autoTabLeft="0" autoTabRight="0"/></hh:tabProperties>
<hh:numberings itemCnt="0"/><hh:bullets itemCnt="0"/>
<hh:paraProperties itemCnt="1"><hh:paraPr id="0" tabPrIDRef="0" condense="0" fontLineHeight="0" snapToGrid="1" suppressLineNumbers="0" checked="0" textDir="LTR"><hh:align horizontal="JUSTIFY" vertical="BASELINE"/><hh:heading type="NONE" idRef="0" level="0"/><hh:breakSetting breakLatinWord="KEEP_WORD" breakNonLatinWord="BREAK_WORD" widowOrphan="0" keepWithNext="0" keepLines="0" pageBreakBefore="0" lineWrap="BREAK"/><hh:autoSpacing eAsianEng="0" eAsianNum="0"/></hh:paraPr></hh:paraProperties>
<hh:styles itemCnt="1"><hh:style id="0" type="PARA" name="바탕글" engName="Normal" paraPrIDRef="0" charPrIDRef="0" nextStyleIDRef="0" langID="1042" lockForm="0"/></hh:styles>
</hh:refList>
</hh:head>`;
}

function sectionPreamble(){
  return `<hp:p id="1" paraPrIDRef="0" styleIDRef="0" pageBreak="0" columnBreak="0" merged="0"><hp:run charPrIDRef="0"><hp:secPr id="" textDirection="HORIZONTAL" spaceColumns="1134" tabStop="8000" tabStopVal="4000" tabStopUnit="HWPUNIT" outlineShapeIDRef="1" memoShapeIDRef="0" textVerticalWidthHead="0" masterPageCnt="0"><hp:grid lineGrid="0" charGrid="0" wonggojiFormat="0"/><hp:startNum pageStartsOn="BOTH" page="0" pic="0" tbl="0" equation="0"/><hp:visibility hideFirstHeader="0" hideFirstFooter="0" hideFirstMasterPage="0" border="SHOW_ALL" fill="SHOW_ALL" hideFirstPageNum="0" hideFirstEmptyLine="0" showLineNumber="0"/><hp:lineNumberShape restartType="0" countBy="0" distance="0" startNumber="0"/><hp:pagePr landscape="WIDELY" width="59528" height="84186" gutterType="LEFT_ONLY"><hp:margin header="4252" footer="4252" gutter="0" left="8504" right="8504" top="5668" bottom="4252"/></hp:pagePr></hp:secPr><hp:ctrl><hp:colPr id="" type="NEWSPAPER" layout="LEFT" colCount="1" sameSz="1" sameGap="0"/></hp:ctrl><hp:t/></hp:run></hp:p>`;
}
function blockParagraph(block,index){
  const charRef=block.type==='heading1'?1:block.type==='heading2'?2:block.type==='heading3'?3:0;
  const text=esc(block.text||'');
  return `<hp:p id="${index+2}" paraPrIDRef="0" styleIDRef="0" pageBreak="0" columnBreak="0" merged="0"><hp:run charPrIDRef="${charRef}"><hp:t>${text}</hp:t></hp:run></hp:p>`;
}

function sectionXml(blocks){
  const body=blocks.map(blockParagraph).join('');
  return `<?xml version="1.0" encoding="UTF-8"?><hs:sec xmlns:hs="http://www.hancom.co.kr/hwpml/2011/section" xmlns:hp="http://www.hancom.co.kr/hwpml/2011/paragraph">${sectionPreamble()}${body}</hs:sec>`;
}

export function buildHwpxParts({title='제목 없는 문서',blocks=[]}={}){
  const safeBlocks=(Array.isArray(blocks)&&blocks.length?blocks:[{type:'paragraph',text:''}]).slice(0,5000);
  const container='<?xml version="1.0" encoding="UTF-8"?><ocf:container xmlns:ocf="urn:oasis:names:tc:opendocument:xmlns:container"><ocf:rootfiles><ocf:rootfile full-path="Contents/content.hpf" media-type="application/hwpml-package+xml"/></ocf:rootfiles></ocf:container>';
  const version='<?xml version="1.0" encoding="UTF-8" standalone="yes" ?><hv:HCFVersion xmlns:hv="http://www.hancom.co.kr/hwpml/2011/version" tagetApplication="WORDPROCESSOR" major="5" minor="1" micro="1" buildNumber="0" os="10" xmlVersion="1.5" application="EKODI Docs AI" appVersion="1.0.0"/>';
  const preview=safeBlocks.map(block=>block.text||'').join('\n').slice(0,12000);
  return {
    mimetype:HWPX_MIMETYPE,
    'version.xml':version,
    'META-INF/container.xml':container,
    'Contents/content.hpf':contentHpf(strip(title)||'제목 없는 문서'),
    'Contents/header.xml':headerXml(),
    'Contents/section0.xml':sectionXml(safeBlocks),
    'Preview/PrvText.txt':preview,
  };
}
export async function createHwpxBlob({title,blocks},providedZip=null){
  const JSZip=await zipCtor(providedZip),safeBlocks=(Array.isArray(blocks)&&blocks.length?blocks:[{type:'paragraph',text:''}]).slice(0,5000);
  try{
    const response=await fetch(new URL('./Skeleton.hwpx',import.meta.url));if(!response.ok)throw new Error(`template_${response.status}`);
    const sourceZip=await JSZip.loadAsync(await response.arrayBuffer()),template=await sourceZip.file('Contents/section0.xml')?.async('string');
    const text=safeBlocks.map(block=>block.text||'').join('\n'),source=String(template||'');
    if(!source.includes('<hp:t/>'))throw new Error('template_section_invalid');
    const section=source.replace('<hp:t/>',`<hp:t>${esc(text)}</hp:t>`),out=new JSZip();
    const hpf=String(await sourceZip.file('Contents/content.hpf')?.async('string')||''),safeTitle=esc(strip(title)||'제목 없는 문서');
    const nextHpf=hpf.replace(/<opf:title\s*\/>/i,`<opf:title>${safeTitle}</opf:title>`).replace(/<opf:title>[\s\S]*?<\/opf:title>/i,`<opf:title>${safeTitle}</opf:title>`);
    const add=async(name,compression,override=null)=>{const file=sourceZip.file(name);if(!file&&override===null)throw new Error(`template_missing_${name}`);const data=override===null?await file.async('uint8array'):override;out.file(name,data,{compression,createFolders:false,compressionOptions:compression==='DEFLATE'?{level:6}:undefined})};
    await add('mimetype','STORE',HWPX_MIMETYPE);await add('version.xml','STORE');await add('Contents/header.xml','DEFLATE');await add('Contents/section0.xml','DEFLATE',section);await add('Preview/PrvText.txt','DEFLATE',text.slice(0,12000));await add('settings.xml','DEFLATE');await add('Preview/PrvImage.png','STORE');await add('META-INF/container.rdf','DEFLATE');await add('Contents/content.hpf','DEFLATE',nextHpf);await add('META-INF/container.xml','DEFLATE');await add('META-INF/manifest.xml','DEFLATE');
    return out.generateAsync({type:'blob',mimeType:HWPX_MIMETYPE});
  }catch(error){
    console.warn('HWPX validated template unavailable; using minimal package fallback',error);
    const zip=new JSZip(),parts=buildHwpxParts({title,blocks:safeBlocks});zip.file('mimetype',parts.mimetype,{compression:'STORE'});for(const [name,content] of Object.entries(parts)){if(name!=='mimetype')zip.file(name,content,{compression:'DEFLATE'})}
    return zip.generateAsync({type:'blob',mimeType:HWPX_MIMETYPE,compression:'DEFLATE',compressionOptions:{level:6}});
  }
}

function decodeXmlText(value){
  return String(value||'').replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/&quot;/g,'"').replace(/&apos;/g,"'").replace(/&amp;/g,'&');
}

function paragraphText(xml){
  return [...String(xml||'').matchAll(/<(?:[A-Za-z0-9_-]+:)?t(?:\s[^>]*)?>([\s\S]*?)<\/(?:[A-Za-z0-9_-]+:)?t>/g)]
    .map(match=>decodeXmlText(match[1].replace(/<[^>]+>/g,''))).join('');
}

function xmlDocument(value){
  if(typeof DOMParser==='undefined')return null;
  const doc=new DOMParser().parseFromString(String(value||''),'application/xml');
  return doc.querySelector?.('parsererror')?null:doc;
}
function localName(node){return String(node?.localName||node?.nodeName||'').split(':').pop().toLowerCase()}
function descendants(root,name){
  if(!root)return[];
  if(root.getElementsByTagNameNS)return [...root.getElementsByTagNameNS('*',name)];
  return [...(root.querySelectorAll?.(name)||[])];
}
function closestLocal(node,name,stop=null){
  let cur=node?.parentElement||node?.parentNode||null;
  while(cur&&cur!==stop){if(localName(cur)===name)return cur;cur=cur.parentElement||cur.parentNode||null}
  return null;
}
function ownTextNodes(paragraph){return descendants(paragraph,'t').filter(node=>!closestLocal(node,'p',paragraph))}

function runHtml(node,section,indexMap){
  const index=indexMap.get(node),text=String(node?.textContent||'');
  const empty=text?'':' data-hwpx-empty="1"';
  return `<span data-hwpx-section="${section}" data-hwpx-text="${index}"${empty}>${esc(text)}</span>`;
}
function paragraphHtml(paragraph,section,indexMap,pIndexMap){
  const runs=ownTextNodes(paragraph).map(node=>runHtml(node,section,indexMap)).join('');
  const pIndex=pIndexMap.get(paragraph);
  return `<p data-hwpx-section="${section}" data-hwpx-p="${pIndex}">${runs||'<br>'}</p>`;
}
function tableHtml(table,section,indexMap,pIndexMap){
  const rows=[...table.children].filter(node=>localName(node)==='tr');
  return '<table data-hwpx-table="1"><tbody>'+rows.map(row=>'<tr>'+[...row.children].filter(node=>localName(node)==='tc').map(cell=>{
    const span=[...cell.children].find(node=>localName(node)==='cellspan');
    const col=Math.max(1,Number(span?.getAttribute?.('colSpan')||1)),rowSpan=Math.max(1,Number(span?.getAttribute?.('rowSpan')||1));
    const paragraphs=descendants(cell,'p').filter(node=>closestLocal(node,'tc')===cell);
    const attrs=` colspan="${col}" rowspan="${rowSpan}"`;
    return `<td${attrs}>${paragraphs.map(node=>paragraphHtml(node,section,indexMap,pIndexMap)).join('')||'<p><br></p>'}</td>`;
  }).join('')+'</tr>').join('')+'</tbody></table>';
}
export function sectionXmlToEditableHtml(xml,section=0){
  const doc=xmlDocument(xml);
  if(!doc){
    const paragraphs=[];for(const match of String(xml||'').matchAll(/<(?:[A-Za-z0-9_-]+:)?p\b[^>]*>([\s\S]*?)<\/(?:[A-Za-z0-9_-]+:)?p>/g)){const text=paragraphText(match[1]);if(text||paragraphs.length)paragraphs.push(text)}
    return paragraphs.map(text=>`<p>${esc(text).replace(/\t/g,'&emsp;')}</p>`).join('')||'<p><br></p>';
  }
  const allT=descendants(doc,'t'),allP=descendants(doc,'p'),indexMap=new Map(allT.map((node,index)=>[node,index])),pIndexMap=new Map(allP.map((node,index)=>[node,index]));
  const root=doc.documentElement,top=[...root.children].filter(node=>localName(node)==='p');let html='';
  for(const paragraph of top){
    const tables=descendants(paragraph,'tbl').filter(node=>closestLocal(node,'p')===paragraph);
    const own=ownTextNodes(paragraph);
    if(own.length||!tables.length)html+=paragraphHtml(paragraph,section,indexMap,pIndexMap);
    for(const table of tables)html+=tableHtml(table,section,indexMap,pIndexMap);
  }
  return html||'<p><br></p>';
}
export function sectionXmlToHtml(xml){return sectionXmlToEditableHtml(xml,0)}

function metadataTitle(content){
  const match=String(content||'').match(/<(?:dc:)?title(?:\s[^>]*)?>([\s\S]*?)<\/(?:dc:)?title>/i);
  return match?decodeXmlText(match[1].replace(/<[^>]+>/g,'')).trim():'';
}

export async function importHwpx(file,providedZip=null){
  if(!file)throw new Error('HWPX 파일이 없습니다.');
  if(Number(file.size||0)>MAX_HWPX_BYTES)throw new Error('HWPX는 20MB 이하 파일만 가져올 수 있습니다.');
  const sourceBuffer=await file.arrayBuffer();
  const JSZip=await zipCtor(providedZip),zip=await JSZip.loadAsync(sourceBuffer);
  const entries=Object.keys(zip.files);
  if(entries.length>300)throw new Error('HWPX 내부 파일 수가 허용 범위를 초과했습니다.');
  const mime=await zip.file('mimetype')?.async('string');
  if(String(mime||'').trim()!==HWPX_MIMETYPE)throw new Error('유효한 HWPX 서명이 아닙니다.');
  const sections=entries.filter(name=>/^Contents\/section\d+\.xml$/i.test(name)).sort((a,b)=>Number(a.match(/\d+/)?.[0]||0)-Number(b.match(/\d+/)?.[0]||0));
  if(!sections.length)throw new Error('HWPX 본문 섹션을 찾을 수 없습니다.');
  let total=0,html='';
  for(let index=0;index<sections.length;index+=1){const xml=await zip.file(sections[index])?.async('string');total+=String(xml||'').length;if(total>MAX_SECTION_CHARS)throw new Error('HWPX 본문 크기가 허용 범위를 초과했습니다.');html+=sectionXmlToEditableHtml(xml,index)}
  const hpf=await zip.file('Contents/content.hpf')?.async('string');
  return {contract:HWPX_CONTRACT,roundTripContract:HWPX_ROUNDTRIP_CONTRACT,title:metadataTitle(hpf),html:html||'<p><br></p>',sourceFormat:'hwpx',sourceBuffer,sourceName:String(file.name||'document.hwpx'),sectionNames:sections};
}

function textTagRegex(){return /<((?:[A-Za-z0-9_-]+:)?t)\b([^>]*?)(\/>|>([\s\S]*?)<\/\1>)/g}
function countTextTags(xml){let count=0;for(const _ of String(xml||'').matchAll(textTagRegex()))count+=1;return count}
function patchTextTags(xml,edits){let index=0;return String(xml||'').replace(textTagRegex(),(full,tag,attrs,_tail)=>{const current=index++;if(!edits.has(current))return full;return `<${tag}${attrs}>${esc(edits.get(current))}</${tag}>`})}
function editorSectionEdits(editor,section){const edits=new Map();for(const node of editor.querySelectorAll(`[data-hwpx-section="${section}"][data-hwpx-text]`)){const index=Number(node.getAttribute('data-hwpx-text'));if(Number.isInteger(index)&&index>=0&&!edits.has(index))edits.set(index,String(node.textContent||'').replace(/\u200b/g,''))}return edits}

export async function createRoundTripHwpxBlob({sourceBuffer,title,editor},providedZip=null){
  if(!sourceBuffer||!editor)throw new Error('원본 HWPX 패키지와 편집 문서가 필요합니다.');
  const JSZip=await zipCtor(providedZip),sourceZip=await JSZip.loadAsync(sourceBuffer),entries=Object.keys(sourceZip.files);
  const sections=entries.filter(name=>/^Contents\/section\d+\.xml$/i.test(name)).sort((a,b)=>Number(a.match(/\d+/)?.[0]||0)-Number(b.match(/\d+/)?.[0]||0));
  const modified=new Map();let totalExpected=0,totalTracked=0;
  for(let section=0;section<sections.length;section+=1){const name=sections[section],xml=await sourceZip.file(name)?.async('string'),expected=countTextTags(xml),edits=editorSectionEdits(editor,section);totalExpected+=expected;totalTracked+=edits.size;if(edits.size!==expected){const error=new Error(`원본 서식 매핑이 변경되었습니다. 추적 ${edits.size}/${expected}`);error.code='HWPX_ROUNDTRIP_MAPPING_LOST';throw error}modified.set(name,patchTextTags(xml,edits))}
  const hpf=String(await sourceZip.file('Contents/content.hpf')?.async('string')||''),safeTitle=esc(strip(title)||'제목 없는 문서');
  if(hpf)modified.set('Contents/content.hpf',hpf.replace(/<opf:title\s*\/>/i,`<opf:title>${safeTitle}</opf:title>`).replace(/<opf:title>[\s\S]*?<\/opf:title>/i,`<opf:title>${safeTitle}</opf:title>`));
  modified.set('Preview/PrvText.txt',String(editor.innerText||editor.textContent||'').slice(0,12000));
  const out=new JSZip();
  const add=async(name)=>{if(name==='mimetype'){out.file(name,HWPX_MIMETYPE,{compression:'STORE',createFolders:false});return}const file=sourceZip.file(name);if(!file)return;const data=modified.has(name)?modified.get(name):await file.async('uint8array');out.file(name,data,{compression:'DEFLATE',createFolders:false,compressionOptions:{level:6}})};
  if(entries.includes('mimetype'))await add('mimetype');for(const name of entries){if(name==='mimetype'||sourceZip.files[name]?.dir)continue;await add(name)}
  const blob=await out.generateAsync({type:'blob',mimeType:HWPX_MIMETYPE});return {blob,contract:HWPX_ROUNDTRIP_CONTRACT,tracked:totalTracked,expected:totalExpected};
}
