import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { requiresVerifiedPublisherHandoff } from '../books-network-control.js';

const backend = await readFile(new URL('../books-network-control.js', import.meta.url), 'utf8');
const publisherGate = await readFile(new URL('../publishing/release-entitlement.js', import.meta.url), 'utf8');

test('direct Books Network moderation cannot publish an unverified new title', () => {
  for (const previous of ['DRAFT', 'SUBMITTED', 'REJECTED', '', null]) {
    assert.equal(requiresVerifiedPublisherHandoff(previous, 'PUBLISHED'), true, String(previous));
  }
  assert.match(backend, /if \(requiresVerifiedPublisherHandoff\(current\.status, status\)\)/);
  const gate=backend.indexOf('if (requiresVerifiedPublisherHandoff(current.status, status))');
  const update=backend.indexOf("UPDATE books_creator_titles SET status=?,admin_note=?,updated_at=?");
  assert.ok(gate>0 && update>gate, 'fail-closed check must precede the publication mutation');
  assert.match(backend.slice(gate,update), /PUBLISHER_HANDOFF_REQUIRED/);
  assert.match(backend.slice(gate,update), /409/);
});

test('existing published titles are not bulk unpublished and moderation stays usable', () => {
  assert.equal(requiresVerifiedPublisherHandoff('PUBLISHED','PUBLISHED'),false);
  for (const previous of ['DRAFT','SUBMITTED','REJECTED','PUBLISHED']) {
    for (const next of ['REJECTED','SUBMITTED']) {
      assert.equal(requiresVerifiedPublisherHandoff(previous,next),false);
    }
  }
  assert.match(backend, /status='PUBLISHED'/);
  assert.doesNotMatch(backend, /DROP TABLE|DELETE FROM books_creator_titles/);
});

test('user-submitted status, role, claims or digest cannot waive the publisher handoff', () => {
  assert.equal(requiresVerifiedPublisherHandoff('SUBMITTED','PUBLISHED',{verified:true,role:'admin',releaseDigest:'a'.repeat(64)}),true);
  assert.match(backend,/if \(!\(await isAdmin\(env, auth\)\)\)/);
  assert.match(publisherGate,/verifyCommercialRelease/);
  assert.match(publisherGate,/PUBLISH_DB/);
  assert.match(publisherGate,/SEPARATE_SIGNED_PUBLISHING_CONTRACT_REQUIRED/);
  assert.match(publisherGate,/FREE_PREMIUM_AUDIOBOOK_QA_REQUIRED/);
});
