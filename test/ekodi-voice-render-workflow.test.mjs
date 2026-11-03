// EKODI-VOICE-001: 오디오북 초안 렌더링 워크플로 가드.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';

const wf = readFileSync(new URL('../.github/workflows/render-ekodi-voice-audiobook.yml', import.meta.url), 'utf8');
const render = readFileSync(new URL('../scripts/ekodi-voice/render.py', import.meta.url), 'utf8');

test('workflow renders drafts only: never overwrites approved audio, never sets approval metadata, no paid voice API', () => {
  assert.match(wf, /approved audio is never overwritten/);
  assert.doesNotMatch(wf, /approved[=:]\s*'?true/);
  assert.doesNotMatch(wf, /--custom-metadata/);
  assert.match(wf, /self-recorded-for-ekodi-audiobooks/);
  assert.doesNotMatch(wf, /elevenlabs|texttospeech\.googleapis|openai\.com/i);
  assert.match(wf, /rm -rf private out/);
  assert.match(wf, /path: manifest\//, 'only the metadata manifest is published as an artifact');
});

test('engine uses MIT-licensed MeloTTS + OpenVoice and marks output as a human-review draft', () => {
  assert.match(render, /MeloTTS\(기본 낭독, MIT\) \+ OpenVoice V2/);
  assert.match(render, /human review required/);
  assert.match(render, /message='@EKODI'/, 'AI provenance watermark');
});

test('chapter extractor reads spine order, drops TOC/references and parallel English in Korean narration', () => {
  const out = execFileSync('python3', ['-I', '-c', `
import sys, zipfile, io, json
sys.path.insert(0, 'scripts/ekodi-voice')
from chapters import chapters
buf = io.BytesIO(); z = zipfile.ZipFile(buf, 'w')
z.writestr('META-INF/container.xml', '<container xmlns="urn:oasis:names:tc:opendocument:xmlns:container"><rootfiles><rootfile full-path="OEBPS/c.opf"/></rootfiles></container>')
z.writestr('OEBPS/c.opf', '<package xmlns="http://www.idpf.org/2007/opf"><manifest><item id="t" href="toc.xhtml" media-type="application/xhtml+xml" properties="nav"/><item id="a" href="a.xhtml" media-type="application/xhtml+xml"/><item id="r" href="ref.xhtml" media-type="application/xhtml+xml"/></manifest><spine><itemref idref="t"/><itemref idref="a"/><itemref idref="r"/></spine></package>')
body = '<p>' + '가나다라마바사 아자차카타파하. ' * 20 + '</p><p>This English parallel paragraph should be skipped in Korean narration.</p>'
z.writestr('OEBPS/toc.xhtml', '<html xmlns="http://www.w3.org/1999/xhtml"><body><h1>차례</h1>' + body + '</body></html>')
z.writestr('OEBPS/a.xhtml', '<html xmlns="http://www.w3.org/1999/xhtml"><body><h1>1장 · Chapter 1 첫 이야기 First Story</h1>' + body + '</body></html>')
z.writestr('OEBPS/ref.xhtml', '<html xmlns="http://www.w3.org/1999/xhtml"><body><h1>참고문헌</h1>' + body + '</body></html>')
z.close(); open('/tmp/ekodi-voice-test.epub','wb').write(buf.getvalue())
print(json.dumps([[c['title'], len(c['paragraphs'])] for c in chapters('/tmp/ekodi-voice-test.epub','ko')], ensure_ascii=False))
`], { encoding: 'utf8' });
  assert.deepEqual(JSON.parse(out), [['1장 첫 이야기', 1]]);
});
