export function createHttpAssets({endpoint,token='',fetchImpl=fetch}){
  const base=String(endpoint||'').replace(/\/$/,'');
  const headers=token?{authorization:`Bearer ${token}`}:{ };
  const urlFor=(workspaceId,assetKey)=>`${base}/v1/assets/${encodeURIComponent(assetKey)}?workspace_id=${encodeURIComponent(workspaceId)}`;
  return{
    ready(){return Boolean(base)},
    async put({workspace_id,asset_key,data,mime_type='application/octet-stream',metadata={}}){
      if(!base){const error=new Error('asset endpoint is not configured');error.code='PIPELINE_ASSET_STORE_DISCONNECTED';throw error}
      const response=await fetchImpl(urlFor(workspace_id,asset_key),{
        method:'PUT',headers:{'content-type':mime_type,'x-asset-metadata':JSON.stringify(metadata),...headers},body:Buffer.from(data)
      });
      if(!response.ok)throw new Error(`asset PUT failed: HTTP ${response.status}`);
      return response.json();
    },
    async get({workspace_id,asset_key}){
      if(!base){const error=new Error('asset endpoint is not configured');error.code='PIPELINE_ASSET_STORE_DISCONNECTED';throw error}
      const response=await fetchImpl(urlFor(workspace_id,asset_key),{method:'GET',headers});
      if(response.status===404)return null;
      if(!response.ok)throw new Error(`asset GET failed: HTTP ${response.status}`);
      return{workspace_id,asset_key,data:Buffer.from(await response.arrayBuffer()),mime_type:response.headers.get('content-type')||'application/octet-stream',metadata:JSON.parse(response.headers.get('x-asset-metadata')||'{}'),stored_at:response.headers.get('x-asset-stored-at')||''};
    }
  };
}
