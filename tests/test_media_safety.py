
import importlib.util
import json
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch

spec = importlib.util.spec_from_file_location("prepare", Path(__file__).parents[1] / "tools/prepare_media.py")
prepare = importlib.util.module_from_spec(spec)
spec.loader.exec_module(prepare)

class MetadataSafety(unittest.TestCase):
    def setUp(self):
        self.record = {"id":"permanent-id","file":"photo.jpg","eventId":"event","people":["person"],
                       "caption":"Original words","era":"Original era","order":7,"available":False,
                       "type":"image","custom":{"keep":True}}
        self.data = {"schemaVersion":3,"media":[self.record]}
    def test_attachment_preserves_editorial_metadata_and_envelope(self):
        result=prepare.merged_manifest(self.data,"photo.jpg","image",None,"event",None,None)
        expected={**self.record,"available":True,"path":"assets/media/photo.jpg"}
        self.assertEqual(result,{"schemaVersion":3,"media":[expected]})
        self.assertFalse(self.record["available"])
    def test_explicit_caption_does_not_clear_people(self):
        result=prepare.merged_manifest(self.data,"photo.jpg","image",None,"event","Edited",None)
        self.assertEqual(result["media"][0]["people"],["person"])
        self.assertEqual(result["media"][0]["caption"],"Edited")
    def test_ambiguous_id_or_event_rejected(self):
        with self.assertRaises(RuntimeError):
            prepare.merged_manifest(self.data,"permanent-id.jpg","image",None,"event",None,None)
        with self.assertRaises(RuntimeError):
            prepare.merged_manifest(self.data,"photo.jpg","image",None,"other",None,None)
    def test_array_envelope_preserved(self):
        self.assertIsInstance(prepare.merged_manifest([self.record],"new.jpg","image",None,"event",None,[]),list)
    def test_failed_replace_keeps_original_and_backup(self):
        with tempfile.TemporaryDirectory() as directory:
            target=Path(directory)/"media.json"; original=json.dumps(self.data).encode();target.write_bytes(original)
            with patch.object(prepare,"MEDIA_JSON",target), patch.object(prepare,"validate_references"), patch.object(prepare.os,"replace",side_effect=OSError("simulated")):
                with self.assertRaises(OSError):
                    prepare.update_manifest("photo.jpg","image",None,"event",None,None)
            self.assertEqual(target.read_bytes(),original)
            self.assertEqual(next(Path(directory).glob("media-backup-*")).read_bytes(),original)
    def test_successful_atomic_save_keeps_backup(self):
        with tempfile.TemporaryDirectory() as directory:
            target=Path(directory)/"media.json";original=json.dumps(self.data).encode();target.write_bytes(original)
            with patch.object(prepare,"MEDIA_JSON",target),patch.object(prepare,"validate_references"):
                prepare.update_manifest("photo.jpg","image",None,"event",None,None)
            self.assertEqual(json.loads(target.read_text())["media"][0]["id"],"permanent-id")
            self.assertEqual(next(Path(directory).glob("media-backup-*")).read_bytes(),original)

if __name__ == "__main__":
    unittest.main()

