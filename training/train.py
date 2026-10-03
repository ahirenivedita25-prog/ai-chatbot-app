import argparse
import json
import re
from pathlib import Path

try:
    from training.data_prep import prepare_dataset
except ModuleNotFoundError:
    from data_prep import prepare_dataset


DEFAULT_MODEL = "distilgpt2"
MODEL_VERSION_PREFIX = "moonlit-brain-"


def clean_text(value):
    if not isinstance(value, str):
        raise ValueError("Each input and output value must be a string")
    return re.sub(r"\s+", " ", value).strip()


def build_preprocessor(tokenizer, max_length):
    def preprocess(batch):
        prompts = [f"### User: {clean_text(value)}\n### Assistant:" for value in batch["input"]]
        answers = [clean_text(value) for value in batch["output"]]
        full_text = [f"{prompt} {answer}{tokenizer.eos_token}" for prompt, answer in zip(prompts, answers)]
        encoded = tokenizer(full_text, truncation=True, max_length=max_length)
        prompt_tokens = tokenizer(prompts, truncation=True, max_length=max_length - 1)
        labels = []

        for input_ids, prompt_ids in zip(encoded["input_ids"], prompt_tokens["input_ids"]):
            label_ids = input_ids.copy()
            # Ignore prompt tokens so training loss only rewards the answer.
            label_ids[: len(prompt_ids)] = [-100] * min(len(prompt_ids), len(label_ids))
            labels.append(label_ids)

        encoded["labels"] = labels
        return encoded

    return preprocess


class MoonlitDataCollator:
    def __init__(self, tokenizer):
        self.tokenizer = tokenizer

    def __call__(self, features):
        model_features = [
            {key: value for key, value in feature.items() if key != "labels"}
            for feature in features
        ]
        batch = self.tokenizer.pad(model_features, padding=True, return_tensors="pt")
        labels = batch["input_ids"].new_full(batch["input_ids"].shape, -100)
        for row_index, feature in enumerate(features):
            row_labels = feature["labels"]
            labels[row_index, : len(row_labels)] = row_labels
        batch["labels"] = labels
        return batch


def preprocess_logits_for_metrics(logits, _labels):
    if isinstance(logits, tuple):
        logits = logits[0]
    return logits.argmax(dim=-1)


def compute_metrics(prediction):
    import numpy as np

    predicted_tokens = prediction.predictions
    labels = prediction.label_ids
    predicted_tokens = predicted_tokens[:, :-1]
    labels = labels[:, 1:]
    valid_tokens = labels != -100
    if not np.any(valid_tokens):
        return {"token_accuracy": 0.0}
    return {
        "token_accuracy": float(
            np.mean(predicted_tokens[valid_tokens] == labels[valid_tokens])
        )
    }


def parse_args():
    parser = argparse.ArgumentParser(description="Fine-tune a Moonlit causal language model")
    parser.add_argument("--data", required=True, help="Training .json, .jsonl, or .csv file")
    parser.add_argument("--test-data", help="Optional separate evaluation dataset")
    parser.add_argument("--model-name", default=DEFAULT_MODEL, help="Hugging Face base model ID")
    parser.add_argument("--version", default="1", help="Moonlit version number, for example 2 or 3")
    parser.add_argument("--output-dir", help="Override the default versioned output directory")
    parser.add_argument("--overwrite", action="store_true", help="Overwrite an existing output version")
    parser.add_argument("--epochs", type=float, default=3)
    parser.add_argument("--batch-size", type=int, default=2)
    parser.add_argument("--learning-rate", type=float, default=5e-5)
    parser.add_argument("--test-size", type=float, default=0.1)
    parser.add_argument("--max-length", type=int, default=512)
    parser.add_argument("--seed", type=int, default=42)
    return parser.parse_args()


