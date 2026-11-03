"""EKODI-VOICE-001 self-test: 공개 문장으로 작은 EPUB과 기준 음성(MeloTTS 기본 화자)을 만든다. 비공개 자료를 쓰지 않는다."""
import io, sys, zipfile
out = sys.argv[1]
body = ''.join(f'<p>{s}</p>' for s in [
    '책은 조용한 대화입니다. 한 사람이 오래 생각한 것을 다른 사람이 천천히 따라 걷는 길입니다.',
    '오늘 우리는 그 길 위에서, 빠름보다 깊음을, 많음보다 바름을 묻습니다. 이것은 엔진 점검용 공개 문장입니다.'] * 3)
buf = io.BytesIO(); z = zipfile.ZipFile(buf, 'w')
z.writestr('META-INF/container.xml', '<container xmlns="urn:oasis:names:tc:opendocument:xmlns:container"><rootfiles><rootfile full-path="OEBPS/c.opf"/></rootfiles></container>')
z.writestr('OEBPS/c.opf', '<package xmlns="http://www.idpf.org/2007/opf"><manifest><item id="a" href="a.xhtml" media-type="application/xhtml+xml"/></manifest><spine><itemref idref="a"/></spine></package>')
z.writestr('OEBPS/a.xhtml', f'<html xmlns="http://www.w3.org/1999/xhtml"><body><h1>점검 장</h1>{body}</body></html>')
z.close(); open(f'{out}/book.epub', 'wb').write(buf.getvalue())
from melo.api import TTS
tts = TTS(language='KR', device='cpu')
tts.tts_to_file('안녕하세요. 이것은 에코디 낭독 엔진을 점검하기 위한 기준 음성입니다. ' * 6, tts.hps.data.spk2id['KR'], f'{out}/sample.bin.wav', quiet=True)
import os; os.replace(f'{out}/sample.bin.wav', f'{out}/sample.bin')
