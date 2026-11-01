/**
 * EPUB-MASTER-PREFLIGHT-001 — zero-dependency, read-only EPUB3 package preflight.
 * This is NOT EPUBCheck, Ace, human review, a signed release or a publication action.
 */
import { createHash } from 'node:crypto';
import { readFile, writeFile, stat } from 'node:fs/promises';
import { inflateRawSync } from 'node:zlib';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const MAX_FILE = 50 * 1024 * 1024;
const MAX_ENTRY = 40 * 1024 * 1024;
const MAX_UNPACKED = 180 * 1024 * 1024;
const MAX_ENTRIES = 2000;
const UTF8 = new TextDecoder('utf-8', {fatal:true});
const SHA256 = /^[a-f0-9]{64}$/;
const FILE_NAME = /^[^\\\0:]+$/;

function safeZipName(name) {
  if (typeof name !== 'string' || name.length > 2048 || !name ||
    !FILE_NAME.test(name) || name.startsWith('/') || name.startsWith('./') ||
    /(^|\/)\.\.?($|\/)/.test(name) || name.includes('//')) return false;
  return true;
}
function attrs(tag) {
  const out = {};
  const re = /([\w:.-]+)\s*=\s*(['"])(.*?)\2/gs;
  for (const m of tag.matchAll(re)) out[m[1]] = m[3];
  return out;
}
const CRC_TABLE = Uint32Array.from({length:256}, (_,n) => {
  let c=n;
  for(let k=0;k<8;k++) c=(c>>>1)^((c&1)?0xedb88320:0);
  return c>>>0;
});
function crc32(input) {
  let crc=0xffffffff;
  for(const b of input) crc=CRC_TABLE[(crc^b)&0xff]^(crc>>>8);
  return (crc^0xffffffff)>>>0;
}
function zipEntries(data) {
  if (data.length < 22 || data.length > MAX_FILE) throw new Error('file_size_invalid');
  let end = -1;
  // EOCD must be the final record (except permitted ZIP comment).
  for (let i=data.length-22;i>=Math.max(0,data.length-22-65535);i--) {
    if (data.readUInt32LE(i) === 0x06054b50 && i+22+data.readUInt16LE(i+20)===data.length) {
      end=i; break;
    }
  }
  if(end<0) throw new Error('zip_end_record_missing');
  const count=data.readUInt16LE(end+10), cdSize=data.readUInt32LE(end+12), cdOffset=data.readUInt32LE(end+16);
  if (data.readUInt16LE(end+4)!==0 || data.readUInt16LE(end+6)!==0 ||
      data.readUInt16LE(end+8)!==count || count<2 || count>MAX_ENTRIES ||
      cdOffset===0xffffffff || cdSize===0xffffffff ||
      cdOffset+cdSize>end) throw new Error('zip_directory_invalid');
  let off=cdOffset, total=0;
  const entries=new Map();
  for(let i=0;i<count;i++){
    if(off+46>cdOffset+cdSize || data.readUInt32LE(off)!==0x02014b50)
      throw new Error('zip_central_entry_invalid');
    const flags=data.readUInt16LE(off+8), method=data.readUInt16LE(off+10);
    const crc=data.readUInt32LE(off+16), compressed=data.readUInt32LE(off+20), size=data.readUInt32LE(off+24);
    const nameSize=data.readUInt16LE(off+28), extra=data.readUInt16LE(off+30), comment=data.readUInt16LE(off+32);
    const external=data.readUInt32LE(off+38), localOffset=data.readUInt32LE(off+42);
    const next=off+46+nameSize+extra+comment;
    if(next>cdOffset+cdSize) throw new Error('zip_directory_overrun');
    const name=UTF8.decode(data.subarray(off+46,off+46+nameSize));
    off=next;
    if(!safeZipName(name)) throw new Error('zip_unsafe_name');
    if(entries.has(name)) throw new Error('zip_duplicate_entry');
    // Unix symlink in ZIP archive is not a safe EPUB resource.
    const unixMode=(external>>>16)&0xf000;
    if(unixMode===0xa000) throw new Error('zip_symlink_denied');
    if(flags&1 || (method!==0 && method!==8)) throw new Error('zip_encrypted_or_unsupported');
    if(size>MAX_ENTRY || compressed>MAX_FILE || size===0xffffffff || compressed===0xffffffff)
      throw new Error('zip_entry_too_large');
    total+=size;
    if(total>MAX_UNPACKED) throw new Error('zip_inflation_limit');
    if(localOffset+30>cdOffset || data.readUInt32LE(localOffset)!==0x04034b50)
      throw new Error('zip_local_header_invalid');
    const localNameLen=data.readUInt16LE(localOffset+26),localExtra=data.readUInt16LE(localOffset+28);
    const bodyStart=localOffset+30+localNameLen+localExtra;
    if(bodyStart+compressed>cdOffset || data.readUInt16LE(localOffset+8)!==method ||
       data.readUInt16LE(localOffset+6)!==flags)
      throw new Error('zip_local_payload_invalid');
    if(UTF8.decode(data.subarray(localOffset+30,localOffset+30+localNameLen))!==name)
      throw new Error('zip_local_name_mismatch');
    const rec={name,size,method,crc,offset:localOffset,localExtra,compressed,bodyStart};
    entries.set(name,rec);
  }
  if(off!==cdOffset+cdSize) throw new Error('zip_directory_size_mismatch');
  function read(name){
    const e=entries.get(name);
    if(!e) throw new Error('zip_missing_required_resource');
    const b=data.subarray(e.bodyStart,e.bodyStart+e.compressed);
    const decoded=e.method===0 ? b : inflateRawSync(b,{maxOutputLength:MAX_ENTRY+1});
    if(decoded.length!==e.size || crc32(decoded)!==e.crc)
      throw new Error('zip_payload_integrity_failed');
    return decoded;
  }
  // Verify payload decompression and CRC of every entry, not just EPUB XML.
  for(const name of entries.keys()) read(name);
  return {entries,read};
}
function resourcePath(opfFile,href) {
  if(typeof href!=='string'||!href||href.startsWith('#')||/^[a-z]+:/i.test(href)) return null;
  let decoded;
  try{decoded=decodeURIComponent(href.split(/[?#]/,1)[0]);}catch{return null;}
  const full=path.posix.normalize(path.posix.join(path.posix.dirname(opfFile),decoded));
  return safeZipName(full)?full:null;
}
export async function inspectEpubMaster({file, expected={}}={}) {
  const blockers=[];
  let digest=null, packagePath=null, files=0, spineItems=0, navPresent=false, digestMatched=false;
  try {
    const fileInfo=await stat(file);
    if(!fileInfo.isFile() || fileInfo.size<22 || fileInfo.size>MAX_FILE) throw new Error('file_size_invalid');
    const data=await readFile(file);
    if(data.length>MAX_FILE) throw new Error('file_size_invalid');
    digest=createHash('sha256').update(data).digest('hex');
    if(!expected || typeof expected!=='object' || !expected.bookId || !expected.edition)
      blockers.push('expected_identity_missing');
    if(expected.sha256!==undefined){
      if(!SHA256.test(expected.sha256)) blockers.push('expected_digest_invalid');
      else if(expected.sha256!==digest) blockers.push('expected_digest_mismatch');
      else digestMatched=true;
    }
    const zip=zipEntries(data);
    files=zip.entries.size;
    const mime=zip.entries.get('mimetype');
    if(!mime || mime.offset!==0 || mime.method!==0 || mime.localExtra!==0 ||
      zip.read('mimetype').toString('utf8')!=='application/epub+zip')
      blockers.push('epub_mimetype_invalid');
    let opf=null;
    try{
      const container=zip.read('META-INF/container.xml').toString('utf8');
      const root=container.match(/<rootfile\b[^>]*>/i);
      const full=root?attrs(root[0])['full-path']:null;
      if(!full||!safeZipName(full)||!full.toLowerCase().endsWith('.opf'))
        blockers.push('epub_container_invalid');
      else{packagePath=full; opf=zip.read(full).toString('utf8');}
    }catch{blockers.push('epub_container_or_opf_missing');}
    if(opf){
      const p=opf.match(/<package\b[^>]*>/i);
      if(!p || !/^3(?:\.[0-9]+)?$/.test(attrs(p[0]).version||''))
        blockers.push('epub3_package_version_invalid');
      if(!/<metadata\b/i.test(opf)||!/<dc:title\b[^>]*>\s*[^<\s]/i.test(opf)||
         !/<dc:language\b[^>]*>\s*[^<\s]/i.test(opf))
        blockers.push('epub_metadata_incomplete');
      const manifest=new Map();
      for(const m of opf.matchAll(/<item\b[^>]*>/gi)){
        const a=attrs(m[0]);
        if(!a.id||!a.href||manifest.has(a.id)){
          blockers.push('epub_manifest_invalid');continue;
        }
        manifest.set(a.id,a);
        const target=resourcePath(packagePath,a.href);
        if(!target || !zip.entries.has(target)) blockers.push('epub_manifest_resource_missing');
        if((a.properties||'').split(/\s+/).includes('nav')){
          if(a['media-type']!=='application/xhtml+xml') blockers.push('epub_navigation_media_invalid');
          navPresent=Boolean(target && zip.entries.has(target));
          if(navPresent){
            try{if(!/<nav\b/i.test(zip.read(target).toString('utf8')))blockers.push('epub_navigation_document_invalid');}
            catch{blockers.push('epub_navigation_document_invalid');}
          }
        }
      }
      if(!manifest.size) blockers.push('epub_manifest_empty');
      if(!navPresent) blockers.push('epub_navigation_missing');
      const spine=opf.match(/<spine\b[^>]*>([\s\S]*?)<\/spine\s*>/i);
      const refs=spine?[...spine[1].matchAll(/<itemref\b[^>]*>/gi)]:[];
      spineItems=refs.length;
      if(!refs.length) blockers.push('epub_spine_missing');
      for(const ref of refs){
        const item=manifest.get(attrs(ref[0]).idref);
        if(!item||item['media-type']!=='application/xhtml+xml'){
          blockers.push('epub_spine_reference_invalid');break;
        }
        const target=resourcePath(packagePath,item.href);
        if(!target||!zip.entries.has(target)){
          blockers.push('epub_spine_resource_missing');break;
        }
      }
    }
  } catch (error){ blockers.push(error?.message?.startsWith('zip_')||error?.message?.startsWith('file_size')?
    error.message:'epub_unreadable_or_unsupported'); }
  return {
    schema:'ekodi-epub3-technical-preflight-v1',
    bookId:typeof expected?.bookId==='string'?expected.bookId:null,
    edition:typeof expected?.edition==='string'?expected.edition:null,
    sha256:digest,
    approvedDigestMatched:digestMatched,
    technicalStatus:blockers.length?'blocked':'passed',
    resourceCount:files,spineItems,navigationPresent:navPresent,
    blockers:[...new Set(blockers)],
    releaseReady:false,
    releaseBlockers:[
      'official_EPUBCheck_and_Ace_validation',
      'human_screen_reader_mobile_and_content_QA',
      'author_publisher_rights_and_edition_approval',
      'audiobook_licensed_human_QA_and_same_edition',
      'signed_dual_channel_publication_payment_refund_E2E'
    ]
  };
}
async function main(argv){
  const params={};
  for(let i=0;i<argv.length;i+=2){
    if(!['--epub','--expect','--out'].includes(argv[i])||!argv[i+1]||params[argv[i]])
      throw new Error('invalid_arguments');
    params[argv[i]]=argv[i+1];
  }
  if(!params['--epub']||!params['--expect'])
    throw new Error('usage: --epub /private/book.epub --expect /private/edition.json [--out /private/report.json]');
  const expected=JSON.parse(await readFile(params['--expect'],'utf8'));
  const report=await inspectEpubMaster({file:params['--epub'],expected});
  const text=JSON.stringify(report,null,2)+'\n';
  if(params['--out']) await writeFile(params['--out'],text,{flag:'wx',mode:0o600});
  else process.stdout.write(text);
  process.exitCode=report.technicalStatus==='passed'?0:2;
}
if(process.argv[1] && fileURLToPath(import.meta.url)===path.resolve(process.argv[1]))
  main(process.argv.slice(2)).catch(e=>{console.error('EPUB preflight:',e.message);process.exitCode=2;});
