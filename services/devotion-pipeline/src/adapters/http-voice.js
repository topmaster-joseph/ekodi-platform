export function createHttpVoice({endpoint,token='',fetchImpl=fetch}){
  const base=String(endpoint||'').replace(/\/$/,'');
  return{
    ready(){return Boolean(base)},
    async synthesize({text,style='',voice}){
      if(!base){const error=new Error('voice endpoint is not configured');error.code='PIPELINE_VOICE_DISCONNECTED';throw error}
      const response=await fetchImpl(`${base}/v1/speech`,{
        method:'POST',
        headers:{'content-type':'application/json',...(token?{authorization:`Bearer ${token}`}:{})},
        body:JSON.stringify({text,style,voice})
      });
      if(!response.ok){
        const body=await response.json().catch(()=>({}));
        const error=new Error(body.error||`voice request failed: HTTP ${response.status}`);
        error.code=body.code||'VOICE_REQUEST_FAILED';
        throw error;
      }
      return{
        audio:Buffer.from(await response.arrayBuffer()),
        mime_type:response.headers.get('content-type')||'audio/wav',
        provider_model:response.headers.get('x-voice-model')||'',
        voice:response.headers.get('x-voice-name')||voice||''
      };
    }
  };
}
