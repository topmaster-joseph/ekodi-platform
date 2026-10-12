// Public *read-only* inventory of already-created, explicitly public boards.
// Never resolve speculative board URLs here: handleSiteBoardRequest initialises
// unknown board instances, which makes blind discovery unsuitable for production.
const MAX_PAGE_SIZE=100,DEFAULT_PAGE_SIZE=40;
const BOARD_SITE=/^[a-z0-9][a-z0-9-]{0,79}$/;
const RESERVED_SITE_IDS=new Set(['api','admin','auth','control','core','shell']);
const response=(data,status=200)=>new Response(JSON.stringify(data),{status,headers:{
  'content-type':'application/json; charset=utf-8','cache-control':'no-store',
  'x-content-type-options':'nosniff','referrer-policy':'no-referrer',
  'x-ekodi-board-catalog':'public-v1'
}});

export async function handlePublicBoardCatalog(request,env){
  const url=new URL(request.url);
  if(url.pathname!=='/api/boards/public-catalog')return null;
  if(!['GET','HEAD'].includes(request.method)){
    const result=response({ok:false,error:'method_not_allowed'},405);
    result.headers.set('allow','GET, HEAD');
    return result;
  }
  const rawCursor=url.searchParams.get('cursor')||'';
  if(rawCursor&&(!/^site:[a-z0-9][a-z0-9-]{0,79}:main$/.test(rawCursor)||rawCursor.length>95)){
    return response({ok:false,error:'invalid_cursor'},400);
  }
  const limitRaw=url.searchParams.get('limit')||String(DEFAULT_PAGE_SIZE);
  if(!/^\d{1,3}$/.test(limitRaw)||Number(limitRaw)<1||Number(limitRaw)>MAX_PAGE_SIZE){
    return response({ok:false,error:'invalid_page_size'},400);
  }
  if(!env?.DB?.prepare)return response({ok:false,error:'catalog_unavailable'},503);
  try{
    const requested=Number(limitRaw);
    // Join only active registered customers or four official boards; speculative
    // URL probes can have created stray board instances, which must not be listed.
    // No migrations/CREATE TABLE, on-demand inserts, tenant domains, emails,
    // membership, visibility=private rows or customer identifiers are exposed.
    const rows=await env.DB.prepare(`SELECT b.board_id,b.site_id
      FROM ekodi_board_instances b
      WHERE b.status='active' AND b.visibility='public' AND b.board_id>?
        AND (
          b.site_id IN ('cgma','cheonggye','ekodimission','ekodichurch')
          OR EXISTS (SELECT 1 FROM customer_tenants t
                     WHERE t.status='active' AND lower(t.slug)=lower(b.site_id))
        )
      ORDER BY b.board_id LIMIT ?`).bind(rawCursor,requested+1).all();
    const items=Array.isArray(rows?.results)?rows.results:[];
    if(items.length>requested+1)return response({ok:false,error:'catalog_result_invalid'},503);
    const page=items.slice(0,requested);
    const boards=[];
    for(const row of page){
      const site=String(row?.site_id||''),id=String(row?.board_id||'');
      if(!BOARD_SITE.test(site)||RESERVED_SITE_IDS.has(site)||id!==`site:${site}:main`){
        return response({ok:false,error:'catalog_entry_invalid'},503);
      }
      boards.push({siteId:site,boardId:id,prefix:`/${site}/board`});
    }
    const nextCursor=items.length>requested?String(page.at(-1)?.board_id||''):null;
    if(nextCursor&&!/^site:[a-z0-9][a-z0-9-]{0,79}:main$/.test(nextCursor)){
      return response({ok:false,error:'catalog_cursor_invalid'},503);
    }
    return response({ok:true,schemaVersion:1,source:'existing_public_board_instances',
      boards,nextCursor,complete:nextCursor===null});
  }catch{
    return response({ok:false,error:'catalog_query_failed'},503);
  }
}
