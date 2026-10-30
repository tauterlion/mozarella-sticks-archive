"""Reviewed identity contract; missing portrait files are deliberately valid."""
import hashlib
import json
from pathlib import Path
import unittest

ROOT = Path(__file__).resolve().parents[1]

class ReviewedPeopleTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.people = json.loads((ROOT / 'data/people.json').read_text(encoding='utf-8'))['people']
        cls.by_id = {p['id']: p for p in cls.people}
        cls.review = json.loads((ROOT / 'tests/people-reviewed.json').read_text(encoding='utf-8'))

    def test_stable_identity_and_legacy_aliases(self):
        self.assertEqual(len(self.by_id), len(self.people))
        for person_id, original in self.review['legacy'].items():
            current = self.by_id[person_id]
            self.assertEqual(current['displayName'], original['displayName'])
            self.assertTrue(set(original['aliases']).issubset(current['aliases']))

    def test_exact_reviewed_copy_and_identity(self):
        for person_id, reviewed in self.review['reviewed'].items():
            current = self.by_id[person_id]
            for key in ('fullName', 'status', 'isOG'):
                self.assertEqual(current[key], reviewed[key], person_id)
            digest = hashlib.sha256(json.dumps([current['biography'], current['knownFor']], ensure_ascii=False).encode()).hexdigest()
            self.assertEqual(digest, reviewed['copySha256'], person_id)

    def test_membership_and_noninvented_profiles(self):
        self.assertEqual(len(self.people), 37)
        self.assertEqual(sum(p['status'] == 'Member' for p in self.people), 25)
        self.assertEqual(sum(p['status'] == 'Connected Person' for p in self.people), 12)
        self.assertEqual(sum(p['isOG'] for p in self.people), 10)
        for p in self.people:
            if p['id'] not in self.review['reviewed']:
                self.assertFalse(p.get('biography'))
                self.assertFalse(p.get('knownFor'))
            self.assertIsInstance(p['isOG'], bool)

    def test_patch_3_0_1_participants_and_photo_removal(self):
        events = {e['id']: e for e in json.loads((ROOT / 'data/timeline.json').read_text(encoding='utf-8'))['events']}
        media = json.loads((ROOT / 'data/media.json').read_text(encoding='utf-8'))['media']
        self.assertNotIn('serafina', events['party-bus-adventure']['people'])
        self.assertNotIn('marife', events['graduation']['people'])
        graduation_photo = next(m for m in media if m['id'] == 'everyoneatgraduation')
        self.assertNotIn('marife', graduation_photo['people'])
        self.assertFalse(any(m['id'] == 'chegui-cameo' for m in media))
        self.assertFalse((ROOT / 'assets/media/chegui-cameo.jpeg').exists())

    def test_corrected_names_and_search_aliases(self):
        self.assertEqual(self.by_id['charlee']['fullName'], 'Charleston Robinson')
        self.assertEqual(self.by_id['marife']['fullName'], 'Maria Fernanda Davila')
        self.assertEqual(self.by_id['marife']['displayName'], 'Marife')
        self.assertIn('Mafe', self.by_id['marife']['aliases'])
        self.assertIn('Marife', self.by_id['marife']['aliases'])
        self.assertNotIn('Mafe, Marife', self.by_id['marife']['aliases'])

    def test_canonical_portrait_names_and_nickname(self):
        self.assertIn('valentina', self.by_id)
        self.assertNotIn('valentina-correa', self.by_id)
        self.assertEqual(self.by_id['libby']['fullName'], 'Elizabeth Macbeth')
        self.assertIn('Verity', self.by_id['samantha']['aliases'])
        self.assertNotIn('Verity', self.by_id['jaime']['aliases'])
        # This test never requires a JPG to exist: a silhouette is a valid state.
        for p in self.people:
            self.assertNotIn('/', p['id'])
            self.assertNotIn('..', p['id'])

if __name__ == '__main__':
    unittest.main()
