"""Release text-availability IDs and genuine full-text-only positions.

Reuses the audited SPECTER passage vectors, including full-text vectors for
paired records. No abstract vector enters the full-text projection.
"""

import json

import numpy as np
import sklearn
from sklearn.manifold import trustworthiness
import umap

from build_abstract_positions import ROOT, SOURCE, neighbours, overlap, sha


def read(path):
    return json.loads(path.read_text(encoding="utf-8"))


def write(path, value, compact=False):
    path.write_text(
        json.dumps(
            value,
            ensure_ascii=False,
            indent=None if compact else 2,
            separators=(",", ":") if compact else None,
        )
        + "\n",
        encoding="utf-8",
    )


def main():
    catalogue = read(ROOT / "public/data/map.json")
    union = read(ROOT / "public/data/positions-union.json")
    audit = read(ROOT / "docs/UNION_POSITIONS_AUDIT.json")
    extra = read(SOURCE / "union_excluded_abstracts.json")
    assert sha(SOURCE / "union_text_input.jsonl") == audit["coverage"]["input_sha256"]
    assert sha(SOURCE / "union_specter.npy") == audit["source_sha256"]
    rows = [
        json.loads(line)
        for line in (SOURCE / "union_text_input.jsonl")
        .read_text(encoding="utf-8")
        .splitlines()
    ]
    assert [r["id"] for r in rows] == union["ids"]
    released_abstracts = {p["id"] for p in catalogue["points"] if "bertopic" in p}
    assert not released_abstracts & {p["id"] for p in extra}
    abstract_ids = released_abstracts | {p["id"] for p in extra}
    fulltext_ids = {r["id"] for r in rows if r["fulltext_windows"]}
    assert (
        len(abstract_ids)
        == audit["coverage"]["counts"]["raw_abstract_nonempty"]
        == 2100
    )
    assert (
        len(fulltext_ids)
        == audit["coverage"]["counts"]["usable_english_fulltext"]
        == 2091
    )
    assert len(abstract_ids & fulltext_ids) == 423
    assert {p["id"] for p in extra if p["fulltext_eligible"]} <= fulltext_ids
    canonical = [p["id"] for p in catalogue["points"]]
    assert abstract_ids | fulltext_ids <= set(canonical)
    prefix = "http://www.jstor.org/stable/"
    assert all(i.startswith(prefix) for i in canonical)
    availability = dict(
        version=1,
        id_prefix=prefix,
        abstracts=[i.removeprefix(prefix) for i in canonical if i in abstract_ids],
        fulltext=[i.removeprefix(prefix) for i in canonical if i in fulltext_ids],
        counts=dict(
            abstracts=2100,
            fulltext=2091,
            both=423,
            abstract_only=1677,
            fulltext_only=1668,
            neither=3308,
        ),
    )
    write(ROOT / "lib/text-availability.json", availability, compact=True)

    primary = np.load(SOURCE / "union_specter.npy")
    paired = np.load(SOURCE / "union_paired_fulltext.npy")
    assert primary.shape == paired.shape == (len(rows), 768)
    paired_mask = np.linalg.norm(paired, axis=1) > 0.5
    assert {
        r["id"] for r, yes in zip(rows, paired_mask) if yes
    } == abstract_ids & fulltext_ids
    indices = [i for i, r in enumerate(rows) if r["id"] in fulltext_ids]
    embeddings = np.array(
        [paired[i] if rows[i]["source"] == "abstract" else primary[i] for i in indices],
        dtype=np.float32,
    )
    ids = [rows[i]["id"] for i in indices]
    assert ids == [prefix + i for i in availability["fulltext"]]
    assert embeddings.shape == (2091, 768) and np.isfinite(embeddings).all()
    assert np.allclose(np.linalg.norm(embeddings, axis=1), 1, atol=1e-5)
    np.save(SOURCE / "fulltext_specter.npy", embeddings)
    source_hash = sha(SOURCE / "fulltext_specter.npy")
    source_nn = neighbours(embeddings, "cosine")
    parameters = dict(n_neighbors=30, min_dist=0.08, metric="cosine", n_jobs=1)
    projections, runs = {}, {}
    for dimensions in (2, 3):
        results, reference_nn = [], None
        for seed in (42, 43, 44):
            cache = (
                SOURCE
                / f"fulltext_positions_{source_hash[:12]}_{dimensions}d_nn30_md008_seed{seed}.npy"
            )
            values = (
                np.load(cache)
                if cache.exists()
                else umap.UMAP(**parameters, n_components=dimensions, random_state=seed)
                .fit_transform(embeddings)
                .astype(np.float32)
            )
            assert values.shape == (2091, dimensions) and np.isfinite(values).all()
            np.save(cache, values)
            nn = neighbours(values, "euclidean")
            if seed == 42:
                reference_nn = nn
                projections[f"coordinates{dimensions}d"] = np.round(
                    values.astype(float), 5
                ).tolist()
            metrics = dict(
                seed=seed,
                trustworthiness_15=round(
                    float(
                        trustworthiness(
                            embeddings, values, n_neighbors=15, metric="cosine"
                        )
                    ),
                    6,
                ),
                neighbour_recall_15=round(overlap(source_nn, nn, 15), 6),
                neighbour_recall_30=round(overlap(source_nn, nn, 30), 6),
                seed_neighbour_overlap_15=round(overlap(reference_nn, nn, 15), 6),
            )
            results.append(metrics)
            print(json.dumps(dict(dimensions=dimensions, **metrics)), flush=True)
        runs[str(dimensions)] = results
    payload = dict(
        version=1,
        ids=ids,
        **projections,
        embedding="SPECTER sampled full-text embeddings",
        parameters={**parameters, "random_state": 42},
        source_sha256=source_hash,
        audit=runs,
    )
    output = ROOT / "public/data/positions-fulltext.json"
    write(output, payload, compact=True)
    release = dict(count=len(ids), sha256=sha(output))
    write(ROOT / "lib/fulltext-release.json", release)
    record = dict(
        version=1,
        papers=len(ids),
        output_sha256=sha(output),
        source_sha256=source_hash,
        union_vectors_sha256=sha(SOURCE / "union_specter.npy"),
        paired_fulltext_vectors_sha256=sha(SOURCE / "union_paired_fulltext.npy"),
        raw_catalogue_sha256=audit["raw_catalogue_sha256"],
        input_sha256=audit["coverage"]["input_sha256"],
        availability_sha256=sha(ROOT / "lib/text-availability.json"),
        excluded_abstract_audit_sha256=sha(SOURCE / "union_excluded_abstracts.json"),
        pipeline_sha256=sha(ROOT / "scripts/build_text_views.py"),
        availability=availability["counts"],
        encoder=audit["encoder"]["protocol"],
        parameters=payload["parameters"],
        audit=runs,
        source_composition=dict(
            fulltext_only=1668, paired_fulltext=423, abstract_vectors=0
        ),
        software=dict(
            numpy=np.__version__, sklearn=sklearn.__version__, umap=umap.__version__
        ),
        limitations=[
            "Text availability is not embedding eligibility: 2,100 nonempty abstracts exist, but only 2,057 have released abstract positions.",
            "Full-text positions reuse at most eight sampled 256-word passages, not exhaustive whole-document encoding.",
            "SPECTER was trained on titles and abstracts; its full-text application is exploratory.",
            "The full-text cohort differs in source and document type. A separate fit is not an isolated comparison of document lengths.",
            "The Both filter selects shared records without refitting or moving them; it is not an additional embedding model.",
            "Existing topic assignments and correlation-matrix cohorts remain unchanged.",
        ],
    )
    write(ROOT / "docs/FULLTEXT_POSITIONS_AUDIT.json", record)
    print(
        json.dumps(dict(release=release, availability=availability["counts"])),
        flush=True,
    )


if __name__ == "__main__":
    main()
