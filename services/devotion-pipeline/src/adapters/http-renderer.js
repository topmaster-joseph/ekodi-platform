export function createHttpRenderer({endpoint,token='',fetchImpl=fetch}){
  const base=String(endpoint||'').replace(/\/$/,'');
  return{
    ready(){return Boolean(base)},
    async render({job,batch,voice_asset}){
      if(!base){const error=new Error('renderer endpoint is not configured');error.code='PIPELINE_RENDERER_DISCONNECTED';throw error}
      const items=batch.items.map((item,index)=>index===0?{
        ...item,
        metadata:{...item.metadata,audio_base64:Buffer.from(voice_asset.data).toString('base64'),audio_mime_type:voice_asset.mime_type||'audio/wav'}
      }:item);
      const response=await fetchImpl(`${base}/v1/render`,{
        method:'POST',
        headers:{'content-type':'application/json',...(token?{authorization:`Bearer ${token}`}:{})},
        body:JSON.stringify({job,batch:{...batch,items},include_video_base64:true})
      });
      const body=await response.json().catch(()=>({}));
      if(!response.ok){const error=new Error(body.error||`renderer request failed: HTTP ${response.status}`);error.code=body.code||'RENDER_REQUEST_FAILED';throw error}
      return body;
    }
  };
}
