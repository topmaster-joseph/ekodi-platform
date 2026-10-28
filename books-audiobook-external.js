// EKODIAN-AUDIO-EXTERNAL-CLAIMS: claims are NOT proof until manual retailer verification.
// Only order HMACs are stored, never full receipt numbers.
import { buyerIdentity, operatorEmails, loadCatalog } from './books-commerce.js';
const stores=new Set(['upaper','google-play','amazon']);
const bookIdPattern=/^[A-Z0-9-]{3,40}$/;
const codePattern=/^[A-Za-z0-9][A-Za-z0-9._\/@ -]{4,127}$/;
const reply=(status,data)=>new Response(JSON.stringify(data),{status,headers:{
  'content-type':'application/json; charset=utf-8','cache-control':'private, no-store','x-content-type-options':'nosniff'
}});
const deny=(s,code)=>reply(s,{error:code,code});
const iso=()=>new Date().toISOString();
async function input(req){const s=await req.text();if(s.length>2048)return null;try{return JSON.parse(s)}catch{return null}}
async function identify(req,env,operator=false){
  const user=await buyerIdentity(req);
  if(!user)return {error:deny(401,'LOGIN_REQUIRED')};
  if(operator&&!operatorEmails(env).has(user.email))return {error:deny(403,'OPERATOR_REQUIRED')};
  return {user};
}
async function orderHash(env,retailer,book,code){
  const secret=String(env?.AUDIOBOOK_PURCHASE_PROOF_HMAC_KEY||'');
  if(secret.length<32)throw Error('Missing HMAC secret');
  const key=await crypto.subtle.importKey('raw',new TextEncoder().encode(secret),
    {name:'HMAC',hash:'SHA-256'},false,['sign']);
  const bytes=await crypto.subtle.sign('HMAC',key,
    new TextEncoder().encode([retailer,book,code.trim()].join('\n')));
  return [...new Uint8Array(bytes)].map(x=>x.toString(16).padStart(2,'0')).join('');
}
async function eligibleBook(env,id){
  if(!bookIdPattern.test(String(id||'')))return false;
  const catalog=await loadCatalog(env);
  return (catalog?.books||[]).some(b=>b.id===id&&b.bonusAudio?.included===true);
}
export async function submitAudioClaim(env,req){
  const {user,error}=await identify(req,env);if(error)return error;
  const b=await input(req);
  if(!b||b.consent!==true||!stores.has(b.retailer)||!codePattern.test(String(b.orderNumber||'')))
    return deny(400,'INVALID_CLAIM');
  if(!(await eligibleBook(env,b.bookId)))return deny(404,'BOOK_NOT_ELIGIBLE');
  const since=new Date(Date.now()-86400000).toISOString();
  const count=await env.DB.prepare('SELECT COUNT(*) n FROM books_audiobook_external_claims WHERE buyer_user_id=? AND created_at>?')
    .bind(user.userId,since).first();
  if(Number(count?.n||0)>=3)return deny(429,'DAILY_LIMIT');
  const code=String(b.orderNumber).trim(),hash=await orderHash(env,b.retailer,b.bookId,code);
  const id=crypto.randomUUID(),now=iso();
  try{
    await env.DB.prepare("INSERT INTO books_audiobook_external_claims (id,book_id,buyer_user_id,buyer_email,retailer,external_order_hmac,order_suffix,status,created_at,updated_at) VALUES (?,?,?,?,?,?,?,'pending',?,?)")
      .bind(id,b.bookId,user.userId,user.email,b.retailer,hash,code.slice(-4),now,now).run();
  }catch{return deny(409,'ALREADY_SUBMITTED')}
  return reply(202,{claimId:id,bookId:b.bookId,status:'pending'});
}
export async function listMyClaims(env,req){
  const {user,error}=await identify(req,env);if(error)return error;
  const rows=await env.DB.prepare('SELECT id,book_id,retailer,status,created_at FROM books_audiobook_external_claims WHERE buyer_user_id=? ORDER BY created_at DESC LIMIT 30')
    .bind(user.userId).all();
  return reply(200,{claims:rows.results||[]});
}
export async function listPendingClaims(env,req){
  const {error}=await identify(req,env,true);if(error)return error;
  const rows=await env.DB.prepare("SELECT id,book_id,buyer_email,retailer,order_suffix,created_at FROM books_audiobook_external_claims WHERE status='pending' ORDER BY created_at LIMIT 100").all();
  return reply(200,{claims:rows.results||[]});
}
export async function approveAudioClaim(env,req,id){
  const {user,error}=await identify(req,env,true);if(error)return error;
  const b=await input(req);
  if(!b||b.confirmedWithRetailer!==true||b.verificationMethod!=='retailer_portal'
    ||!codePattern.test(String(b.orderNumber||'')))return deny(400,'INDEPENDENT_VERIFICATION_REQUIRED');
  const claim=await env.DB.prepare('SELECT * FROM books_audiobook_external_claims WHERE id=?').bind(id).first();
  if(!claim||claim.status!=='pending')return deny(409,'NOT_PENDING');
  if(await orderHash(env,claim.retailer,claim.book_id,String(b.orderNumber))!==claim.external_order_hmac)
    return deny(409,'PROOF_MISMATCH');
  const at=iso();
  await env.DB.batch([
    env.DB.prepare("UPDATE books_audiobook_external_claims SET status='verified', verified_by=?,verification_method='retailer_portal',reviewed_at=?,updated_at=? WHERE id=? AND status='pending'")
      .bind(user.email,at,at,id),
    env.DB.prepare("INSERT INTO books_audiobook_external_grants (buyer_user_id,book_id,claim_id,granted_at) SELECT buyer_user_id,book_id,id,? FROM books_audiobook_external_claims WHERE id=? AND status='verified' ON CONFLICT DO NOTHING")
      .bind(at,id)
  ]);
  return reply(200,{ok:true,status:'verified',claimId:id});
}
export async function revokeAudioClaim(env,req,id){
  const {user,error}=await identify(req,env,true);if(error)return error;
  const b=await input(req);
  if(!b||b.confirm!==true||!['refund','fraud','chargeback','owner_request'].includes(b.reason))
    return deny(400,'REASON_REQUIRED');
  const row=await env.DB.prepare('SELECT status FROM books_audiobook_external_claims WHERE id=?').bind(id).first();
  if(!row||row.status!=='verified')return deny(409,'NOT_ACTIVE');
  const at=iso();
  await env.DB.batch([
    env.DB.prepare("UPDATE books_audiobook_external_claims SET status='revoked',verified_by=?,updated_at=? WHERE id=? AND status='verified'")
      .bind(user.email,at,id),
    env.DB.prepare('UPDATE books_audiobook_external_grants SET revoked_at=? WHERE claim_id=? AND revoked_at IS NULL')
      .bind(at,id)
  ]);
  return reply(200,{ok:true,status:'revoked',claimId:id});
}
export async function externalAudioLibrary(env,req){
  const {user,error}=await identify(req,env);if(error)return error;
  const rows=await env.DB.prepare('SELECT book_id,granted_at FROM books_audiobook_external_grants WHERE buyer_user_id=? AND revoked_at IS NULL')
    .bind(user.userId).all();
  const catalog=await loadCatalog(env),byId=new Map((catalog.books||[]).map(b=>[b.id,b]));
  return reply(200,{items:(rows.results||[]).map(g=>{
    const b=byId.get(g.book_id);
    return {id:g.book_id,title:b?.title||g.book_id,author:b?.author||'',coverImage:b?.coverImage||'',
      grantedAt:g.granted_at,bonusStatus:b?.bonusAudio?.published===true?'check':'preparing'};
  })});
}
export async function handleExternalAudioClaims(request,env){
  if(!env?.DB)return deny(503,'DB_UNAVAILABLE');
  const path=new URL(request.url).pathname;
  const action=/^\/api\/commerce\/admin\/audiobook\/claims\/([a-f0-9-]{36})\/(approve|revoke)$/.exec(path);
  try{
    if(action&&request.method==='POST')return action[2]==='approve'
      ?approveAudioClaim(env,request,action[1]):revokeAudioClaim(env,request,action[1]);
    if(path==='/api/commerce/admin/audiobook/claims'&&request.method==='GET')return listPendingClaims(env,request);
    if(path==='/api/commerce/audiobook/claims'&&request.method==='POST')return submitAudioClaim(env,request);
    if(path==='/api/commerce/audiobook/claims'&&request.method==='GET')return listMyClaims(env,request);
    if(path==='/api/commerce/audiobook/external-library'&&request.method==='GET')return externalAudioLibrary(env,request);
    return deny(404,'NOT_FOUND');
  }catch{return deny(503,'CLAIMS_UNAVAILABLE')}
}
