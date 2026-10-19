import test from 'node:test';
import assert from 'node:assert/strict';
import board from '../services/independent-board/worker.js';

// Production evidence (2026-10-18): EKODI verifies the Google ID token in
// identity-api, then signs the user in with a Supabase email one-time session.
// Supabase therefore records provider "email" for every account (0/10 users
// carry a Supabase "google" identity), while the canonical Google proof lives
// in EKODI's login_identities registry. Writing must accept that proof and
// nothing weaker.

const origin='https://seonammedi.kr';
const emailSessionUser={id:'auth-user-1',email:'Writer@Example.com',email_confirmed_at:'2026-01-01T00:00:00Z',
  app_metadata:{provider:'email',providers:['email']},identities:[{provider:'email'}]};

async function sessionWith(identityResponse,{user=emailSessionUser,record=[]}={}){
  const oldFetch=globalThis.fetch;
  globalThis.fetch=async(url,options={})=>{
    const u=new URL(url);
    record.push({path:u.pathname,headers:options.headers||{}});
    if(u.pathname==='/auth/v1/user')return Response.json(user);
    if(u.pathname==='/functions/v1/identity-api/identities')return identityResponse();
    return new Response('unexpected',{status:500});
  };
  try{
    const res=await board.fetch(new Request(origin+'/board/api/auth/session',{headers:{authorization:'Bearer fixture-email-session'}}),{});
    return {status:res.status,body:await res.json()};
  }finally{globalThis.fetch=oldFetch}
}

test('EKODI-verified Google login (Supabase email session + active current google identity) may write',async()=>{
  const record=[];
  const r=await sessionWith(()=>Response.json({person:{id:'p'},identities:[
    {provider:'google',status:'active',is_current:true,email:'writer@example.com'}]}),{record});
  assert.equal(r.status,200);
  assert.deepEqual(r.body,{ok:true,authenticated:true,provider:'google',email:'writer@example.com'});
  const idCall=record.find(x=>x.path==='/functions/v1/identity-api/identities');
  assert.ok(idCall,'canonical EKODI identity registry must be consulted');
  assert.equal(idCall.headers.authorization,'Bearer fixture-email-session','the same user token is verified, never a service secret');
  assert.equal(idCall.headers.origin,'https://ekodi.kr');
});

test('a google identity that belongs to another login of the same person is not enough',async()=>{
  const r=await sessionWith(()=>Response.json({identities:[{provider:'google',status:'active',is_current:false}]}));
  assert.equal(r.status,401);
  assert.equal(r.body.error,'google_login_required');
});

test('inactive google identities, non-google identities and registry failures are rejected',async()=>{
  for(const make of [
    ()=>Response.json({identities:[{provider:'google',status:'revoked',is_current:true}]}),
    ()=>Response.json({identities:[{provider:'email',status:'active',is_current:true}]}),
    ()=>Response.json({identities:[]}),
    ()=>Response.json({error:'unauthorized'},{status:401}),
    ()=>new Response('not json',{status:200}),
    ()=>{throw new Error('network')}
  ]){
    const r=await sessionWith(make);
    assert.equal(r.status,401);
    assert.equal(r.body.error,'google_login_required');
  }
});

test('an unconfirmed or invalid Supabase session never reaches the identity registry',async()=>{
  const record=[];
  const r=await sessionWith(()=>Response.json({identities:[{provider:'google',status:'active',is_current:true}]}),
    {user:{...emailSessionUser,email_confirmed_at:null},record});
  assert.equal(r.status,401);
  assert.ok(!record.some(x=>x.path.includes('identity-api')),'identity registry is only a second factor after a valid session');
});

test('the same canonical check gates the write API, not only the session probe',async()=>{
  const oldFetch=globalThis.fetch;
  globalThis.fetch=async url=>{
    const u=new URL(url);
    if(u.pathname==='/auth/v1/user')return Response.json(emailSessionUser);
    if(u.pathname.endsWith('/identities'))return Response.json({identities:[]});
    return new Response('unexpected',{status:500});
  };
  try{
    const res=await board.fetch(new Request(origin+'/board/api/voices-fresh',{method:'POST',
      headers:{authorization:'Bearer fixture-email-session','content-type':'application/json'},
      body:JSON.stringify({message:'시민의견'})}),{BOARD_DB:{prepare(){throw new Error('must not touch storage')}}});
    assert.equal(res.status,401);
  }finally{globalThis.fetch=oldFetch}
});
