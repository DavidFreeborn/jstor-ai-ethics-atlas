"""Dependency-free boundary checks for the text extraction protocol."""

import unittest
from build_union_source import text, windows, usable_text, WINDOW_WORDS, MAX_WINDOWS


class SourceProtocol(unittest.TestCase):
    def test_text_types(self):
        self.assertEqual(text(["a\n b", "c", None, {"x": 1}]), "a b c  ")
        self.assertEqual(text(None), "")
        self.assertEqual(text({"unexpected": "not prose"}), "")

    def test_short_text_is_not_dropped(self):
        for n in (1, 50, 255, 256, 257, 2047, 2048):
            words = [f"word{i}" for i in range(n)]
            result = windows(words)
            self.assertEqual(" ".join(result).split(), words)
            self.assertLessEqual(len(result), MAX_WINDOWS)
            self.assertTrue(all(len(w.split()) <= WINDOW_WORDS for w in result))

    def test_long_text_is_stratified_and_bounded(self):
        for n in (2049, 10000, 100000):
            words = [f"word{i}" for i in range(n)]
            result = windows(words)
            self.assertEqual(len(result), MAX_WINDOWS)
            positions = [int(w.split()[0][4:]) for w in result]
            self.assertEqual(positions, sorted(set(positions)))
            self.assertTrue(
                all(b - a >= WINDOW_WORDS for a, b in zip(positions, positions[1:]))
            )
            self.assertGreater(positions[-1] - positions[0], 0.7 * n)
            self.assertEqual(result, windows(words))

    def test_quality_thresholds(self):
        self.assertFalse(usable_text([]))
        self.assertFalse(usable_text(["word"] * 1000))
        self.assertFalse(usable_text(["42", "--"] * 100))
        self.assertFalse(usable_text([f"word{i}" for i in range(49)]))
        self.assertTrue(usable_text([f"word{i}" for i in range(50)]))


if __name__ == "__main__":
    unittest.main()
