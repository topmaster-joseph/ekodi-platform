import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const get=p=>readFileSync(new URL('../worship/2026-10-18/'+p,import.meta.url),'utf8');
const html=get('index.html'),js=get('worship.js'),packet=JSON.parse(get('materials.json'));
test('October 18 Sunday scripture and archive are independent',()=>{assert.equal(packet.date,'2026-10-18');assert.equal(packet.scripture,'신명기 33:12–19');assert.equal(packet.devotion.length,7);assert.match(html,/신명기 33:12–19/);assert.doesNotMatch(html,/2026-10-11|신명기 31:9/);});
test('Presentation and YouTube metadata are safe, not claimed to be scheduled',()=>{assert.equal(packet.slides.length,16);assert.equal((js.match(/"title":/g)||[]).length,16);assert.match(js,/ekodi-church-worship-20261018/);assert.equal(packet.youtube.status,'metadata-prepared-not-scheduled');assert.doesNotMatch(JSON.stringify(packet),/RTMP_KEY|PRIVATE_KEY|SUPABASE_SERVICE_ROLE/);new Function(js);});
test('October 18 stays reachable as an archived week',()=>{const weekly=JSON.parse(readFileSync(new URL('../worship/weekly.json',import.meta.url),'utf8'));assert.equal(weekly.services.find(s=>s.date==='2026-10-18').status,'archived');});
