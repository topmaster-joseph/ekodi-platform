// Regression: the explicit ko-KR selector maps to document.lang='ko'.
// A Korean page must not be forced through the non-Korean translation predicate.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const source=readFileSync(new URL('../scripts/verify-church-standalone-calendar-native.mjs', import.meta.url),'utf8');
test('Korean standalone locale is accepted after canonical lang normalization',()=>{
  assert.match(source,/locale==='ko-KR'\?'ko':locale/);
  assert.match(source,/expected==='ko'\|\|\(!\/\[가-힣\]\//);
  assert.doesNotMatch(source,/expected==='ko-KR'\|\|/);
});
test('read-only browser proof remains release bound and fail closed',()=>{
  assert.match(source,/assert\.match\(sha,\/\^\[0-9a-f\]\{40\}\$\//);
  assert.match(source,/EKODI_CHURCH_STANDALONE_CALENDAR_NATIVE_PROOF/);
  assert.match(source,/guestEditorHidden/);
});
