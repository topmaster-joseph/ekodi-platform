/**
 * AUDIO-MASTER-PREFLIGHT-001 — offline, read-only EKODI audiobook QA.
 * No TTS, approval, publication, upload, payment, or purchaser entitlement.
 */
import { createHash } from 'node:crypto';
import { readFile, realpath, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const MAX_TRACKS=120, MAX_BYTES=32*1024*1024, MAX_JSON=2*1024*1024;
const BOOK_ID=/^BOOK-[A-Z0-9-]+$/;
const field=(v,max)=>typeof v==='string'&&v.trim().length>0&&v.length<=max;
const mp3Header=b=>(b[0]===0x49&&b[1]===0x44&&b[2]===0x33)||
  (b[0]===0xff&&(b[1]&0xe0)===0xe0);

/**
 * Technical file/header/hash verification only. No full decode, narration
 * completeness, human listening, copyright, commercial voice or R2 validation.
 */
export async function inspectAudiobookMaster({catalog,submission,root}) {
  const blockers=[], inspected=[], seenFiles=new Set(), seenHashes=new Set();
  const bookId=submission?.bookId, edition=submission?.edition;
  if(!BOOK_ID.test(bookId||'')) blockers.push('bookId.invalid');
  if(!field(edition,160)) blockers.push('edition.missing');
  const book=(Array.isArray(catalog?.books)?catalog.books:[]).find(b=>b.id===bookId);
  if(!book) blockers.push('catalog.book_not_found');
  else if(!field(book.edition,160)||book.edition!==edition)
    blockers.push('catalog.edition_mismatch');
  if(!field(root,4096)) blockers.push('root.required');
  const tracks=submission?.chapters;
  if(!Array.isArray(tracks)||tracks.length<1||tracks.length>MAX_TRACKS)
    blockers.push('chapters.count_invalid');
  let directory=null;
  if(field(root,4096)) {
    try { directory=await realpath(root); }
    catch { blockers.push('root.unavailable'); }
  }
  if(Array.isArray(tracks)&&tracks.length>0&&tracks.length<=MAX_TRACKS) {
    for(let i=0;i<tracks.length;i++){
      const n=i+1, track=tracks[i]||{}, tag='chapter.'+n+'.';
      if(track.number!==n) blockers.push(tag+'sequence_invalid');
      if(!field(track.title,150)) blockers.push(tag+'title_invalid');
      if(!field(track.file,1024)||!/\.mp3$/i.test(track.file)){
        blockers.push(tag+'file_invalid');continue;
      }
      const rel=path.posix.normalize(track.file.replace(/\\/g,'/'));
      if(rel==='..'||rel.startsWith('../')||rel.startsWith('/')||
         /^[a-zA-Z]:/.test(rel)){
        blockers.push(tag+'path_escape');continue;
      }
      if(seenFiles.has(rel)){ blockers.push(tag+'duplicate_file');continue; }
      seenFiles.add(rel);
      if(!directory)continue;
      try{
        const file=await realpath(path.join(directory,rel));
        const inside=path.relative(directory,file);
        if(!inside||inside==='..'||inside.startsWith('..'+path.sep)||path.isAbsolute(inside)){
          blockers.push(tag+'path_escape');continue;
        }
        const info=await stat(file);
        if(!info.isFile()||info.size<128||info.size>MAX_BYTES){
          blockers.push(tag+'file_size_invalid');continue;
        }
        const data=await readFile(file);
        if(!mp3Header(data)){blockers.push(tag+'not_mp3_header');continue;}
        const sha256=createHash('sha256').update(data).digest('hex');
        if(seenHashes.has(sha256)) blockers.push(tag+'duplicate_audio_bytes');
        seenHashes.add(sha256);
        inspected.push({number:n,title:track.title,format:'mp3',sizeBytes:data.length,sha256});
      }catch{
        blockers.push(tag+'file_unreadable');
      }
    }
  }
  if(inspected.length!==tracks?.length) blockers.push('chapters.incomplete');
  return {
    schema:'ekodi-audiobook-technical-preflight-v1',
    bookId:BOOK_ID.test(bookId||'')?bookId:null,
    edition:field(edition,160)?edition:null,
    technicalStatus:blockers.length?'blocked':'passed',
    chapters:inspected,
    blockers:[...new Set(blockers)],
    // Deliberate fail-closed gate. This checker cannot attest human approval.
    releaseReady:false,
    releaseBlockers:[
      'complete_mp3_decode_and_full_listening_qa',
      'author_publisher_rights_voice_accessibility_signoffs',
      'approved_catalog_edition_and_private_R2_metadata',
      'authenticated_buyer_entitlement_and_refund_e2e'
    ]
  };
}
async function main(argv){
  const args={};
  for(let i=0;i<argv.length;i+=2){
    if(!['--catalog','--submission','--root','--out'].includes(argv[i])||
       !argv[i+1]||args[argv[i]]) throw new Error('Invalid options');
    args[argv[i]]=argv[i+1];
  }
  if(!args['--catalog']||!args['--submission']||!args['--root'])
    throw new Error('Use --catalog books/books.json --submission /private/tracks.json --root /private/audio [--out /private/report.json]');
  const [a,b]=await Promise.all([readFile(args['--catalog']),readFile(args['--submission'])]);
  if(a.length>MAX_JSON||b.length>MAX_JSON)throw new Error('Input JSON too large');
  const report=await inspectAudiobookMaster({
    catalog:JSON.parse(a.toString('utf8')),
    submission:JSON.parse(b.toString('utf8')),
    root:args['--root']
  });
  const output=JSON.stringify(report,null,2)+'\n';
  if(args['--out']) await writeFile(args['--out'],output,{flag:'wx',mode:0o600});
  else process.stdout.write(output);
  process.exitCode=report.technicalStatus==='passed'?0:2;
}
if(process.argv[1]&&fileURLToPath(import.meta.url)===path.resolve(process.argv[1])){
  main(process.argv.slice(2)).catch(e=>{console.error('Audio preflight:',e.message);process.exitCode=2;});
}
