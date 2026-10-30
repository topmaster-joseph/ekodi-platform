// Local, read-only OOXML/HWPX structure and short text preview. No original template editing.
// Untrusted ZIP limits: paths, entry count, decompression ratio, expanded bytes, and file size.
const decoder=new TextDecoder('utf-8',{fatal:true});
const MAX_ARCHIVE=12_000_000,MAX_TOTAL=30_000_000,MAX_ENTRY=2_000_000,MAX_SELECTED=12;
const u16=(v,p)=>v.getUint16(p,true),u32=(v,p)=>v.getUint32(p,true);
const fail=message=>{throw new Error(message);};

function entriesFromZip(buffer){
 const bytes=new Uint8Array(buffer),v=new DataView(buffer);
 if(bytes.length<22||bytes.length>MAX_ARCHIVE)fail('Office 원본은 12MB 이하만 검사할 수 있습니다.');
 let eocd=-1;
 for(let p=bytes.length-22;p>=Math.max(0,bytes.length-65557);p--){
  if(u32(v,p)===0x06054b50&&p+22+u16(v,p+20)===bytes.length){eocd=p;break;}
 }
 if(eocd<0)fail('유효한 ZIP 기반 Office 파일이 아닙니다.');
 const count=u16(v,eocd+10),length=u32(v,eocd+12),begin=u32(v,eocd+16);
 if(!count||count>600||count===65535||begin===0xffffffff||length===0xffffffff||begin+length>eocd)fail('파일 내부 항목이 너무 많거나 지원하지 않는 ZIP 형식입니다.');
 const entries=new Map();let p=begin,total=0;
 for(let i=0;i<count;i++){
  if(p+46>bytes.length||u32(v,p)!==0x02014b50)fail('ZIP 중앙 디렉터리가 손상됐습니다.');
  const flags=u16(v,p+8),method=u16(v,p+10),crc=u32(v,p+16),size=u32(v,p+20),expanded=u32(v,p+24);
  const nameLen=u16(v,p+28),extra=u16(v,p+30),comment=u16(v,p+32),local=u32(v,p+42);
  if(p+46+nameLen+extra+comment>bytes.length||!nameLen)fail('ZIP 경로 정보가 손상됐습니다.');
  const name=decoder.decode(bytes.subarray(p+46,p+46+nameLen));
  if(name.length>260||name.startsWith('/')||name.includes('\\')||name.split('/').some(x=>x==='..'||x==='.')||entries.has(name))fail('위험하거나 중복된 ZIP 경로입니다.');
  if((flags&1)!==0||![0,8].includes(method)||size===0xffffffff||expanded===0xffffffff)fail('암호화 또는 지원하지 않는 압축 방식입니다.');
  total+=expanded;
  if(total>MAX_TOTAL||expanded>MAX_ENTRY&&name.endsWith('.xml')||size===0&&expanded>0||size>0&&expanded/size>300)fail('압축 해제 크기 제한을 초과했습니다.');
  if(local+30>bytes.length||u32(v,local)!==0x04034b50)fail('ZIP 항목 위치가 손상됐습니다.');
  const dataAt=local+30+u16(v,local+26)+u16(v,local+28);
  if(dataAt+size>bytes.length)fail('ZIP 항목 데이터가 손상됐습니다.');
  if(!name.endsWith('/'))entries.set(name,{method,crc,size,expanded,dataAt});
  p+=46+nameLen+extra+comment;
 }
 if(p!==begin+length)fail('ZIP 중앙 디렉터리 크기가 일치하지 않습니다.');
 return {bytes,entries};
}
async function readEntry(zip,name){
 const entry=zip.entries.get(name);if(!entry)return '';
 if(entry.expanded>MAX_ENTRY)fail('검사 대상 XML이 너무 큽니다.');
 const raw=zip.bytes.subarray(entry.dataAt,entry.dataAt+entry.size);
 let result;
 if(entry.method===0){result=raw;}
 else{
  if(typeof DecompressionStream!=='function')fail('이 브라우저는 압축된 Office 파일 미리보기를 지원하지 않습니다.');
  try{
   const stream=new Blob([raw]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
   const reader=stream.getReader(),chunks=[];let total=0;
   try{
    for(;;){const {done,value}=await reader.read();if(done)break;total+=value.length;if(total>MAX_ENTRY)fail('압축 해제 용량을 초과했습니다.');chunks.push(value);}
   }finally{reader.releaseLock();}
   result=new Uint8Array(total);let pos=0;for(const chunk of chunks){result.set(chunk,pos);pos+=chunk.length;}
  }catch(error){fail('Office 압축 해제에 실패했습니다: '+error.message);}
 }
 if(result.length!==entry.expanded)fail('ZIP 항목의 실제 크기가 일치하지 않습니다.');
 return decoder.decode(result);
}
function decodeXml(value){
 return value.replace(/&(?:amp|lt|gt|quot|apos|#\d{1,7}|#x[0-9a-fA-F]{1,6});/g,token=>{
  const named={'&amp;':'&','&lt;':'<','&gt;':'>','&quot;':'"','&apos;':"'"};
  if(named[token])return named[token];
  const hex=token.startsWith('&#x'),code=Number.parseInt(token.slice(hex?3:2,-1),hex?16:10);
  return code>0&&code<=0x10ffff&&!(code>=0xd800&&code<=0xdfff)?String.fromCodePoint(code):'';
 });
}
function readXmlPreview(xml){
 if(/<!DOCTYPE|<!ENTITY/i.test(xml))fail('외부 엔터티가 있는 XML은 처리하지 않습니다.');
 const output=[];
 const paragraph=/<(?:[\w.-]+:)?p(?:\s[^>]*)?>([\s\S]*?)<\/(?:[\w.-]+:)?p>/g;
 let blocks=[...xml.matchAll(paragraph)].map(m=>m[1]);
 if(!blocks.length)blocks=[xml];
 for(const block of blocks){
  const tokens=[];
  for(const m of block.matchAll(/<(?:[\w.-]+:)?(?:t|v)(?:\s[^>]*)?>([\s\S]*?)<\/(?:[\w.-]+:)?(?:t|v)>/g)){
   if(m[1].includes('<'))continue;
   tokens.push(decodeXml(m[1]));
  }
  const line=tokens.join('').trim();
  if(line)output.push(line.slice(0,450));
  if(output.join('\n').length>=6000||output.length>=100)break;
 }
 return output.join('\n').slice(0,6000);
}
export async function inspectOfficeDocument(file){
 const name=String(file?.name||'');
 const format=name.split('.').pop().toLowerCase();
 if(!['hwpx','docx','xlsx','pptx'].includes(format))fail('지원하지 않는 Office 형식입니다.');
 if(!Number.isSafeInteger(file.size)||file.size>MAX_ARCHIVE)fail('Office 원본은 최대 12MB입니다.');
 const zip=entriesFromZip(await file.arrayBuffer());
 const names=[...zip.entries.keys()],xml=[];
 if(format==='hwpx'){
  if(!names.some(n=>/^Contents\/section\d+\.xml$/.test(n)))fail('HWPX 본문 section이 없습니다.');
  xml.push(...names.filter(n=>/^Contents\/section\d+\.xml$/.test(n)).sort((a,b)=>Number(a.match(/\d+/)[0])-Number(b.match(/\d+/)[0])).slice(0,MAX_SELECTED));
 }else if(format==='docx'){
  if(!zip.entries.has('word/document.xml'))fail('Word 본문이 없는 파일입니다.');
  xml.push('word/document.xml');
 }else if(format==='xlsx'){
  if(!zip.entries.has('xl/workbook.xml'))fail('Excel 통합문서가 아닙니다.');
  xml.push(...['xl/sharedStrings.xml','xl/worksheets/sheet1.xml'].filter(n=>zip.entries.has(n)));
 }else{
  if(!zip.entries.has('ppt/presentation.xml'))fail('PowerPoint 프레젠테이션이 아닙니다.');
  xml.push(...names.filter(n=>/^ppt\/slides\/slide\d+\.xml$/.test(n)).sort((a,b)=>Number(a.match(/\d+/)[0])-Number(b.match(/\d+/)[0])).slice(0,MAX_SELECTED));
 }
 const excerpts=[];
 for(const path of xml){
  const preview=readXmlPreview(await readEntry(zip,path));
  if(preview)excerpts.push(preview);
  if(excerpts.join('\n').length>=6000)break;
 }
 return {format,parts:xml.length,entryCount:names.length,excerpt:excerpts.join('\n').slice(0,6000),
  note:'ZIP·XML에서 텍스트 일부만 추출했습니다. 문맥·수치·양식·진위는 검증되지 않았으며 원본을 수정하거나 재출력하지 않습니다.'};
}
