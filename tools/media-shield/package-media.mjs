#!/usr/bin/env node
// EKODI Media Shield packager — encrypts fragmented MP4 (init + media segments) for
// the software shield and writes the manifest. Upload the output folder to R2 under
// media-shield/<contentId>/ (bucket bound as MEDIA_SHIELD_BUCKET).
//
// 1) Fragment the source (free tools):
//    ffmpeg -i input.mp4 -c:v libx264 -c:a aac -f hls -hls_time 6 -hls_playlist_type vod \
//      -hls_segment_type fmp4 -hls_fmp4_init_filename init.mp4 -hls_segment_filename 'seg%05d.m4s' out.m3u8
// 2) EKODI_MEDIA_SHIELD_MASTER_KEY=... node tools/media-shield/package-media.mjs \
//      --in ./fragments --out ./packaged --content sermon-20261115 --title "주일 말씀" \
//      --mime 'video/mp4; codecs="avc1.64001f, mp4a.40.2"' --audience members
// 3) wrangler r2 object put ekodi-storage/media-shield/<contentId>/<file> --file packaged/<file> (each file)
import { readdir, readFile, writeFile, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { deriveContentKeyBytes, encryptSegment, isValidContentId, MEDIA_SHIELD_VERSION } from '../../ekodi-media-shield.js';

const args=Object.fromEntries(process.argv.slice(2).reduce((pairs,value,index,all)=>{if(value.startsWith('--'))pairs.push([value.slice(2),all[index+1]&&!all[index+1].startsWith('--')?all[index+1]:'true']);return pairs;},[]));
const master=process.env.EKODI_MEDIA_SHIELD_MASTER_KEY||'';
const contentId=String(args.content||'').toLowerCase();
if(!args.in||!args.out||!isValidContentId(contentId)||master.length<32){
  console.error('usage: EKODI_MEDIA_SHIELD_MASTER_KEY=<32+ chars> package-media.mjs --in DIR --out DIR --content ID --mime MIME [--title T] [--audience members|subjects] [--subjects a@x,b@y] [--init init.mp4]');
  process.exit(2);
}
const initName=args.init||'init.mp4';
const files=(await readdir(args.in)).filter(name=>/\.(m4s|mp4)$/i.test(name)&&name!==initName).sort((a,b)=>a.localeCompare(b,undefined,{numeric:true}));
if(!files.length)throw new Error('no media segments found');
const key=await deriveContentKeyBytes(master,contentId);
await mkdir(args.out,{recursive:true});
const write=async(source,target)=>{
  const plain=new Uint8Array(await readFile(join(args.in,source)));
  await writeFile(join(args.out,target),await encryptSegment(key,contentId,target,plain));
};
await write(initName,'init.bin');
const segments=[];
for(const [index,name] of files.entries()){
  const target=`s${String(index+1).padStart(5,'0')}.bin`;
  await write(name,target);
  segments.push(target);
}
const manifest={
  version:MEDIA_SHIELD_VERSION,contentId,title:String(args.title||contentId),
  mime:String(args.mime||'video/mp4; codecs="avc1.64001f, mp4a.40.2"'),
  init:'init.bin',segments,
  audience:args.audience==='members'?'members':'subjects',
  subjects:String(args.subjects||'').split(',').map(v=>v.trim().toLowerCase()).filter(Boolean),
  packagedAt:new Date().toISOString(),
};
await writeFile(join(args.out,'manifest.json'),JSON.stringify(manifest,null,2));
console.log(`packaged ${segments.length} segments for ${contentId} → ${args.out}`);
