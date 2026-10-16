import test from 'node:test';
import assert from 'node:assert/strict';
import {createProposalDraft} from '../proposal/core.js';
import {makeGuidedProposalDraft} from '../proposal/analysis.js';
test('draft remains unverified',()=>{const draft=createProposalDraft({title:'기획'}); const result=makeGuidedProposalDraft(draft);assert.match(result.draft.sections[0].body,/검증 전/);});

import {calculateProposalBudget,parseKrwAmount} from '../proposal/analysis.js';
test('budget totals are user-entered arithmetic',()=>{const result=calculateProposalBudget([{name:'교육',quantity:2,unitCost:5000}]);assert.equal(result.total,10000);assert.equal(parseKrwAmount('1만원'),10000);});
