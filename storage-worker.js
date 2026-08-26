import { handleGoogleDriveStorageControl } from './google-drive-storage-control.js';
import { handleR2StorageControl } from './r2-storage-control.js';
import { applyApiSecurityHeaders, enforceEdgeSecurity } from './security-edge.js';

function json(data,status=200){return applyApiSecurityHeaders(new Response(JSON.stringify(data),{status,headers:{'content-type':'application/json; charset=utf-8','cache-control':'no-store','x-content-type-options':'nosniff'}}));}

export default {
  async fetch(request,env){
    const guard=await enforceEdgeSecurity(request,env);if(guard)return guard;
    const url=new URL(request.url);
    if(request.method==='OPTIONS'){
      const origin=request.headers.get('origin')||'';
      const allowed=String(env.ALLOWED_ORIGINS||'').split(',').map(v=>v.trim()).filter(Boolean);
      const headers=new Headers({'access-control-allow-methods':'GET,HEAD,POST,PUT,DELETE,OPTIONS','access-control-allow-headers':'authorization,content-type','access-control-max-age':'86400','cache-control':'no-store','vary':'Origin'});
      if(allowed.includes(origin))headers.set('access-control-allow-origin',origin);
      return new Response(null,{status:204,headers});
    }
    if(url.pathname==='/health')return json({ok:true,service:'ekodi-storage-control',provider:'google_drive',configured:Boolean(env.GOOGLE_DRIVE_CLIENT_SECRET&&env.STORAGE_CREDENTIAL_KEY),r2:{configured:Boolean(env.R2_BUCKET),binding:'R2_BUCKET'},primaryDomains:String(env.STORAGE_PRIMARY_GOOGLE_DOMAINS||'ekodi.kr').split(',')});
    if(url.pathname.startsWith('/api/control/storage/r2')){
      try{const response=await handleR2StorageControl(request,env);if(response)return applyApiSecurityHeaders(response);}
      catch(error){console.error('R2 Storage Control error',error);return json({error:'R2 Storage 처리 중 오류가 발생했습니다.',code:'R2_STORAGE_CONTROL_ERROR'},500);}
    }
    if(url.pathname.startsWith('/api/control/storage/google')){
      try{const response=await handleGoogleDriveStorageControl(request,env);if(response)return applyApiSecurityHeaders(response);}
      catch(error){console.error('Google Drive Storage Control error',error);return json({error:'Google Drive Storage 처리 중 오류가 발생했습니다.',code:'STORAGE_CONTROL_ERROR'},500);}
    }
    return json({error:'Storage Control endpoint not found'},404);
  }
};
