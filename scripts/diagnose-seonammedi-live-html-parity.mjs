import {createHash} from 'node:crypto';
import {mkdir,writeFile} from 'node:fs/promises';

const targets=[
  {name:'canonical',url:'https://ekodi.kr/seonammedi/?ekodi_readonly_parity=1'},
  {name:'customer',url:'https://seonammedi.kr/?ekodi_readonly_parity=1'}
];
const sha256=value=>createHash('sha256').update(value).digest('hex');
const results=[];
for(const target of targets){
  try{
    const response=await fetch(target.url,{redirect:'follow',cache:'no-store',headers:{'cache-control':'no-cache'},signal:AbortSignal.timeout(25000)});
    const body=await response.text();
    results.push({name:target.name,url:response.url,http:response.status,sha256:sha256(body),bytes:Buffer.byteLength(body),html:body,
      release:body.match(/<meta name="ekodi-release" content="([^"]+)"/)?.[1]||'',
      headers:Object.fromEntries(['x-ekodi-route','cache-control','etag','cf-cache-status','content-type','x-content-type-options'].map(key=>[key,response.headers.get(key)||'']))});
  }catch(error){results.push({name:target.name,error:String(error.message||error)})}
}
const [a,b]=results;
let firstDifference=-1;
if(a?.html!==undefined&&b?.html!==undefined){
  let i=0;
  while(i<Math.min(a.html.length,b.html.length)&&a.html[i]===b.html[i])i++;
  if(i!==a.html.length||i!==b.html.length)firstDifference=i;
}
// Compare the two exact HTML documents while allowing ONLY path-prefix removal.
// This is diagnostic evidence, not a release acceptance shortcut.
function analyzePrefixAliases(canonical,customer){
  if(typeof canonical!=='string'||typeof customer!=='string')return {aliasOnly:false,aliases:[],otherDifference:'missing_html'};
  let i=0,j=0;const aliases=[];
  while(i<canonical.length&&j<customer.length){
    if(canonical[i]===customer[j]){i++;j++;continue}
    if(canonical.startsWith('/seonammedi/',i)&&customer[j]==='/'&&canonical.slice(i+11,i+31)===customer.slice(j,j+20)){
      const token=customer.slice(j).match(/^\/[^\s"'<>]+/)?.[0]||'';
      aliases.push({canonicalOffset:i,customerOffset:j,customerPath:token.slice(0,160)});
      i+=11;
      continue;
    }
    return {aliasOnly:false,aliases,otherDifference:{canonicalOffset:i,customerOffset:j}};
  }
  return {aliasOnly:i===canonical.length&&j===customer.length,aliases,otherDifference:i===canonical.length&&j===customer.length?null:{canonicalOffset:i,customerOffset:j}};
}
const prefixAnalysis=analyzePrefixAliases(a?.html,b?.html);
const excerpt=(input,i)=>i<0?'':String(input||'').slice(Math.max(0,i-100),i+200);
const report={
  readOnly:true,
  sameRelease:!!a?.release&&a.release===b?.release,
  byteIdentical:firstDifference===-1&&a?.html!==undefined&&b?.html!==undefined,
  firstDifference,
  prefixAnalysis,
  snippets:firstDifference<0?null:{canonical:excerpt(a.html,firstDifference),customer:excerpt(b.html,firstDifference)},
  results:results.map(({html,...rest})=>rest)
};
await mkdir('artifacts/seonammedi-html-parity',{recursive:true});
await writeFile('artifacts/seonammedi-html-parity/report.json',JSON.stringify(report,null,2));
console.log(JSON.stringify(report));
if(results.some(r=>r.error||r.http!==200))process.exitCode=1;
