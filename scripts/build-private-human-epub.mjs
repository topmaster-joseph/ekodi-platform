/**
 * EKODI Human Publishing private EPUB3 DRAFT builder.
 *
 * A manuscript MUST come from an authorized EKODI editor's private workspace.
 * Input claims are not publisher signatures. This code neither writes stories
 * nor calls external AI APIs, and it cannot release, sell or distribute books.
 */
import {createHash} from 'node:crypto';
import {readFile,writeFile,stat,realpath,open,unlink} from 'node:fs/promises';
import {deflateRawSync} from 'node:zlib';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
import {FIELD_CATALOG,monthlyEditorialSlots} from '../publishing/human/editorial-policy.js';
import {inspectEpubMaster} from './verify-epub-master.mjs';

const MAX_SOURCE=5*1024*1024,MAX_EPUB=50*1024*1024;
const asciiId=/^[A-Za-z0-9][A-Za-z0-9._-]{5,100}$/;
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
const escapeXml=v=>String(v).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
  .replace(/"/g,'&quot;').replace(/'/g,'&apos;');
const strictText=(v,min,max,label)=>{
  if(typeof v!=='string'||v.trim().length<min||v.length>max||/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(v))
    throw new Error('manuscript_'+label+'_invalid');
  return v.trim();
};
const crcTable=Uint32Array.from({length:256},(_,n)=>{
  let value=n;
  for(let i=0;i<8;i++)value=(value>>>1)^((value&1)?0xedb88320:0);
  return value>>>0;
});
function crc32(data){
  let value=0xffffffff;
  for(const byte of data)value=crcTable[(value^byte)&255]^(value>>>8);
  return (value^0xffffffff)>>>0;
}
function xmlPage(title,body,lang){
  return '<?xml version="1.0" encoding="UTF-8"?>\n'+
    '<!DOCTYPE html>\n'+
    '<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops"'+
    ' lang="'+escapeXml(lang)+'" xml:lang="'+escapeXml(lang)+'">'+
    '<head><meta charset="utf-8"/><title>'+escapeXml(title)+'</title>'+
    '<link rel="stylesheet" type="text/css" href="../styles/book.css"/></head>'+
    '<body>'+body+'</body></html>';
}
export function validatePrivateManuscript(raw){
  if(!raw||typeof raw!=='object'||Array.isArray(raw))throw new Error('manuscript_required');
  const {month,fieldId,slotId,bookId,editionId,date,language}=raw;
  const ids=FIELD_CATALOG.map(x=>x.id);
  if(!/^\d{4}-(?:0[1-9]|1[0-2])$/.test(month||'')||!ids.includes(fieldId)||
     slotId!==monthlyEditorialSlots(month).find(x=>x.fieldId===fieldId).id)
    throw new Error('manuscript_slot_mismatch');
  if(!asciiId.test(bookId||'')||!asciiId.test(editionId||''))
    throw new Error('manuscript_identity_invalid');
  if(typeof date!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(date)||
     !Number.isFinite(Date.parse(date+'T00:00:00Z'))||
     new Date(date+'T00:00:00Z').toISOString().slice(0,10)!==date||
     date.slice(0,7)!==month || Number(date.slice(0,4))<1980||Number(date.slice(0,4))>2107)
    throw new Error('manuscript_date_invalid');
  if(!['ko','en'].includes(language))throw new Error('manuscript_language_invalid');
  const title=strictText(raw.title,2,160,'title');
  const author=strictText(raw.authorDisplay,2,120,'author');
  if(raw.seriesId==='EKODIAN'||raw.collectionId==='ekodian')
    throw new Error('manuscript_series_excluded');
  if(!Array.isArray(raw.chapters)||raw.chapters.length<1||raw.chapters.length>24)
    throw new Error('manuscript_chapters_invalid');
  const chapterTitles=new Set();
  const chapters=raw.chapters.map((c,i)=>{
    const name=strictText(c?.title,2,130,'chapter_title');
    const body=strictText(c?.body,160,450000,'chapter_body');
    if(chapterTitles.has(name))throw new Error('manuscript_duplicate_chapter_title');
    chapterTitles.add(name);
    return Object.freeze({id:'ch'+String(i+1).padStart(2,'0'),title:name,body});
  });
  const sum=chapters.reduce((n,c)=>n+c.body.length,0);
  if(sum<350||sum>2500000)throw new Error('manuscript_content_length_invalid');
  return Object.freeze({month,fieldId,slotId,bookId,editionId,date,language,
    title,author,chapters});
}
function zipArchive(entries,date){
  const parts=date.split('-').map(Number);
  const dosDate=((parts[0]-1980)<<9)|(parts[1]<<5)|parts[2];
  const local=[],central=[];let offset=0;
  for(const {name,content,method} of entries){
    const nameBytes=Buffer.from(name,'utf8'),body=Buffer.from(content,'utf8');
    const compressed=method===8?deflateRawSync(body):body;
    if(body.length>15*1024*1024 || compressed.length>15*1024*1024)
      throw new Error('epub_resource_limit');
    const checksum=crc32(body);
    const l=Buffer.alloc(30);l.writeUInt32LE(0x04034b50,0);l.writeUInt16LE(20,4);
    l.writeUInt16LE(0x0800,6);l.writeUInt16LE(method,8);
    l.writeUInt16LE(0,10);l.writeUInt16LE(dosDate,12);l.writeUInt32LE(checksum,14);
    l.writeUInt32LE(compressed.length,18);l.writeUInt32LE(body.length,22);
    l.writeUInt16LE(nameBytes.length,26);
    local.push(l,nameBytes,compressed);
    const cd=Buffer.alloc(46);cd.writeUInt32LE(0x02014b50,0);cd.writeUInt16LE(20,4);
    cd.writeUInt16LE(20,6);cd.writeUInt16LE(0x0800,8);cd.writeUInt16LE(method,10);
    cd.writeUInt16LE(0,12);cd.writeUInt16LE(dosDate,14);cd.writeUInt32LE(checksum,16);
    cd.writeUInt32LE(compressed.length,20);cd.writeUInt32LE(body.length,24);
    cd.writeUInt16LE(nameBytes.length,28);cd.writeUInt32LE(0x81a40000,38);
    cd.writeUInt32LE(offset,42);central.push(cd,nameBytes);
    offset+=l.length+nameBytes.length+compressed.length;
  }
  const directory=Buffer.concat(central),end=Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50,0);end.writeUInt16LE(entries.length,8);
  end.writeUInt16LE(entries.length,10);end.writeUInt32LE(directory.length,12);
  end.writeUInt32LE(offset,16);
  const archive=Buffer.concat([...local,directory,end]);
  if(archive.length>MAX_EPUB)throw new Error('epub_size_limit');
  return archive;
}
function chaptersAsXhtml(model){
  return model.chapters.map(chapter=>{
    const paragraphs=chapter.body.split(/\n\s*\n/).map(x=>x.trim()).filter(Boolean);
    return xmlPage(chapter.title,
      '<section epub:type="chapter" aria-labelledby="'+chapter.id+'">'+
      '<h1 id="'+chapter.id+'">'+escapeXml(chapter.title)+'</h1>'+
      paragraphs.map(text=>'<p>'+escapeXml(text).replace(/\n/g,' ')+'</p>').join('')+
      '</section>',model.language);
  });
}
export function buildPrivateEpubBytes(raw){
  const m=validatePrivateManuscript(raw),pages=chaptersAsXhtml(m);
  const navItems=m.chapters.map((chapter,i)=>{
    return '<li><a href="text/'+chapter.id+'.xhtml">'+escapeXml(chapter.title)+'</a></li>';
  }).join('');
  const nav='<?xml version="1.0" encoding="UTF-8"?>'+
    '<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops"'+
    ' lang="'+m.language+'" xml:lang="'+m.language+'"><head><title>목차</title></head>'+
    '<body><nav epub:type="toc" id="toc"><h1>목차</h1><ol>'+navItems+'</ol></nav></body></html>';
  const items=m.chapters.map(ch=>'<item id="'+ch.id+'" href="text/'+ch.id+
    '.xhtml" media-type="application/xhtml+xml"/>').join('');
  const spine=m.chapters.map(ch=>'<itemref idref="'+ch.id+'"/>').join('');
  const opf='<?xml version="1.0" encoding="UTF-8"?>'+
    '<package xmlns="http://www.idpf.org/2007/opf" version="3.0" unique-identifier="uid" '+
    'prefix="schema: http://schema.org/">'+
    '<metadata xmlns:dc="http://purl.org/dc/elements/1.1/">'+
    '<dc:identifier id="uid">'+escapeXml(m.bookId+':'+m.editionId)+'</dc:identifier>'+
    '<dc:title>'+escapeXml(m.title)+'</dc:title><dc:creator>'+escapeXml(m.author)+'</dc:creator>'+
    '<dc:language>'+m.language+'</dc:language><dc:date>'+m.date+'</dc:date>'+
    '<meta property="dcterms:modified">'+m.date+'T00:00:00Z</meta>'+
    '<meta property="schema:accessMode">textual</meta>'+
    '<meta property="schema:accessibilityFeature">structuralNavigation</meta>'+
    '</metadata><manifest>'+
    '<item id="nav" href="nav.xhtml" media-type="application/xhtml+xml" properties="nav"/>'+
    '<item id="css" href="styles/book.css" media-type="text/css"/>'+items+
    '</manifest><spine>'+spine+'</spine></package>';
  const container='<?xml version="1.0" encoding="UTF-8"?>'+
    '<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">'+
    '<rootfiles><rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/>'+
    '</rootfiles></container>';
  const css='html{font-family:serif;line-height:1.65}body{margin:0 5%}h1{font-size:1.6em;line-height:1.35}'+
    'p{margin:.75em 0;orphans:2;widows:2;text-align:left}a{color:inherit}';
  const entries=[
    {name:'mimetype',content:'application/epub+zip',method:0},
    {name:'META-INF/container.xml',content:container,method:8},
    {name:'OEBPS/content.opf',content:opf,method:8},
    {name:'OEBPS/nav.xhtml',content:nav,method:8},
    {name:'OEBPS/styles/book.css',content:css,method:8},
    ...pages.map((p,i)=>({name:'OEBPS/text/'+m.chapters[i].id+'.xhtml',content:p,method:8}))
  ];
  return {bytes:zipArchive(entries,m.date),identity:{bookId:m.bookId,edition:m.editionId,
    slotId:m.slotId,fieldId:m.fieldId,chapters:m.chapters.length}};
}
function inside(root,target){const relative=path.relative(root,target);return relative!==''&&!relative.startsWith('..'+path.sep)&&relative!=='..'&&!path.isAbsolute(relative);}
export async function preparePrivateEpub({sourceFile,outputFile,privateRoot}={}){
  if(![sourceFile,outputFile,privateRoot].every(p=>typeof p==='string'&&path.isAbsolute(p)))
    throw new Error('private_absolute_paths_required');
  const root=await realpath(privateRoot);
  const repo=await realpath(process.cwd());
  if(inside(repo,root)||root===repo)throw new Error('private_root_inside_checkout_denied');
  const source=await realpath(sourceFile),outputDir=await realpath(path.dirname(outputFile));
  if(!inside(root,source)||!inside(root,outputDir)&&root!==outputDir)
    throw new Error('source_or_output_outside_private_root');
  const st=await stat(source);
  if(!st.isFile()||st.size<100||st.size>MAX_SOURCE)throw new Error('private_source_size_invalid');
  let manuscript;
  try{manuscript=JSON.parse(await readFile(source,'utf8'));}catch{throw new Error('private_manuscript_json_invalid');}
  const {bytes,identity}=buildPrivateEpubBytes(manuscript);
  let handle;
  try{
    handle=await open(outputFile,'wx',0o600);
    try{await handle.writeFile(bytes);}finally{await handle.close();}
    const report=await inspectEpubMaster({file:outputFile,expected:{
      bookId:identity.bookId,edition:identity.edition,sha256:sha(bytes)
    }});
    if(report.technicalStatus!=='passed'||report.approvedDigestMatched!==true)
      throw new Error('epub_structural_readback_failed');
    return {
      schema:'ekodi-human-private-epub-draft-v1',
      ...identity,sha256:sha(bytes),resourceCount:report.resourceCount,
      structuralStatus:'passed_unapproved_draft',
      epubcheckPassed:false,acePassed:false,rightsApproved:false,
      authorApproved:false,publisherApproved:false,releaseReady:false,
      saleReady:false,modelsCalled:0,publicationActions:0
    };
  }catch(e){
    if(handle){try{await handle.close();}catch{}try{await unlink(outputFile);}catch{}}
    throw e;
  }
}
async function cli(argv){
  const x={};
  for(let i=0;i<argv.length;i+=2){
    if(!['--private-root','--source','--out','--receipt'].includes(argv[i])||!argv[i+1]||x[argv[i]])
      throw new Error('cli_arguments_invalid');
    x[argv[i]]=argv[i+1];
  }
  if(!x['--private-root']||!x['--source']||!x['--out']||!x['--receipt'])
    throw new Error('private_root_source_out_and_receipt_required');
  const root=await realpath(x['--private-root']);
  const receiptDir=await realpath(path.dirname(x['--receipt']));
  if(!inside(root,receiptDir)&&root!==receiptDir)
    throw new Error('receipt_outside_private_root');
  const report=await preparePrivateEpub({privateRoot:root,sourceFile:x['--source'],outputFile:x['--out']});
  await writeFile(x['--receipt'],JSON.stringify(report,null,2)+'\n',{flag:'wx',mode:0o600});
  process.stdout.write('Private EPUB draft ready for further QA. No publication.\n');
}
if(process.argv[1]&&fileURLToPath(import.meta.url)===path.resolve(process.argv[1]))
  cli(process.argv.slice(2)).catch(e=>{
    // Do not print manuscript excerpts, bearer tokens, paths or private metadata.
    console.error('EKODI private EPUB generation blocked:',String(e?.message||'unknown').slice(0,100));
    process.exitCode=2;
  });
