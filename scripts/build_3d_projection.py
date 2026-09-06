"""Reproducible 3D title-semantic display and independent embedding-space audit."""
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
SOURCE = ROOT / 'data/source'
PUBLIC = ROOT / 'public/data'

def neighbours(values, metric='euclidean'):
    rows = NearestNeighbors(n_neighbors=31, metric=metric, n_jobs=1).fit(values).kneighbors(values, return_distance=False)
    return np.array([[j for j in row if j != i][:30] for i, row in enumerate(rows)])

def overlap(left, right, k=15):
    return float(np.mean([len(set(a[:k]) & set(b[:k])) / k for a, b in zip(left, right)]))

def main():
    data = json.loads((PUBLIC / 'map.json').read_text(encoding='utf-8'))
    index = list(csv.DictReader((SOURCE / 'catalogue_doc_index.csv').open(encoding='utf-8-sig')))
    assert [p['id'] for p in data['points']] == [r['doc_id'] for r in index]
    embedding_path = SOURCE / 'catalogue_title_specter.npy'
    embeddings = np.load(embedding_path)
    assert embeddings.shape == (7076, 768) and np.isfinite(embeddings).all()
    params = dict(n_components=3, n_neighbors=30, min_dist=0.08, metric='cosine', n_jobs=1)
    source_nn = neighbours(embeddings, 'cosine')
    runs = []
    reference = None
    reference_nn = None
    for seed in (42, 43, 44):
        cache = SOURCE / f'catalogue_title_umap3d_seed{seed}.npy'
        values = np.load(cache) if cache.exists() else umap.UMAP(**params, random_state=seed).fit_transform(embeddings).astype(np.float32)
        assert values.shape == (7076, 3) and np.isfinite(values).all()
        np.save(cache, values)
        nn = neighbours(values)
        metrics = dict(seed=seed, trustworthiness_15=round(float(trustworthiness(embeddings, values, n_neighbors=15, metric='cosine')), 6), neighbour_recall_15=round(overlap(source_nn, nn), 6), neighbour_recall_30=round(overlap(source_nn, nn, 30), 6))
        if reference is None:
            reference, reference_nn = values, nn
        metrics['seed_neighbour_overlap_15'] = round(overlap(reference_nn, nn), 6)
        runs.append(metrics)
        print(json.dumps(metrics), flush=True)
    assert runs[0]['trustworthiness_15'] >= 0.85
    payload = dict(version=1, ids=[p['id'] for p in data['points']], coordinates=np.round(reference.astype(float), 5).tolist(), method='3D UMAP of SPECTER title embeddings', parameters={**params, 'random_state':42}, audit=runs)
    output = PUBLIC / 'projection-3d.json'
    output.write_text(json.dumps(payload, ensure_ascii=False, separators=(',', ':')), encoding='utf-8')
    audit = dict(papers=7076, dimensions=3, source_sha256=hashlib.sha256(embedding_path.read_bytes()).hexdigest(), index_sha256=hashlib.sha256((SOURCE/'catalogue_doc_index.csv').read_bytes()).hexdigest(), output_sha256=hashlib.sha256(output.read_bytes()).hexdigest(), numpy=np.__version__, sklearn=sklearn.__version__, umap=umap.__version__, parameters=payload['parameters'], runs=runs)
    (ROOT/'docs/PROJECTION_3D_AUDIT.json').write_text(json.dumps(audit, indent=2), encoding='utf-8')

if __name__ == '__main__':
    main()
