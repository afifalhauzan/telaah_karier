# docker compose -f docker-compose.dev.yml run --rm --no-deps -v "$PWD/ml/test_pipeline.py:/app/test_pipeline.py" ml \
#   sh -c "pip install -q pytest && python -m pytest -q -p no:cacheprovider"
import json
from pathlib import Path

from pipeline import explain, load_champion, train

SCAMS = [
    "Lowongan kerja kapal pesiar gaji 30 juta, transfer biaya pendaftaran {i} ratus ribu ke rekening pribadi, hubungi WA",
    "Dicari karyawan online, kerja dari HP, deposit tugas dulu {i} ratus ribu lalu komisi cair, chat admin di telegram",
    "Rekrutmen BUMN tanpa tes, cukup bayar seragam dan biaya pelatihan {i} ratus ribu, kuota terbatas segera daftar",
]
GENUINE = [
    "PT Maju Jaya membuka lowongan staf gudang {i}, pendidikan minimal SMA, lamaran dikirim melalui portal resmi perusahaan",
    "Dibutuhkan admin keuangan {i}, pengalaman satu tahun, menguasai Excel, proses seleksi tanpa dipungut biaya apa pun",
    "Lowongan perawat rumah sakit {i}, wajib STR aktif, wawancara di kantor cabang, kontrak kerja tertulis",
]


def write_pool(path: Path, extra: int = 0) -> None:
    lines = []
    for i in range(12 + extra):
        for j, template in enumerate(SCAMS):
            lines.append({"id": f"s{i}-{j}", "label": "penipuan", "text": template.format(i=i), "url": f"https://tbh/{i}{j}", "published_at": f"2026-{1 + i % 9:02d}-01"})
        for j, template in enumerate(GENUINE):
            lines.append({"id": f"g{i}-{j}", "label": "asli", "text": template.format(i=i), "url": f"https://kh/{i}{j}", "collected_at": f"2026-{1 + i % 9:02d}-01"})
    path.write_text("\n".join(json.dumps(line) for line in lines), encoding="utf-8")


def test_too_little_data_is_skipped(tmp_path):
    pool = tmp_path / "pool.jsonl"
    pool.write_text(json.dumps({"id": "a", "label": "penipuan", "text": "x"}), encoding="utf-8")
    assert train(pool, tmp_path / "models", tmp_path / "none.csv")["status"] == "skipped"


def test_first_model_is_promoted_and_explains_itself(tmp_path):
    pool, models = tmp_path / "pool.jsonl", tmp_path / "models"
    write_pool(pool)
    result = train(pool, models, tmp_path / "none.csv")
    assert result["status"] == "promoted"
    assert result["validation"]["f1"] >= 0.9

    model, version = load_champion(models)
    assert version == result["version"]
    text = "kerja online deposit tugas dulu lalu komisi cair"
    assert model.predict_proba([text])[0][1] > 0.5
    assert any("deposit" in term or "tugas" in term for term in explain(model, text))


def test_a_retrain_on_new_data_can_replace_the_model_and_an_unchanged_pool_is_skipped(tmp_path):
    pool, models = tmp_path / "pool.jsonl", tmp_path / "models"
    write_pool(pool)
    first = train(pool, models, tmp_path / "none.csv")
    write_pool(pool, extra=3)

    second = train(pool, models, tmp_path / "none.csv")
    # The champion has not seen the newest rows, so it cannot win by memory
    assert second["status"] == "promoted"
    assert load_champion(models)[1] == second["version"] != first["version"]
    assert train(pool, models, tmp_path / "none.csv")["status"] == "skipped"


def test_eval_dataset_rows_never_reach_training(tmp_path):
    pool, models, eval_csv = tmp_path / "pool.jsonl", tmp_path / "models", tmp_path / "eval.csv"
    write_pool(pool)
    eval_csv.write_text(
        "id,split,label,text,sumber_label,sumber_asli\n"
        "e1,dev,penipuan,Lowongan khusus evaluasi,https://tbh/00,\n",
        encoding="utf-8",
    )
    result = train(pool, models, eval_csv)
    assert result["counts"]["penipuan"] == 12 * 3 - 1
    assert result["eval_dev"]["n"] == 1
