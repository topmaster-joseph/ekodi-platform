"""Render private EKODI devotional AUDIO DRAFTS using vendor-supplied stock TTS voices.

This avoids cloning any identifiable private sample. The model weights are
OpenRAIL-M; package code is MIT. The model owner supplies presets M4/F5.
Outputs are never approved or published by this command. Human Scripture
pronunciation, rights and performance checks precede publishing.
"""
import argparse
import datetime as dt
import hashlib
import json
import math
import pathlib
import subprocess
import sys
import tempfile

MODEL = "supertonic-3"
PINNED_PACKAGE = "1.3.1"
PINNED_REVISION = "724fb5abbf5502583fb520898d45929e62f02c0b"
STOCK = {"male": "M4", "female": "F5"}
MAX_SEGMENTS = 100
MAX_CHARS_PER_SEGMENT = 230


def validate_public_script(payload, *, today=None):
    if today is None:
        today = dt.datetime.now(dt.timezone(dt.timedelta(hours=9))).date()
    date_text = payload.get("date", "")
    try:
        value = dt.date.fromisoformat(date_text)
    except (TypeError, ValueError):
        raise ValueError("invalid_devotion_date") from None
    if value.isoformat() != date_text or value > today:
        raise ValueError("future_or_invalid_devotion_date")
    segments = payload.get("segments")
    if not isinstance(segments, list) or not 3 <= len(segments) <= MAX_SEGMENTS:
        raise ValueError("invalid_segment_count")
    if any(not isinstance(s, str) or not s.strip() or len(s) > MAX_CHARS_PER_SEGMENT for s in segments):
        raise ValueError("invalid_segment_text")
    joined = "\n".join(segments)
    digest = hashlib.sha256(joined.encode("utf-8")).hexdigest()
    if payload.get("sha256") != digest:
        raise ValueError("source_text_integrity_mismatch")
    return digest, segments


def command(*args):
    subprocess.run(args, check=True, stdout=subprocess.DEVNULL, stderr=subprocess.PIPE, timeout=240)


def render(script_file, out_dir, *, speed=0.95, steps=8, dry_run=False):
    if not 0.75 <= speed <= 1.1 or not 5 <= steps <= 12:
        raise ValueError("invalid_narration_parameters")
    payload = json.loads(pathlib.Path(script_file).read_text(encoding="utf-8"))
    source_sha, segments = validate_public_script(payload)
    if dry_run:
        return {"date": payload["date"], "segments": len(segments), "sourceScriptSha256": source_sha, "state": "validated-only"}
    import numpy as np
    import supertonic
    from supertonic import TTS
    from supertonic.config import MODEL_CONFIGS

    if supertonic.__version__ != PINNED_PACKAGE:
        raise RuntimeError("tts_python_package_version_not_pinned")
    config = MODEL_CONFIGS.get(MODEL, {})
    if config.get("revision") != PINNED_REVISION:
        raise RuntimeError("tts_model_revision_not_pinned")
    tts = TTS(model=MODEL, auto_download=True, intra_op_num_threads=4)
    if abs(tts.sample_rate - 44100) > 1:
        raise RuntimeError("unexpected_sample_rate")
    output = pathlib.Path(out_dir)
    output.mkdir(parents=True, exist_ok=True)
    result = {}
    for gender, preset in STOCK.items():
        if preset not in tts.voice_style_names:
            raise RuntimeError("stock_voice_missing:" + preset)
        style = tts.get_voice_style(preset)
        chunks = []
        for i, text in enumerate(segments):
            audio, duration = tts.synthesize(
                text, voice_style=style, total_steps=steps, speed=speed,
                lang="ko", silence_duration=0.18,
            )
            audio = np.asarray(audio, dtype="float32").reshape(-1)
            if audio.size < tts.sample_rate * 0.14 or not np.all(np.isfinite(audio)):
                raise RuntimeError("invalid_audio_segment:" + str(i))
            chunks.append(np.clip(audio, -1.0, 1.0))
            if i < len(segments) - 1:
                delay = 0.5 if text.startswith(("성경 본문", "말씀 묵상", "적용 질문", "오늘의 실천", "함께 드리는 기도")) else 0.26
                chunks.append(np.zeros(round(delay * tts.sample_rate), dtype="float32"))
        master = np.concatenate(chunks)
        duration_seconds = len(master) / tts.sample_rate
        if not 8 < duration_seconds < 3600:
            raise RuntimeError("invalid_master_duration")
        if np.max(np.abs(master)) < 0.003:
            raise RuntimeError("near_silent_master")
        with tempfile.TemporaryDirectory(prefix="ekodi-stock-voice-") as tmp:
            import soundfile as sf
            wav = str(pathlib.Path(tmp) / "master.wav")
            sf.write(wav, master, tts.sample_rate, subtype="PCM_16")
            mp3 = output / (gender + ".mp3")
            command("ffmpeg", "-y", "-hide_banner", "-loglevel", "error",
                    "-i", wav, "-af", "loudnorm=I=-18:TP=-3:LRA=7",
                    "-ac", "1", "-ar", "44100", "-c:a", "libmp3lame", "-b:a", "128k",
                    "-metadata", "artist=EKODI AI Narration",
                    "-metadata", "comment=synthetic stock preset; human review required",
                    str(mp3))
        encoded = mp3.read_bytes()
        if len(encoded) < 4096:
            raise RuntimeError("generated_mp3_invalid")
        result[gender] = {
            "file": gender + ".mp3", "preset": preset,
            "durationSec": round(duration_seconds, 2),
            "sha256": hashlib.sha256(encoded).hexdigest(),
            "sizeBytes": len(encoded),
        }
    provenance = {
        "schema": "ekodi.devotion.audio-draft.v1", "status": "draft-unapproved",
        "date": payload["date"], "passage": payload.get("passage", ""),
        "sourceScriptSha256": source_sha,
        "engine": "supertone-stock-presets", "model": MODEL,
        "modelRevision": PINNED_REVISION, "pythonPackage": "supertonic==" + PINNED_PACKAGE,
        "packageLicense": "MIT", "modelLicense": "OpenRAIL-M",
        "speakerCloning": False, "speakerConsentRequired": False,
        "syntheticVoiceDisclosureRequired": True,
        "tracks": result,
        "note": "Voice preset license and phonetic/audio human review needed before release",
    }
    (output / "draft-provenance.json").write_text(
        json.dumps(provenance, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
    )
    return {"date": payload["date"], "tracks": result, "draftOnly": True}


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--script", required=True)
    parser.add_argument("--out", required=True)
    parser.add_argument("--speed", type=float, default=0.95)
    parser.add_argument("--steps", type=int, default=8)
    parser.add_argument("--validate-only", action="store_true")
    options = parser.parse_args()
    try:
        report = render(options.script, options.out,
                        speed=options.speed, steps=options.steps,
                        dry_run=options.validate_only)
        print(json.dumps(report, ensure_ascii=False))
    except Exception as exc:
        print("EKODI stock narrator draft failed: " + str(exc), file=sys.stderr)
        sys.exit(1)
