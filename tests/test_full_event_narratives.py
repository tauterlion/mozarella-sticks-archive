"""Editorial regression checks for optional full-page archive narratives."""

import json
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parent.parent
EXPECTED_PARAGRAPHS = {
    "closeup-departure": 3,
    "statue-liberty-photos": 3,
    "gage-confession": 4,
    "june5-hangout": 2,
    "crushing-playlist": 4,
}


class FullEventNarrativeTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        data = json.loads((ROOT / "data" / "timeline.json").read_text(encoding="utf-8"))
        cls.events = {event["id"]: event for event in data["events"]}

    def test_selected_entries_retain_paragraph_boundaries(self):
        for event_id, expected_count in EXPECTED_PARAGRAPHS.items():
            with self.subTest(event=event_id):
                event = self.events[event_id]
                self.assertIsInstance(event.get("fullDetails"), str)
                self.assertEqual(len(event["fullDetails"].split("\n\n")), expected_count)
                self.assertTrue(all(paragraph.strip() for paragraph in event["fullDetails"].split("\n\n")))
                self.assertNotIn("\n\n", event["details"])  # Timeline stays concise.

    def test_approved_inline_emphasis_is_preserved(self):
        self.assertIn("*The Wiz*", self.events["gage-confession"]["fullDetails"])

    def test_surgical_editorial_corrections(self):
        medalla = self.events["stuco-medalla-arena-party"]
        self.assertIn("Toroverde", medalla["summary"])
        self.assertIn("Toroverde", medalla["details"])
        self.assertNotIn("Toroverda", medalla["summary"] + medalla["details"])
        self.assertNotIn(
            "shows that they were comfortable",
            self.events["chickfila"]["details"],
        )


if __name__ == "__main__":
    unittest.main()
