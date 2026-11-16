// EKODI Education: consent-only participant screen relay coordinator.
// Participants who press "share" send low-rate still JPEG frames; the Durable Object relays them in
// memory to the instructor only (never stored, never recorded). One instructor, at most 30 participants.
// Short-lived capability tokens are hashed at rest; all state expires after 2 hours.
const enc=new TextEncoder();
const reply=(data,status=200)=>new Response(JSON.stringify(data),{status,headers:{'content-type':'application/json; charset=utf-8','cache-control':'no-store','x-content-type-options':'nosniff','referrer-policy':'no-referrer'}});
const hash=async s=>[...new Uint8Array(await crypto.subtle.digest('SHA-256',enc.encode(s)))].map(x=>x.toString(16).padStart(2,'0')).join('');
const key=()=>{const a=crypto.getRandomValues(new Uint8Array(32));return [...a].map(x=>x.toString(16).padStart(2,'0')).join('');};
const validId=s=>/^[a-f0-9]{32}$/.test(String(s||''));
const cleanName=s=>String(s||'').replace(/[<>&"']/g,'').trim().slice(0,36);
export const ROOM_TTL_MS=4*60*60*1000;
export const MAX_LEARNERS=30;
export class EducationScreenRoom {
 constructor(ctx,env){this.ctx=ctx;this.env=env;}
 sockets(){return this.ctx.getWebSockets();}
 role(ws){return ws.deserializeAttachment()||{};}
 send(ws,value){try{ws.send(JSON.stringify(value));}catch{}}
 host(){return this.sockets().find(w=>this.role(w).role==='host')||null;}
 viewers(){return this.sockets().filter(w=>this.role(w).role==='viewer');}
 // Instructor-side screens (control room + projector windows) receive participant frames.
 watchers(){return this.sockets().filter(w=>['host','viewer'].includes(this.role(w).role));}
 student(id){return this.sockets().find(w=>this.role(w).role==='student'&&this.role(w).id===id)||null;}
 async config(){return await this.ctx.storage.get('config')||null;}
 async roster(){
  const seen=new Set(),list=[];
  for(const ws of this.sockets()){
   const a=this.role(ws);if(a.role!=='student'||seen.has(a.id))continue;
   seen.add(a.id);list.push({id:a.id,name:a.name,connected:true,sharing:!!this.sharing?.get(a.id)});
  }
  const selected=await this.ctx.storage.get('selected');
  for(const w of this.watchers())this.send(w,{type:'roster',participants:list,selected:selected||null,max:MAX_LEARNERS});
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
   const auth=protocols.find(p=>/^(?:host|view)\.[a-f0-9]{64}$/.test(p)||/^student\.[a-f0-9]{32}\.[a-f0-9]{64}$/.test(p));
   let identity;
   if(auth?.startsWith('host.')){
    if(await hash(auth.slice(5))!==config.hostHash)return reply({ok:false,code:'invalid_host'},403);
    identity={role:'host',id:'host'};
   }else if(auth?.startsWith('view.')){
    // Projector window: same instructor secret, display only (cannot select, stop or end).
    if(await hash(auth.slice(5))!==config.hostHash)return reply({ok:false,code:'invalid_host'},403);
    const viewers=this.viewers();if(viewers.length>=3){this.send(viewers[0],{type:'replaced'});viewers[0].close(4000,'replaced');}
    identity={role:'viewer',id:'view-'+crypto.randomUUID().slice(0,8)};
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
   if(identity.role==='viewer'){const sel=await this.ctx.storage.get('selected');const st=sel&&this.student(sel);this.send(server,st?{type:'show',id:sel,name:this.role(st).name}:{type:'grid'});}
   await this.roster();
   return new Response(null,{status:101,webSocket:client,headers:{'sec-websocket-protocol':'ekodi-screen-v1'}});
  }
  return reply({ok:false,code:'not_found'},404);
 }
 // 2026-11-16 redesign: WebRTC (STUN-only) failed across school Wi-Fi/LTE, so participants now send
 // low-rate still JPEG frames of the screen they chose to share. Frames are relayed in memory to the
 // instructor only, never stored or recorded. Sharing still starts only by the participant's own click.
 async webSocketMessage(ws,data){
  if(typeof data!=='string'||data.length>370000){ws.close(1009,'too_large');return}
  let msg;try{msg=JSON.parse(data)}catch{return}
  const from=this.role(ws),conf=await this.config(),now=Date.now();
  if(!conf||conf.ended||now>=conf.expiresAt){this.send(ws,{type:'room_closed'});ws.close(4001,'expired');return}
  this.sharing??=new Map();this.last??=new Map();
  if(from.role==='host'){
   if(msg.type==='focus'||msg.type==='select'){
    const id=String(msg.id||'');
    if(!validId(id)||!this.student(id))return this.send(ws,{type:'error',code:'participant_offline'});
    const old=await this.ctx.storage.get('selected');
    if(old&&old!==id){const previous=this.student(old);if(previous)this.send(previous,{type:'unfocus'});}
    await this.ctx.storage.put('selected',id);
    this.send(this.student(id),{type:'focus'});
    this.send(ws,{type:'focused',id});
    for(const v of this.viewers())this.send(v,{type:'show',id,name:this.role(this.student(id)).name});
    return this.roster();
   }
   if(msg.type==='unfocus'){
    const old=await this.ctx.storage.get('selected');if(old&&this.student(old))this.send(this.student(old),{type:'unfocus'});
    await this.ctx.storage.delete('selected');this.send(ws,{type:'unfocused'});for(const v of this.viewers())this.send(v,{type:'grid'});return this.roster();
   }
   if(msg.type==='stop'){
    const id=validId(msg.id)?msg.id:await this.ctx.storage.get('selected');
    if(id&&this.student(id))this.send(this.student(id),{type:'stop',reason:'instructor'});
    if(id)this.sharing.delete(id);
    if(id&&id===await this.ctx.storage.get('selected'))await this.ctx.storage.delete('selected');
    this.send(ws,{type:'stopped',id:id||null});return this.roster();
   }
   if(msg.type==='end'){
    conf.ended=true;await this.ctx.storage.put('config',conf);
    for(const s of this.sockets()){this.send(s,{type:'room_closed'});s.close(4001,'ended');}
    return;
   }
   return;
  }
  if(from.role!=='student')return;
  if(msg.type==='frame'&&typeof msg.data==='string'&&msg.data.length<350000&&/^data:image\/(?:jpeg|png);base64,[A-Za-z0-9+/=]+$/.test(msg.data)){
   if(now-(this.last.get(from.id)||0)<500)return; // per-participant rate limit
   this.last.set(from.id,now);
   if(!this.sharing.get(from.id)){this.sharing.set(from.id,true);await this.roster();}
   for(const w of this.watchers())this.send(w,{type:'frame',id:from.id,name:from.name,data:msg.data});
   return;
  }
  if(msg.type==='status'&&['sharing','stopped','unsupported','denied'].includes(msg.status)){
   if(msg.status==='sharing')this.sharing.set(from.id,true);else this.sharing.delete(from.id);
   for(const w of this.watchers())this.send(w,{type:'status',id:from.id,name:from.name,status:msg.status});
   return this.roster();
  }
 }
 async webSocketClose(ws){
  const who=this.role(ws),selected=await this.ctx.storage.get('selected');
  this.sharing??=new Map();
  if(who.role==='host'){
   // A projector window that is still open keeps showing; with nobody watching, participants stop.
   if(!this.viewers().length){
    for(const s of this.sockets()){if(this.role(s).role==='student')this.send(s,{type:'stop',reason:'instructor_disconnected'});}
    this.sharing.clear();await this.ctx.storage.delete('selected');
   }
  }else if(who.role==='viewer'){
   // nothing to clean up
  }else if(who.role==='student'){
   this.sharing.delete(who.id);
   if(selected===who.id)await this.ctx.storage.delete('selected');
   for(const w of this.watchers())if(w!==ws)this.send(w,{type:'left',id:who.id});
  }
  await this.roster();
 }
 async webSocketError(ws){await this.webSocketClose(ws);}
 async alarm(){
  for(const socket of this.sockets()){this.send(socket,{type:'room_closed'});socket.close(4001,'expired');}
  await this.ctx.storage.deleteAll();
 }
}
