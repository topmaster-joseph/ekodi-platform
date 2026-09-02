import test from 'node:test';
import assert from 'node:assert/strict';
import { createDevotionPublisher } from '../src/service.js';

const batch={workspace_id:'workspace-a',batch_key:'2026-09',title:'9월 묵상',items:[{id:'02',passage:'신명기 15:1-11',metadata:{render_version:'v1'}}]};
const publication={workspace_id:'workspace-a',batch_key:'2026-09',target_id:'church',publish_at:'2026-09-02T06:00:00+09:00',item_ids:['02']};
const target={id:'church',kind:'youtube',config_ref:'channel-a',metadata:{}};

test('publisher loads durable video and script assets before scheduling',async()=>{
  const requested=[];
  const assets={ready:()=>true,async get({asset_key}){requested.push(asset_key);if(asset_key.includes('publication-'))return null;if(asset_key.endsWith('video.mp4'))return{data:Buffer.from('video')};return{data:Buffer.from(JSON.stringify({title:'빚을 놓아주는 시간',publish_title:'놓아주어야 다시 시작됩니다',description:'신명기 15:1-11 묵상',hashtags:['#매일묵상','#신명기']}))}}};
  let upload;
  const youtube={async upload(input){upload=input;return{video_id:'abc123',url:'https://www.youtube.com/watch?v=abc123'}}};
  const service=createDevotionPublisher({assets,youtube,clock:()=>new Date('2026-09-02T02:00:00+09:00')});
  const result=await service.schedule({publication,target,batch});
  assert.deepEqual(requested,['2026-09/02/v1/video.mp4','2026-09/02/v1/script.json','2026-09/02/v1/publication-church.json']);
  assert.equal(upload.configRef,'channel-a');
  assert.equal(upload.title,'놓아주어야 다시 시작됩니다');
  assert.match(upload.description,/#매일묵상/);
  assert.equal(result.external_ref,'abc123');
});

test('publisher does not silently back-publish a past devotional',async()=>{
  const service=createDevotionPublisher({assets:{ready:()=>true},youtube:{},clock:()=>new Date('2026-09-02T08:00:00+09:00')});
  await assert.rejects(service.schedule({publication,target,batch}),error=>error?.code==='PUBLISH_AT_NOT_FUTURE');
});

test('publisher reuses a stored publication record instead of uploading twice',async()=>{
  const map=new Map([
    ['2026-09/02/v1/video.mp4',{data:Buffer.from('video')}],
    ['2026-09/02/v1/script.json',{data:Buffer.from(JSON.stringify({publish_title:'한 번만 예약',description:'묵상',hashtags:['#묵상','#신명기']}))}]
  ]);
  const assets={
    ready:()=>true,
    async get({asset_key}){return map.get(asset_key)||null},
    async put({asset_key,data}){map.set(asset_key,{data:Buffer.from(data)});return{asset_key,size:Buffer.from(data).length}}
  };
  let uploads=0;
  const youtube={async upload(){uploads++;return{video_id:'once',url:'https://www.youtube.com/watch?v=once'}}};
  const service=createDevotionPublisher({assets,youtube,clock:()=>new Date('2026-09-02T02:00:00+09:00')});
  const first=await service.schedule({publication,target,batch});
  const second=await service.schedule({publication,target,batch});
  assert.equal(uploads,1);
  assert.equal(first.external_ref,'once');
  assert.equal(second.results[0].video_id,'once');
  assert.equal(second.results[0].idempotent,true);
});
