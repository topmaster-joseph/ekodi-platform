// Plays the PERSON at the PC (test only): navigates the open window to submit the login.
const port=process.argv[2]; const list=await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
const p=list.find(t=>t.type==='page'); const ws=new WebSocket(p.webSocketDebuggerUrl);
await new Promise(r=>ws.onopen=r); ws.send(JSON.stringify({id:1,method:'Page.navigate',params:{url:'https://mokpo.factchat.bot/login/submit'}}));
await new Promise(r=>setTimeout(r,2500)); ws.close(); console.log('human logged in');
