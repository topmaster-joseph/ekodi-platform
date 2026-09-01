export function createHttpPipelineRenderer({endpoint,token='',fetchImpl=fetch}){
  const base=String(endpoint||'').replace(/\/$/,'');
  return{
    ready(){return Boolean(base)},
    async dispatch({job,snapshot}){
      if(!base){const error=new Error('pipeline endpoint is not configured');error.code='RENDERER_NOT_CONNECTED';throw error}
      const results=[];
      for(const item of snapshot.items||[]){
        const response=await fetchImpl(`${base}/v1/process`,{
          method:'POST',
          headers:{'content-type':'application/json',...(token?{authorization:`Bearer ${token}`}:{})},
          body:JSON.stringify({
            workspace_id:snapshot.workspace_id,batch_key:snapshot.batch_key,item_id:item.id,
            render_version:item.metadata?.render_version||job.payload?.render_version||'v1',
            passage:item.passage,script:item.script,metadata:item.metadata||{},format:job.payload?.format||{}
          })
        });
        const body=await response.json().catch(()=>({}));
        if(!response.ok){const error=new Error(body.error||`pipeline dispatch failed: HTTP ${response.status}`);error.code=body.code||'PIPELINE_DISPATCH_FAILED';throw error}
        results.push(body);
      }
      return{job_id:job.id,workspace_id:snapshot.workspace_id,batch_key:snapshot.batch_key,results};
    }
  };
}
