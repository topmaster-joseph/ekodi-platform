// EKODI native Chromium: opt-in QR classroom screen-sharing acceptance.
// Does not automatically capture any learner's display, request access to
// real learner files, log QR credentials, or persist the still image.
import {chromium} from 'playwright';
import {mkdir,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {mintGateToken,GATE_COOKIE} from '../education-instructor-gate.js';
const ORIGIN='https://ekodi.kr';
const PATH='/edu/study/live/screen-share/';
const out=resolve('artifacts/education-screen-share-native');
const report={scope:'real-production',kind:'consensual-classroom-qr',ok:false,checks:[]};
const assert=(test,message)=>{if(!test)throw Error(message)};
async function accept(name,condition){assert(condition,name);report.checks.push({name,passed:true})}
async function run(){
 const key=process.env.EDU_GATE_SIGNING_KEY||'';
 assert(key.length>=32,'signed instructor proof unavailable');
 await mkdir(out,{recursive:true});
 const browser=await chromium.launch({headless:true});
 let teacher,first,second,ctx;
 try{
  ctx=await browser.newContext({viewport:{width:1366,height:768}});
  await ctx.addCookies([{name:GATE_COOKIE,value:await mintGateToken(key),domain:'ekodi.kr',path:'/edu/study/live',httpOnly:true,secure:true,sameSite:'Lax'}]);
  teacher=await ctx.newPage();
  const page=await teacher.goto(ORIGIN+PATH,{waitUntil:'domcontentloaded',timeout:30000});
  await accept('host page 200',page?.status()===200);
  await accept('host entry markup',await teacher.locator('#roster').count()===1);
  for(const width of [320,390,768,1366,1440]){
   const view=await browser.newContext({viewport:{width,height:820}});
   const probe=await view.newPage();
   const response=await probe.goto(ORIGIN+PATH,{waitUntil:'domcontentloaded',timeout:30000});
   const overflow=await probe.evaluate(()=>document.documentElement.scrollWidth-innerWidth);
   await accept('QR classroom responsive '+width+'px',response?.status()===200&&overflow<=4);
   await view.close();
  }
  const unauth=await browser.newContext();
  const deny=await unauth.request.post(ORIGIN+PATH+'api/rooms',{headers:{origin:ORIGIN},failOnStatusCode:false});
  await accept('anonymous cannot create room',deny.status()===401);
  const badOrigin=await unauth.request.post(ORIGIN+PATH+'api/rooms',{headers:{origin:'https://untrusted.invalid'},failOnStatusCode:false});
  await accept('foreign origin blocked',badOrigin.status()===403);
  await unauth.close();
  await teacher.locator('#createRoom').click();
  await teacher.locator('#invitePanel:not([hidden])').waitFor({timeout:20000});
  const join=await teacher.locator('#inviteLink').inputValue();
  const parsed=new URL(join);
  await accept('QR canonical and token in fragment only',parsed.origin===ORIGIN&&parsed.pathname===PATH&&/^\?r=[a-f0-9]{32}$/.test(parsed.search)&&/^#k=[a-f0-9]{64}$/.test(parsed.hash));
  await accept('owned QR renderer',await teacher.locator('#qr svg').count()===1);
  const student1=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true});
  first=await student1.newPage();
  await first.goto(join,{waitUntil:'domcontentloaded',timeout:30000});
  await accept('learner URL strips fragment',!(await first.evaluate(()=>location.hash)));
  await first.locator('#displayName').fill('학습자 A');
  await first.locator('#joinRoom').click();
  await teacher.waitForFunction(()=>document.querySelector('#rosterCount')?.textContent==='1',null,{timeout:15000});
  const student2=await browser.newContext({viewport:{width:320,height:720},isMobile:true,hasTouch:true});
  second=await student2.newPage();
  await second.goto(join,{waitUntil:'domcontentloaded',timeout:30000});
  await second.locator('#displayName').fill('학습자 B');
  await second.locator('#joinRoom').click();
  await teacher.waitForFunction(()=>document.querySelector('#rosterCount')?.textContent==='2',null,{timeout:15000});
  await accept('live roster shows two people',await teacher.locator('#roster li').count()===2);
  await accept('no screen shared before learner permission',await teacher.locator('#remoteVideo').isHidden()&&await teacher.locator('#remoteImage').isHidden());
  await teacher.locator('#roster li').filter({hasText:'학습자 A'}).getByRole('button').click();
  await first.locator('#shareControls:not([hidden])').waitFor({timeout:15000});
  await accept('selected learner receives explicit share button',await first.locator('#startShare').isVisible()&&await teacher.locator('#remoteVideo').isHidden());
  await accept('unselected learner never receives share controls',await second.locator('#shareControls').isHidden());
  // A synthetic 1-pixel input is selected by the test, exactly like a learner
  // voluntarily choosing a picture. No phone display is recorded.
  const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/a9kAAAAASUVORK5CYII=','base64');
  await first.locator('#snapshotFile').setInputFiles({name:'sample.png',mimeType:'image/png',buffer:png});
  await first.locator('#sendSnapshot').click();
  await teacher.locator('#remoteImage:not([hidden])').waitFor({timeout:15000});
  await accept('instructor sees learner-approved still', (await teacher.locator('#remoteImage').getAttribute('src')||'').startsWith('data:image/jpeg;base64,'));
  await teacher.locator('#stopSelection').click();
  await teacher.locator('#remoteImage[hidden]').waitFor({timeout:15000});
  await first.locator('#shareControls[hidden]').waitFor({timeout:15000});
  await accept('instructor can stop and revoke share',await first.locator('#shareControls').isHidden());
  await teacher.locator('#roster li').filter({hasText:'학습자 B'}).getByRole('button').click();
  await second.locator('#shareControls:not([hidden])').waitFor({timeout:15000});
  await accept('instructor can switch chosen student',await first.locator('#shareControls').isHidden()&&await second.locator('#shareControls').isVisible());
  await teacher.locator('#endRoom').click();
  await second.locator('#shareControls[hidden]').waitFor({timeout:15000});
  await accept('classroom closed by host',await second.locator('#shareControls').isHidden());
  report.ok=true;
 }finally{await browser.close();}
}
try{await run();}catch(e){report.error=String(e?.message||e).slice(0,240);process.exitCode=1;}
await mkdir(out,{recursive:true});
await writeFile(resolve(out,'result.json'),JSON.stringify(report,null,2));
console.log(JSON.stringify({kind:report.kind,scope:report.scope,ok:report.ok,checks:report.checks.length,error:report.error||null}));
