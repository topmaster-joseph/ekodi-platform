import test from 'node:test';
import assert from 'node:assert/strict';
import {createDevotionPipeline} from '../src/service.js';
import {createHttpVoice} from '../src/adapters/http-voice.js';
import {createHttpAssets} from '../src/adapters/http-assets.js';
import {createHttpRenderer} from '../src/adapters/http-renderer.js';

function memoryAssets(ready=true){
  const map=new Map();
  const key=(workspace,asset)=>`${workspace}::${asset}`;
  return{
    map,ready:()=>ready,
    async put({workspace_id,asset_key,data,mime_type,metadata}){
      const record={workspace_id,asset_key,data:Buffer.from(data),mime_type,metadata};
      map.set(key(workspace_id,asset_key),record);
      return{workspace_id,asset_key,mime_type,metadata,size:record.data.length,stored_at:'2026-09-01T00:00:00.000Z'};
    },
    async get({workspace_id,asset_key}){return map.get(key(workspace_id,asset_key))||null}
  };
}
const video64=Buffer.from('MP4').toString('base64');
const baseInput={workspace_id:'workspace-a',batch_key:'2026-09',item_id:'01',render_version:'v1',passage:'신명기 14:22-29',script:'받은 복은 흘려보낼 때 하나님의 복이 됩니다.',metadata:{duration_seconds:30}};

test('pipeline is idempotent for the same workspace/batch/item/version',async()=>{
  const assets=memoryAssets();let voiceCalls=0,renderCalls=0;
  const voice={ready:()=>true,async synthesize(){voiceCalls++;return{audio:Buffer.from('WAV'),mime_type:'audio/wav',provider_model:'fake'}}};
  const renderer={ready:()=>true,async render({job,batch,voice_asset}){renderCalls++;assert.equal(job.id,'workspace-a:2026-09:01:v1');assert.equal(batch.items[0].metadata.voice_asset_key,'2026-09/01/v1/voice.wav');assert.equal(voice_asset.data.toString(),'WAV');return{ok:true,artifacts:[{item_id:'01',path:'/tmp/01.mp4',video_base64:video64}]}}};
  const pipeline=createDevotionPipeline({voice,assets,renderer,clock:()=>new Date('2026-09-01T00:00:00Z')});
  const first=await pipeline.processItem(baseInput);
  const replay=await pipeline.processItem(baseInput);
  assert.equal(first.idempotent,false);
  assert.equal(replay.idempotent,true);
  assert.equal(voiceCalls,1);
  assert.equal(renderCalls,1);
  assert.equal(replay.render.artifacts[0].path,'/tmp/01.mp4');
  assert.equal(replay.video_asset.asset_key,'2026-09/01/v1/video.mp4');
});

test('identical batch/item/version keys remain isolated by workspace_id',async()=>{
  const assets=memoryAssets();let calls=0;
  const pipeline=createDevotionPipeline({voice:{ready:()=>true,async synthesize(){return{audio:Buffer.from(`v${++calls}`),mime_type:'audio/wav'}}},assets,renderer:{ready:()=>true,async render({batch}){return{workspace_id:batch.workspace_id,artifacts:[{video_base64:video64}]}}}});
  const a=await pipeline.processItem(baseInput);
  const b=await pipeline.processItem({...baseInput,workspace_id:'workspace-b'});
  assert.equal(a.render.workspace_id,'workspace-a');
  assert.equal(b.render.workspace_id,'workspace-b');
  assert.equal(calls,2);
  assert.equal(assets.map.size,6);
});

test('pipeline reuses stored voice after a renderer failure',async()=>{
  const assets=memoryAssets();let voiceCalls=0,renderCalls=0;
  const voice={ready:()=>true,async synthesize(){voiceCalls++;return{audio:Buffer.from('voice-once'),mime_type:'audio/wav'}}};
  const renderer={ready:()=>true,async render(){renderCalls++;if(renderCalls===1)throw new Error('temporary render failure');return{ok:true,artifacts:[{path:'/tmp/retry.mp4',video_base64:video64}]}}};
  const pipeline=createDevotionPipeline({voice,assets,renderer});
  await assert.rejects(pipeline.processItem(baseInput),/temporary render failure/);
  const recovered=await pipeline.processItem(baseInput);
  assert.equal(recovered.render.artifacts[0].path,'/tmp/retry.mp4');
  assert.equal(voiceCalls,1);
  assert.equal(renderCalls,2);
});

