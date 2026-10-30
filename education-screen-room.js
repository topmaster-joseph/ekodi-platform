// EKODI Education: consent-only, single-student screen relay coordinator.
// The Durable Object relays signaling/one-time still images, NEVER video frames.
// One instructor, at most 30 joined learners and ONE selected WebRTC sender.
// Short-lived capability tokens are hashed at rest; all state expires after 2 hours.
const enc=new TextEncoder();
const reply=(data,status=200)=>new Response(JSON.stringify(data),{status,headers:{'content-type':'application/json; charset=utf-8','cache-control':'no-store','x-content-type-options':'nosniff','referrer-policy':'no-referrer'}});
const hash=async s=>[...new Uint8Array(await crypto.subtle.digest('SHA-256',enc.encode(s)))].map(x=>x.toString(16).padStart(2,'0')).join('');
const key=()=>{const a=crypto.getRandomValues(new Uint8Array(32));return [...a].map(x=>x.toString(16).padStart(2,'0')).join('');};
const validId=s=>/^[a-f0-9]{32}$/.test(String(s||''));
const cleanName=s=>String(s||'').replace(/[<>&"']/g,'').trim().slice(0,36);
export const ROOM_TTL_MS=2*60*60*1000;
export const MAX_LEARNERS=30;
export class EducationScreenRoom {
 constructor(ctx,env){this.ctx=ctx;this.env=env;}
 sockets(){return this.ctx.getWebSockets();}
 role(ws){return ws.deserializeAttachment()||{};}
 send(ws,value){try{ws.send(JSON.stringify(value));}catch{}}
 host(){return this.sockets().find(w=>this.role(w).role==='host')||null;}
 student(id){return this.sockets().find(w=>this.role(w).role==='student'&&this.role(w).id===id)||null;}
 async config(){return await this.ctx.storage.get('config')||null;}
 async roster(){
  const seen=new Set(),list=[];
  for(const ws of this.sockets()){
   const a=this.role(ws);if(a.role!=='student'||seen.has(a.id))continue;
   seen.add(a.id);list.push({id:a.id,name:a.name,connected:true});
  }
  const host=this.host(),selected=await this.ctx.storage.get('selected');
  if(host)this.send(host,{type:'roster',participants:list,selected:selected||null,max:MAX_LEARNERS});
 }
 async fetch(request){
  const url=new URL(request.url),config=await this.config(),now=Date.now();
  if(url.pathname==='/init'&&request.method==='POST'){
   if(config)return reply({ok:false,code:'room_exists'},409);
   let body;try{body=await request.json()}catch{return reply({ok:false,code:'bad_json'},400)}
   if(!validId(body?.id)||!Number.isSafeInteger(body?.createdAt)||Math.abs(now-body.createdAt)>30000||!(/^[a-f0-9]{64}$/.test(body?.hostKey||''))||!(/^[a-f0-9]{64}$/.test(body?.joinKey||'')))return reply({ok:false,code:'invalid_room'},400);
   const saved={id:body.id,createdAt:now,expiresAt:now+ROOM_TTL_MS,hostHash:await hash(body.hostKey),joinHash:await hash(body.joinKey),ended:false};
   await this.ctx.storage.put('config',saved);
   // Expiry is enforced on every request and backed by automatic erasure.
   await this.ctx.storage.setAlarm(saved.expiresAt);
   return reply({ok:true,expiresAt:saved.expiresAt});
  }
  if(!config||config.ended||now>=config.expiresAt)return reply({ok:false,code:'room_closed'},410);
  if(url.pathname==='/join'&&request.method==='POST'){
   let input;try{input=await request.json()}catch{return reply({ok:false,code:'bad_json'},400)}
   if(!/^[a-f0-9]{64}$/.test(input?.joinKey||'')||await hash(input.joinKey)!==config.joinHash)return reply({ok:false,code:'invalid_invitation'},403);
   const name=cleanName(input?.name);if(name.length<2)return reply({ok:false,code:'name_required'},400);
   const all=(await this.ctx.storage.list({prefix:'student:'}));if(all.size>=MAX_LEARNERS)return reply({ok:false,code:'room_full'},429);
   const id=crypto.randomUUID().replaceAll('-',''),token=key();
   await this.ctx.storage.put('student:'+id,{name,tokenHash:await hash(token),joinedAt:now});
   return reply({ok:true,id,token,name,expiresAt:config.expiresAt});
  }
  if(url.pathname==='/connect'&&request.method==='GET'){
   if(request.headers.get('upgrade')?.toLowerCase()!=='websocket')return reply({ok:false,code:'upgrade_required'},426);
   const protocols=(request.headers.get('sec-websocket-protocol')||'').split(',').map(x=>x.trim());
   if(!protocols.includes('ekodi-screen-v1'))return reply({ok:false,code:'invalid_protocol'},403);
   const auth=protocols.find(p=>/^host\.[a-f0-9]{64}$/.test(p)||/^student\.[a-f0-9]{32}\.[a-f0-9]{64}$/.test(p));
   let identity;
   if(auth?.startsWith('host.')){
    if(await hash(auth.slice(5))!==config.hostHash)return reply({ok:false,code:'invalid_host'},403);
    identity={role:'host',id:'host'};
   }else if(auth?.startsWith('student.')){
    const [,id,token]=auth.split('.'),student=await this.ctx.storage.get('student:'+id);
    if(!student||await hash(token)!==student.tokenHash)return reply({ok:false,code:'invalid_student'},403);
    identity={role:'student',id,name:student.name};
   }else return reply({ok:false,code:'invalid_token'},403);
   // Only one connected host and one connection for a specific student.
   for(const socket of this.sockets()){const data=this.role(socket);
    if(data.role===identity.role&&data.id===identity.id){this.send(socket,{type:'replaced'});socket.close(4000,'replaced');}
   }
   const pair=new WebSocketPair(),client=pair[0],server=pair[1];
   this.ctx.acceptWebSocket(server,['room-client']);
   server.serializeAttachment(identity);
   this.send(server,{type:'connected',role:identity.role,id:identity.id,expiresAt:config.expiresAt});
   await this.roster();
   return new Response(null,{status:101,webSocket:client,headers:{'sec-websocket-protocol':'ekodi-screen-v1'}});
  }
  return reply({ok:false,code:'not_found'},404);
 }
 async webSocketMessage(ws,data){
  if(typeof data!=='string'||data.length>370000){ws.close(1009,'too_large');return}
  let msg;try{msg=JSON.parse(data)}catch{return}
  const from=this.role(ws),conf=await this.config(),now=Date.now();
  if(!conf||conf.ended||now>=conf.expiresAt){this.send(ws,{type:'room_closed'});ws.close(4001,'expired');return}
  if(from.role==='host'){
   if(msg.type==='select'){
    const id=String(msg.id||'');
    if(!validId(id)||!this.student(id))return this.send(ws,{type:'error',code:'participant_offline'});
    const old=await this.ctx.storage.get('selected');
    if(old&&old!==id){const previous=this.student(old);if(previous)this.send(previous,{type:'stop',reason:'switched'});}
    await this.ctx.storage.put('selected',id);
    this.send(this.student(id),{type:'selected'});
    this.send(ws,{type:'selected',id});
    return this.roster();
   }
   if(msg.type==='stop'){
    const old=await this.ctx.storage.get('selected');if(old&&this.student(old))this.send(this.student(old),{type:'stop',reason:'instructor'});
    await this.ctx.storage.delete('selected');this.send(ws,{type:'stopped'});return this.roster();
   }
   if(msg.type==='end'){
    conf.ended=true;await this.ctx.storage.put('config',conf);
    for(const s of this.sockets()){this.send(s,{type:'room_closed'});s.close(4001,'ended');}
    return;
   }
  }
  const selected=await this.ctx.storage.get('selected');
  if(!selected)return;
  const recipient=from.role==='host'?this.student(selected):(from.role==='student'&&from.id===selected?this.host():null);
  if(!recipient)return;
  if(msg.type==='rtc'&&['offer','answer','ice'].includes(msg.kind)&&
    JSON.stringify(msg.payload||{}).length<28000){
    this.send(recipient,{type:'rtc',kind:msg.kind,payload:msg.payload,from:from.id});return;
  }
  if(from.role==='student'&&from.id===selected&&msg.type==='snapshot'&&
    typeof msg.data==='string'&&msg.data.length<350000&&/^data:image\/(?:jpeg|png);base64,[A-Za-z0-9+/=]+$/.test(msg.data)){
    this.send(recipient,{type:'snapshot',data:msg.data,name:from.name});return;
  }
  if(from.role==='student'&&from.id===selected&&msg.type==='status'&&['sharing','stopped','unsupported','denied','connecting'].includes(msg.status))
    this.send(recipient,{type:'status',id:from.id,status:msg.status});
 }
 async webSocketClose(ws){const who=this.role(ws),selected=await this.ctx.storage.get('selected');if(who.role==='student'&&selected===who.id){await this.ctx.storage.delete('selected');const host=this.host();if(host)this.send(host,{type:'stopped'});}await this.roster();}
 async webSocketError(ws){await this.webSocketClose(ws);}
 async alarm(){
  for(const socket of this.sockets()){this.send(socket,{type:'room_closed'});socket.close(4001,'expired');}
  await this.ctx.storage.deleteAll();
 }
}
