import argparse
import csv
import json
import random
import unicodedata
from pathlib import Path


def normalize_text(value):
    if not isinstance(value, str):
        raise ValueError("Each input and output value must be a string")
    normalized = unicodedata.normalize("NFKC", value).replace("\u00a0", " ")
    return " ".join(normalized.split())


def load_records(path):
    source = Path(path)
    extension = source.suffix.lower()
    if extension == ".csv":
        with source.open(newline="", encoding="utf-8-sig") as handle:
            rows = list(csv.DictReader(handle))
    elif extension == ".jsonl":
        with source.open(encoding="utf-8") as handle:
            rows = [json.loads(line) for line in handle if line.strip()]
    elif extension == ".json":
        with source.open(encoding="utf-8") as handle:
            rows = json.load(handle)
    else:
        raise ValueError("Dataset must be .json, .jsonl, or .csv")

    if not isinstance(rows, list):
        raise ValueError("JSON dataset must contain an array of Q&A objects")

    cleaned = []
    for row_number, row in enumerate(rows, start=1):
        if not isinstance(row, dict) or "input" not in row or "output" not in row:
            raise ValueError(f"Row {row_number} must contain input and output")
        pair = {"input": normalize_text(row["input"]), "output": normalize_text(row["output"])}
        if not pair["input"] or not pair["output"]:
            raise ValueError(f"Row {row_number} has an empty input or output")
        cleaned.append(pair)
    return cleaned


def deduplicate_records(records):
    unique = []
    seen = set()
    for record in records:
        key = (record["input"].casefold(), record["output"].casefold())
        if key not in seen:
            seen.add(key)
            unique.append(record)
    return unique


def split_records(records, test_size, seed):
    if not 0 < test_size < 1:
        raise ValueError("test_size must be between 0 and 1")
    if len(records) < 2:
        raise ValueError("At least two unique Q&A pairs are required")

    shuffled = list(records)
    random.Random(seed).shuffle(shuffled)
    test_count = min(len(shuffled) - 1, max(1, round(len(shuffled) * test_size)))
    return shuffled[test_count:], shuffled[:test_count]


def prepare_dataset(data_path, output_dir, test_size=0.1, seed=42, test_data_path=None):
    original_train = load_records(data_path)
    train_records = deduplicate_records(original_train)
    duplicates_removed = len(original_train) - len(train_records)
    if test_data_path:
        original_test = load_records(test_data_path)
        unique_test = deduplicate_records(original_test)
        duplicates_removed += len(original_test) - len(unique_test)
        train_keys = {
            (record["input"].casefold(), record["output"].casefold())
            for record in train_records
        }
        test_records = [
            record
            for record in unique_test
            if (record["input"].casefold(), record["output"].casefold()) not in train_keys
        ]
        duplicates_removed += len(unique_test) - len(test_records)
        if not train_records or not test_records:
            raise ValueError("Explicit train/test files need nonempty, non-overlapping pairs")
    else:
        train_records, test_records = split_records(train_records, test_size, seed)
    target = Path(output_dir)
    target.mkdir(parents=True, exist_ok=True)
    (target / "train.json").write_text(
        json.dumps(train_records, ensure_ascii=False, indent=2), encoding="utf-8"
    )
    (target / "test.json").write_text(
        json.dumps(test_records, ensure_ascii=False, indent=2), encoding="utf-8"
    )
    manifest = {
        "source": str(Path(data_path)),
        "normalization": "Unicode NFKC and collapsed whitespace",
        "deduplication": "exact normalized input/output pair, case-insensitive",
        "seed": seed,
        "test_size": test_size,
        "test_source": str(Path(test_data_path)) if test_data_path else None,
        "input_rows": len(original_train) + (len(original_test) if test_data_path else 0),
        "unique_rows": len(train_records) + len(test_records),
        "duplicates_removed": duplicates_removed,
        "train_rows": len(train_records),
        "test_rows": len(test_records),
    }
    (target / "manifest.json").write_text(
        json.dumps(manifest, ensure_ascii=False, indent=2), encoding="utf-8"
    )
    return manifest


def main():
    parser = argparse.ArgumentParser(description="Normalize, deduplicate, and split Moonlit Q&A data")
    parser.add_argument("--data", required=True, help="Source JSON, JSONL, or CSV file")
    parser.add_argument("--output-dir", default="data/prepared")
    parser.add_argument("--test-size", type=float, default=0.1)
    parser.add_argument("--seed", type=int, default=42)
    args = parser.parse_args()
    print(
        json.dumps(
            prepare_dataset(args.data, args.output_dir, args.test_size, args.seed),
            indent=2,
        )
    )


if __name__ == "__main__":
    main()