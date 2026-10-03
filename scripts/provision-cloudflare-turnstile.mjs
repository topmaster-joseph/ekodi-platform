import fs from 'node:fs';
import path from 'node:path';

const API='https://api.cloudflare.com/client/v4';
export const TURNSTILE_WIDGET=Object.freeze({
  name:'EKODI Public Write Guard',
  domains:Object.freeze([
    'ekodi.kr',
    'seonammedi.kr',
    'www.seonammedi.kr',
    'xn--3e0b8b58jw4co4mnpll3k.kr',
    'www.xn--3e0b8b58jw4co4mnpll3k.kr',
  ]),
  mode:'managed',
  clearance_level:'no_clearance',
});

export function validateTurnstileWidget(widget=TURNSTILE_WIDGET){
  const errors=[];
  if(widget.name!=='EKODI Public Write Guard')errors.push('canonical widget name required');
  if(widget.mode!=='managed')errors.push('managed mode required');
  if(widget.clearance_level!=='no_clearance')errors.push('pre-clearance must stay disabled');
  if(!Array.isArray(widget.domains)||!widget.domains.includes('ekodi.kr')||!widget.domains.includes('seonammedi.kr'))errors.push('canonical domains required');
  if((widget.domains||[]).length>10)errors.push('Cloudflare widget domain limit exceeded');
  return errors;
}

async function cf(pathname,{method='GET',token,body}={}){
  const response=await fetch(API+pathname,{
    method,
    headers:{Authorization:'Bearer '+token,...(body?{'Content-Type':'application/json'}:{})},
    body:body?JSON.stringify(body):undefined,
  });
  const payload=await response.json().catch(()=>null);
  if(!response.ok||payload?.success!==true){
    const errors=(payload?.errors||[]).map(item=>String(item?.code||'CF')+':'+String(item?.message||'request failed')).join(', ');
    throw new Error('Cloudflare '+method+' '+pathname+' failed ('+response.status+')'+(errors?': '+errors:''));
  }
  return payload.result;
}

function sameDomains(a=[],b=[]){
  return [...a].map(String).sort().join('\n')===[...b].map(String).sort().join('\n');
}

async function resolveWidget({token,accountId}){
  const list=await cf('/accounts/'+encodeURIComponent(accountId)+'/challenges/widgets?per_page=100',{token});
  const exact=(Array.isArray(list)?list:[]).filter(item=>item?.name===TURNSTILE_WIDGET.name);
  if(exact.length>1)throw new Error('Multiple canonical EKODI Turnstile widgets exist; refusing ambiguous mutation.');

  let widget;
  if(exact.length===0){
    widget=await cf('/accounts/'+encodeURIComponent(accountId)+'/challenges/widgets',{
      method:'POST',token,body:TURNSTILE_WIDGET,
    });
    console.log('Created canonical EKODI Turnstile widget.');
  }else{
    const sitekey=String(exact[0]?.sitekey||'');
    if(!sitekey)throw new Error('Existing Turnstile widget is missing sitekey.');
    widget=await cf('/accounts/'+encodeURIComponent(accountId)+'/challenges/widgets/'+encodeURIComponent(sitekey),{token});
    const drift=widget?.mode!==TURNSTILE_WIDGET.mode
      ||widget?.clearance_level!==TURNSTILE_WIDGET.clearance_level
      ||!sameDomains(widget?.domains||[],TURNSTILE_WIDGET.domains);
    if(drift){
      widget=await cf('/accounts/'+encodeURIComponent(accountId)+'/challenges/widgets/'+encodeURIComponent(sitekey),{
        method:'PUT',token,body:TURNSTILE_WIDGET,
      });
      console.log('Updated canonical EKODI Turnstile widget to the approved host/mode contract.');
    }else console.log('Canonical EKODI Turnstile widget already matches policy.');
  }

  const sitekey=String(widget?.sitekey||'').trim();
  const secret=String(widget?.secret||'').trim();
  if(!sitekey||!secret)throw new Error('Turnstile widget response did not include both sitekey and secret.');
  return {sitekey,secret};
}

async function main(){
  const errors=validateTurnstileWidget();
  if(errors.length)throw new Error(errors.join('; '));
  if(process.argv.includes('--validate-only')){
    console.log('EKODI Turnstile provisioning contract: PASS');
    return;
  }

  const token=String(process.env.CLOUDFLARE_API_TOKEN||'').trim();
  const accountId=String(process.env.CLOUDFLARE_ACCOUNT_ID||'').trim();
  const output=String(process.env.TURNSTILE_SECRETS_FILE||'').trim();
  if(!token||!accountId||!output)throw new Error('Cloudflare credentials and TURNSTILE_SECRETS_FILE are required.');
  if(process.env.GITHUB_REF&&process.env.GITHUB_REF!=='refs/heads/main')throw new Error('Production Turnstile provisioning may run only for main.');

  const {sitekey,secret}=await resolveWidget({token,accountId});
  fs.mkdirSync(path.dirname(output),{recursive:true});
  fs.writeFileSync(output,JSON.stringify({
    TURNSTILE_SITE_KEY:sitekey,
    TURNSTILE_SECRET_KEY:secret,
    TURNSTILE_ENFORCEMENT:'enabled',
  }));
  fs.chmodSync(output,0o600);
  console.log('Turnstile Worker secret bundle prepared without printing credentials.');
}

if(import.meta.url===`file://${process.argv[1]}`)main().catch(error=>{console.error(error.message);process.exit(1)});
