// Prepare published, public EKODI daily devotional narration script.
// Never fetch tomorrow or a private devotional with an authorization token.
import {writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {devotionSpeechSegments} from '../../bible/devotion-share-audio.js';
const [date,out] = process.argv.slice(2);
if(!/^\d{4}-\d{2}-\d{2}$/.test(date||'')||!out)throw Error('usage: node script date out.json');
const today=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Seoul',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
if(date>today)throw Error('future_date_disallowed');
const response=await fetch('https://ekodi.kr/bible/api/bible/devotion?date='+date,{headers:{accept:'application/json'},redirect:'error'});
if(!response.ok)throw Error('published_devotion_unavailable:'+response.status);
const body=await response.json();
if(!body?.found||body.date!==date)throw Error('devotion_date_mismatch');
const segments=devotionSpeechSegments(body);
if(segments.length<3)throw Error('missing_narration_content');
const script=segments.join('\n');
const sha256=createHash('sha256').update(script,'utf8').digest('hex');
writeFileSync(out,JSON.stringify({date,passage:body.passage,segments,sha256},null,2),'utf8');
console.log(JSON.stringify({date,passage:body.passage,segments:segments.length,sha256}));
