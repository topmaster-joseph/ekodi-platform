const required=(value,name)=>{const text=String(value??'').trim();if(!text)throw new Error(`${name} is required`);return text};
const safe=value=>required(value,'identity segment').replace(/[^a-zA-Z0-9._-]+/g,'-').replace(/^-+|-+$/g,'');
const disconnected=(code,message)=>{const error=new Error(message);error.code=code;return error};
const connected=port=>Boolean(port?.ready?.());
const parseJsonAsset=record=>{
  if(!record?.data)return null;
  try{return JSON.parse(Buffer.from(record.data).toString('utf8'))}catch{return null}
};
const identityOf=input=>({
  workspace_id:required(input.workspace_id,'workspace_id'),
  batch_key:required(input.batch_key,'batch_key'),
  item_id:required(input.item_id,'item_id'),
  render_version:required(input.render_version||'v1','render_version')
});
const keysOf=identity=>{
  const base=[safe(identity.batch_key),safe(identity.item_id),safe(identity.render_version)].join('/');
  return{voice:`${base}/voice.wav`,result:`${base}/result.json`};
};

export function createDevotionPipeline({voice,assets,renderer,clock=()=>new Date()}){
  if(!voice||!assets||!renderer)throw new Error('voice, assets and renderer adapters are required');
  const readiness=()=>({voice:connected(voice),assets:connected(assets),renderer:connected(renderer)});
  async function processItem(input={}){
    const identity=identityOf(input);
    const script=required(input.script,'script');
    const keys=keysOf(identity);
    if(!connected(assets))throw disconnected('PIPELINE_ASSET_STORE_DISCONNECTED','asset store is not connected');

    const existing=parseJsonAsset(await assets.get({workspace_id:identity.workspace_id,asset_key:keys.result}));
    if(existing)return{...existing,idempotent:true};

    let voiceRecord=await assets.get({workspace_id:identity.workspace_id,asset_key:keys.voice});
    if(!voiceRecord){
      if(!connected(voice))throw disconnected('PIPELINE_VOICE_DISCONNECTED','voice service is not connected');
      const speech=await voice.synthesize({text:script,style:String(input.voice_style||''),voice:input.voice});
      voiceRecord={
        ...(await assets.put({workspace_id:identity.workspace_id,asset_key:keys.voice,data:speech.audio,mime_type:speech.mime_type||'audio/wav',metadata:{kind:'voice',sample_rate:speech.sample_rate||0,provider_model:speech.provider_model||'',voice:speech.voice||''}})),
        data:Buffer.from(speech.audio),mime_type:speech.mime_type||'audio/wav'
      };
    }
    if(!connected(renderer))throw disconnected('PIPELINE_RENDERER_DISCONNECTED','renderer service is not connected');
    const jobId=[identity.workspace_id,identity.batch_key,identity.item_id,identity.render_version].map(safe).join(':');
    const batch={workspace_id:identity.workspace_id,batch_key:identity.batch_key,items:[{
      id:identity.item_id,
      passage:String(input.passage||''),
      script,
      metadata:{...(input.metadata||{}),render_version:identity.render_version,voice_asset_key:keys.voice}
    }]};
    const render=await renderer.render({
      job:{id:jobId,workspace_id:identity.workspace_id,batch_key:identity.batch_key,kind:'render',payload:{format:input.format||{},render_version:identity.render_version}},
      batch,
      voice_asset:{asset_key:keys.voice,data:Buffer.from(voiceRecord.data),mime_type:voiceRecord.mime_type||'audio/wav'}
    });
    const result={...identity,voice_asset:{asset_key:keys.voice,mime_type:voiceRecord.mime_type||'audio/wav'},render,completed_at:clock().toISOString()};
    await assets.put({workspace_id:identity.workspace_id,asset_key:keys.result,data:Buffer.from(JSON.stringify(result)),mime_type:'application/json',metadata:{kind:'pipeline-result',render_version:identity.render_version}});
    return{...result,idempotent:false};
  }
  return{ready:readiness,processItem,keysFor:input=>keysOf(identityOf(input))};
}
