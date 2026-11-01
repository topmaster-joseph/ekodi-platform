"""EKODI-VOICE-001: 에코디 낭독 음성으로 장별 오디오북 초안을 만든다.

엔진(교체 가능한 어댑터): MeloTTS(기본 낭독, MIT) + OpenVoice V2 음색 변환(MIT, 상업 이용 허용).
- 음색: 운영자 본인이 동의 문장과 함께 녹음한 샘플(비공개 R2)에서만 추출한다.
- 출력: 장별 MP3(-18 LUFS, 모노 44.1kHz) + 해시 매니페스트. 본문 텍스트·음성은 로그/아티팩트에 남기지 않는다.
- 초안은 승인 메타데이터 없이 저장되므로 사람이 듣고 승인하기 전에는 구매자에게 전달되지 않는다.
"""
import argparse, hashlib, json, os, re, subprocess, sys, tempfile
sys.path.insert(0, os.path.dirname(__file__))
from chapters import chapters

def sh(*cmd):
    subprocess.run(cmd, check=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)

def enhance_sample(src, dst):
    # 녹음 고급화: 저역 잡음 제거, 스펙트럼 잡음 억제, 무음 구간 정리, 음량 표준화
    sh('ffmpeg', '-y', '-i', src, '-ac', '1', '-af',
       'highpass=f=70,lowpass=f=12000,afftdn=nf=-28,silenceremove=stop_periods=-1:stop_duration=0.6:stop_threshold=-45dB,loudnorm=I=-18:TP=-2:LRA=9',
       '-ar', '24000', dst)

def split_text(paras, limit=260):
    for p in paras:
        sentences = re.split(r'(?<=[.!?。…”"])\s+', p)
        buf = ''
        for s in sentences:
            if len(buf) + len(s) > limit and buf:
                yield buf.strip(); buf = ''
            buf += ' ' + s
        if buf.strip():
            yield buf.strip()
        yield None  # 문단 경계

class Engine:
    def __init__(self, lang, checkpoints, reference, speed):
        import torch
        from melo.api import TTS
        from openvoice.api import ToneColorConverter
        self.torch = torch
        self.tts = TTS(language='KR' if lang == 'ko' else 'EN', device='cpu')
        spk = self.tts.hps.data.spk2id
        self.speaker_key = 'KR' if lang == 'ko' else ('EN-US' if 'EN-US' in spk else next(iter(spk)))
        self.speaker = spk[self.speaker_key]
        self.speed = speed
        self.conv = ToneColorConverter(f'{checkpoints}/converter/config.json', device='cpu')
        self.conv.load_ckpt(f'{checkpoints}/converter/checkpoint.pth')
        # 기준 음성은 이미 잡음·침묵을 정리했으므로 VAD(외부 모델 다운로드) 없이 10초 조각들로 음색을 추출한다.
        seg_dir = os.path.join(os.path.dirname(reference), 'ref_segments'); os.makedirs(seg_dir, exist_ok=True)
        sh('ffmpeg', '-y', '-i', reference, '-f', 'segment', '-segment_time', '10', '-ar', '22050', '-ac', '1', f'{seg_dir}/s%03d.wav')
        segs = sorted(os.path.join(seg_dir, f) for f in os.listdir(seg_dir))
        segs = [f for f in segs if os.path.getsize(f) > 22050 * 2 * 2] or segs  # 2초 미만 끝 조각 제외
        self.target_se = self.conv.extract_se(segs)
        name = self.speaker_key.lower().replace('_', '-')
        self.source_se = torch.load(f'{checkpoints}/base_speakers/ses/{name}.pth', map_location='cpu')

    def say(self, text, out):
        raw = out + '.base.wav'
        self.tts.tts_to_file(text, self.speaker, raw, speed=self.speed, quiet=True)
        self.conv.convert(audio_src_path=raw, src_se=self.source_se, tgt_se=self.target_se, output_path=out, message='@EKODI')
        os.remove(raw)

def render_chapter(engine, ch, work, out_mp3, book_title):
    parts, n = [], 0
    silence = lambda sec, name: (sh('ffmpeg', '-y', '-f', 'lavfi', '-i', f'anullsrc=r=22050:cl=mono', '-t', str(sec), name), name)[1]
    s_short, s_para, s_head = silence(0.25, f'{work}/s1.wav'), silence(0.6, f'{work}/s2.wav'), silence(1.2, f'{work}/s3.wav')
    head = f'{work}/head.wav'; engine.say(ch['title'], head); parts += [head, s_head]
    for chunk in split_text(ch['paragraphs']):
        if chunk is None:
            parts.append(s_para); continue
        n += 1; f = f'{work}/c{n:04d}.wav'; engine.say(chunk, f); parts += [f, s_short]
    lst = f'{work}/list.txt'
    with open(lst, 'w') as fh:
        fh.writelines(f"file '{p}'\n" for p in parts)
    sh('ffmpeg', '-y', '-f', 'concat', '-safe', '0', '-i', lst, '-ac', '1', '-ar', '44100',
       '-af', 'loudnorm=I=-18:TP=-3:LRA=7', '-c:a', 'libmp3lame', '-b:a', '96k',
       '-metadata', f'title={ch["title"]}', '-metadata', f'album={book_title}', '-metadata', 'artist=EKODI Voice',
       '-metadata', 'comment=EKODI AI narration draft (human review required)', out_mp3)

def main():
    a = argparse.ArgumentParser()
    a.add_argument('--book-id', required=True); a.add_argument('--epub', required=True); a.add_argument('--sample', required=True)
    a.add_argument('--lang', default='ko'); a.add_argument('--title', default=''); a.add_argument('--checkpoints', default='checkpoints_v2')
    a.add_argument('--out', default='out'); a.add_argument('--shard', type=int, default=0); a.add_argument('--shards', type=int, default=1)
    a.add_argument('--speed', type=float, default=0.95)
    args = a.parse_args()
    if not re.fullmatch(r'BOOK-[A-Z0-9-]{3,40}', args.book_id):
        sys.exit('bad book id')
    chs = chapters(args.epub, args.lang)
    mine = [c for c in chs if (c['number'] - 1) % args.shards == args.shard]
    os.makedirs(f'{args.out}/{args.book_id}/audiobook', exist_ok=True)
    with tempfile.TemporaryDirectory() as work:
        ref = f'{work}/ref.wav'; enhance_sample(args.sample, ref)
        engine = Engine(args.lang, args.checkpoints, ref, args.speed)
        manifest = []
        for c in mine:
            key = f'{args.book_id}/audiobook/{c["number"]:02d}.mp3'
            path = f'{args.out}/{key}'
            cw = f'{work}/ch{c["number"]}'; os.makedirs(cw)
            render_chapter(engine, c, cw, path, args.title)
            data = open(path, 'rb').read()
            dur = float(subprocess.run(['ffprobe', '-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', path], capture_output=True, text=True).stdout or 0)
            manifest.append({'number': c['number'], 'title': c['title'], 'key': key, 'format': 'mp3',
                             'sha256': hashlib.sha256(data).hexdigest(), 'bytes': len(data), 'durationSec': round(dur, 1)})
            print(f'chapter {c["number"]}/{len(chs)} rendered ({round(dur)}s)', flush=True)
    with open(f'{args.out}/manifest-{args.shard}.json', 'w') as fh:
        json.dump({'bookId': args.book_id, 'chapters': len(chs), 'tracks': manifest}, fh, ensure_ascii=False, indent=1)

if __name__ == '__main__':
    main()
