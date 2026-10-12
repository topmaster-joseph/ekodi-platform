import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import {
  SOCIAL_CHANNEL_PROVIDERS, DEFAULT_REGISTRY, normalizeRegistry, publicSocialRegistrySnapshot
} from '../social-registry-api.js';

const group = (channels, extra={}) => ({
  id:'mall',name:'에코디몰',website:'https://ekodi.kr/ekodimall/',isActive:true,channels,...extra
});
const channel = (values={}) => ({
  id:'mall-blog',provider:'naver_blog',label:'에코디몰 블로그',url:'https://blog.naver.com/example',
  kind:'owned',purpose:'commerce',visibility:'public',publicationMode:'link_only',isActive:true,...values
});

test('existing active channels retain their public links and never leak directory-only permissions',()=>{
  const legacy=normalizeRegistry(DEFAULT_REGISTRY);
  const publicView=publicSocialRegistrySnapshot(legacy);
  const church=publicView.organizations.find(org=>org.id==='church');
  const yt=church.channels.find(c=>c.id==='church-youtube');
  assert.equal(yt.handle,'@ekodichurch');
  assert.ok(yt.channelId.startsWith('UC'));
  assert.ok(!('publicationMode' in yt));
  assert.ok(!('kind' in yt));
  assert.ok(SOCIAL_CHANNEL_PROVIDERS.includes('marketplace'));
  assert.ok(SOCIAL_CHANNEL_PROVIDERS.includes('newsletter'));
});

test('the central directory can register internal, external and affiliate channels without enabling publishing',()=>{
  const registry=normalizeRegistry({organizations:[group([
    channel(),
    channel({id:'mall-store',provider:'marketplace',label:'외부 판매처',kind:'partner',url:'https://shop.example/item',publicationMode:'link_only'}),
    channel({id:'mall-internal',provider:'rss',visibility:'internal',url:'https://ekodi.kr/ekodimall/feed.xml'}),
    channel({id:'mall-hidden',provider:'website',isActive:false,url:'https://example.org'})
  ])]});
  assert.equal(registry.organizations[0].channels.length,4);
  const publicView=publicSocialRegistrySnapshot(registry);
  assert.deepEqual(publicView.organizations[0].channels.map(x=>x.id).sort(),['mall-blog','mall-store']);
  assert.ok(publicView.organizations[0].channels.every(x=>!Object.hasOwn(x,'publicationMode')));
});

test('hidden organizations cannot leak public channels',()=>{
  assert.equal(publicSocialRegistrySnapshot({organizations:[group([channel()],{socialPolicy:'none'})]}).organizations.length,0);
  assert.equal(publicSocialRegistrySnapshot({organizations:[group([channel()],{isActive:false})]}).organizations.length,0);
});

test('untrusted/partner/public links cannot grant automatic publish or reveal private hosts',()=>{
  const one=x=>normalizeRegistry({organizations:[group([x])]});
  assert.throws(()=>one(channel({kind:'external',publicationMode:'manual'})),/link-only/);
  assert.throws(()=>one(channel({kind:'partner',publicationMode:'automatic'})),/automatic posting/);
  assert.throws(()=>one(channel({visibility:'unknown'})),/unsupported visibility/);
  assert.throws(()=>one(channel({url:'https://user:secret@example.org/a'})),/credentials/);
  assert.throws(()=>one(channel({url:'https://127.0.0.1/admin'})),/private network/);
  assert.throws(()=>one(channel({url:'http://example.org'})),/https/);
});

test('central UI distinguishes directory entries from OAuth connections and offers a Mall group',async()=>{
  const ui=await readFile(new URL('../social-admin.js',import.meta.url),'utf8');
  assert.match(ui,/에코디몰 채널 그룹/);
  assert.match(ui,/외부·제휴 채널 등록/);
  assert.match(ui,/channel\.visibility=visibility\.value/);
  assert.match(ui,/channel\.kind=kind\.value/);
  assert.match(ui,/공식 OAuth 연결/);
  assert.match(ui,/channel\.publicationMode=publicationMode\.value/);
  assert.match(ui,/publicationMode\.disabled = kind\.value !== 'owned'/);
  assert.match(ui,/function applyDirectoryFilters\(\)/);
  assert.match(ui,/channelSearch\.addEventListener\('input',applyDirectoryFilters\)/);
  assert.match(ui,/kindFilter\.addEventListener\('change',applyDirectoryFilters\)/);
});
