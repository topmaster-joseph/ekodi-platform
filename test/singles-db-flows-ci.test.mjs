import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const script=readFileSync(new URL('../scripts/sql/singles_money_flows_probe.sql',import.meta.url),'utf8');
const workflow=readFileSync(new URL('../.github/workflows/supabase-local-ci.yml',import.meta.url),'utf8');
test('Singles flow probe runs entirely inside one rollback transaction with synthetic identities',()=>{
 assert.match(script,/^-- SINGLES-FLOW-001[\s\S]*?\nbegin;\n/);
 assert.match(script,/\nrollback;\n$/);
 assert.doesNotMatch(script,/\bcommit\b/i);
 assert.equal((script.match(/SINGLES-FLOW PASS/g)||[]).length,5);
 assert.doesNotMatch(script,/ROLLBACK_PROBE/);
 assert.doesNotMatch(script,/@(?!singles-ci\.invalid|singles-ci\.INVALID)[a-z0-9.-]+\.[a-z]{2,}/i,'only .invalid identities');
 assert.doesNotMatch(script,/정찬균|100-123-456789|ekodi\.kr|gmail\.com/,'no real names, accounts or member emails');
 assert.doesNotMatch(script,/'[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}'/i,'no fixed real user ids');
});
test('CI runs the Singles flow probe on PRs touching it and on main',()=>{
 assert.match(workflow,/scripts\/sql\/singles_\[\^\/\]\*\\\.sql\$/);
 assert.match(workflow,/< scripts\/sql\/singles_money_flows_probe\.sql/);
 assert.match(workflow,/grep -c 'SINGLES-FLOW PASS'\)" -eq 5/);
});
