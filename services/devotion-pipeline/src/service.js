const required=(value,name)=>{const text=String(value??'').trim();if(!text)throw new Error(`${name} is required`);return text};
const safe=value=>required(value,'identity segment').replace(/[^a-zA-Z0-9._-]+/g,'-').replace(/^-+|-+$/g,'');
const disconnected=(code,message)=>{const error=new Error(message);error.code=code;return error};
const connected=port=>Boolean(port?.ready?.());
const parseJsonAsset=record=>{if(!record?.data)return null;try{return JSON.parse(Buffer.from(record.data).toString('utf8'))}catch{return null}};
const identityOf=input=>({workspace_id:required(input.workspace_id,'workspace_id'),batch_key:required(input.batch_key,'batch_key'),item_id:required(input.item_id,'item_id'),render_version:required(input.render_version||'v1','render_version')});
const keysOf=identity=>{const base=[safe(identity.batch_key),safe(identity.item_id),safe(identity.render_version)].join('/');return{script:`${base}/script.json`,voice:`${base}/voice.wav`,video:`${base}/video.mp4`,result:`${base}/result.json`}};
const draftMetadata=draft=>({title:draft?.title||'',core:draft?.core||'',application_question:draft?.application_question||'',prayer:draft?.prayer||'',publish_title:draft?.publish_title||draft?.title||'',description:draft?.description||'',hashtags:draft?.hashtags||[],writer_provider:draft?.provider||'',writer_model:draft?.provider_model||''});
const withoutInlineVideo=render=>({...render,artifacts:(render?.artifacts||[]).map(({video_base64,...artifact})=>artifact)});

export function createDevotionPipeline({writer=null,voice,assets,renderer,clock=()=>new Date()}){
  if(!voice||!assets||!renderer)throw new Error('voice, assets and renderer adapters are required');
  const readiness=()=>({writer:connected(writer),voice:connected(voice),assets:connected(assets),renderer:connected(renderer)});
  async function processItem(input={}){
    const identity=identityOf(input);const keys=keysOf(identity);
    if(!connected(assets))throw disconnected('PIPELINE_ASSET_STORE_DISCONNECTED','asset store is not connected');
    const existing=parseJsonAsset(await assets.get({workspace_id:identity.workspace_id,asset_key:keys.result}));
    if(existing)return{...existing,idempotent:true};

    let metadata={...(input.metadata||{})};
    let draft=parseJsonAsset(await assets.get({workspace_id:identity.workspace_id,asset_key:keys.script}));
    let script=String(input.script||draft?.narration||'').trim();
    if(!script){
      if(!connected(writer))throw disconnected('PIPELINE_WRITER_DISCONNECTED','writer service is not connected');
      draft=await writer.write({passage:required(input.passage,'passage'),date:metadata.devotion_date||'',metadata});
      script=required(draft?.narration,'writer narration');
      await assets.put({workspace_id:identity.workspace_id,asset_key:keys.script,data:Buffer.from(JSON.stringify(draft)),mime_type:'application/json',metadata:{kind:'devotional-script',provider:draft.provider||'',model:draft.provider_model||''}});
    }
    if(draft)metadata={...metadata,...draftMetadata(draft)};

    let voiceRecord=await assets.get({workspace_id:identity.workspace_id,asset_key:keys.voice});
    if(!voiceRecord){
      if(!connected(voice))throw disconnected('PIPELINE_VOICE_DISCONNECTED','voice service is not connected');
      const speech=await voice.synthesize({text:script,style:String(input.voice_style||metadata.voice_style||''),voice:input.voice});
      voiceRecord={...(await assets.put({workspace_id:identity.workspace_id,asset_key:keys.voice,data:speech.audio,mime_type:speech.mime_type||'audio/wav',metadata:{kind:'voice',sample_rate:speech.sample_rate||0,provider_model:speech.provider_model||'',voice:speech.voice||''}})),data:Buffer.from(speech.audio),mime_type:speech.mime_type||'audio/wav'};
    }
    if(!connected(renderer))throw disconnected('PIPELINE_RENDERER_DISCONNECTED','renderer service is not connected');
    const jobId=[identity.workspace_id,identity.batch_key,identity.item_id,identity.render_version].map(safe).join(':');
    const batch={workspace_id:identity.workspace_id,batch_key:identity.batch_key,items:[{id:identity.item_id,passage:String(input.passage||''),script,metadata:{...metadata,render_version:identity.render_version,voice_asset_key:keys.voice,duration_seconds:Number(metadata.duration_seconds||30)}}]};
    const render=await renderer.render({job:{id:jobId,workspace_id:identity.workspace_id,batch_key:identity.batch_key,kind:'render',payload:{format:input.format||{},render_version:identity.render_version}},batch,voice_asset:{asset_key:keys.voice,data:Buffer.from(voiceRecord.data),mime_type:voiceRecord.mime_type||'audio/wav'}});
    const artifact=(render?.artifacts||[])[0];
    if(!artifact?.video_base64){const error=new Error('renderer did not return a durable video artifact');error.code='PIPELINE_RENDER_ARTIFACT_MISSING';throw error}
    const video=Buffer.from(artifact.video_base64,'base64');
    const videoRecord=await assets.put({workspace_id:identity.workspace_id,asset_key:keys.video,data:video,mime_type:'video/mp4',metadata:{kind:'video',render_version:identity.render_version,duration_seconds:artifact.duration_seconds||30}});
    const result={...identity,script_asset:{asset_key:keys.script,mime_type:'application/json'},voice_asset:{asset_key:keys.voice,mime_type:voiceRecord.mime_type||'audio/wav'},video_asset:{asset_key:keys.video,mime_type:'video/mp4',size:videoRecord.size||video.length},render:withoutInlineVideo(render),content:draft?draftMetadata(draft):{narration:script},completed_at:clock().toISOString()};
    await assets.put({workspace_id:identity.workspace_id,asset_key:keys.result,data:Buffer.from(JSON.stringify(result)),mime_type:'application/json',metadata:{kind:'pipeline-result',render_version:identity.render_version}});
    return{...result,idempotent:false};
  }
  return{ready:readiness,processItem,keysFor:input=>keysOf(identityOf(input))};
}
