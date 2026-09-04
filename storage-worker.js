import { WorkerEntrypoint } from 'cloudflare:workers';
import { handleGoogleDriveStorageControl, exchangeGoogleAuthorizationCode, refreshGoogleAccessToken } from './google-drive-storage-control.js';
import { handleR2StorageControl } from './r2-storage-control.js';
import { handleStorageGateway } from './storage-gateway.js';
import { applyApiSecurityHeaders, enforceEdgeSecurity } from './security-edge.js';

function allowedOrigins(env){return String(env.ALLOWED_ORIGINS||'').split(',').map(v=>v.trim()).filter(Boolean);}
function withCors(response,request,env){
  const origin=request.headers.get('origin')||'';
  const headers=new Headers(response.headers);
  headers.set('vary','Origin');
  if(allowedOrigins(env).includes(origin)){
    headers.set('access-control-allow-origin',origin);
    headers.set('access-control-allow-credentials','true');
  }
  return new Response(response.body,{status:response.status,statusText:response.statusText,headers});
}
function secure(response,request,env){return withCors(applyApiSecurityHeaders(response),request,env);}
function json(data,status=200,request,env){return secure(new Response(JSON.stringify(data),{status,headers:{'content-type':'application/json; charset=utf-8','cache-control':'no-store','x-content-type-options':'nosniff'}}),request,env);}

export default {
  async fetch(request,env){
    const url=new URL(request.url);
    if(request.method==='OPTIONS'){
      const origin=request.headers.get('origin')||'';
      const headers=new Headers({'access-control-allow-methods':'GET,HEAD,POST,PUT,DELETE,OPTIONS','access-control-allow-headers':'authorization,content-type,x-ekodi-storage-key,x-request-id','access-control-max-age':'86400','access-control-allow-credentials':'true','cache-control':'no-store','vary':'Origin'});
      if(allowedOrigins(env).includes(origin))headers.set('access-control-allow-origin',origin);
      return new Response(null,{status:204,headers});
    }
    if(url.pathname==='/admin'||url.pathname==='/admin/')return Response.redirect('https://admin.ekodi.kr/?route=storage&source=drive.ekodi.kr',307);
    const guard=await enforceEdgeSecurity(request,env);if(guard)return withCors(guard,request,env);
    if(url.pathname==='/health')return json({ok:true,service:'ekodi-storage-control',provider:'google_drive',configured:Boolean(env.GOOGLE_DRIVE_CLIENT_SECRET&&env.STORAGE_CREDENTIAL_KEY),r2:{configured:Boolean(env.R2_BUCKET),binding:'R2_BUCKET'},primaryDomains:String(env.STORAGE_PRIMARY_GOOGLE_DOMAINS||'ekodi.kr').split(',')},200,request,env);
    if(url.pathname.startsWith('/api/storage/v1')){
      try{const response=await handleStorageGateway(request,env);if(response)return secure(response,request,env);}
      catch(error){console.error('Storage Gateway error',error);return json({error:'EKODI Storage Gateway 처리 중 오류가 발생했습니다.',code:'STORAGE_GATEWAY_ERROR'},500,request,env);}
    }
    if(url.pathname.startsWith('/api/control/storage/r2')){
      try{const response=await handleR2StorageControl(request,env);if(response)return secure(response,request,env);}
      catch(error){console.error('R2 Storage Control error',error);return json({error:'R2 Storage 처리 중 오류가 발생했습니다.',code:'R2_STORAGE_CONTROL_ERROR'},500,request,env);}
    }
    if(url.pathname.startsWith('/api/control/storage/google')){
      try{const response=await handleGoogleDriveStorageControl(request,env);if(response)return secure(response,request,env);}
      catch(error){console.error('Google Drive Storage Control error',error);return json({error:'Google Drive Storage 처리 중 오류가 발생했습니다.',code:'STORAGE_CONTROL_ERROR'},500,request,env);}
    }
    return json({error:'Storage Control endpoint not found'},404,request,env);
  }
};

export class GoogleOAuthBroker extends WorkerEntrypoint {
  async exchangeAuthorizationCode(input={}) { return exchangeGoogleAuthorizationCode(this.env,input); }
  async refreshAccessToken(input={}) { return refreshGoogleAccessToken(this.env,input); }
}
