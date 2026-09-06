"""Frozen 2D/3D positions from the released BERTopic-input abstract embeddings.

No topic labels enter the projection. Parameters match the title display;
seeds 43/44 audit sensitivity, never select for visual separation.
"""
import csv
import hashlib
import json
from pathlib import Path

import numpy as np
import sklearn
from sklearn.manifold import trustworthiness
from sklearn.neighbors import NearestNeighbors
import umap

ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / "data/source"


def sha(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def neighbours(values, metric):
    rows = NearestNeighbors(n_neighbors=31, metric=metric, n_jobs=1).fit(values).kneighbors(values, return_distance=False)
    return np.array([[j for j in row if j != i][:30] for i, row in enumerate(rows)])


def overlap(left, right, k):
    return float(np.mean([len(set(a[:k]) & set(b[:k])) / k for a, b in zip(left, right)]))


def main():
    index_path = SOURCE / "doc_index.csv"
    source_path = SOURCE / "s_scibert.npy"
    with index_path.open(encoding="utf-8-sig") as handle:
        rows = sorted(csv.DictReader(handle), key=lambda row: int(row["row_index"]))
    ids = [row["doc_id"] for row in rows]
    assert [int(row["row_index"]) for row in rows] == list(range(len(rows)))
    embeddings = np.load(source_path)
    data = json.loads((ROOT / "public/data/map.json").read_text(encoding="utf-8"))
    eligible = {p["id"] for p in data["points"] if "bertopic" in p}
    assert len(ids) == len(set(ids)) == 2057 and set(ids) == eligible
    assert embeddings.shape == (len(ids), 768) and np.isfinite(embeddings).all()
    parameters = dict(n_neighbors=30, min_dist=0.08, metric="cosine", n_jobs=1)
    source_nn = neighbours(embeddings, "cosine")
    source_hash = sha(source_path)
    projections, audit = {}, {}
    for dimensions in (2, 3):
        runs, reference_nn = [], None
        for seed in (42, 43, 44):
            cache = SOURCE / f"abstract_positions_{source_hash[:12]}_{dimensions}d_nn30_md008_seed{seed}.npy"
            values = np.load(cache) if cache.exists() else umap.UMAP(**parameters, n_components=dimensions, random_state=seed).fit_transform(embeddings).astype(np.float32)
            assert values.shape == (len(ids), dimensions) and np.isfinite(values).all()
            np.save(cache, values)
            nn = neighbours(values, "euclidean")
            if seed == 42:
                reference_nn = nn
                projections[f"coordinates{dimensions}d"] = np.round(values.astype(float), 5).tolist()
            metrics = dict(seed=seed, trustworthiness_15=round(float(trustworthiness(embeddings, values, n_neighbors=15, metric="cosine")), 6), neighbour_recall_15=round(overlap(source_nn, nn, 15), 6), neighbour_recall_30=round(overlap(source_nn, nn, 30), 6), seed_neighbour_overlap_15=round(overlap(reference_nn, nn, 15), 6))
            runs.append(metrics)
            print(json.dumps({"dimensions": dimensions, **metrics}), flush=True)
        audit[str(dimensions)] = runs
    payload = dict(version=1, ids=ids, **projections, embedding="S-SciBERT abstract embeddings", method="Independent direct UMAP projections of released abstract embeddings", parameters={**parameters, "random_state": 42}, source_sha256=source_hash, index_sha256=sha(index_path), audit=audit)
    output = ROOT / "public/data/positions-abstracts.json"
    output.write_text(json.dumps(payload, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    record = {key: value for key, value in payload.items() if key not in ("ids", "coordinates2d", "coordinates3d")}
    record.update(papers=len(ids), output_sha256=sha(output), software=dict(numpy=np.__version__, sklearn=sklearn.__version__, umap=umap.__version__), limitations=["Uses the frozen abstract encoder output, not preview snippets. Upstream encoder token limits still apply.", "Title positions use SPECTER; abstract positions use the released BERTopic-input S-SciBERT embeddings. Switching changes both text source and encoder, not text alone.", "Cohort restriction changes density. No labels or manual cluster offsets enter either projection."])
    (ROOT / "docs/ABSTRACT_POSITIONS_AUDIT.json").write_text(json.dumps(record, indent=2) + "\n", encoding="utf-8")


if __name__ == "__main__":
    main()
