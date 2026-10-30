// Human Publishing audiobook production queue (metadata only; NO voice API call).
// EKODI Orchestrator can inspect this queue after a protected ebook release.
// Never upload private manuscripts, authorize a voice clone or incur a TTS cost.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { complimentaryAudiobookPolicy } from '../books-audiobook.js';

export const HUMAN_AUDIO_PRODUCTION_GATES = Object.freeze([
  'final_ebook_and_rights_snapshot',
  'chapter_scene_voice_and_dialogue_script',
  'licensed_voice_selection_and_cost_approval',
  'narration_render_and_performance_review',
  'whole_book_listening_and_accessibility_qa',
  'independent_author_publisher_rights_signoffs',
  'protect_sha256_chapter_manifest_and_private_upload',
  'verify_owner_bonus_entitlement_and_refund_revocation',
]);

export function audiobookProductionQueue(catalog) {
  const books=Array.isArray(catalog?.books)?catalog.books:[];
  return books.map(book=>{
    const offer=complimentaryAudiobookPolicy(book);
    if (!book?.directSale?.enabled) return null;
    return {
      bookId:book.id,
      title:String(book.title||''),
      sourceEdition:String(book.edition||''),
      complimentaryPriceKrw:0,
      publishedEbook:offer.included,
      audioState:offer.state,
      humanReviewRequired:true,
      noPaidVoiceCalls:true,
      nextAction:!offer.included?'verify_ebook_publication':
        !offer.approved?'finalize_script_voice_rights_and_audio_master':'verify_r2_tracks_and_enable_owner_downloads',
      gates: [...HUMAN_AUDIO_PRODUCTION_GATES],
    };
  }).filter(Boolean);
}

// Console output is safe only because it includes public catalog metadata.
// Do not add manuscript text, session IDs, payment keys or private R2 URLs.
if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const catalog=JSON.parse(readFileSync(new URL('../books/books.json',import.meta.url),'utf8'));
  console.log(JSON.stringify({schema:'ekodi-audiobook-production-queue-v1',
    generatedAt:new Date().toISOString(),
    readyToChargeOrPublish:false,
    jobs:audiobookProductionQueue(catalog)},null,2));
}
