import json
import csv
import tempfile
import unittest
from pathlib import Path

from training.data_prep import deduplicate_records, normalize_text, prepare_dataset
from training.add_qa import append_pair


class DataPreparationTests(unittest.TestCase):
    def test_normalizes_unicode_and_whitespace(self):
        self.assertEqual(normalize_text("  Ｈello\u00a0  world \n"), "Hello world")

    def test_removes_duplicate_pairs_case_insensitively(self):
        records = [
            {"input": "Question", "output": "Answer"},
            {"input": "question", "output": "answer"},
            {"input": "Question", "output": "Different"},
        ]
        self.assertEqual(len(deduplicate_records(records)), 2)

    def test_preparation_persists_seeded_splits_and_manifest(self):
        with tempfile.TemporaryDirectory() as directory:
            source = Path(directory) / "raw.json"
            output = Path(directory) / "prepared"
            source.write_text(
                json.dumps([
                    {"input": " A ", "output": " One "},
                    {"input": "B", "output": "Two"},
                    {"input": "a", "output": "one"},
                    {"input": "C", "output": "Three"},
                ]),
                encoding="utf-8",
            )

            manifest = prepare_dataset(source, output, test_size=0.34, seed=7)
            train_rows = json.loads((output / "train.json").read_text(encoding="utf-8"))
            test_rows = json.loads((output / "test.json").read_text(encoding="utf-8"))

            self.assertEqual(manifest["duplicates_removed"], 1)
            self.assertEqual(len(train_rows) + len(test_rows), 3)
            self.assertEqual(manifest["seed"], 7)
            self.assertTrue((output / "manifest.json").exists())

    def test_add_qa_only_appends_new_reviewed_pairs(self):
        with tempfile.TemporaryDirectory() as directory:
            dataset = Path(directory) / "qa.json"
            self.assertTrue(append_pair(dataset, "Question", "Answer"))
            self.assertFalse(append_pair(dataset, " question ", "answer"))
            self.assertEqual(len(json.loads(dataset.read_text(encoding="utf-8"))), 1)

    def test_csv_ingestion_and_held_out_overlap_removal(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            train_path = root / "train.csv"
            test_path = root / "test.csv"
            with train_path.open("w", newline="", encoding="utf-8") as handle:
                writer = csv.DictWriter(handle, fieldnames=["input", "output"])
                writer.writeheader()
                writer.writerows([
                    {"input": "Question A", "output": "Answer A"},
                    {"input": "Question B", "output": "Answer B"},
                ])
            with test_path.open("w", newline="", encoding="utf-8") as handle:
                writer = csv.DictWriter(handle, fieldnames=["input", "output"])
                writer.writeheader()
                writer.writerows([
                    {"input": "question a", "output": "answer a"},
                    {"input": "Question C", "output": "Answer C"},
                ])

            output = root / "prepared"
            manifest = prepare_dataset(
                train_path, output, test_data_path=test_path
            )
            test_rows = json.loads((output / "test.json").read_text(encoding="utf-8"))
            self.assertEqual(test_rows, [{"input": "Question C", "output": "Answer C"}])
            self.assertEqual(manifest["duplicates_removed"], 1)


if __name__ == "__main__":
    unittest.main()