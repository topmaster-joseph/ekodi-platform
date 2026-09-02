import {buildEkodiSeptemberBatch} from '../../../integrations/devotion-studio/ekodi-september-2026.js';
import {createDevotionWriter} from '../../devotion-writer/src/service.js';
import {createGeminiWriterProvider} from '../../devotion-writer/src/providers/gemini.js';
import {createVoiceService} from '../../devotion-voice/src/service.js';
import {createGeminiTtsProvider} from '../../devotion-voice/src/providers/gemini.js';
import {createAssetService} from '../../devotion-assets/src/service.js';
import {createFilesystemStore} from '../../devotion-assets/src/adapters/filesystem-store.js';
import {createHttpStorageGateway} from '../../devotion-assets/src/adapters/http-storage-gateway.js';
import {createDevotionPipeline} from '../../devotion-pipeline/src/service.js';
import {renderBatch,ffmpegAvailable} from '../../devotion-renderer/src/render.js';
import {createDevotionPublisher,createYoutubeApi} from '../../devotion-publisher/src/service.js';

const env=process.env;
const number=(value,fallback)=>Number.isFinite(Number(value))?Number(value):fallback;
const required=(value,name)=>{const text=String(value||'').trim();if(!text)throw new Error(`${name} is required`);return text};
const bool=value=>String(value||'').toLowerCase()==='true';
const clamp=(value,min,max)=>Math.min(max,Math.max(min,value));
const kstNow=()=>new Date(Date.now()+9*60*60*1000);
const todayDay=()=>{const now=kstNow();return now.getUTCFullYear()===2026&&now.getUTCMonth()===8?now.getUTCDate():1};
const dateForDay=day=>`2026-09-${String(day).padStart(2,'0')}`;
const publishIso=(date,time)=>new Date(`${date}T${time}:00+09:00`).toISOString();
const workspaceId=env.DEVOTION_WORKSPACE_ID||'ekodi-daily-devotion';
const renderVersion=env.DEVOTION_RENDER_VERSION||'v1';
const fromDay=clamp(number(env.RUN_FROM_DAY,todayDay()),1,30);
const toDay=clamp(number(env.RUN_TO_DAY,Math.min(30,fromDay+6)),fromDay,30);
const store=env.STORAGE_GATEWAY_ENDPOINT
  ? createHttpStorageGateway({endpoint:env.STORAGE_GATEWAY_ENDPOINT,token:env.STORAGE_GATEWAY_TOKEN})
  : createFilesystemStore({baseDir:env.DEVOTION_ASSET_DIR||'./data/devotion-assets'});
const assets=createAssetService({store});
const writer=createDevotionWriter({providers:[createGeminiWriterProvider({
  apiKey:env.GEMINI_API_KEY,
  model:env.DEVOTION_WRITER_GEMINI_MODEL||'gemini-3.7-flash'
})]});
const voice=createVoiceService({provider:createGeminiTtsProvider({
  apiKey:env.GEMINI_API_KEY,
  model:env.GEMINI_TTS_MODEL||'gemini-3.1-flash-tts-preview',
  voice:env.GEMINI_TTS_VOICE||'Kore'
})});
const renderer={
  ready:()=>true,
  async render({job,batch}){
    return renderBatch({
      job,batch,
      outputDir:env.DEVOTION_OUTPUT_DIR||'./data/devotion-output',
      ffmpegPath:env.FFMPEG_PATH||'ffmpeg',
      fontName:env.CAPTION_FONT_NAME||'Noto Sans CJK KR',
      includeVideoBase64:true
    });
  }
};
const pipeline=createDevotionPipeline({writer,voice,assets,renderer});
const batch=buildEkodiSeptemberBatch({
  workspaceId,
  churchTargetRef:'church',
  missionTargetRef:'mission'
});
const publishEnabled=bool(env.PUBLISH_YOUTUBE);
const youtube=publishEnabled?createYoutubeApi({
  clientId:required(env.YOUTUBE_CLIENT_ID,'YOUTUBE_CLIENT_ID'),
  clientSecret:required(env.YOUTUBE_CLIENT_SECRET,'YOUTUBE_CLIENT_SECRET'),
  refreshTokenResolver:ref=>{
    if(ref==='church')return env.YOUTUBE_CHURCH_REFRESH_TOKEN||'';
    if(ref==='mission')return env.YOUTUBE_MISSION_REFRESH_TOKEN||'';
    return'';
  }
}):null;
const publisher=publishEnabled?createDevotionPublisher({assets,youtube}):null;
const selected=batch.items.filter(item=>{
  const day=Number(String(item.metadata?.devotion_date||'').slice(-2));
  return day>=fromDay&&day<=toDay;
});
const report={
  workspace_id:workspaceId,batch_key:batch.batch_key,
  range:{from_day:fromDay,to_day:toDay},
  storage:env.STORAGE_GATEWAY_ENDPOINT?'gateway':'filesystem',
  publish_youtube:publishEnabled,
  rendered:[],scheduled:[],skipped:[]
};
if(!(await ffmpegAvailable(env.FFMPEG_PATH||'ffmpeg')))throw new Error('FFmpeg is required on the execution node');
required(env.GEMINI_API_KEY,'GEMINI_API_KEY');
for(const item of selected){
  const metadata={
    ...(item.metadata||{}),
    render_version:renderVersion,
    ...(env.DEVOTION_BACKGROUND_VIDEO?{background_path:env.DEVOTION_BACKGROUND_VIDEO}:{})
  };
  const result=await pipeline.processItem({
    workspace_id:workspaceId,
    batch_key:batch.batch_key,
    item_id:item.id,
    render_version:renderVersion,
    passage:item.passage,
    script:item.script||'',
    metadata,
    format:{width:1080,height:1920,fps:30,codec:'h264'}
  });
  report.rendered.push({
    item_id:item.id,
    date:metadata.devotion_date,
    idempotent:Boolean(result.idempotent),
    video_asset:result.video_asset?.asset_key||''
  });
  console.log(`rendered ${metadata.devotion_date} ${item.passage}${result.idempotent?' (cached)':''}`);
}
if(publishEnabled){
  for(const target of batch.publication_targets){
    for(const item of selected){
      const date=item.metadata.devotion_date||dateForDay(Number(item.id));
      const publishAt=publishIso(date,target.metadata.default_publish_time);
      if(Date.parse(publishAt)<=Date.now()){
        report.skipped.push({item_id:item.id,target_id:target.id,reason:'publish_time_passed'});
        continue;
      }
      const result=await publisher.schedule({
        publication:{
          workspace_id:workspaceId,
          batch_key:batch.batch_key,
          target_id:target.id,
          publish_at:publishAt,
          item_ids:[item.id]
        },
        target,
        batch:{...batch,items:[{...item,metadata:{...item.metadata,render_version:renderVersion}}]}
      });
      report.scheduled.push({item_id:item.id,target_id:target.id,publish_at:publishAt,external_ref:result.external_ref});
      console.log(`scheduled ${date} ${target.id} ${publishAt}`);
    }
  }
}
console.log(JSON.stringify(report,null,2));
