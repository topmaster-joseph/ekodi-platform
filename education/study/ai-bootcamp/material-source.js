// Pure, review-first authoring contract: no server, AI provider, persistent store or publishing.
export const MATERIAL_SCHEMA='ekodi-education-lesson-draft/v1';
export const SUPPORTED_MATERIAL_EXTENSIONS=Object.freeze(['txt','md','csv','json','docx','pptx','hwpx']);
export const MAX_SOURCE_BYTES=8*1024*1024;
export const MAX_EXTRACTED_BYTES=1024*1024;
export const LESSON_STRING_FIELDS=Object.freeze(['title','sub','outcome','question','practice','sample','prompt','reflection','offline']);
export const LESSON_LIST_FIELDS=Object.freeze(['objectives','concepts','demo','steps','verify']);
export const LESSON_FIELDS=Object.freeze([...LESSON_STRING_FIELDS,...LESSON_LIST_FIELDS]);
const MAX_FIELD_CHARS=12000;
const MAX_LIST_ITEMS=32;
const hasOwn=(object,key)=>Object.prototype.hasOwnProperty.call(object,key);
const cleanString=(value,max=MAX_FIELD_CHARS)=>String(value??'').replace(/\u0000/g,'').trim().slice(0,max);
function reject(message){throw new Error(message)}
export function fileExtension(filename){
  return String(filename||'').toLowerCase().split('.').pop().trim();
}
export function describeMaterial(filename,size){
  const ext=fileExtension(filename);
  if(!SUPPORTED_MATERIAL_EXTENSIONS.includes(ext)){
    reject('지원되지 않는 형식입니다. HWP/PDF/XLSX는 검토 가능한 TXT·DOCX·PPTX·CSV 또는 구조화 JSON으로 변환해 주세요.');
  }
  if(!Number.isFinite(size)||size<0||size>MAX_SOURCE_BYTES)reject('개별 자료는 최대 8MB까지 읽을 수 있습니다.');
  return {extension:ext,filename:cleanString(String(filename||'').split(/[/\\]/).pop(),150),size};
}
export function buildLessonDraft(course,lessonId,batchId='A'){
  const lesson=course?.lessons?.find(item=>item.id===Number(lessonId));
  const batch=course?.batches?.find(item=>item.id===batchId);
  if(!lesson||!batch)reject('교육 회차 또는 세트가 올바르지 않습니다.');
  const fields={};
  for(const key of LESSON_FIELDS)fields[key]=Array.isArray(lesson[key])?[...lesson[key]]:String(lesson[key]??'');
  return {schema:MATERIAL_SCHEMA,courseId:course.id,lessonId:lesson.id,batchId:batch.id,fields,sources:[],reviewed:false};
}
export function validateLessonDraft(raw,course){
  if(!raw||Array.isArray(raw)||typeof raw!=='object'||raw.schema!==MATERIAL_SCHEMA)reject('에코디 교안 초안 형식이 아닙니다.');
  const draft=buildLessonDraft(course,raw.lessonId,raw.batchId);
  if(raw.courseId!==course.id)reject('이 교육과정의 파일이 아닙니다.');
  if(!raw.fields||typeof raw.fields!=='object'||Array.isArray(raw.fields))reject('강의 필드 구조가 잘못되었습니다.');
  for(const key of LESSON_STRING_FIELDS){
    if(typeof raw.fields[key]!=='string'||raw.fields[key].length>MAX_FIELD_CHARS)reject(key+' 항목은 제한된 길이의 문장이어야 합니다.');
    draft.fields[key]=cleanString(raw.fields[key]);
  }
  for(const key of LESSON_LIST_FIELDS){
    const entries=raw.fields[key];
    if(!Array.isArray(entries)||entries.length>MAX_LIST_ITEMS||entries.some(item=>typeof item!=='string'||item.length>1500))reject(key+' 목록의 형식 또는 길이를 확인하세요.');
    draft.fields[key]=entries.map(item=>cleanString(item,1500)).filter(Boolean);
  }
  const sources=raw.sources??[];
  if(!Array.isArray(sources)||sources.length>12)reject('출처 목록 수가 초과되었습니다.');
  draft.sources=sources.map(item=>{
    if(!item||typeof item.name!=='string'||typeof item.format!=='string'||typeof item.size!=='number')reject('출처 기록의 형식이 올바르지 않습니다.');
    const ext=fileExtension(item.name);
    if(!SUPPORTED_MATERIAL_EXTENSIONS.includes(ext)||ext!==item.format||item.size<0||item.size>MAX_SOURCE_BYTES)reject('출처 기록이 올바르지 않습니다.');
    return {name:cleanString(item.name,150),format:ext,size:item.size};
  });
  // A JSON import is never considered reviewed, even if the file says otherwise.
  draft.reviewed=false;
  return draft;
}
export function applyDraftToLesson(course,draft){
  const valid=validateLessonDraft(draft,course);
  return {...course.lessons.find(item=>item.id===valid.lessonId),...valid.fields};
}
export function updateDraftField(draft,key,value){
  if(!LESSON_FIELDS.includes(key))reject('변경할 수 없는 강의 항목입니다.');
  const copy={...draft,fields:{...draft.fields},reviewed:false};
  if(LESSON_LIST_FIELDS.includes(key)){
    const values=Array.isArray(value)?value:String(value).split(/\r?\n/);
    copy.fields[key]=values.map(v=>cleanString(v,1500)).filter(Boolean).slice(0,MAX_LIST_ITEMS);
  }else copy.fields[key]=cleanString(value);
  return copy;
}
export function detectContentWarnings(text){
  const s=String(text||'');
  const warnings=[];
  if(/\b\d{6}-?[1-4]\d{6}\b/.test(s))warnings.push('주민등록번호 형태의 문자열');
  if(/\b01[016789][-\s]?\d{3,4}[-\s]?\d{4}\b/.test(s))warnings.push('휴대전화번호 형태의 문자열');
  if(/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/i.test(s))warnings.push('이메일주소 형태의 문자열');
  if(/(?:학번|학생번호|인사평가|진료기록|계좌번호|비밀번호|주민등록)/i.test(s))warnings.push('민감정보 또는 내부자료 관련 표현');
  return warnings;
}
export function assessDraft(draft,course){
  const valid=validateLessonDraft(draft,course);
  const issues=[];
  const f=valid.fields;
  for(const name of ['title','outcome','sample','prompt','practice'])if(!f[name])issues.push(name+' 내용이 비어 있습니다.');
  for(const name of ['objectives','steps','verify'])if(f[name].length===0)issues.push(name+' 목록이 비어 있습니다.');
  const warnings=detectContentWarnings([...LESSON_STRING_FIELDS.map(x=>f[x]),...LESSON_LIST_FIELDS.flatMap(x=>f[x])].join('\n'));
  if(warnings.length)issues.push('개인정보·기밀 여부를 확인하세요: '+warnings.join(', '));
  if(f.prompt&&!/(?:확인|검증|출처|원문|추측)/.test(f.prompt))issues.push('실습 프롬프트에 사실 검증 조건을 추가할 것을 권장합니다.');
  return {readyForReview:issues.length===0,issues,sourceCount:valid.sources.length};
}
export function sourceToDraft(draft,text,target='sample',mode='replace'){
  if(!LESSON_FIELDS.includes(target))reject('자료 적용 항목을 선택하세요.');
  const incoming=cleanString(text);
  if(!incoming)reject('추출한 자료에 활용 가능한 텍스트가 없습니다.');
  const before=draft.fields[target];
  const joiner=LESSON_LIST_FIELDS.includes(target)?'\n':'\n\n';
  const original=Array.isArray(before)?before.join('\n'):before;
  return updateDraftField(draft,target,mode==='append'&&original?original+joiner+incoming:incoming);
}
function decodeEntities(value){
  return String(value).replace(/&(#x[0-9a-f]+|#\d+|amp|lt|gt|quot|apos);/gi,(all,key)=>{
    const fixed={amp:'&',lt:'<',gt:'>',quot:'"',apos:"'"};
    if(hasOwn(fixed,key.toLowerCase()))return fixed[key.toLowerCase()];
    const code=key[1]?.toLowerCase()==='x'?parseInt(key.slice(2),16):parseInt(key.slice(1),10);
    return Number.isInteger(code)&&code>0&&code<=0x10ffff&&!(code>=0xd800&&code<=0xdfff)?String.fromCodePoint(code):'';
  });
}
function plainFromXml(xml){
  return decodeEntities(String(xml).replace(/<(?:\/)?(?:w:p|a:p|hp:p|p:sp|row|text:p)(?:\s[^>]*)?>/gi,'\n')
    .replace(/<(?:\/)?(?:w:tab|a:tab)(?:\s[^>]*)?\/?>/gi,'\t')
    .replace(/<[^>]*>/g,' ')).replace(/[ \t]{2,}/g,' ').replace(/\n[ \t]+/g,'\n').replace(/\n{3,}/g,'\n\n').trim();
}
function findEOCD(bytes){
  for(let i=bytes.length-22;i>=Math.max(0,bytes.length-65557);i--){
    if(bytes[i]===0x50&&bytes[i+1]===0x4b&&bytes[i+2]===5&&bytes[i+3]===6)return i;
  }
  reject('지원되는 Office ZIP 파일이 아니거나 손상되었습니다.');
}
async function inflateBounded(data,compression,maxBytes){
  if(compression===0){
    if(data.byteLength>maxBytes)reject('압축 해제 결과 크기가 제한을 초과했습니다.');
    return data;
  }
  if(compression!==8||typeof DecompressionStream!=='function')reject('현재 브라우저에서 이 문서 압축 형식을 지원하지 않습니다.');
  let reader;
  try{reader=new Blob([data]).stream().pipeThrough(new DecompressionStream('deflate-raw')).getReader()}
  catch{reject('문서 압축을 해제할 수 없습니다. 텍스트로 변환해 주세요.')}
  const chunks=[];let size=0;
  try{
    while(true){
      const {done,value}=await reader.read();if(done)break;
      size+=value.byteLength;
      if(size>maxBytes)reject('문서 압축 해제 크기가 제한을 초과했습니다.');
      chunks.push(value);
    }
  }finally{await reader.cancel().catch(()=>{})}
  const all=new Uint8Array(size);let offset=0;
  for(const chunk of chunks){all.set(chunk,offset);offset+=chunk.length}
  return all;
}
export async function extractOfficeText(buffer,extension){
  const bytes=new Uint8Array(buffer);
  if(bytes.length>MAX_SOURCE_BYTES)reject('8MB 이상 원본 자료는 읽지 않습니다.');
  const dv=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength),eocd=findEOCD(bytes);
  const count=dv.getUint16(eocd+10,true),offset=dv.getUint32(eocd+16,true);
  if(count>500||offset>=bytes.length)reject('압축 문서 구조가 허용 범위를 벗어납니다.');
  let cursor=offset;const matches=[];
  for(let i=0;i<count;i++){
    if(cursor+46>bytes.length||dv.getUint32(cursor,true)!==0x02014b50)reject('ZIP 중앙 디렉터리가 손상되었습니다.');
    const flags=dv.getUint16(cursor+8,true),method=dv.getUint16(cursor+10,true),packed=dv.getUint32(cursor+20,true),expanded=dv.getUint32(cursor+24,true);
    const nameLen=dv.getUint16(cursor+28,true),extra=dv.getUint16(cursor+30,true),comment=dv.getUint16(cursor+32,true),local=dv.getUint32(cursor+42,true);
    if(cursor+46+nameLen>bytes.length)reject('ZIP 이름이 손상되었습니다.');
    const name=new TextDecoder().decode(bytes.subarray(cursor+46,cursor+46+nameLen));
    cursor+=46+nameLen+extra+comment;
    if(flags&1)reject('암호화된 문서는 텍스트 변환 후 이용하세요.');
    const ok=extension==='docx'?name==='word/document.xml'
      :extension==='pptx'?/^ppt\/slides\/slide\d+\.xml$/.test(name)
      :extension==='hwpx'?/^Contents\/section\d+\.xml$/i.test(name):false;
    if(!ok)continue;
    if(expanded>MAX_EXTRACTED_BYTES||packed>MAX_SOURCE_BYTES)reject('문서 본문이 허용 크기를 초과했습니다.');
    if(local+30>bytes.length||dv.getUint32(local,true)!==0x04034b50)reject('ZIP 본문 구조가 손상되었습니다.');
    const localName=dv.getUint16(local+26,true),localExtra=dv.getUint16(local+28,true);
    const start=local+30+localName+localExtra;
    if(start+packed>bytes.length)reject('ZIP 본문 크기가 잘못되었습니다.');
    matches.push({name,method,data:bytes.subarray(start,start+packed),expanded});
  }
  if(!matches.length)reject('해당 Office/HWPX 문서에서 본문 텍스트를 찾지 못했습니다.');
  matches.sort((a,b)=>{
    const getNo=x=>Number(x.name.match(/(?:slide|section)(\d+)\.xml/i)?.[1]||0);
    return getNo(a)-getNo(b);
  });
  const result=[];let total=0;
  for(const entry of matches){
    const data=await inflateBounded(entry.data,entry.method,MAX_EXTRACTED_BYTES-total);
    total+=data.byteLength;
    if(total>MAX_EXTRACTED_BYTES)reject('문서 전체의 압축 해제 크기가 제한을 초과했습니다.');
    const plain=plainFromXml(new TextDecoder().decode(data));
    if(plain)result.push(plain);
  }
  return cleanString(result.join('\n\n'),MAX_FIELD_CHARS);
}
export async function readMaterialFile(file){
  const meta=describeMaterial(file?.name,file?.size);
  let text='';
  if(['docx','pptx','hwpx'].includes(meta.extension))text=await extractOfficeText(await file.arrayBuffer(),meta.extension);
  else text=cleanString(await file.text(),MAX_FIELD_CHARS);
  if(!text)reject('선택한 자료에서 텍스트를 읽지 못했습니다.');
  return {...meta,text,warnings:detectContentWarnings(text)};
}
export function serializeDraft(draft,course){
  const validated=validateLessonDraft(draft,course);
  return JSON.stringify({...validated,reviewed:false},null,2)+'\n';
}
