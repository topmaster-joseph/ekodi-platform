import https from 'node:https'; import fs from 'node:fs';
const page=(body)=>`<!doctype html><html><head><meta charset=utf-8><title>FactChat</title></head><body>${body}</body></html>`;
https.createServer({key:fs.readFileSync(new URL('./key.pem',import.meta.url)),cert:fs.readFileSync(new URL('./cert.pem',import.meta.url))},(req,res)=>{
  const authed=/auth=1/.test(req.headers.cookie||''); const u=new URL(req.url,'https://mokpo.factchat.bot');
  if(u.pathname==='/login/submit'){res.writeHead(302,{'set-cookie':'auth=1; Path=/; Secure; HttpOnly',location:'/dashboard/chat/40882'});return res.end();}
  if(u.pathname.startsWith('/dashboard')&&!authed){res.writeHead(302,{location:'/login'});return res.end();}
  res.writeHead(200,{'content-type':'text/html; charset=utf-8'});
  if(u.pathname==='/login') return res.end(page('<form><input name=id><input type=password name=pw><button>로그인</button></form>'));
  res.end(page(`<nav><a href="#">생산성</a><a href="#">회의록</a><a href="#">HWP 편집</a><a href="#">프레젠테이션</a><a href="#">Super Agent</a><a href="#">Deep Research</a><a href="#">Univ-in-Data</a></nav>
  <aside><li>채팅: 비밀 회의 kim@mokpo.ac.kr</li></aside><main><p>잔여 크레딧 1,000 / 한도 5,000 (kim@mokpo.ac.kr)</p><p>사용량 오늘 12회</p></main>`));
}).listen(443,'127.0.0.1',()=>console.log('mock factchat up'));
