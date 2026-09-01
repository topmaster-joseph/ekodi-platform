const required=(value,name)=>{const text=String(value??'').trim();if(!text)throw new Error(`${name} is required`);return text};
export function createAssetService({store}){
  if(!store)throw new Error('asset store adapter is required');
  return{
    ready(){return Boolean(store.ready?.()??true)},
    async put({workspace_id,asset_key,data,mime_type='application/octet-stream',metadata={}}){
      const workspaceId=required(workspace_id,'workspace_id');
      const assetKey=required(asset_key,'asset_key');
      if(data==null)throw new Error('data is required');
      return store.put({workspace_id:workspaceId,asset_key:assetKey,data,mime_type:String(mime_type),metadata:metadata&&typeof metadata==='object'?metadata:{}});
    },
    async get({workspace_id,asset_key}){
      return store.get({workspace_id:required(workspace_id,'workspace_id'),asset_key:required(asset_key,'asset_key')});
    }
  }
}
