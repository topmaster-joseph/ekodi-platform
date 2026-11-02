"""Create strictly PRIVATE Korean daily-devotion voice drafts with built-in voices.

Supertonic 3 stock voice M1/F1: no private narrator recording or cloning.
Source code license MIT; model weights OpenRAIL-M, requiring disclosure and
use-policy checks. This script NEVER approves or publishes its audio.
"""
import argparse
import hashlib
import json
import pathlib
import re
import shutil
import subprocess
import sys

MODEL = "Supertone/supertonic-3"
MODEL_LICENSE = "OpenRAIL-M"
VOICE_PRESETS = {"male": "M1", "female": "F1"}


def validate_script(path):
    record = json.loads(pathlib.Path(path).read_text(encoding="utf-8"))
    date = record.get("date")
    if not isinstance(date, str) or not re.fullmatch(r"\d{4}-\d{2}-\d{2}", date):
        raise ValueError("invalid devotional date")
    from datetime import date as Date
    if Date.fromisoformat(date).isoformat() != date:
        raise ValueError("invalid devotional date")
    from zoneinfo import ZoneInfo
    from datetime import datetime
    if date > datetime.now(ZoneInfo("Asia/Seoul")).date().isoformat():
        raise ValueError("future devotional narration forbidden")
    segments = record.get("segments")
    if not isinstance(segments, list) or not 3 <= len(segments) <= 500:
        raise ValueError("invalid segment count")
    if any(not isinstance(item, str) or not item.strip() or len(item) > 230 for item in segments):
        raise ValueError("invalid segment text")
    actual = hashlib.sha256("\n".join(segments).encode("utf-8")).hexdigest()
    if actual != record.get("sha256"):
        raise ValueError("source scripture hash mismatch")
    return record


def create_drafts(record, out_dir, steps=10, speed=0.94, tts_factory=None):
    if not 5 <= steps <= 12 or not 0.75 <= speed <= 1.15:
        raise ValueError("unsafe speech synthesis settings")
    if shutil.which("ffmpeg") is None or shutil.which("ffprobe") is None:
        raise RuntimeError("ffmpeg and ffprobe required")
    if tts_factory is None:
        from supertonic import TTS
        tts_factory = lambda: TTS(auto_download=True)
    tts = tts_factory()
    folder = pathlib.Path(out_dir)
    folder.mkdir(parents=True, exist_ok=True)
    # No speaker-supplied reference, voice clone, or paid API.
    script = "\n".join(record["segments"])
    manifest = {
        "schema": "ekodi.devotion.stock-narrator.draft.v1",
        "date": record["date"],
        "language": "ko-KR",
        "sourceScriptSha256": record["sha256"],
        "status": "draft",
        "approved": False,
        "model": MODEL,
        "modelLicense": MODEL_LICENSE,
        "licensedSource": "stock-built-in-voice-styles",
        "aiGeneratedDisclosure": "에코디 AI가 생성한 낭독음성입니다.",
        "tracks": {},
        "review": {
            "rights": False,
            "textIntegrity": False,
            "voicePerformance": False,
            "accessibility": False,
        },
    }
    for role, voice_id in VOICE_PRESETS.items():
        style = tts.get_voice_style(voice_name=voice_id)
        wav, duration = tts.synthesize(
            text=script,
            voice_style=style,
            lang="ko",
            total_steps=steps,
            speed=speed,
            max_chunk_length=120,
            silence_duration=0.3,
            verbose=False,
        )
        wav_path = folder / (role + ".wav")
        mp3_path = folder / (role + ".mp3")
        tts.save_audio(wav, str(wav_path))
        subprocess.run([
            "ffmpeg", "-v", "error", "-y", "-i", str(wav_path),
            "-af", "loudnorm=I=-18:TP=-3:LRA=7",
            "-ac", "1", "-ar", "44100", "-b:a", "128k",
            "-codec:a", "libmp3lame", "-metadata",
            "comment=EKODI AI-generated devotional narration (human QA required)",
            str(mp3_path),
        ], check=True)
        wav_path.unlink()
        seconds = float(subprocess.check_output([
            "ffprobe", "-v", "error", "-show_entries", "format=duration",
            "-of", "default=noprint_wrappers=1:nokey=1", str(mp3_path)
        ], text=True).strip())
        if not (5 < seconds < 3600) or not (4096 < mp3_path.stat().st_size < 32 * 1024 * 1024):
            raise ValueError("unacceptable audio duration/size")
        manifest["tracks"][role] = {
            "voiceId": voice_id,
            "file": role + ".mp3",
            "durationSec": round(seconds, 1),
            "sha256": hashlib.sha256(mp3_path.read_bytes()).hexdigest(),
            "approved": False,
        }
    if manifest["tracks"]["male"]["sha256"] == manifest["tracks"]["female"]["sha256"]:
        raise ValueError("male and female drafts are identical")
    (folder / "draft-manifest.json").write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    return manifest


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--script", required=True)
    parser.add_argument("--out", required=True)
    parser.add_argument("--steps", type=int, default=10)
    parser.add_argument("--speed", type=float, default=0.94)
    args = parser.parse_args()
    record = validate_script(args.script)
    result = create_drafts(record, args.out, steps=args.steps, speed=args.speed)
    print(json.dumps({
        "date": result["date"], "status": "draft", "reviewed": False,
        "modelLicense": result["modelLicense"],
        "voices": {g: round(t["durationSec"], 1) for g,t in result["tracks"].items()},
    }, ensure_ascii=False))


if __name__ == "__main__":
    main()
