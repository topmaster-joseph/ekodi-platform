const json=(data,status=200,extra={})=>new Response(JSON.stringify(data),{status,headers:{'content-type':'application/json; charset=utf-8','cache-control':'no-store','x-content-type-options':'nosniff',...extra}});
const text=v=>String(v??'').trim();
const now=()=>new Date().toISOString();
const enc=new TextEncoder();
const CATEGORIES=new Set(['question','proposal','experience','factcheck','tip','other']);
async function sha(v){return [...new Uint8Array(await crypto.subtle.digest('SHA-256',enc.encode(v)))].map(b=>b.toString(16).padStart(2,'0')).join('')}
async function derive(password,salt,iterations=210000){const key=await crypto.subtle.importKey('raw',enc.encode(password),'PBKDF2',false,['deriveBits']);const bits=await crypto.subtle.deriveBits({name:'PBKDF2',hash:'SHA-256',salt:enc.encode(salt),iterations},key,256);return [...new Uint8Array(bits)].map(b=>b.toString(16).padStart(2,'0')).join('')}
function bearer(req){return (req.headers.get('authorization')||'').replace(/^Bearer\s+/i,'')}
function pathOf(req){const path=new URL(req.url).pathname;return path==='/board'?'/':path.startsWith('/board/')?path.slice('/board'.length):path}
async function admin(req,env){const raw=bearer(req);if(!raw)return null;return env.BOARD_DB.prepare('SELECT a.id,a.login FROM board_sessions s JOIN board_admins a ON a.id=s.admin_id WHERE s.token_hash=? AND s.expires_at>?').bind(await sha(raw),now()).first()}
async function body(req){try{return await req.json()}catch{return{}}}
function category(v){const value=text(v).toLowerCase();return CATEGORIES.has(value)?value:'other'}
async function list(env,url){
  const q=text(url.searchParams.get('q'));
  let sql="SELECT id,author_name,category,title,body,created_at,updated_at FROM board_posts WHERE status='published'",args=[];
  if(q){sql+=' AND (title LIKE ? OR body LIKE ?)';args=[`%${q}%`,`%${q}%`]}
  sql+=' ORDER BY id DESC LIMIT 100';
  const posts=(await env.BOARD_DB.prepare(sql).bind(...args).all()).results||[];
  const replies=(await env.BOARD_DB.prepare("SELECT id,post_id,author_name,body,created_at FROM board_replies WHERE status='published' ORDER BY id").all()).results||[];
  return json({ok:true,boardId:env.BOARD_ID,storage:'independent-board-d1',items:posts.map(p=>({
    id:Number(p.id),category:p.category||'other',displayName:p.author_name||'익명',message:p.body||'',createdAt:p.created_at,updatedAt:p.updated_at,
    replies:replies.filter(r=>Number(r.post_id)===Number(p.id)).map(r=>({id:Number(r.id),displayName:r.author_name||'익명',message:r.body||'',createdAt:r.created_at}))
  }))});
}
export default {async fetch(req,env){
  const url=new URL(req.url),path=pathOf(req);
  if(path==='/'&&req.method==='GET')return Response.redirect(new URL('/#voices',url),302);
  if(path==='/health'&&req.method==='GET')return json({ok:true,service:'independent-board',boardId:env.BOARD_ID,storage:'independent-board-d1',db:Boolean(env.BOARD_DB),files:Boolean(env.BOARD_FILES)});
  if(path==='/api/posts'&&req.method==='GET')return list(env,url);
  if(path==='/api/posts'&&req.method==='POST'){
    const b=await body(req),name=text(b.name||b.authorName).slice(0,80),content=text(b.message||b.body).slice(0,12000),title=text(b.title||name||'시민의견').slice(0,160),kind=category(b.category),contact=text(b.contact).slice(0,160);
    if(!content)return json({ok:false,error:'message_required',message:'의견 내용을 입력해 주세요.'},400);
    const t=now(),r=await env.BOARD_DB.prepare('INSERT INTO board_posts(author_name,category,private_contact,title,body,created_at,updated_at) VALUES(?,?,?,?,?,?,?)').bind(name||'익명',kind,contact,title,content,t,t).run();
    return json({ok:true,id:Number(r.meta.last_row_id||0),storage:'independent-board-d1',message:'시민의견이 등록되어 바로 게시되었습니다.'},201);
  }
  const reply=path.match(/^\/api\/posts\/(\d+)\/replies$/);
  if(reply&&req.method==='POST'){
    const b=await body(req),name=text(b.name||b.authorName).slice(0,80),content=text(b.message||b.body).slice(0,6000);
    if(!content)return json({ok:false,error:'message_required',message:'답글 내용을 입력해 주세요.'},400);
    const post=await env.BOARD_DB.prepare("SELECT id FROM board_posts WHERE id=? AND status='published'").bind(+reply[1]).first();if(!post)return json({ok:false,error:'not_found'},404);
    const r=await env.BOARD_DB.prepare('INSERT INTO board_replies(post_id,author_name,body,created_at) VALUES(?,?,?,?)').bind(post.id,name||'익명',content,now()).run();
    return json({ok:true,id:Number(r.meta.last_row_id||0),message:'답글이 등록되었습니다.'},201);
  }
  if(path==='/api/admin/bootstrap'&&req.method==='POST'){
    const count=await env.BOARD_DB.prepare('SELECT COUNT(*) n FROM board_admins').first();if(Number(count?.n)>0)return json({ok:false,error:'bootstrap_closed'},409);
    const b=await body(req),login=text(b.login).slice(0,120),password=text(b.password);if(!login||password.length<12)return json({ok:false,error:'strong_credentials_required'},400);
    const salt=crypto.randomUUID(),iterations=210000,hash=await derive(password,salt,iterations);await env.BOARD_DB.prepare('INSERT INTO board_admins(login,password_hash,password_salt,password_iterations,created_at) VALUES(?,?,?,?,?)').bind(login,hash,salt,iterations,now()).run();return json({ok:true},201);
  }
  if(path==='/api/admin/login'&&req.method==='POST'){
    const b=await body(req),row=await env.BOARD_DB.prepare('SELECT * FROM board_admins WHERE login=?').bind(text(b.login)).first();if(!row||await derive(text(b.password),row.password_salt,row.password_iterations)!==row.password_hash)return json({ok:false,error:'invalid_credentials'},401);
    const raw=crypto.randomUUID()+crypto.randomUUID(),expires=new Date(Date.now()+8*3600e3).toISOString();await env.BOARD_DB.prepare('INSERT INTO board_sessions(token_hash,admin_id,expires_at,created_at) VALUES(?,?,?,?)').bind(await sha(raw),row.id,expires,now()).run();return json({ok:true,token:raw,expiresAt:expires});
  }
  const del=path.match(/^\/api\/admin\/posts\/(\d+)$/);
  if(del&&req.method==='DELETE'){if(!await admin(req,env))return json({ok:false,error:'unauthorized'},401);await env.BOARD_DB.prepare('UPDATE board_posts SET status=\'deleted\',updated_at=? WHERE id=?').bind(now(),+del[1]).run();return json({ok:true})}
  return json({ok:false,error:'not_found'},404);
}};