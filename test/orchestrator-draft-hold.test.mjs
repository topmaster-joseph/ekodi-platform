import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

const script=await readFile(new URL('../scripts/converge-orchestrated-pr-merge.mjs',import.meta.url),'utf8');

test('draft recovery PR short-circuits before merge or deployment',()=>{
 const found=script.indexOf("if(!pr)fail('open PR not found');");
 const hold=script.indexOf('if(pr.draft===true)',found);
 const files=script.indexOf("const filesLookup=await api('/pulls/'+pr.number+'/files?per_page=100')",found);
 assert.ok(found>=0&&hold>found&&files>hold,'draft check must happen before merge-dispatch analysis');
 assert.match(script,/draft PR; unpublished hold, no merge/);
});

test('changing PR to draft while waiting prevents status synthesis and merge',()=>{
 const loop=script.indexOf('for(let cycle=0;cycle<180;cycle++)');
 const guard=script.indexOf('if(p?.draft===true)',loop);
 const statuses=script.indexOf('const headStatuses=await statusMap(headSha)',loop);
 const merged=script.indexOf("const merged=await api('/pulls/'+pr.number+'/merge'",loop);
 assert.ok(loop>=0&&guard>loop&&statuses>guard&&merged>guard,'no merge or status synthesis after draft transition');
});
