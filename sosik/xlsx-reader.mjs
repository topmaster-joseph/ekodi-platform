// EKODI SOSIK: private, browser-side Excel workbook reader. No file uploads to third parties.
// Supports the first worksheet in ordinary .xlsx files; all other imports can use CSV.
const decoder=new TextDecoder('utf-8',{fatal:true});
const S_MAX=2_000_000;
const U_MAX=6_000_000;
const ENTRIES_MAX=250;
function ensure(ok,message){if(!ok)throw new Error(message);}
const utf8=b=>decoder.decode(b);
const cellString=(node,strings)=>{
  const type=node.getAttribute('t')||'';
  const v=node.getElementsByTagNameNS('*','v')[0]?.textContent??'';
  if(type==='s'){
    const index=Number(v);
    return Number.isInteger(index)&&index>=0&&index<strings.length?strings[index]:'';
  }
  if(type==='inlineStr')return [...node.getElementsByTagNameNS('*','t')].map(n=>n.textContent||'').join('');
  if(type==='b')return v==='1'?'true':'false';
  return v;
};
async function inflateEntry(source,entry){
  const view=new DataView(source.buffer,source.byteOffset,source.byteLength);
  const offset=entry.offset;
  ensure(offset+30<=source.byteLength&&view.getUint32(offset,true)===0x04034b50,'XLSX 내부 ZIP 헤더 오류');
  const nameLength=view.getUint16(offset+26,true),extra=view.getUint16(offset+28,true),begin=offset+30+nameLength+extra;
  ensure(begin+entry.compressed<=source.byteLength,'XLSX 압축 데이터 범위 오류');
  const payload=source.slice(begin,begin+entry.compressed);
  if(entry.method===0){
    ensure(payload.length<=U_MAX,'XLSX 내부 파일 용량 초과');
    return payload;
  }
  ensure(entry.method===8&&typeof DecompressionStream==='function','XLSX 압축 방식이 지원되지 않습니다. CSV로 저장해서 불러오세요.');
  const stream=new Blob([payload]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
  const reader=stream.getReader(),chunks=[];let size=0;
  try {
    while(true){
      const {done,value}=await reader.read();
      if(done)break;
      size+=value.byteLength;
      ensure(size<=U_MAX,'XLSX 압축 해제 제한 초과');
      chunks.push(value);
    }
  }finally{reader.releaseLock();}
  ensure(size===entry.uncompressed,'XLSX 압축 파일 크기가 일치하지 않습니다.');
  const result=new Uint8Array(size);let p=0;
  for(const chunk of chunks){result.set(chunk,p);p+=chunk.byteLength;}
  return result;
}
function xml(value){
  ensure(typeof DOMParser==='function','이 브라우저에서는 Excel 처리를 지원하지 않습니다.');
  const doc=new DOMParser().parseFromString(value,'application/xml');
  ensure(doc.getElementsByTagName('parsererror').length===0,'XLSX XML 구문 오류');
  return doc;
}
function findZipEntries(buf){
  ensure(buf.byteLength>=22&&buf.byteLength<=S_MAX,'Excel 파일은 최대 2MB입니다.');
  const view=new DataView(buf.buffer,buf.byteOffset,buf.byteLength);
  let end=-1;
  for(let i=buf.byteLength-22;i>=Math.max(0,buf.byteLength-66000);i--){
    if(view.getUint32(i,true)===0x06054b50){end=i;break;}
  }
  ensure(end>=0,'XLSX ZIP 종료 정보를 찾을 수 없습니다.');
  const count=view.getUint16(end+10,true),offset=view.getUint32(end+16,true);
  const size=view.getUint32(end+12,true);
  ensure(count>0&&count<=ENTRIES_MAX&&offset+size<=buf.byteLength,'XLSX 목차 제한 또는 오류');
  const files=new Map();let pos=offset;
  for(let i=0;i<count;i++){
    ensure(pos+46<=buf.byteLength&&view.getUint32(pos,true)===0x02014b50,'XLSX 목차 구조 오류');
    const method=view.getUint16(pos+10,true),compressed=view.getUint32(pos+20,true),uncompressed=view.getUint32(pos+24,true);
    const nameLength=view.getUint16(pos+28,true),extra=view.getUint16(pos+30,true),comment=view.getUint16(pos+32,true);
    const localOffset=view.getUint32(pos+42,true);
    ensure(pos+46+nameLength+extra+comment<=buf.byteLength,'XLSX 목차 길이 오류');
    ensure(compressed<=S_MAX&&uncompressed<=U_MAX,'XLSX 내부 항목 용량 초과');
    const name=utf8(buf.slice(pos+46,pos+46+nameLength));
    ensure(!name.includes('..')&&!name.startsWith('/'),'잘못된 XLSX 내부 경로');
    files.set(name,{method,compressed,uncompressed,offset:localOffset});
    pos+=46+nameLength+extra+comment;
  }
  return files;
}
function excelDate(value){
  if(!/^\d{5}(\.\d+)?$/.test(value))return value;
  const n=Number(value);
  if(n<20000||n>85000)return value;
  return new Date(Date.UTC(1899,11,30)+Math.floor(n)*86400000).toISOString().slice(0,10);
}
export async function readSosikXlsx(file){
  ensure(file&&typeof file.arrayBuffer==='function','Excel 파일을 선택하세요.');
  ensure(file.size<=S_MAX,'Excel 파일은 최대 2MB입니다.');
  const buf=new Uint8Array(await file.arrayBuffer());
  const files=findZipEntries(buf);
  const worksheet=files.get('xl/worksheets/sheet1.xml');
  ensure(worksheet,'첫 번째 시트를 찾지 못했습니다. CSV 파일로 저장해 주세요.');
  let strings=[];
  if(files.has('xl/sharedStrings.xml')){
    const entries=xml(utf8(await inflateEntry(buf,files.get('xl/sharedStrings.xml'))));
    strings=[...entries.getElementsByTagNameNS('*','si')].map(si=>[...si.getElementsByTagNameNS('*','t')].map(t=>t.textContent||'').join(''));
  }
  const book=xml(utf8(await inflateEntry(buf,worksheet)));
  const rows=[...book.getElementsByTagNameNS('*','row')];
  ensure(rows.length>0&&rows.length<=251,'Excel은 제목 행 포함 251행까지만 처리합니다.');
  const result=[];
  for(const row of rows){
    const values=[];
    for(const cell of row.getElementsByTagNameNS('*','c')){
      const label=cell.getAttribute('r')||'';
      const match=/^([A-Z]+)\d+$/.exec(label.toUpperCase());
      if(!match)continue;
      let index=0;for(const letter of match[1])index=index*26+letter.charCodeAt(0)-64;
      index--;
      if(index<0||index>30)continue;
      values[index]=cellString(cell,strings).trim();
    }
    result.push(values.map(v=>v||''));
  }
  const expected=['audience','email','name','consentAt','source'];
  const header=result.shift().map(s=>s.trim());
  ensure(expected.every(name=>header.includes(name)),'Excel 제목 행에 audience,email,name,consentAt,source 열이 필요합니다.');
  return result.filter(row=>row.some(Boolean)).map(row=>Object.fromEntries(expected.map(name=>{
    const value=String(row[header.indexOf(name)]||'').trim();
    return [name,name==='consentAt'?excelDate(value):value];
  })));
}
