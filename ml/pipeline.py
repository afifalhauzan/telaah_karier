"""
TelaahKarier's own text classifier: trained on the pool the API collects every day (fact-checked
scams from TurnBackHoax, genuine postings from KarirHub), retrained when the pool grows, and promoted
only when it is at least as good as the model in use (champion/challenger).

The model is TF-IDF n-grams with logistic regression: competitive on a few hundred short postings,
cheap on a CPU, and explainable (the n-grams that pushed a prediction can be shown to the user).
shortcut: text only; an image classifier (CLIP embeddings) waits for enough posters without the
fact-checker's stamp in the pool.
"""

from __future__ import annotations

import csv
import hashlib
import json
import re
import time
from dataclasses import dataclass
from datetime import datetime
from pathlib import Path

import joblib
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import f1_score, precision_score, recall_score
from sklearn.pipeline import FeatureUnion, Pipeline

# Newest share of the pool held out to judge a challenger: future postings are what it must handle
VALIDATION_SHARE = 0.2
MIN_PER_CLASS = 20
THRESHOLD = 0.5


@dataclass
class Row:
    id: str
    label: int  # 1 = penipuan, 0 = asli
    text: str
    url: str
    date: str


def normalize(text: str) -> str:
    # Without punctuation: the same posting is quoted with straight or curly quotes in different places
    return re.sub(r"[^\w]+", " ", text.lower()).strip()


def load_pool(path: Path, excluded_urls: set[str], excluded_texts: set[str]) -> list[Row]:
    """The pool without duplicates and without anything in the evaluation dataset (no leakage)."""
    rows: list[Row] = []
    seen: set[str] = set()
    for line in path.read_text(encoding="utf-8").splitlines():
        if not line.strip():
            continue
        item = json.loads(line)
        text = (item.get("text") or "").strip()
        key = normalize(text)
        if not text or key in seen or key in excluded_texts or item.get("url") in excluded_urls:
            continue
        seen.add(key)
        rows.append(
            Row(
                id=item["id"],
                label=1 if item["label"] == "penipuan" else 0,
                text=text,
                url=item.get("url") or "",
                date=item.get("published_at") or item.get("collected_at") or "",
            )
        )
    return rows


def eval_dataset(path: Path) -> tuple[set[str], set[str], list[tuple[str, str, int]]]:
    """URLs and texts of the hand-labeled evaluation dataset, and its dev rows for reporting."""
    urls: set[str] = set()
    texts: set[str] = set()
    dev: list[tuple[str, str, int]] = []
    if not path.exists():
        return urls, texts, dev
    with path.open(encoding="utf-8") as handle:
        for row in csv.DictReader(handle):
            urls.update(url for url in (row.get("sumber_label"), row.get("sumber_asli")) if url)
            if row.get("text"):
                texts.add(normalize(row["text"]))
            if row.get("split") == "dev" and row.get("text") and row.get("label") in ("penipuan", "asli"):
                dev.append((row["id"], row["text"], 1 if row["label"] == "penipuan" else 0))
    return urls, texts, dev


def build_model() -> Pipeline:
    features = FeatureUnion(
        [
            # Words and short phrases ("biaya pendaftaran", "link di bio")
            ("words", TfidfVectorizer(ngram_range=(1, 2), min_df=2, sublinear_tf=True, lowercase=True)),
            # Character runs survive spelling games ("p3ndaftaran", "w.a")
            ("chars", TfidfVectorizer(analyzer="char_wb", ngram_range=(3, 5), min_df=2, sublinear_tf=True, lowercase=True)),
        ]
    )
    return Pipeline([("features", features), ("clf", LogisticRegression(max_iter=2000, class_weight="balanced", C=4.0))])


def split_by_date(rows: list[Row]) -> tuple[list[Row], list[Row]]:
    """Train on older rows, validate on the newest, per class so both sides are represented."""
    train: list[Row] = []
    valid: list[Row] = []
    for label in (0, 1):
        group = sorted((row for row in rows if row.label == label), key=lambda row: (row.date, row.id))
        cut = int(len(group) * (1 - VALIDATION_SHARE))
        train += group[:cut]
        valid += group[cut:]
    return train, valid


