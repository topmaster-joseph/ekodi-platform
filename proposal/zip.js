// Dependency-free OOXML ZIP store writer for small browser-local deliverables.
// UTF-8, CRC32, explicit size and entry limits. No filesystem/network.
const enc=new TextEncoder();
const table=(()=>{
 const t=new Uint32Array(256);
 for(let n=0;n<256;n++){let c=n;for(let k=0;k<8;k++)c=c&1?0xedb88320^(c>>>1):c>>>1;t[n]=c>>>0;}
 return t;
})();
function crc32(bytes){
 let c=0xffffffff;
 for(const b of bytes)c=table[(c^b)&255]^(c>>>8);
 return (c^0xffffffff)>>>0;
}
const u16=(view,at,n)=>view.setUint16(at,n,true);
const u32=(view,at,n)=>view.setUint32(at,n,true);
export function zipXmlEntries(entries){
 if(!Array.isArray(entries)||entries.length<2||entries.length>150)throw new Error('OOXML 항목 수가 허용 범위를 초과했습니다.');
 const normalized=[];const used=new Set();let total=0;
 for(const item of entries){
  const name=String(item.name||'');
  if(!name||name.length>240||name.includes('\\')||name.startsWith('/')||name.split('/').some(x=>x==='..')||used.has(name))throw new Error('잘못된 OOXML 경로입니다.');
  const path=enc.encode(name),data=enc.encode(String(item.content??''));
  total+=30+path.length+data.length+46+path.length;
  if(total>10000000||data.length>4000000)throw new Error('문서 생성 최대 용량을 초과했습니다.');
  used.add(name);normalized.push({path,data,crc:crc32(data)});
 }
 total+=22;
 const blob=new Uint8Array(total),view=new DataView(blob.buffer);
 const central=[];let offset=0;
 for(const entry of normalized){
  const start=offset;
  u32(view,offset,0x04034b50);u16(view,offset+4,20);u16(view,offset+6,0x0800);
  u16(view,offset+8,0);u16(view,offset+10,0);u16(view,offset+12,33);
  u32(view,offset+14,entry.crc);u32(view,offset+18,entry.data.length);u32(view,offset+22,entry.data.length);
  u16(view,offset+26,entry.path.length);u16(view,offset+28,0);offset+=30;
  blob.set(entry.path,offset);offset+=entry.path.length;
  blob.set(entry.data,offset);offset+=entry.data.length;
  central.push({entry,start});
 }
 const centralStart=offset;
 for(const {entry,start} of central){
  u32(view,offset,0x02014b50);u16(view,offset+4,20);u16(view,offset+6,20);u16(view,offset+8,0x0800);
  u16(view,offset+10,0);u16(view,offset+12,0);u16(view,offset+14,33);
  u32(view,offset+16,entry.crc);u32(view,offset+20,entry.data.length);u32(view,offset+24,entry.data.length);
  u16(view,offset+28,entry.path.length);u16(view,offset+30,0);u16(view,offset+32,0);u16(view,offset+34,0);
  u16(view,offset+36,0);u32(view,offset+38,0);u32(view,offset+42,start);offset+=46;
  blob.set(entry.path,offset);offset+=entry.path.length;
 }
 const centralSize=offset-centralStart;
 u32(view,offset,0x06054b50);u16(view,offset+4,0);u16(view,offset+6,0);
 u16(view,offset+8,central.length);u16(view,offset+10,central.length);
 u32(view,offset+12,centralSize);u32(view,offset+16,centralStart);u16(view,offset+20,0);
 return blob;
}
export function xmlEscape(value){
 return String(value??'').replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g,'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&apos;'}[c]));
}
