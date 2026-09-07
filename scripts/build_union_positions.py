"""Direct, label-free 2D/3D union projections and reproducible release audit."""

import csv
import hashlib
import json
from collections import Counter

import numpy as np
import sklearn
from sklearn.manifold import trustworthiness
import umap

from build_abstract_positions import ROOT, SOURCE, neighbours, overlap, sha


def summary(values):
    return {
        label: round(float(np.quantile(values, q)), 6)
        for label, q in [("p05", 0.05), ("median", 0.5), ("p95", 0.95)]
    }


def main():
    with (SOURCE / "union_doc_index.csv").open(encoding="utf-8") as handle:
        rows = list(csv.DictReader(handle))
    ids, sources = [r["doc_id"] for r in rows], [r["source"] for r in rows]
    assert [int(r["row_index"]) for r in rows] == list(range(len(rows)))
    catalogue = json.loads((ROOT / "public/data/map.json").read_text(encoding="utf-8"))
    manifest = json.loads(
        (ROOT / "public/data/manifest.json").read_text(encoding="utf-8")
    )
    raw_hash = next(
        s["sha256"]
        for s in manifest["sources"]
        if s["file"] == "jstor_catalogue.jsonl.gz"
    )
    with (SOURCE / "jstor_catalogue.jsonl.gz").open("rb") as raw:
        assert hashlib.file_digest(raw, "sha256").hexdigest() == raw_hash, (
            "Raw catalogue changed since the frozen release"
        )
    abstracts = {p["id"] for p in catalogue["points"] if "bertopic" in p}
    assert len(ids) == len(set(ids)) and set(ids) <= {
        p["id"] for p in catalogue["points"]
    }
    assert {i for i, s in zip(ids, sources) if s == "abstract"} == abstracts
    coverage = json.loads(
        (SOURCE / "union_coverage_audit.json").read_text(encoding="utf-8")
    )
    coverage["raw_abstracts_outside_frozen_cohort"] = coverage["counts"][
        "raw_abstract_nonempty"
    ] - len(abstracts)
    inputs = [
        json.loads(line)
        for line in (SOURCE / "union_text_input.jsonl")
        .read_text(encoding="utf-8")
        .splitlines()
    ]
    assert [r["id"] for r in inputs] == ids
    coverage["sampled_fraction_of_fulltext_words_by_type"] = {
        kind: summary(
            [
                sum(len(w.split()) for w in r["fulltext_windows"]) / r["fulltext_words"]
                for r in inputs
                if r["source"] == "fulltext" and r["type"] == kind
            ]
        )
        for kind in sorted({r["type"] for r in inputs if r["source"] == "fulltext"})
    }
    with (SOURCE / "fulltext_selected_assignments.csv").open(
        encoding="utf-8-sig"
    ) as handle:
        released_fulltext_ids = {r["doc_id"] for r in csv.DictReader(handle)}
    additional_fulltexts = [
        r
        for r in inputs
        if r["fulltext_windows"] and r["id"] not in released_fulltext_ids
    ]
    coverage["fulltext_model_release_comparison"] = dict(
        existing_model_records=len(released_fulltext_ids),
        available_texts_outside_model=len(additional_fulltexts),
        outside_model_over_100000_words=sum(
            r["fulltext_words"] > 100000 for r in additional_fulltexts
        ),
        outside_model_below_100_words=sum(
            r["fulltext_words"] < 100 for r in additional_fulltexts
        ),
        interpretation="The position view has its own stated eligibility and is not limited to an existing full-text topic model. Length counts do not by themselves establish the upstream exclusion rules.",
    )
    encoder = json.loads(
        (SOURCE / "union_encoder_audit.json").read_text(encoding="utf-8")
    )
    encoder["sampled_passage_tokens_discarded"] = encoder.pop("body_tokens_discarded")
    encoder["abstract_tokens_discarded"] = 0
    assert coverage["union"] == len(ids)
    assert encoder["protocol"]["input_sha256"] == coverage["input_sha256"]
    embeddings = np.load(SOURCE / "union_specter.npy")
    assert embeddings.shape == (len(ids), 768) and np.isfinite(embeddings).all()
    assert np.allclose(np.linalg.norm(embeddings, axis=1), 1, atol=1e-5)
    source_hash = sha(SOURCE / "union_specter.npy")
    parameters = dict(n_neighbors=30, min_dist=0.08, metric="cosine", n_jobs=1)
    source_nn = neighbours(embeddings, "cosine")
    projections, audit = {}, {}
    for dimensions in (2, 3):
        runs, reference_nn = [], None
        for seed in (42, 43, 44):
            cache = (
                SOURCE
                / f"union_positions_{source_hash[:12]}_{dimensions}d_nn30_md008_seed{seed}.npy"
            )
            values = (
                np.load(cache)
                if cache.exists()
                else umap.UMAP(**parameters, n_components=dimensions, random_state=seed)
                .fit_transform(embeddings)
                .astype(np.float32)
            )
            assert values.shape == (len(ids), dimensions) and np.isfinite(values).all()
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
            runs.append(metrics)
            print(json.dumps(dict(dimensions=dimensions, **metrics)), flush=True)
        audit[str(dimensions)] = runs
    full = np.array([s == "fulltext" for s in sources])
    eight = full & np.array([len(r["fulltext_windows"]) == 8 for r in inputs])
    four = np.load(SOURCE / "union_specter_four_windows.npy")
    # A genuine four/eight sensitivity check: shorter texts stay unchanged.
    four[~eight] = embeddings[~eight]
    four_nn = neighbours(four, "cosine")
    paired = np.load(SOURCE / "union_paired_fulltext.npy")
    paired_mask = np.linalg.norm(paired, axis=1) > 0.5
    assert int(paired_mask.sum()) == coverage["counts"]["paired_usable"]
    replacements = embeddings.copy()
    replacements[paired_mask] = paired[paired_mask]
    paired_nn = neighbours(replacements, "cosine")
    sensitivity = dict(
        four_vs_eight_windows=dict(
            documents=int(eight.sum()),
            cosine_similarity=summary(np.sum(embeddings[eight] * four[eight], axis=1)),
            neighbour_overlap_30=round(
                overlap(source_nn[eight], four_nn[eight], 30), 6
            ),
            protocol="Alternate four of eight windows; shorter full texts and all abstracts held fixed",
        ),
        paired_abstract_vs_fulltext=dict(
            documents=int(paired_mask.sum()),
            by_type=dict(
                Counter(
                    r["type"] for r, eligible in zip(inputs, paired_mask) if eligible
                )
            ),
            cosine_similarity=summary(
                np.sum(embeddings[paired_mask] * paired[paired_mask], axis=1)
            ),
            neighbour_overlap_30=round(
                overlap(source_nn[paired_mask], paired_nn[paired_mask], 30), 6
            ),
        ),
        same_source_neighbour_fraction_30=round(
            float(np.mean(full[source_nn] == full[:, None])), 6
        ),
        random_mixing_baseline=round(
            float(
                (full.sum() * (full.sum() - 1) + (~full).sum() * ((~full).sum() - 1))
                / (len(ids) * (len(ids) - 1))
            ),
            6,
        ),
        interpretation="Source mixing is confounded by document type and content; paired sensitivity is descriptive, not a controlled text-length experiment.",
    )
    payload = dict(
        version=1,
        ids=ids,
        sources=sources,
        **projections,
        embedding="SPECTER abstract / sampled full-text embeddings",
        parameters={**parameters, "random_state": 42},
        source_sha256=source_hash,
        audit=audit,
    )
    output = ROOT / "public/data/positions-union.json"
    output.write_text(
        json.dumps(payload, ensure_ascii=False, separators=(",", ":")), encoding="utf-8"
    )
    descriptor = dict(
        count=len(ids),
        abstracts=sources.count("abstract"),
        fulltext=sources.count("fulltext"),
        sha256=sha(output),
    )
    (ROOT / "lib/union-release.json").write_text(
        json.dumps(descriptor, indent=2) + "\n", encoding="utf-8"
    )
    diagnostics = np.array(encoder.pop("diagnostics"))
    encoder["diagnostics_summary"] = {
        name: summary(diagnostics[:, i])
        for i, name in enumerate(encoder["diagnostics_columns"])
    }
    record = dict(
        version=1,
        papers=len(ids),
        output_sha256=sha(output),
        source_sha256=source_hash,
        index_sha256=sha(SOURCE / "union_doc_index.csv"),
        raw_catalogue_sha256=raw_hash,
        pipeline_source_sha256={
            name: sha(ROOT / "scripts" / name)
            for name in (
                "build_union_source.py",
                "build_union_embeddings.py",
                "build_union_positions.py",
            )
        },
        coverage=coverage,
        encoder=encoder,
        parameters=payload["parameters"],
        audit=audit,
        sensitivity=sensitivity,
        software=dict(
            numpy=np.__version__, sklearn=sklearn.__version__, umap=umap.__version__
        ),
        references=[
            "https://github.com/allenai/specter",
            "https://umap-learn.readthedocs.io/en/latest/reproducibility.html",
        ],
        limitations=[
            "Abstract-first coverage union; 423 paired full texts do not create extra points or enter the released representation.",
            "The paired cohort has no books. Its source sensitivity does not validate book representations.",
            "Full text is sampled in at most eight 256-word windows; this is not exhaustive full-document encoding.",
            "Four/eight-window sensitivity is a nested subsampling check, not an independent assessment of exhaustive coverage.",
            "SPECTER was trained for titles and abstracts. Applying it to full-text windows is an exploratory extension.",
            "Text source, encoder and cohort change across position modes; gaps and cluster sizes are not direct semantic measurements.",
            "Topic labels remain frozen abstract assignments. More geometry does not imply more topic-model coverage.",
        ],
    )
    (ROOT / "docs/UNION_POSITIONS_AUDIT.json").write_text(
        json.dumps(record, indent=2) + "\n", encoding="utf-8"
    )
    print(
        json.dumps(dict(release=descriptor, sensitivity=sensitivity), indent=2),
        flush=True,
    )


if __name__ == "__main__":
    main()