def scores(model: Pipeline, texts: list[str], labels: list[int]) -> dict[str, float]:
    predicted = [int(p >= THRESHOLD) for p in model.predict_proba(texts)[:, 1]]
    return {
        "f1": round(f1_score(labels, predicted, zero_division=0), 4),
        "precision": round(precision_score(labels, predicted, zero_division=0), 4),
        "recall": round(recall_score(labels, predicted, zero_division=0), 4),
        "n": len(labels),
    }


def train(pool_path: Path, models_dir: Path, eval_path: Path) -> dict:
    """Trains a challenger, compares it with the champion on the same newest rows, promotes if no worse."""
    excluded_urls, excluded_texts, dev = eval_dataset(eval_path)
    rows = load_pool(pool_path, excluded_urls, excluded_texts)
    counts = {"penipuan": sum(row.label for row in rows), "asli": sum(1 - row.label for row in rows)}
    if min(counts.values()) < MIN_PER_CLASS:
        return {"status": "skipped", "reason": f"need {MIN_PER_CLASS} rows per class", "counts": counts}

    data_sha256 = hashlib.sha256(pool_path.read_bytes()).hexdigest()[:16]
    champion = load_champion(models_dir)
    if champion and read_metrics(models_dir, champion[1]).get("data_sha256") == data_sha256:
        return {"status": "skipped", "reason": "pool unchanged since the model in use", "counts": counts}

    # The challenger is served as trained: the champion was never fit on the newest rows either, so
    # both are judged on rows they have not seen
    train_rows, valid_rows = split_by_date(rows)
    challenger = build_model().fit([row.text for row in train_rows], [row.label for row in train_rows])
    valid_texts, valid_labels = [row.text for row in valid_rows], [row.label for row in valid_rows]
    report = {
        "trained_at": time.strftime("%Y-%m-%dT%H:%M:%S"),
        "counts": counts,
        "data_sha256": data_sha256,
        "validation": scores(challenger, valid_texts, valid_labels),
        # The hand-labeled dev split, never trained on: comparable with the agent's own eval
        "eval_dev": scores(challenger, [t for _, t, _ in dev], [l for _, _, l in dev]) if dev else None,
    }

    champion_validation = scores(champion[0], valid_texts, valid_labels) if champion else None
    report["champion_validation"] = champion_validation
    promote = champion_validation is None or (
        report["validation"]["f1"] >= champion_validation["f1"] and report["validation"]["recall"] >= champion_validation["recall"]
    )

    version = datetime.now().strftime("%Y%m%d-%H%M%S-%f")
    target = models_dir / version
    target.mkdir(parents=True, exist_ok=True)
    report.update({"version": version, "promoted": promote})
    # A rejected challenger keeps only its scores, for the record
    if promote:
        joblib.dump(challenger, target / "model.joblib")
    (target / "metrics.json").write_text(json.dumps(report, indent=2), encoding="utf-8")
    if promote:
        (models_dir / "CHAMPION").write_text(version, encoding="utf-8")
    return {"status": "promoted" if promote else "kept_champion", **report}


def read_metrics(models_dir: Path, version: str) -> dict:
    return json.loads((models_dir / version / "metrics.json").read_text(encoding="utf-8"))


def load_champion(models_dir: Path) -> tuple[Pipeline, str] | None:
    pointer = models_dir / "CHAMPION"
    if not pointer.exists():
        return None
    version = pointer.read_text(encoding="utf-8").strip()
    return joblib.load(models_dir / version / "model.joblib"), version


def explain(model: Pipeline, text: str, limit: int = 5) -> list[str]:
    """The word n-grams in the text that pushed it most toward "penipuan"."""
    words: TfidfVectorizer = model.named_steps["features"].transformer_list[0][1]
    coefficients = model.named_steps["clf"].coef_[0][: len(words.vocabulary_)]
    present = words.transform([text]).nonzero()[1]
    names = words.get_feature_names_out()
    ranked = sorted(present, key=lambda index: coefficients[index], reverse=True)
    return [names[index] for index in ranked[:limit] if coefficients[index] > 0]
