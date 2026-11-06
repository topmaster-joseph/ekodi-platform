/**
 * Owner-directed publication freeze for Cheonggye regional services.
 *
 * Default-deny until a separate owner-approved guarded release changes this
 * explicit source constant. A database/publication-dashboard toggle cannot
 * silently re-open the public surface during the redesign.
 *
 * This does not modify CGMA, tenant authority, admin APIs or storage.
 */
export const CHEONGGYE_PUBLICATION_HOLD=true;

const ADMIN_CLIENT_ASSETS=new Set([
  '/cheonggye/local-region-admin-auth.js',
  '/cheonggye/local-region-access-admin.js',
  '/cheonggye/local-region-operations-admin.js',
  '/cheonggye/local-region-module-admin.js',
  '/cheonggye/local-region-forest-admin.js',
  '/cheonggye/cheonggyepass-vendor-intake-ui.js',
]);

function cleanPath(pathname){
  const path=String(pathname||'/').split(/[?#]/)[0].replace(/\/+$/,'').toLowerCase();
  return path||'/';
}
function under(path,root){return path===root||path.startsWith(root+'/');}

export function isCheonggyeUnreleasedPublicPath(pathname){
  if(!CHEONGGYE_PUBLICATION_HOLD)return false;
  const path=cleanPath(pathname);
  if(ADMIN_CLIENT_ASSETS.has(path))return false;
  if(under(path,'/cheonggye/admin')||under(path,'/cgpass/admin')||under(path,'/cheonggyepass/admin'))return false;
  return under(path,'/cheonggye')||under(path,'/cgpass')||under(path,'/cheonggyepass');
}

/** Only previously anonymous, public-read ledger endpoints are withheld.
 * Authenticated admin reads and writes keep their existing ownership gates.
 */
export function isCheonggyeUnreleasedPublicApi(pathname,method='GET'){
  if(!CHEONGGYE_PUBLICATION_HOLD||String(method).toUpperCase()!=='GET')return false;
  const path=cleanPath(pathname);
  return /^\/api\/local-operations\/cheonggye\/(?:modules|projects)\/[a-z0-9-]+$/.test(path);
}

function privateHeaders(contentType){
  return {
    'content-type':contentType,
    'cache-control':'private, no-store, max-age=0',
    'x-robots-tag':'noindex, nofollow, noarchive, nosnippet',
    'x-content-type-options':'nosniff',
    'x-ekodi-route':'regional-private-hold',
    'x-ekodi-region-publication':'private-owner-release-required',
  };
}

export function cheonggyePublicHoldResponse(request){
  if(!isCheonggyeUnreleasedPublicPath(new URL(request.url).pathname))return null;
  const method=String(request.method||'GET').toUpperCase();
  const body='<!doctype html><html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex,nofollow,noarchive,nosnippet"><title>서비스 비공개 | EKODI</title></head><body><main style="max-width:660px;margin:12vh auto;padding:24px;font:16px/1.7 system-ui,sans-serif;color:#1e3c31"><h1>서비스 비공개</h1><p>청계 지역 서비스는 화면과 기능 개선을 위해 외부 공개를 중단했습니다.</p><p>검수와 운영 승인을 마친 후 공개합니다.</p></main></body></html>';
  return new Response(method==='HEAD'?null:body,{status:404,headers:privateHeaders('text/html; charset=utf-8')});
}

export function cheonggyePublicApiHoldResponse(request){
  if(!isCheonggyeUnreleasedPublicApi(new URL(request.url).pathname,request.method))return null;
  return new Response(JSON.stringify({ok:false,code:'REGIONAL_PUBLICATION_PRIVATE',message:'서비스 비공개'}),{
    status:404,headers:privateHeaders('application/json; charset=utf-8'),
  });
}
