// Guards the production QR screen-share probe against two defects that made
// the Education deploy fail although the product worked: a corrupted PNG
// fixture (bad IDAT CRC, rejected by Chromium) and waits that expected a
// `[hidden]` element to become visible.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {crc32,inflateSync} from 'node:zlib';

const source=readFileSync(new URL('../scripts/verify-education-screen-share-native.mjs',import.meta.url),'utf8');

test('learner still-image fixture is a decodable PNG with valid chunk CRCs',()=>{
 const match=source.match(/Buffer\.from\('([A-Za-z0-9+/=]+)','base64'\)/);
 assert.ok(match,'fixture literal present');
 const png=Buffer.from(match[1],'base64');
 assert.equal(png.subarray(0,8).toString('hex'),'89504e470d0a1a0a');
 let offset=8;const types=[];let idat=Buffer.alloc(0);
 while(offset<png.length){
  const length=png.readUInt32BE(offset);const type=png.subarray(offset+4,offset+8);const data=png.subarray(offset+8,offset+8+length);
  assert.equal(png.readUInt32BE(offset+8+length),crc32(Buffer.concat([type,data]))>>>0,`${type} CRC`);
  if(type.toString()==='IDAT')idat=Buffer.concat([idat,data]);
  types.push(type.toString());offset+=12+length;
 }
 assert.deepEqual(types,['IHDR','IDAT','IEND']);
 assert.ok(inflateSync(idat).length>0);
});

test('probe never waits for a [hidden] element to become visible',()=>{
 assert.doesNotMatch(source,/\[hidden\]'\)\.waitFor\(\{timeout/);
 assert.match(source,/locator\('#remoteImage'\)\.waitFor\(\{state:'hidden'/);
});