def main():
    args = parse_args()
    if not 0 < args.test_size < 1:
        raise ValueError("--test-size must be between 0 and 1")
    if args.max_length < 2:
        raise ValueError("--max-length must be at least 2")
    if args.epochs <= 0 or args.batch_size <= 0 or args.learning_rate <= 0:
        raise ValueError("--epochs, --batch-size, and --learning-rate must be positive")

    try:
        from datasets import load_dataset
        from transformers import (
            AutoModelForCausalLM,
            AutoTokenizer,
            Trainer,
            TrainingArguments,
        )
        import numpy as np
    except ImportError as error:
        raise SystemExit(
            "Training dependencies are missing. Install them with: "
            "python -m pip install -r requirements-training.txt"
        ) from error

    version_number = args.version.removeprefix("v")
    if not version_number.isdigit() or int(version_number) < 1:
        raise ValueError("--version must be a positive integer, optionally prefixed with v")
    model_version = f"{MODEL_VERSION_PREFIX}v{version_number}"
    output_dir = Path(args.output_dir or model_version)
    if output_dir.exists() and any(output_dir.iterdir()) and not args.overwrite:
        raise FileExistsError(
            f"{output_dir} already exists; choose a new --version or pass --overwrite"
        )
    output_dir.mkdir(parents=True, exist_ok=True)
    prepared_dir = Path("training/prepared") / model_version
    manifest = prepare_dataset(
        args.data,
        prepared_dir,
        args.test_size,
        args.seed,
        test_data_path=args.test_data,
    )
    datasets = load_dataset(
        "json",
        data_files={
            "train": str(prepared_dir / "train.json"),
            "test": str(prepared_dir / "test.json"),
        },
    )
    train_data, eval_data = datasets["train"], datasets["test"]
    tokenizer = AutoTokenizer.from_pretrained(args.model_name)
    if tokenizer.eos_token is None:
        raise ValueError("The selected tokenizer must define an EOS token")
    if tokenizer.pad_token is None:
        tokenizer.pad_token = tokenizer.eos_token
    tokenizer.padding_side = "right"

    preprocessor = build_preprocessor(tokenizer, args.max_length)
    train_data = train_data.map(preprocessor, batched=True, remove_columns=train_data.column_names)
    eval_data = eval_data.map(preprocessor, batched=True, remove_columns=eval_data.column_names)
    train_data = train_data.filter(lambda row: any(token != -100 for token in row["labels"]))
    eval_data = eval_data.filter(lambda row: any(token != -100 for token in row["labels"]))
    if not len(train_data) or not len(eval_data):
        raise ValueError("Preprocessing left an empty training or evaluation split")

    model = AutoModelForCausalLM.from_pretrained(args.model_name)
    model.config.pad_token_id = tokenizer.pad_token_id
    training_args = TrainingArguments(
        output_dir=str(output_dir / "checkpoints"),
        num_train_epochs=args.epochs,
        per_device_train_batch_size=args.batch_size,
        per_device_eval_batch_size=args.batch_size,
        learning_rate=args.learning_rate,
        eval_strategy="epoch",
        save_strategy="epoch",
        load_best_model_at_end=True,
        metric_for_best_model="eval_loss",
        greater_is_better=False,
        logging_steps=10,
        report_to="none",
        seed=args.seed,
    )
    trainer = Trainer(
        model=model,
        args=training_args,
        train_dataset=train_data,
        eval_dataset=eval_data,
        data_collator=MoonlitDataCollator(tokenizer),
        processing_class=tokenizer,
        compute_metrics=compute_metrics,
        preprocess_logits_for_metrics=preprocess_logits_for_metrics,
    )
    trainer.train()
    metrics = trainer.evaluate()
    if "eval_loss" in metrics:
        metrics["perplexity"] = float(np.exp(metrics["eval_loss"]))

    trainer.save_model(str(output_dir))
    tokenizer.save_pretrained(str(output_dir))
    (output_dir / "moonlit-metadata.json").write_text(
        json.dumps(
            {
                "model_version": model_version,
                "base_model": args.model_name,
                "train_examples": len(train_data),
                "evaluation_examples": len(eval_data),
                "dataset_manifest": manifest,
                "metrics": metrics,
            },
            indent=2,
        ),
        encoding="utf-8",
    )
    print(json.dumps({"model_version": model_version, "output_dir": str(output_dir), "metrics": metrics}, indent=2))


if __name__ == "__main__":
    main()