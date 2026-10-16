import test from 'node:test';
import assert from 'node:assert/strict';
import {createProposalDraft} from '../proposal/core.js';
import {makeGuidedProposalDraft} from '../proposal/analysis.js';
test('draft remains unverified',()=>{const draft=createProposalDraft({title:'기획'}); const result=makeGuidedProposalDraft(draft);assert.match(result.draft.sections[0].body,/검증 전/);});

import {calculateProposalBudget,parseKrwAmount} from '../proposal/analysis.js';
test('budget totals are user-entered arithmetic',()=>{const result=calculateProposalBudget([{name:'교육',quantity:2,unitCost:5000}]);assert.equal(result.total,10000);assert.equal(parseKrwAmount('1만원'),10000);});

import {analyzeProposalSources,reviewProposalBudget} from '../proposal/analysis.js';
test('reference URLs are not treated as read files',()=>{const draft=createProposalDraft({title:'정책',sourceNames:['https://example.org/data']});draft.sources[0].readStatus='url';const report=analyzeProposalSources(draft);assert.equal(report.excerpts.length,0);assert.equal(report.verifiedCount,0);});
test('declared and calculated budget mismatch is identified',()=>{const draft=createProposalDraft({title:'계획'});draft.budgetRows=[{name:'교육',quantity:2,unitCost:5000}];draft.decisions.totalBudget='5만원';const qa=reviewProposalBudget(draft);assert.equal(qa.matched,false);assert.equal(draft.decisions.totalBudget,'5만원');});
