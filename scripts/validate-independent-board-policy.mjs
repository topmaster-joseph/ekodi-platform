import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  INDEPENDENT_BOARD_POLICY, BOARD_ENGINE_ACTIONS, PLATFORM_BOARD_ACTIONS,
  boardActionOwner, boardRouteKey, validateBoardRegistration,
} from '../independent-board-policy.js';

const readJson = p => JSON.parse(readFileSync(new URL(p, import.meta.url), 'utf8').replace(/^\uFEFF/, ''));
const constitution = readJson('../governance/constitution/constitution.json').independentBoardPolicy;
const workspace = readJson('../config/service-workspace-policy.json').boardPolicy;
const required = {
  constitution: ['singleCanonicalWriteStore', 'legacyWriteForbidden', 'preserveExistingRecords', 'perBoardCategoryContract', 'canonicalTrailingSlashEquivalent', 'returnToOriginalBoardAfterLogin', 'serverSideAuthorizationRequired', 'requireRealProductionEvidenceBeforeCompletion', 'inheritedWithoutServiceOptIn', 'localOverrideForbidden'],
  workspace: ['inherited', 'singleCanonicalWriteStore', 'legacyWriteForbidden', 'preserveExistingRecords', 'perBoardCategoryContract', 'canonicalTrailingSlashEquivalent', 'returnToOriginalBoardAfterLogin', 'serverSideAuthorizationRequired', 'noCompletionWithoutEvidence'],
};
try {
  assert.equal(constitution?.id, INDEPENDENT_BOARD_POLICY.policyId, 'constitution rule missing');
  assert.equal(constitution?.status, 'enforced');
  assert.equal(workspace?.policyId, INDEPENDENT_BOARD_POLICY.policyId, 'workspace inheritance missing');
  assert.equal(constitution?.scope, INDEPENDENT_BOARD_POLICY.scope);
  assert.equal(workspace?.scope, 'all-existing-and-future-service-and-independent-site-boards');
  for (const [name, policy] of [['constitution', constitution], ['workspace', workspace]]) {
    for (const key of required[name]) assert.equal(policy[key], true, `${name}.${key} must be true`);
    assert.equal(policy.globalCategoryListForced, false, 'every board must retain its own category contract');
  }
  assert.deepEqual(constitution?.platformRole, ['identity-provider', 'authorization-handoff', 'route-integration']);
  assert.deepEqual(workspace?.boardEngineOwns, BOARD_ENGINE_ACTIONS);
  assert.deepEqual(workspace?.platformOwns, PLATFORM_BOARD_ACTIONS);
  for (const operation of BOARD_ENGINE_ACTIONS) assert.equal(boardActionOwner(operation), 'independent-board-engine');
  for (const operation of PLATFORM_BOARD_ACTIONS) assert.equal(boardActionOwner(operation), 'ekodi-platform');
  assert.equal(boardRouteKey('/board/voices'), boardRouteKey('/board/voices/'));
  assert.equal(boardRouteKey('/board/api/admin/posts'), null);
  const board = {
    boardId: 'test_board', engineOwner: 'independent-board-engine', identityAuthority: 'ekodi',
    canonicalWriteStore: 'board-engine', legacyWritesEnabled: false, serverSideAuthorization: true,
    preserveExistingRecords: true, slashParity: true, loginReturnToBoard: true,
    categories: [{ id: 'question', label: '질문' }],
  };
  assert.deepEqual(validateBoardRegistration(board), []);
  assert.notDeepEqual(validateBoardRegistration({ ...board, legacyWritesEnabled: true }), []);
  const runtime = readFileSync(new URL('../workspace-route-policy.js', import.meta.url), 'utf8');
  assert.match(runtime, /from '\.\/independent-board-policy\.js'/, 'workspace runtime must expose the board contract');
  for (const binding of constitution.enforcement || []) {
    const file = new URL('../' + binding, import.meta.url);
    assert.doesNotThrow(() => readFileSync(file, 'utf8'), `missing enforcement binding: ${binding}`);
  }
  console.log('BOARD-INDEPENDENT-001: constitution/workspace/runtime contract verified.');
} catch (error) {
  console.error('BOARD-INDEPENDENT-001:', error.message);
  process.exitCode = 1;
}
