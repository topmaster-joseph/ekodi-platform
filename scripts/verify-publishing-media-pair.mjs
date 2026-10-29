/**
 * MEDIA-EDITION-PAIR-001 — private, offline EPUB + audiobook pairing evidence.
 * This is NEVER a publisher approval, entitlement, license or sale authorization.
 * It never uploads or publishes source assets and never charges a buyer.
 */
import { createHash } from 'node:crypto';
import { readFile, stat, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { inspectAudiobookMaster } from './verify-audiobook-master.mjs';
import { verifyFormalEpub } from './verify-epub-formal-qa.mjs';

const SHA256=/^[a-f0-9]{64}$/;
const BOOK_ID=/^BOOK-[A-Z0-9-]{1,90}$/;
const MAX_JSON=2*1024*1024;
const isObject=o=>o!==null&&typeof o==='object'&&!Array.isArray(o);
const matchesDigest=s=>typeof s==='string'&&SHA256.test(s);
function blocked(bookId,edition,blockers,epub=null,audio=null,fingerprint=null){
  return {
    schema:'ekodi-media-edition-pair-v1',bookId,edition,
    technicalStatus:blockers.length?'blocked':'passed_automated_only',
    blockers:[...new Set(blockers)],epub,audio,bundleSha256:fingerprint,
    releaseReady:false,
    saleReady:false,
    releaseBlockers:[
      'human_epub_and_accessibility_review',
      'author_publisher_audio_voice_and_rights_signoffs',
      'full_audio_decode_and_human_listening_qa',
      'signed_edition_and_royalty_commission_contracts',
      'verified_books_mall_purchase_entitlement_refund_e2e',
    ],
  };
}
const compactEpub=r=>r&&{
  technicalStatus:r.technicalStatus||'blocked',
  sha256:r.sha256||null,
  epubcheck:r.validators?.epubcheck&&{
    valid:r.validators.epubcheck.valid===true,
    errors:r.validators.epubcheck.errors||0,
    warnings:r.validators.epubcheck.warnings||0,
  },
  ace:r.validators?.ace&&{
    valid:r.validators.ace.valid===true,
    violations:r.validators.ace.violations||0,
    missingMetadataCount:r.validators.ace.missingMetadata?.length||0,
  },
};
const compactAudio=r=>r&&{
  technicalStatus:r.technicalStatus||'blocked',
  chapters:Array.isArray(r.chapters)?
    r.chapters.map(c=>({number:c.number,title:c.title,sha256:c.sha256,sizeBytes:c.sizeBytes})):[],
};
/**
 * approved is an expected *reference* obtained by the operator from a separate
 * approval workflow, not proof of that workflow's identity or signature.
 */
export async function inspectEditionMediaPair({
  catalog,approved,epubFile,audioSubmission,audioRoot,
  inspectAudio=inspectAudiobookMaster,inspectEpub=verifyFormalEpub,
}={}){
  const blockers=[];
  const bookId=typeof approved?.bookId==='string'?approved.bookId:null;
  const edition=typeof approved?.edition==='string'?approved.edition:null;
  if(!BOOK_ID.test(bookId||''))blockers.push('approved.book_id_invalid');
  if(!edition||edition.length>160)blockers.push('approved.edition_invalid');
  if(!matchesDigest(approved?.epubSha256))blockers.push('approved.epub_digest_invalid');
  const pins=approved?.audioChapters;
  if(!Array.isArray(pins)||pins.length<1||pins.length>120)
    blockers.push('approved.audio_chapters_invalid');
  if(!isObject(catalog)||!Array.isArray(catalog.books))
    blockers.push('catalog.invalid');
  const books=catalog?.books;
  const matches=Array.isArray(books)?books.filter(b=>b.id===bookId):[];
  if(matches.length!==1)blockers.push('catalog.book_missing_or_duplicate');
  else if(matches[0].edition!==edition)blockers.push('catalog.edition_mismatch');
  if(!isObject(audioSubmission)||audioSubmission.bookId!==bookId||
    audioSubmission.edition!==edition)blockers.push('audio.edition_mismatch');
  if(Array.isArray(pins)){
    const seen=new Set();
    for(let i=0;i<pins.length;i++){
      const p=pins[i],tag='approved.audio_chapter.'+(i+1)+'.';
      if(!isObject(p)||p.number!==i+1||typeof p.title!=='string'||
        !p.title.trim()||p.title.length>150||!matchesDigest(p.sha256))
        blockers.push(tag+'invalid');
      if(p?.sha256&&seen.has(p.sha256))blockers.push(tag+'duplicate_digest');
      if(p?.sha256)seen.add(p.sha256);
    }
  }
  if(blockers.length)return blocked(bookId,edition,blockers);
  let a=null;
  try{a=await inspectAudio({catalog,submission:audioSubmission,root:audioRoot});}
  catch{blockers.push('audio.preflight_exception');}
  if(!a||a.technicalStatus!=='passed'||a.bookId!==bookId||a.edition!==edition||
    a.releaseReady!==false||a.blockers?.length)
    blockers.push('audio.preflight_failed');
  const audioTracks=Array.isArray(a?.chapters)?a.chapters:[];
  if(audioTracks.length!==pins.length)blockers.push('audio.chapter_count_mismatch');
  for(let i=0;i<pins.length;i++){
    const pin=pins[i],actual=audioTracks[i];
    if(!actual||actual.number!==pin.number||actual.title!==pin.title||
      actual.sha256!==pin.sha256||actual.format!=='mp3')
      blockers.push('audio.chapter.'+(i+1)+'.edition_or_digest_mismatch');
  }
  // Do not invoke optional external EPUB validators for invalid or unpinned audio.
  if(blockers.length)return blocked(bookId,edition,blockers,null,compactAudio(a));
  let e=null;
  try{
    e=await inspectEpub({
      epub:epubFile,expected:{bookId,edition,sha256:approved.epubSha256}
    });
  }catch{blockers.push('epub.formal_qa_exception');}
  if(!e||e.technicalStatus!=='passed_automated_only'||
    e.releaseReady!==false||e.bookId!==bookId||e.edition!==edition||
    e.sha256!==approved.epubSha256||e.blockers?.length||
    e.validators?.epubcheck?.valid!==true||
    e.validators.epubcheck.errors!==0||
    e.validators.epubcheck.warnings!==0||
    e.validators?.ace?.valid!==true||
    e.validators.ace.violations!==0)
    blockers.push('epub.formal_qa_failed');
  if(blockers.length)return blocked(bookId,edition,blockers,compactEpub(e),compactAudio(a));
  // Deterministic version-bound digest, without raw audio/manuscript content.
  const fingerprint=createHash('sha256').update(JSON.stringify({
    schema:'ekodi-edition-audio-fingerprint-v1',bookId,edition,
    epubSha256:approved.epubSha256,
    audioChapters:pins.map(p=>({number:p.number,title:p.title,sha256:p.sha256})),
  })).digest('hex');
  return blocked(bookId,edition,[],compactEpub(e),compactAudio(a),fingerprint);
}
async function readSmallJson(file){
  const f=await stat(file);
  if(!f.isFile()||f.size>MAX_JSON||f.size<2)throw new Error('json_input_invalid');
  return JSON.parse(await readFile(file,'utf8'));
}
async function main(argv){
  const flags=new Set(['--catalog','--approved','--epub','--audio-submission','--audio-root','--out']);
  const args={};
  if(argv.length%2)throw new Error('arguments_invalid');
  for(let i=0;i<argv.length;i+=2){
    if(!flags.has(argv[i])||!argv[i+1]||args[argv[i]])throw new Error('arguments_invalid');
    args[argv[i]]=argv[i+1];
  }
  if(!['--catalog','--approved','--epub','--audio-submission','--audio-root'].every(k=>args[k]))
    throw new Error('required_inputs_missing');
  const [catalog,approved,audioSubmission]=await Promise.all([
    readSmallJson(args['--catalog']),readSmallJson(args['--approved']),
    readSmallJson(args['--audio-submission']),
  ]);
  const result=await inspectEditionMediaPair({
    catalog,approved,epubFile:args['--epub'],
    audioSubmission,audioRoot:args['--audio-root'],
  });
  const output=JSON.stringify(result,null,2)+'\n';
  if(args['--out'])await writeFile(args['--out'],output,{flag:'wx',mode:0o600});
  else process.stdout.write(output);
  process.exitCode=result.technicalStatus==='passed_automated_only'?0:2;
}
if(process.argv[1]&&fileURLToPath(import.meta.url)===path.resolve(process.argv[1]))
  main(process.argv.slice(2)).catch(()=>{
    console.error('Media edition pair: invalid private inputs or unavailable file');
    process.exitCode=2;
  });
