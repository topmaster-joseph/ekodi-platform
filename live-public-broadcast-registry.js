const PUBLIC_STATUSES=new Set(['review','published','hidden']);
const VERIFY_STATUSES=new Set(['unverified','verified','needs_review']);

const text=(value,max=240)=>String(value??'').trim().slice(0,max);
const cleanUrl=value=>{const raw=text(value,2048);if(!raw)return'';try{const url=new URL(raw);return ['https:','http:'].includes(url.protocol)?url.toString():''}catch{return''}};
const cleanId=value=>text(value,80).toLowerCase().replace(/[^a-z0-9_-]+/g,'-').replace(/^-+|-+$/g,'');

export async function ensureLivePublicBroadcastSchema(db){
  if(!db?.prepare)return;
  await db.prepare(`CREATE TABLE IF NOT EXISTS live_public_broadcast_sources (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    category TEXT NOT NULL DEFAULT 'public_agency',
    jurisdiction TEXT NOT NULL DEFAULT '',
    official_url TEXT NOT NULL,
    provider TEXT NOT NULL DEFAULT 'official_site',
    embed_url TEXT NOT NULL DEFAULT '',
    publication_status TEXT NOT NULL DEFAULT 'review',
    verification_status TEXT NOT NULL DEFAULT 'unverified',
    verified_at TEXT NOT NULL DEFAULT '',
    sort_order INTEGER NOT NULL DEFAULT 100,
    note TEXT NOT NULL DEFAULT '',
    updated_at TEXT NOT NULL,
    updated_by TEXT NOT NULL DEFAULT ''
  )`).run();
}

export function normalizeLivePublicBroadcastSource(row={}){
  return {
    id:String(row.id||''),
    name:String(row.name||''),
    category:String(row.category||'public_agency'),
    jurisdiction:String(row.jurisdiction||''),
    officialUrl:String(row.official_url||row.officialUrl||''),
    provider:String(row.provider||'official_site'),
    embedUrl:String(row.embed_url||row.embedUrl||''),
    publicationStatus:String(row.publication_status||row.publicationStatus||'review'),
    verificationStatus:String(row.verification_status||row.verificationStatus||'unverified'),
    verifiedAt:String(row.verified_at||row.verifiedAt||''),
    sortOrder:Number(row.sort_order??row.sortOrder??100)||100,
    note:String(row.note||''),
    updatedAt:String(row.updated_at||row.updatedAt||''),
    updatedBy:String(row.updated_by||row.updatedBy||'')
  };
}

export async function listLivePublicBroadcastSources(db,{publicOnly=false}={}){
  if(!db?.prepare)return[];
  await ensureLivePublicBroadcastSchema(db);
  const sql=publicOnly
    ? `SELECT * FROM live_public_broadcast_sources WHERE publication_status='published' AND verification_status='verified' ORDER BY sort_order ASC, name ASC`
    : `SELECT * FROM live_public_broadcast_sources ORDER BY CASE publication_status WHEN 'review' THEN 0 WHEN 'published' THEN 1 ELSE 2 END, sort_order ASC, name ASC`;
  const rows=await db.prepare(sql).all();
  return (rows?.results||[]).map(normalizeLivePublicBroadcastSource);
}

export async function putLivePublicBroadcastSource(db,input={},actor=''){
  if(!db?.prepare)throw new Error('broadcast_registry_database_required');
  await ensureLivePublicBroadcastSchema(db);
  const id=cleanId(input.id)||('broadcast-'+crypto.randomUUID());
  const name=text(input.name,120);
  const officialUrl=cleanUrl(input.officialUrl);
  if(!name)throw new Error('broadcast_name_required');
  if(!officialUrl)throw new Error('broadcast_official_url_required');
  const publicationStatus=PUBLIC_STATUSES.has(String(input.publicationStatus||''))?String(input.publicationStatus):'review';
  const verificationStatus=VERIFY_STATUSES.has(String(input.verificationStatus||''))?String(input.verificationStatus):'unverified';
  const embedUrl=cleanUrl(input.embedUrl);
  const verifiedAt=verificationStatus==='verified'?(text(input.verifiedAt,64)||new Date().toISOString()):'';
  const row={
    id,
    name,
    category:text(input.category,80)||'public_agency',
    jurisdiction:text(input.jurisdiction,120),
    officialUrl,
    provider:text(input.provider,80)||'official_site',
    embedUrl,
    publicationStatus,
    verificationStatus,
    verifiedAt,
    sortOrder:Math.max(0,Math.min(9999,Number(input.sortOrder??100)||100)),
    note:text(input.note,500),
    updatedAt:new Date().toISOString(),
    updatedBy:text(actor,160)
  };
  await db.prepare(`INSERT INTO live_public_broadcast_sources
    (id,name,category,jurisdiction,official_url,provider,embed_url,publication_status,verification_status,verified_at,sort_order,note,updated_at,updated_by)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)
    ON CONFLICT(id) DO UPDATE SET
      name=excluded.name,category=excluded.category,jurisdiction=excluded.jurisdiction,official_url=excluded.official_url,
      provider=excluded.provider,embed_url=excluded.embed_url,publication_status=excluded.publication_status,
      verification_status=excluded.verification_status,verified_at=excluded.verified_at,sort_order=excluded.sort_order,
      note=excluded.note,updated_at=excluded.updated_at,updated_by=excluded.updated_by`)
    .bind(row.id,row.name,row.category,row.jurisdiction,row.officialUrl,row.provider,row.embedUrl,row.publicationStatus,row.verificationStatus,row.verifiedAt,row.sortOrder,row.note,row.updatedAt,row.updatedBy).run();
  return row;
}

export async function deleteLivePublicBroadcastSource(db,id){
  if(!db?.prepare)return false;
  await ensureLivePublicBroadcastSchema(db);
  const key=cleanId(id);
  if(!key)return false;
  const result=await db.prepare('DELETE FROM live_public_broadcast_sources WHERE id = ?').bind(key).run();
  return Number(result?.meta?.changes||0)>0;
}
