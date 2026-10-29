import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { audiobookProductionQueue, HUMAN_AUDIO_PRODUCTION_GATES } from '../scripts/books-audiobook-production-queue.mjs';

const catalog=JSON.parse(fs.readFileSync(new URL('../books/books.json',import.meta.url),'utf8'));

test('metadata-only queue auto-includes all direct-sale ebook titles; no paid TTS jobs executed',()=>{
  const jobs=audiobookProductionQueue(catalog);
  assert.equal(jobs.length,2);
  assert.deepEqual(jobs.map(job=>job.complimentaryPriceKrw),[0,0]);
  assert.ok(jobs.every(job=>job.humanReviewRequired&&job.noPaidVoiceCalls));
  assert.equal(jobs[0].publishedEbook,true);
  assert.equal(jobs[0].nextAction,'finalize_script_voice_rights_and_audio_master');
  assert.equal(jobs[1].publishedEbook,false);
  assert.equal(jobs[1].nextAction,'verify_ebook_publication');
  assert.ok(HUMAN_AUDIO_PRODUCTION_GATES.includes('chapter_scene_voice_and_dialogue_script'));
  assert.ok(HUMAN_AUDIO_PRODUCTION_GATES.includes('independent_author_publisher_rights_signoffs'));
  assert.ok(HUMAN_AUDIO_PRODUCTION_GATES.includes('verify_owner_bonus_entitlement_and_refund_revocation'));
});

test('production tasks never emit private author drafts, API tokens or audio payloads',()=>{
  const jobs=audiobookProductionQueue(catalog);
  const combined=JSON.stringify(jobs);
  assert.doesNotMatch(combined,/payment_key|access_token|service_role|privateManuscript|voiceApiKey/);
  const empty=audiobookProductionQueue({books:[]});
  assert.deepEqual(empty,[]);
});
