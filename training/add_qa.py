import argparse
import json
from pathlib import Path

try:
    from training.data_prep import deduplicate_records, load_records, normalize_text
except ModuleNotFoundError:
    from data_prep import deduplicate_records, load_records, normalize_text


def append_pair(path, question, answer):
    target = Path(path)
    records = load_records(target) if target.exists() else []
    candidate = {"input": normalize_text(question), "output": normalize_text(answer)}
    if not candidate["input"] or not candidate["output"]:
        raise ValueError("Question and answer must not be empty")
    combined = deduplicate_records([*records, candidate])
    added = len(combined) > len(records)
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_text(json.dumps(combined, ensure_ascii=False, indent=2), encoding="utf-8")
    return added


def main():
    parser = argparse.ArgumentParser(description="Append a reviewed Q&A pair to the Moonlit source dataset")
    parser.add_argument("--data", required=True, help="JSON source dataset to append to")
    parser.add_argument("--input", required=True, help="Reviewed user question")
    parser.add_argument("--output", required=True, help="Reviewed, verified answer")
    args = parser.parse_args()
    added = append_pair(args.data, args.input, args.output)
    print("Q&A pair added." if added else "Duplicate Q&A pair; dataset unchanged.")


if __name__ == "__main__":
    main()