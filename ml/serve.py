"""
The classifier as a small internal service: the web app asks /predict during an analysis, the API's
scheduler asks /train after exporting the pool. Both are on the compose network only, and /train needs
the internal key the other services already share.
"""

from __future__ import annotations

import hmac
import os
import threading
from pathlib import Path

from fastapi import FastAPI, Header, HTTPException
from pydantic import BaseModel, Field

from pipeline import explain, load_champion, read_metrics, train

MODELS_DIR = Path(os.environ.get("ML_MODELS_DIR", "/data/models"))
POOL_PATH = Path(os.environ.get("ML_POOL_PATH", "/data/training-pool.jsonl"))
EVAL_PATH = Path(os.environ.get("ML_EVAL_PATH", "/app/eval_dataset.csv"))
INTERNAL_KEY = os.environ.get("TELAAH_INTERNAL_KEY") or "dev-telaah-internal-key"

app = FastAPI()
_lock = threading.Lock()
_state: dict = {"model": None, "version": None, "counts": None, "training": False, "last": None}


def _current():
    """The champion, reloaded when a training run promoted a new one."""
    pointer = MODELS_DIR / "CHAMPION"
    version = pointer.read_text(encoding="utf-8").strip() if pointer.exists() else None
    if version and version != _state["version"]:
        loaded = load_champion(MODELS_DIR)
        if loaded:
            _state["model"], _state["version"] = loaded
            _state["counts"] = read_metrics(MODELS_DIR, version).get("counts")
    return _state["model"], _state["version"]


class PredictRequest(BaseModel):
    text: str = Field(max_length=20000)


@app.get("/health")
def health():
    _, version = _current()
    return {"ok": True, "model_version": version, "training": _state["training"], "last_training": _state["last"]}


@app.post("/predict")
def predict(request: PredictRequest):
    model, version = _current()
    if model is None:
        raise HTTPException(status_code=503, detail="no model trained yet")
    probability = float(model.predict_proba([request.text])[0][1])
    return {
        "probability": round(probability, 4),
        "model_version": version,
        "trained_on": _state["counts"],
        "top_terms": explain(model, request.text),
    }


def _train_in_background():
    try:
        _state["last"] = train(POOL_PATH, MODELS_DIR, EVAL_PATH)
    except Exception as error:  # reported through /health; the champion stays in place
        _state["last"] = {"status": "error", "error": str(error)}
    finally:
        _state["training"] = False


@app.post("/train", status_code=202)
def start_training(x_internal_key: str = Header(default="")):
    if not hmac.compare_digest(x_internal_key, INTERNAL_KEY):
        raise HTTPException(status_code=403)
    with _lock:
        if _state["training"]:
            return {"status": "already_training"}
        _state["training"] = True
    threading.Thread(target=_train_in_background, daemon=True).start()
    return {"status": "started"}
