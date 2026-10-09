// Independent board discussion comments: persistence and authorization live on the board worker.
const json=(data,status=200)=>new Response(JSON.stringify(data),{status,headers:{'content-type':'application/json; charset=utf-8','cache-control':'no-store','x-content-type-options':'nosniff'}});
const clean=(value,max)=>String(value??'').trim().slice(0,max);
const PARENTS={finance:'finance_posts',notices:'notice_posts'};
export const BOARD_DISCUSSION_QUEUE_KIND='independent-board.discussion-comment.v1';

export async function listBoardDiscussionComments(env,kind,items){
  if(!PARENTS[kind]||!items.length)return items;
  const rows=(await env.BOARD_DB.prepare("SELECT id,post_id,author_name,body,created_at,updated_at FROM board_discussion_comments WHERE board_kind=? AND status='published' ORDER BY id ASC LIMIT 3000").bind(kind).all()).results||[];
  const byPost=new Map();
  for(const r of rows){
    const id=Number(r.post_id);
    if(!byPost.has(id))byPost.set(id,[]);
    byPost.get(id).push({id:Number(r.id),displayName:r.author_name||'회원',message:r.body||'',createdAt:r.created_at,updatedAt:r.updated_at});
  }
  return items.map(item=>({...item,comments:byPost.get(item.id)||[]}));
}

export async function publishBoardComment(request,env,{kind,postId,member,rateLimit,enqueue,queueAvailable}){
  if(!PARENTS[kind]||!Number.isSafeInteger(postId)||postId<1)return json({ok:false,error:'invalid_comment_target'},400);
  if(!member?.id)return json({ok:false,error:'login_required',message:'댓글은 로그인 후 작성할 수 있습니다.'},401);
  const contentLength=Number(request.headers.get('content-length')||0);
  if(contentLength>8192)return json({ok:false,error:'payload_too_large'},413);
  let payload;try{payload=await request.json()}catch{return json({ok:false,error:'invalid_json'},400)}
  const content=clean(payload?.message||payload?.body,2000);
  if(!content)return json({ok:false,error:'comment_required',message:'댓글 내용을 입력해 주세요.'},400);
  const parent=await env.BOARD_DB.prepare("SELECT id FROM "+PARENTS[kind]+" WHERE id=? AND status='published'").bind(postId).first();
  if(!parent?.id)return json({ok:false,error:'not_found'},404);
  const limited=await rateLimit(request,env,kind+'-comment');
  if(!limited.available)return json({ok:false,error:'write_protection_unavailable'},503);
  if(!limited.allowed)return json({ok:false,error:'rate_limited'},429);
  const submissionId=crypto.randomUUID();
  const createdAt=new Date().toISOString();
  const entry={kind:BOARD_DISCUSSION_QUEUE_KIND,payload:{kind,postId,authorId:clean(member.id,128),authorName:clean(member.displayName||'회원',80),content,submissionId,createdAt}};
  try{
    if(queueAvailable(env)&&await enqueue(env,entry))return json({ok:true,queued:true,submissionId,statusUrl:'/board/api/submissions/'+submissionId},202);
    if(env.ENVIRONMENT!=='production'&&env.BOARD_DB?.prepare){
      const id=await consumeDiscussionComment(entry,env);
      return json({ok:true,queued:false,id,submissionId},201);
    }
    return json({ok:false,error:'durable_queue_unavailable'},503);
  }catch(error){console.error('board discussion comment queue failed',error);return json({ok:false,error:'write_ingress_failed'},503)}
}

export async function consumeDiscussionComment(envelope,env){
  if(envelope?.kind!==BOARD_DISCUSSION_QUEUE_KIND)return false;
  const p=envelope.payload||{},table=PARENTS[p.kind];
  if(!table||!Number.isSafeInteger(p.postId)||!p.submissionId||!p.authorId||!p.content)throw Error('invalid_board_discussion_envelope');
  const existing=await env.BOARD_DB.prepare('SELECT id FROM board_discussion_comments WHERE submission_key=?').bind(p.submissionId).first();
  if(existing?.id)return Number(existing.id);
  const parent=await env.BOARD_DB.prepare("SELECT id FROM "+table+" WHERE id=? AND status='published'").bind(p.postId).first();
  if(!parent?.id)return true; // Parent was deleted after queue acceptance; safely discard the orphan.
  const r=await env.BOARD_DB.prepare("INSERT OR IGNORE INTO board_discussion_comments(board_kind,post_id,author_id,author_name,body,submission_key,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?)")
    .bind(p.kind,p.postId,p.authorId,p.authorName,p.content,p.submissionId,p.createdAt,p.createdAt).run();
  return Number(r?.meta?.last_row_id||0)||true;
}

export async function updateBoardDiscussionComment(request,env,{kind,postId,commentId}){
  if(!PARENTS[kind])return json({ok:false,error:'not_found'},404);
  const existing=await env.BOARD_DB.prepare("SELECT id FROM board_discussion_comments WHERE board_kind=? AND post_id=? AND id=? AND status='published'").bind(kind,postId,commentId).first();
  if(!existing?.id)return json({ok:false,error:'not_found'},404);
  let b;try{b=await request.json()}catch{return json({ok:false,error:'invalid_json'},400)}
  const message=clean(b?.message||b?.body,2000);
  if(!message)return json({ok:false,error:'comment_required'},400);
  await env.BOARD_DB.prepare("UPDATE board_discussion_comments SET body=?,updated_at=? WHERE id=? AND board_kind=? AND post_id=? AND status='published'")
    .bind(message,new Date().toISOString(),commentId,kind,postId).run();
  return json({ok:true,id:commentId});
}

export async function deleteBoardDiscussionComment(env,{kind,postId,commentId}){
  if(!PARENTS[kind])return json({ok:false,error:'not_found'},404);
  const r=await env.BOARD_DB.prepare("UPDATE board_discussion_comments SET status='deleted',updated_at=? WHERE id=? AND board_kind=? AND post_id=? AND status='published'")
    .bind(new Date().toISOString(),commentId,kind,postId).run();
  return r?.meta?.changes?json({ok:true,id:commentId}):json({ok:false,error:'not_found'},404);
}
