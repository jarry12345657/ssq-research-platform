import json
import sys
import unittest
from pathlib import Path

ROOT=Path(__file__).resolve().parents[1]
sys.path.insert(0,str(ROOT / 'scripts'))
from update_data import normalize,bundled,update

class DataTests(unittest.TestCase):
    def test_valid_sample(self):
        data=bundled()
        self.assertEqual(len(data),157)
        self.assertEqual(data[-1]['issue'],'26119')
        self.assertEqual(data[-1]['red'],[12,22,23,25,27,30])
        self.assertEqual(data[-1]['blue'],4)
    def test_invalid_reds(self):
        with self.assertRaises(ValueError):
            normalize([dict(issue='26001',date='2026-01-01',red=[1,1,2,3,4,5],blue=4)])
    def test_duplicate(self):
        d=bundled()
        with self.assertRaises(ValueError):normalize(d+[d[-1]])
    def test_output(self):
        # The deployed JSON has at least the bundled coverage and is chronologically ordered.
        f=ROOT/'web/data/history.json'
        x=normalize(json.loads(f.read_text(encoding='utf-8')))
        self.assertGreaterEqual(len(x),157)
        self.assertGreaterEqual(x[-1]['date'], '2026-10-18')

if __name__=='__main__':unittest.main()