test('pipeline can generate and persist a missing script through the writer port',async()=>{
  const assets=memoryAssets();let writerCalls=0;
  const writer={ready:()=>true,async write(){writerCalls++;return{title:'복은 흐릅니다',narration:'가'.repeat(220),core:'복은 이웃에게 흐릅니다.',application_question:'오늘 누구와 나눌 수 있을까요?',prayer:'하나님, 받은 것을 기쁘게 나누게 하소서.',publish_title:'흐르는 복',description:'신명기 묵상',hashtags:['#묵상','#나눔'],provider:'stub',provider_model:'test'}}};
  const voice={ready:()=>true,async synthesize({text}){assert.equal(text.length,220);return{audio:Buffer.from('voice'),mime_type:'audio/wav'}}};
  const renderer={ready:()=>true,async render(){return{ok:true,artifacts:[{video_base64:video64}]}}};
  const pipeline=createDevotionPipeline({writer,voice,assets,renderer});
  const result=await pipeline.processItem({...baseInput,script:''});
  assert.equal(writerCalls,1);
  assert.equal(result.script_asset.asset_key,'2026-09/01/v1/script.json');
  assert.ok(assets.map.has('workspace-a::2026-09/01/v1/script.json'));
});

test('pipeline fails closed with explicit dependency error codes',async()=>{
  const disconnected={ready:()=>false};
  const goodVoice={ready:()=>true,async synthesize(){return{audio:Buffer.from('x'),mime_type:'audio/wav'}}};
  const goodRenderer={ready:()=>true,async render(){return{ok:true,artifacts:[{video_base64:video64}]}}};
  await assert.rejects(createDevotionPipeline({voice:goodVoice,assets:disconnected,renderer:goodRenderer}).processItem(baseInput),error=>error?.code==='PIPELINE_ASSET_STORE_DISCONNECTED');
  await assert.rejects(createDevotionPipeline({voice:disconnected,assets:memoryAssets(),renderer:goodRenderer}).processItem(baseInput),error=>error?.code==='PIPELINE_VOICE_DISCONNECTED');
  await assert.rejects(createDevotionPipeline({voice:goodVoice,assets:memoryAssets(),renderer:disconnected}).processItem(baseInput),error=>error?.code==='PIPELINE_RENDERER_DISCONNECTED');
});

test('HTTP adapters keep generic service contracts and inline voice bytes for rendering',async()=>{
  const calls=[];
  const fetchImpl=async(url,init)=>{
    calls.push({url,init});
    if(url.endsWith('/v1/speech'))return new Response(Buffer.from('wav-bytes'),{status:200,headers:{'content-type':'audio/wav','x-voice-model':'fake-tts'}});
    if(url.includes('/v1/assets/')&&init.method==='PUT')return new Response(JSON.stringify({size:Buffer.from(init.body).length,stored_at:'now'}),{status:200,headers:{'content-type':'application/json'}});
    if(url.includes('/v1/assets/')&&init.method==='GET')return new Response(null,{status:404});
    if(url.endsWith('/v1/render'))return new Response(JSON.stringify({ok:true,artifacts:[{path:'/tmp/out.mp4',video_base64:video64}]}),{status:200,headers:{'content-type':'application/json'}});
    throw new Error(`unexpected ${url}`);
  };
  const voice=createHttpVoice({endpoint:'https://voice.example',fetchImpl});
  const assets=createHttpAssets({endpoint:'https://assets.example',fetchImpl});
  const renderer=createHttpRenderer({endpoint:'https://renderer.example',fetchImpl});
  const pipeline=createDevotionPipeline({voice,assets,renderer});
  await pipeline.processItem(baseInput);
  const renderCall=calls.find(call=>call.url.endsWith('/v1/render'));
  const payload=JSON.parse(renderCall.init.body);
  assert.equal(Buffer.from(payload.batch.items[0].metadata.audio_base64,'base64').toString(),'wav-bytes');
  assert.equal(payload.include_video_base64,true);
  assert.match(calls.find(call=>call.url.includes('/v1/assets/')).url,/workspace_id=workspace-a/);
});

test('pipeline core contains no tenant, publisher, storage vendor, model vendor or renderer implementation dependency',async()=>{
  const fs=await import('node:fs/promises');
  const files=['../src/service.js','../src/adapters/http-writer.js','../src/adapters/http-voice.js','../src/adapters/http-assets.js','../src/adapters/http-renderer.js'];
  for(const file of files){
    const source=await fs.readFile(new URL(file,import.meta.url),'utf8');
    assert.doesNotMatch(source,/에코디교회|에코디선교회|YouTube|Google Drive|googleapis|Gemini|FFmpeg|admin\.ekodi\.kr/i);
  }
});
