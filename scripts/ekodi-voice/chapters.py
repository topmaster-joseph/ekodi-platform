"""EKODI-VOICE-001: EPUB -> 낭독 원고(장별). 외부 의존성 없음(표준 라이브러리만)."""
import json, re, sys, zipfile, posixpath, html
from xml.etree import ElementTree as ET

SKIP = re.compile(r'(cover|nav|toc|copyright|colophon|references|bibliography|판권|차례|목차|참고문헌)', re.I)
HANGUL = re.compile(r'[\uac00-\ud7a3]')

def for_language(paras, lang):
    """한국어 낭독에서는 영어 병기 문단을 뺀다(영어판은 별도 도서로 낭독)."""
    if lang != 'ko':
        return [p for p in paras if len(HANGUL.findall(p)) < 0.3 * max(1, len(p))]
    return [p for p in paras if len(HANGUL.findall(p)) >= 0.1 * len(re.sub(r'\W', '', p) or 'x')]

def korean_title(title, lang):
    if lang != 'ko':
        return title
    kept = [w for w in re.split(r'\s+', title) if HANGUL.search(w) or re.match(r'^[\d·.,]+$', w)]
    return re.sub(r'\s*·\s*\d+\b', '', ' '.join(kept)).strip(' ·') or title

def _text(el):
    parts = []
    for node in el.iter():
        tag = node.tag.split('}')[-1]
        if tag in ('script', 'style'):
            continue
        if node.text and tag not in ('html', 'head', 'title'):
            parts.append(node.text)
        if tag in ('p', 'h1', 'h2', 'h3', 'h4', 'li', 'blockquote', 'div', 'br'):
            parts.append('\n')
        if node.tail:
            parts.append(node.tail)
    t = html.unescape(''.join(parts))
    t = re.sub(r'https?\\?:\S+', '', t)            # 주소는 읽지 않는다
    t = re.sub(r'[ \t ]+', ' ', t)
    paras = [p.strip() for p in t.split('\n')]
    return [p for p in paras if p and not re.fullmatch(r'[\W_□■◆●○]+', p)]

def chapters(epub_path, lang='ko', min_chars=200):
    z = zipfile.ZipFile(epub_path)
    container = ET.fromstring(z.read('META-INF/container.xml'))
    opf_path = next(e.get('full-path') for e in container.iter() if e.get('full-path'))
    opf = ET.fromstring(z.read(opf_path))
    base = posixpath.dirname(opf_path)
    items = {i.get('id'): i for i in opf.iter() if i.tag.endswith('item')}
    out = []
    for ref in (r for r in opf.iter() if r.tag.endswith('itemref')):
        item = items.get(ref.get('idref'))
        if item is None or 'html' not in (item.get('media-type') or ''):
            continue
        href = posixpath.normpath(posixpath.join(base, item.get('href')))
        if SKIP.search(href) or 'nav' in (item.get('properties') or ''):
            continue
        root = ET.fromstring(z.read(href))
        heads = [h for h in root.iter() if h.tag.split('}')[-1] in ('h1', 'h2')]
        title = ' '.join(s.strip() for s in heads[0].itertext() if s.strip()) if heads else ''
        heading_texts = {re.sub(r'\s+', '', ''.join(h.itertext())) for h in heads}
        paras = [p for p in _text(root) if re.sub(r'\s+', '', p) not in heading_texts]  # 제목은 따로 읽는다
        paras = for_language(paras, lang)
        title = korean_title(title, lang)
        if sum(len(p) for p in paras) < min_chars or SKIP.search(title or ''):
            continue
        out.append({'title': title or f'{len(out) + 1}', 'paragraphs': paras, 'chars': sum(len(p) for p in paras)})
    for i, c in enumerate(out, 1):
        c['number'] = i
    return out

if __name__ == '__main__':
    data = chapters(sys.argv[1], sys.argv[2] if len(sys.argv) > 2 else 'ko')
    # 본문은 출력하지 않는다(로그 노출 방지). 장 제목·글자 수만.
    print(json.dumps([{'number': c['number'], 'title': c['title'], 'chars': c['chars']} for c in data], ensure_ascii=False, indent=1))
