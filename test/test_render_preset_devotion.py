import datetime as dt
import hashlib
import importlib.util
import json
from pathlib import Path
import tempfile
import unittest

TARGET = Path(__file__).resolve().parent.parent / "scripts" / "ekodi-voice" / "render-preset-devotion.py"
spec = importlib.util.spec_from_file_location("ekodi_preset_renderer", TARGET)
renderer = importlib.util.module_from_spec(spec)
spec.loader.exec_module(renderer)


def example(date="2026-11-03"):
    segments = ["오늘의 매일묵상. 고린도전서 4장.",
                "하나님의 말씀은 생명의 길입니다.",
                "사랑으로 이웃을 섬깁니다."]
    return {
        "date": date, "passage": "고린도전서 4:1-13", "segments": segments,
        "sha256": hashlib.sha256("\n".join(segments).encode()).hexdigest()
    }


class PresetGuardTests(unittest.TestCase):
    def test_published_date_and_source_hash(self):
        item = example()
        digest, contents = renderer.validate_public_script(item, today=dt.date(2026,11,3))
        self.assertEqual(digest, item["sha256"])
        self.assertEqual(contents, item["segments"])

    def test_future_dates_and_mutated_source_refused(self):
        with self.assertRaisesRegex(ValueError,"future_or_invalid_devotion_date"):
            renderer.validate_public_script(example("2026-11-04"),today=dt.date(2026,11,3))
        tampered=example()
        tampered["segments"][0]="Changed Scripture"
        with self.assertRaisesRegex(ValueError,"source_text_integrity_mismatch"):
            renderer.validate_public_script(tampered,today=dt.date(2026,11,3))
        with self.assertRaisesRegex(ValueError,"invalid_devotion_date"):
            renderer.validate_public_script(example("2026-02-30"))

    def test_rejects_invalid_segments(self):
        base=example()
        for parts in [[], ["only one"], ["", "b", "c"], ["a"*231,"b","c"]]:
            item={**base, "segments":parts}
            with self.assertRaises(ValueError):
                renderer.validate_public_script(item)

    def test_stock_voices_are_distinct_and_noncloned(self):
        self.assertEqual(renderer.STOCK, {"male":"M4","female":"F5"})
        self.assertNotEqual(renderer.STOCK["male"],renderer.STOCK["female"])
        self.assertEqual(renderer.MODEL,"supertonic-3")
        self.assertEqual(renderer.PINNED_PACKAGE,"1.3.1")

    def test_validation_only_never_initializes_model_or_publishes_audio(self):
        with tempfile.TemporaryDirectory() as home:
            src=Path(home)/"public.json"
            src.write_text(json.dumps(example()),encoding="utf-8")
            dest=Path(home)/"draft"
            report=renderer.render(src,dest,dry_run=True)
            self.assertEqual(report["state"],"validated-only")
            self.assertFalse(dest.exists())

if __name__ == "__main__":
    unittest.main()
