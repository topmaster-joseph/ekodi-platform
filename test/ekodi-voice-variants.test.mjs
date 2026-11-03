// EKODI-VOICE-002: 남·여 원 녹음 → 어린이·청소년·중장년·노년 8가지 목소리, 독자는 목소리·속도를 골라 듣는다.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { availableVoices, VOICE_IDS, isVoiceId, voiceKey } from '../books-audiobook-voices.js';

test('eight voices: male/female × child/teen/adult/senior, strict ids and private keys', () => {
  assert.equal(VOICE_IDS.length, 8);
  assert.ok(isVoiceId('f-senior') && !isVoiceId('x-adult') && !isVoiceId('../m-adult'));
  assert.equal(voiceKey('BOOK-EKODI-000001', 'm-child', 3), 'BOOK-EKODI-000001/audiobook/voices/m-child/03.mp3');
});

test('only voices that cover every approved chapter are offered (no dead end mid-book)', async () => {
  const objs = ['m-adult/01', 'm-adult/02', 'm-child/01', 'f-teen/01', 'f-teen/02'].map(k => ({ key: `BOOK-X1/audiobook/voices/${k}.mp3`, size: 10 }));
  const env = { BOOK_FILES: { list: async ({ prefix }) => ({ objects: objs.filter(o => o.key.startsWith(prefix)) }) } };
  assert.deepEqual((await availableVoices(env, 'BOOK-X1', [1, 2])).map(v => v.id), ['m-adult', 'f-teen']);
  assert.deepEqual(await availableVoices({}, 'BOOK-X1', [1]), []);
});

test('reader and audio player offer voice and speed choices and keep the listening position', () => {
  const reader = readFileSync(new URL('../books/reader/epub-reader.js', import.meta.url), 'utf8');
  const player = readFileSync(new URL('../books/reader/audio-player.js', import.meta.url), 'utf8');
  const lib = readFileSync(new URL('../books/buy/library.js', import.meta.url), 'utf8');
  assert.match(reader, /const RATES = \[0\.75, 0\.9, 1, 1\.15, 1\.25, 1\.5, 1\.75, 2\]/);
  assert.match(reader, /audio\.preservesPitch = true/);
  assert.match(reader, /options\.audio\.fetchTrack\(t, state\.voice \|\| ''\)/);
  assert.match(player, /fetchTrack\(t\.number, pos\.voice \|\| ''\)/);
  assert.match(player, /play\(current, Math\.floor\(audio\.currentTime \|\| 0\)\)/);
  assert.match(lib, /\?voice=\$\{encodeURIComponent\(voice\)\}/);
});

test('render workflow stores only primary chapters and age-voice files; age effects run without NaN', () => {
  const wf = readFileSync(new URL('../.github/workflows/render-ekodi-voice-audiobook.yml', import.meta.url), 'utf8');
  assert.match(wf, /voices\/\[mf\]-\(child\|teen\|adult\|senior\)/);
  assert.match(wf, /options: \['m', 'f'\]/);
  const py = readFileSync(new URL('../scripts/ekodi-voice/render.py', import.meta.url), 'utf8');
  assert.match(py, /aformat=sample_fmts=s16p/);
  for (const age of ['child', 'teen', 'senior']) assert.match(py, new RegExp(`'${age}': 'rubberband=pitch=`));
});
