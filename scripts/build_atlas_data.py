#!/usr/bin/env python3
"""Build the frozen, browser-ready data release for the JSTOR AI Ethics Atlas."""

from __future__ import annotations

import ast
import hashlib
import json
import math
import platform
import re
import sys
from collections import Counter, defaultdict
from datetime import datetime, timezone
from pathlib import Path

import numpy as np
import pandas as pd
import scipy
from scipy.linalg import orthogonal_procrustes
from scipy.stats import spearmanr
from sklearn import __version__ as sklearn_version
from sklearn.manifold import trustworthiness
from sklearn.metrics import adjusted_mutual_info_score, adjusted_rand_score
from sklearn.neighbors import NearestNeighbors
import umap


ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / "data" / "source"
PUBLIC = ROOT / "public" / "data"
PUBLIC.mkdir(parents=True, exist_ok=True)

PROJECTION = {
    "n_neighbors": 30,
    "min_dist": 0.08,
    "n_components": 2,
    "metric": "cosine",
    "random_state": 42,
}

HIGH_CONTRAST_PALETTE = [
    "#35D7FF", "#FF0F0F", "#AF38FF", "#FFFF0F", "#0CC20C", "#0C85C2",
    "#E0A955", "#FF61CA", "#0FFF9F", "#C26D0C", "#4AC29A", "#616BFF",
    "#C24AAA", "#61A0FF", "#B6E00D", "#FF7661", "#FF0FFF", "#FFD561",
    "#61FFF4", "#FF0F7F", "#0CAAC2", "#0FFF0F", "#92C24A", "#D561FF",
    "#E05568", "#31E060", "#55E0C5", "#C2910C", "#D20DE0", "#FF0FBF",
    "#BFFF0F", "#E0C40D", "#FF618B", "#FF61FF", "#9661FF", "#55BBE0",
    "#3888FF",
]

NETWORK_TOP_PALETTE = dict(zip(range(1, 7), [
    HIGH_CONTRAST_PALETTE[index] for index in (0, 1, 2, 3, 4, 7)
]))
NETWORK_SPLIT_IDS = [
    "1.1", "1.2", "1.3", "1.4", "1.5", "1.6", "1.7",
    "2.1", "2.2", "2.3", "2.4", "2.5", "2.6", "2.7", "2.8",
    "3", "4.1", "4.2", "4.3", "5", "6",
]
NETWORK_SPLIT_PALETTE = dict(zip(NETWORK_SPLIT_IDS, HIGH_CONTRAST_PALETTE[:21]))

EMBEDDINGS = {
    "SPECTER": SOURCE / "specter.npy",
    "SPECTER2": SOURCE / "specter2.npy",
    "S-SciBERT": SOURCE / "s_scibert.npy",
}
CATALOGUE_EMBEDDING = SOURCE / "catalogue_title_specter.npy"
CATALOGUE_METADATA = SOURCE / "catalogue_metadata.jsonl"
CATALOGUE_PROJECTION = SOURCE / "catalogue_title_umap.npy"
CATALOGUE_PROJECTION_AUDIT = SOURCE / "catalogue_title_umap_audit.json"

BER_PALETTE = HIGH_CONTRAST_PALETTE[:26]
LDA_PALETTE = HIGH_CONTRAST_PALETTE

KNOWN_LDA_STABILITY = {
    12: {"coherence": 0.4445, "recurrence": 0.784727},
    22: {"coherence": 0.4273, "recurrence": 0.772238},
    0: {"coherence": 0.5053, "recurrence": 0.739879},
    14: {"coherence": 0.4265, "recurrence": 0.735718},
    30: {"coherence": 0.1814, "recurrence": 0.704233},
    8: {"coherence": 0.8230, "recurrence": 0.608877},
    24: {"coherence": 0.2690, "recurrence": 0.606515},
    26: {"coherence": 0.4290, "recurrence": 0.590758},
    7: {"coherence": 0.5889, "recurrence": 0.304220},
    31: {"coherence": 0.3604, "recurrence": 0.298834},
    15: {"coherence": 0.2505, "recurrence": 0.290810},
    13: {"coherence": 0.3405, "recurrence": 0.290022},
    10: {"coherence": 0.2609, "recurrence": 0.279470},
    5: {"coherence": 0.2386, "recurrence": 0.274820},
    3: {"coherence": 0.2641, "recurrence": 0.186207},
    34: {"coherence": 0.2067, "recurrence": 0.144651},
}

PUBLISHER_PROFILES = [
    {
        "community": 1,
        "name": "Technology / digital",
        "papers": 1267,
        "publishers": [
            ["Springer", 3.7], ["Amsterdam University Press", 3.3],
            ["Addleton Academic Publishers", 2.6], ["UCL Press", 2.5],
            ["Sage Publications, Inc.", 2.3],
        ],
    },
    {
        "community": 2,
        "name": "Philosophy / science",
        "papers": 1164,
        "publishers": [
            ["Springer", 11.6], ["The University of Chicago Press", 5.2],
            ["Wiley", 5.2], ["American Philosophical Association", 4.0],
            ["Penn State University Press", 3.2],
        ],
    },
    {
        "community": 3,
        "name": "Learning / student",
        "papers": 787,
        "publishers": [
            ["Springer", 9.0], ["American Society for Engineering Education", 6.1],
            ["Taylor & Francis, Ltd.", 3.6],
            ["International Forum of Educational Technology & Society", 2.9],
            ["Wiley", 2.9],
        ],
    },
    {
        "community": 4,
        "name": "Artificial intelligence / defence",
        "papers": 856,
        "publishers": [
            ["Inside Washington Publishers", 12.7],
            ["Hague Centre for Strategic Studies", 4.4],
            ["Strategic Studies Institute, US Army War College", 3.5],
            ["Stockholm International Peace Research Institute", 3.0],
            ["Atlantic Council", 2.8],
        ],
    },
    {
        "community": 5,
        "name": "Health / economic",
        "papers": 588,
        "publishers": [
            ["American Economic Association", 6.5], ["Springer", 4.3],
            ["Brill", 3.2], ["BMJ", 3.1], ["World Health Organization", 3.1],
        ],
    },
    {
        "community": 6,
        "name": "Ethics / business",
        "papers": 290,
        "publishers": [
            ["Springer", 22.4], ["Taylor & Francis, Ltd.", 3.4],
            ["Cambridge University Press", 3.1], ["BMJ", 2.8],
            ["Oxford University Press", 2.4],
        ],
    },
]


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def write_json(path: Path, payload: object) -> None:
    path.write_text(
        json.dumps(payload, ensure_ascii=False, separators=(",", ":"), allow_nan=False),
        encoding="utf-8",
    )


def clean(value: object) -> str:
    if value is None or (isinstance(value, float) and math.isnan(value)):
        return ""
    return str(value).strip()


def parse_topic_id(label: str) -> int:
    match = re.search(r":\s*(-?\d+)\s*$", label)
    if not match:
        raise ValueError(f"Cannot parse topic id from {label!r}")
    return int(match.group(1))


def display_lda_label(label: str) -> str:
    base = re.sub(r":\s*-?\d+\s*$", "", label).strip()
    return base[:1].upper() + base[1:]


def parse_lda_memberships(row: pd.Series) -> list[dict[str, float | int]]:
    memberships: dict[int, float] = {
        parse_topic_id(clean(row["dominant_topic"])): float(row["dominance"])
    }
    other = clean(row.get("other_topics", ""))
    for part in filter(None, (piece.strip() for piece in other.split(";"))):
        match = re.match(r"(.+?:\s*-?\d+)\s+\((0?\.\d+|1(?:\.0+)?)\)$", part)
        if not match:
            raise ValueError(f"Cannot parse LDA membership {part!r}")
        memberships[parse_topic_id(match.group(1))] = float(match.group(2))
    return [
        {"topic": int(topic), "value": round(float(value), 3)}
        for topic, value in sorted(memberships.items(), key=lambda item: -item[1])
    ]


def neighbour_indices(values: np.ndarray, k: int, metric: str) -> np.ndarray:
    model = NearestNeighbors(n_neighbors=k + 1, metric=metric, n_jobs=-1)
    return model.fit(values).kneighbors(return_distance=False)[:, 1:]


def neighbour_recall(high: np.ndarray, low: np.ndarray, k: int) -> float:
    high_nn = neighbour_indices(high, k, "cosine")
    low_nn = neighbour_indices(low, k, "euclidean")
    overlap = [len(set(a).intersection(b)) / k for a, b in zip(high_nn, low_nn)]
    return float(np.mean(overlap))


def low_projection_neighbour_overlap(left: np.ndarray, right: np.ndarray, k: int) -> float:
    """Mean per-point overlap between Euclidean neighbourhoods in two projections."""
    left_nn = neighbour_indices(left, k, "euclidean")
    right_nn = neighbour_indices(right, k, "euclidean")
    overlap = [len(set(a).intersection(b)) / k for a, b in zip(left_nn, right_nn)]
    return float(np.mean(overlap))


def distance_rank_correlation(high: np.ndarray, low: np.ndarray, seed: int = 42) -> float:
    rng = np.random.default_rng(seed)
    n_pairs = 40_000
    left = rng.integers(0, len(high), size=n_pairs)
    right = rng.integers(0, len(high), size=n_pairs)
    keep = left != right
    left, right = left[keep], right[keep]
    high_a = high[left]
    high_b = high[right]
    denom = np.linalg.norm(high_a, axis=1) * np.linalg.norm(high_b, axis=1)
    high_dist = 1.0 - np.sum(high_a * high_b, axis=1) / np.clip(denom, 1e-12, None)
    low_dist = np.linalg.norm(low[left] - low[right], axis=1)
    return float(spearmanr(high_dist, low_dist).statistic)


def fit_projection(values: np.ndarray, seed: int) -> np.ndarray:
    params = dict(PROJECTION)
    params["random_state"] = seed
    reducer = umap.UMAP(**params, n_jobs=1)
    return reducer.fit_transform(values).astype(np.float32)


def projection_audit(embeddings: dict[str, np.ndarray]) -> tuple[str, dict, np.ndarray]:
    metrics: dict[str, dict] = {}
    projections: dict[str, np.ndarray] = {}
    for name, values in embeddings.items():
        projection = fit_projection(values, PROJECTION["random_state"])
        projections[name] = projection
        t15 = float(trustworthiness(values, projection, n_neighbors=15, metric="cosine"))
        t30 = float(trustworthiness(values, projection, n_neighbors=30, metric="cosine"))
        r15 = neighbour_recall(values, projection, 15)
        r30 = neighbour_recall(values, projection, 30)
        rho = distance_rank_correlation(values, projection)
        score = 0.35 * t15 + 0.25 * t30 + 0.20 * r15 + 0.10 * r30 + 0.10 * max(rho, 0)
        metrics[name] = {
            "shape": list(values.shape),
            "finite": bool(np.isfinite(values).all()),
            "mean_norm": round(float(np.linalg.norm(values, axis=1).mean()), 6),
            "trustworthiness_15": round(t15, 6),
            "trustworthiness_30": round(t30, 6),
            "neighbour_recall_15": round(r15, 6),
            "neighbour_recall_30": round(r30, 6),
            "distance_spearman": round(rho, 6),
            "quality_score": round(score, 6),
        }

    # Scholarly-paper encoders are preferred for the reference geometry. S-SciBERT
    # remains fully reported as a sensitivity candidate but is not selected solely
    # because it produced the winning clustering run.
    selected = max(("SPECTER", "SPECTER2"), key=lambda name: metrics[name]["quality_score"])
    base = projections[selected]
    centred_base = base - base.mean(axis=0)
    base_scale = np.linalg.norm(centred_base)
    stability_runs = []
    for seed in (43, 44):
        alternate = fit_projection(embeddings[selected], seed)
        centred_alt = alternate - alternate.mean(axis=0)
        rotation, _ = orthogonal_procrustes(centred_alt, centred_base)
        aligned = centred_alt @ rotation
        aligned *= base_scale / max(np.linalg.norm(aligned), 1e-12)
        displacement = np.linalg.norm(aligned - centred_base, axis=1) / max(
            np.ptp(centred_base, axis=0).max(), 1e-12
        )
        stability_runs.append(
            {
                "seed": seed,
                "median_normalized_displacement": round(float(np.median(displacement)), 6),
                "p90_normalized_displacement": round(float(np.quantile(displacement, 0.9)), 6),
                "neighbour_overlap_15": round(
                    low_projection_neighbour_overlap(base, aligned, 15), 6
                ),
            }
        )
    metrics[selected]["seed_stability"] = stability_runs
    metrics[selected]["selected"] = True
    metrics[selected]["selection_rule"] = (
        "Highest projection-quality score among the persisted scholarly-paper encoders."
    )
    return selected, metrics, base


def catalogue_projection_audit(values: np.ndarray) -> tuple[np.ndarray, dict]:
    """Fit and audit the common title-based catalogue geometry."""
    projection = fit_projection(values, PROJECTION["random_state"])
    quality = {
        "shape": list(values.shape),
        "finite": bool(np.isfinite(values).all()),
        "mean_norm": round(float(np.linalg.norm(values, axis=1).mean()), 6),
        "trustworthiness_15": round(
            float(trustworthiness(values, projection, n_neighbors=15, metric="cosine")), 6
        ),
        "trustworthiness_30": round(
            float(trustworthiness(values, projection, n_neighbors=30, metric="cosine")), 6
        ),
        "neighbour_recall_15": round(neighbour_recall(values, projection, 15), 6),
        "neighbour_recall_30": round(neighbour_recall(values, projection, 30), 6),
        "distance_spearman": round(distance_rank_correlation(values, projection), 6),
    }
    alternate = fit_projection(values, 43)
    centred = projection - projection.mean(axis=0)
    centred_alternate = alternate - alternate.mean(axis=0)
    rotation, _ = orthogonal_procrustes(centred_alternate, centred)
    aligned = centred_alternate @ rotation
    aligned *= np.linalg.norm(centred) / max(np.linalg.norm(aligned), 1e-12)
    displacement = np.linalg.norm(aligned - centred, axis=1) / max(
        np.ptp(centred, axis=0).max(), 1e-12
    )
    quality["seed_stability"] = [
        {
            "seed": 43,
            "median_normalized_displacement": round(float(np.median(displacement)), 6),
            "p90_normalized_displacement": round(float(np.quantile(displacement, 0.9)), 6),
            "neighbour_overlap_15": round(
                low_projection_neighbour_overlap(projection, aligned, 15), 6
            ),
        }
    ]
    return projection, quality


def bertopic_topics() -> tuple[dict[int, dict], dict[int, str]]:
    info = pd.read_csv(SOURCE / "bertopic_topic_info.csv")
    topics: dict[int, dict] = {}
    labels: dict[int, str] = {}
    for _, row in info.iterrows():
        topic = int(row["Topic"])
        representation = ast.literal_eval(row["Representation"])
        if topic == -1:
            label = "Unresolved outliers"
            colour = "#CBD5E1"
        else:
            terms = [clean(term) for term in representation[:3]]
            label = " · ".join(terms[:2])
            label = label[:1].upper() + label[1:]
            colour = BER_PALETTE[topic % len(BER_PALETTE)]
        topics[topic] = {
            "id": topic,
            "label": label,
            "terms": representation[:10],
            "count": int(row["Count"]),
            "colour": colour,
        }
        labels[topic] = label
    return topics, labels


def ladder_data() -> tuple[dict[str, int], list[dict]]:
    assignments = pd.read_csv(SOURCE / "abstracts_ladder_final_assignments.csv")
    lookup = {
        clean(row["doc_id"]): int(row["topic_at_final_level"])
        for _, row in assignments.iterrows()
    }
    words = pd.read_csv(SOURCE / "abstracts_ladder_topic_words.csv")
    final = words[words["level"].astype(str) == "10"]
    summaries = []
    counts = Counter(lookup.values())
    for topic in sorted(counts):
        if topic == -1:
            terms = []
            label = "Unresolved outliers"
            colour = "#CBD5E1"
        else:
            rows = final[final["topic"].astype(str) == f"topic_{topic}"].sort_values("rank")
            terms = rows["word"].astype(str).tolist()[:10]
            label = " · ".join(terms[:2])
            label = label[:1].upper() + label[1:]
            colour = BER_PALETTE[topic % len(BER_PALETTE)]
        summaries.append(
            {"id": topic, "label": label, "terms": terms, "count": counts[topic], "colour": colour}
        )
    return lookup, summaries


def lda_data() -> tuple[dict[str, dict], list[dict]]:
    frame = pd.read_csv(SOURCE / "lda_assignments.csv")
    term_frame = pd.read_csv(SOURCE / "lda_topic_terms.csv")
    terms = {int(row["topic_id"]): clean(row["terms"]).split("|") for _, row in term_frame.iterrows()}
    records: dict[str, dict] = {}
    labels: dict[int, str] = {}
    topic_counts: Counter[int] = Counter()
    topic_dominance: defaultdict[int, list[float]] = defaultdict(list)
    for _, row in frame.iterrows():
        topic = parse_topic_id(clean(row["dominant_topic"]))
        labels.setdefault(topic, display_lda_label(clean(row["dominant_topic"])))
        dominance = float(row["dominance"])
        topic_counts[topic] += 1
        topic_dominance[topic].append(dominance)
        records[clean(row["id"])] = {
            "title": clean(row.get("title", "")),
            "journal": clean(row.get("journal", "")),
            "topic": topic,
            "dominance": round(dominance, 3),
            "memberships": parse_lda_memberships(row),
            "topics_above_010": int(row["n_topics_above_floor"]),
        }

    summaries = []
    for topic in range(37):
        stability = KNOWN_LDA_STABILITY.get(topic)
        summaries.append(
            {
                "id": topic,
                "label": labels.get(topic, f"Topic {topic}"),
                "terms": terms.get(topic, []),
                "count": int(topic_counts[topic]),
                "mean_dominance": round(float(np.mean(topic_dominance[topic])), 4)
                if topic_dominance[topic]
                else 0,
                "colour": LDA_PALETTE[topic],
                "stability": stability,
            }
        )
    return records, summaries


def topic_words(path: Path, run_id: int) -> tuple[dict[int, dict], dict[int, str]]:
    frame = pd.read_csv(path)
    if "run_id" in frame.columns:
        frame = frame[frame["run_id"].astype(int) == run_id]
    grouped: defaultdict[int, list[tuple[int, str]]] = defaultdict(list)
    for _, row in frame.iterrows():
        topic = int(str(row["topic"]).replace("topic_", ""))
        grouped[topic].append((int(row["rank"]), clean(row["word"])))
    result = {}
    labels = {}
    for topic, values in grouped.items():
        terms = [term for _, term in sorted(values)][:10]
        label = " · ".join(terms[:2])
        label = label[:1].upper() + label[1:]
        result[topic] = {"id": topic, "label": label, "terms": terms}
        labels[topic] = label
    labels[-1] = "Unresolved outliers"
    result[-1] = {"id": -1, "label": labels[-1], "terms": []}
    return result, labels


def assignment_provenance(topic: int, probability: float) -> str:
    if topic == -1:
        return "outlier"
    if probability <= 0:
        return "reassigned"
    return "core"


def cross_method_alignment(frame: pd.DataFrame) -> tuple[dict[str, float], dict]:
    valid = frame[(frame["bertopic"] >= 0) & frame["lda"].notna()].copy()
    valid["lda"] = valid["lda"].astype(int)
    cells = valid.groupby(["bertopic", "lda"]).size().rename("count").reset_index()
    row_counts = valid.groupby("bertopic").size().to_dict()
    col_counts = valid.groupby("lda").size().to_dict()
    cell_lookup = {(int(r.bertopic), int(r.lda)): int(r["count"]) for _, r in cells.iterrows()}
    alignment = {}
    for _, row in valid.iterrows():
        b, l = int(row["bertopic"]), int(row["lda"])
        count = cell_lookup[(b, l)]
        score = math.sqrt(count / row_counts[b] * count / col_counts[l])
        alignment[clean(row["doc_id"])] = round(score, 4)
    metrics = {
        "n": int(len(valid)),
        "ari": round(float(adjusted_rand_score(valid["bertopic"], valid["lda"])), 6),
        "ami": round(float(adjusted_mutual_info_score(valid["bertopic"], valid["lda"])), 6),
        "cells": [
            {"bertopic": int(r.bertopic), "lda": int(r.lda), "count": int(r["count"])}
            for _, r in cells.iterrows()
        ],
        "alignment_definition": (
            "Geometric mean of the cell share within its BERTopic topic and within its LDA topic. "
            "It measures local cross-method concentration, not substantive topic equivalence."
        ),
    }
    return alignment, metrics


def load_catalogue_metadata() -> list[dict]:
    with CATALOGUE_METADATA.open("r", encoding="utf-8") as handle:
        return [json.loads(line) for line in handle if line.strip()]


def neighbourhood_agreement(
    index: pd.DataFrame,
    bert_lookup: dict[str, dict],
    lda_lookup: dict[str, dict],
) -> dict[str, float | None]:
    """Jaccard overlap of same-topic neighbours in local abstract-SPECTER neighbourhoods."""
    eligible_positions = [
        position
        for position, doc_id in enumerate(index["doc_id"])
        if int(bert_lookup[doc_id]["topic"]) >= 0 and doc_id in lda_lookup
    ]
    abstract_embeddings = np.load(SOURCE / "specter.npy")[eligible_positions]
    ids = [clean(index.iloc[position]["doc_id"]) for position in eligible_positions]
    neighbours = neighbour_indices(abstract_embeddings, 30, "cosine")
    result: dict[str, float | None] = {}
    for row_index, doc_id in enumerate(ids):
        focal_ber = int(bert_lookup[doc_id]["topic"])
        focal_lda = int(lda_lookup[doc_id]["topic"])
        ber_set = {
            int(neighbour)
            for neighbour in neighbours[row_index]
            if int(bert_lookup[ids[int(neighbour)]]["topic"]) == focal_ber
        }
        lda_set = {
            int(neighbour)
            for neighbour in neighbours[row_index]
            if int(lda_lookup[ids[int(neighbour)]]["topic"]) == focal_lda
        }
        union = ber_set | lda_set
        result[doc_id] = round(len(ber_set & lda_set) / len(union), 4) if union else None
    return result


def facet_counts(points: list[dict], field: str, many: bool = False) -> list[dict]:
    counts: Counter[str] = Counter()
    for point in points:
        values = point.get(field, []) if many else [point.get(field, "")]
        counts.update(value for value in values if value)
    return [
        {"value": value, "count": int(count)}
        for value, count in sorted(counts.items(), key=lambda item: (-item[1], item[0].casefold()))
    ]


def build_map(projection: np.ndarray, projection_quality: dict) -> tuple[dict, dict]:
    catalogue = load_catalogue_metadata()
    index = pd.read_csv(SOURCE / "doc_index.csv").sort_values("row_index").reset_index(drop=True)
    bert = pd.read_csv(SOURCE / "bertopic_assignments.csv")
    if len(catalogue) != len(projection) or len(catalogue) != 7076:
        raise AssertionError(f"Catalogue rows {len(catalogue)} != projection rows {len(projection)}")
    if len({item["id"] for item in catalogue}) != len(catalogue):
        raise AssertionError("Catalogue document IDs must be unique")
    if index["doc_id"].duplicated().any() or bert["doc_id"].duplicated().any():
        raise AssertionError("Abstract model document IDs must be unique")
    if set(index["doc_id"]) != set(bert["doc_id"]):
        raise AssertionError("BERTopic assignments do not cover the abstract embedding index exactly")

    bert_topics, bert_labels = bertopic_topics()
    ladder_lookup, ladder_topics = ladder_data()
    lda_lookup, lda_topics = lda_data()
    bert_lookup = bert.set_index("doc_id").to_dict("index")
    abstract_index = index.set_index("doc_id").to_dict("index")
    agreement = neighbourhood_agreement(index, bert_lookup, lda_lookup)

    journal_names: defaultdict[str, Counter[str]] = defaultdict(Counter)
    for record in catalogue:
        journal_id = clean(record.get("journal_id", ""))
        journal = clean(lda_lookup.get(clean(record["id"]), {}).get("journal", ""))
        if journal_id and journal:
            journal_names[journal_id][journal] += 1
    journal_lookup = {}
    ambiguous_journal_ids = []
    for journal_id, names in journal_names.items():
        normalized = {name.casefold() for name in names}
        if len(normalized) == 1:
            journal_lookup[journal_id] = names.most_common(1)[0][0]
        else:
            ambiguous_journal_ids.append(journal_id)

    joined = pd.DataFrame(
        {
            "doc_id": index["doc_id"],
            "bertopic": [int(bert_lookup[doc]["topic"]) for doc in index["doc_id"]],
            "lda": [lda_lookup.get(doc, {}).get("topic", np.nan) for doc in index["doc_id"]],
        }
    )
    _, comparison = cross_method_alignment(joined)

    author_documents: defaultdict[str, set[str]] = defaultdict(set)
    for record in catalogue:
        for author in record["authors"]:
            author_documents[author].add(record["id"])

    points = []
    provenance_counts: Counter[str] = Counter()
    for position, record in enumerate(catalogue):
        doc_id = clean(record["id"])
        b = bert_lookup.get(doc_id)
        lda = lda_lookup.get(doc_id)
        direct_journal = clean(lda.get("journal", "")) if lda else ""
        point = {
            "i": position,
            "id": doc_id,
            "x": round(float(projection[position, 0]), 5),
            "y": round(float(projection[position, 1]), 5),
            "title": clean(record["title"]),
            "year": clean(record.get("year", "")),
            "type": clean(record.get("type", "")),
            "publisher": clean(record.get("publisher", "")),
            "journal": direct_journal or journal_lookup.get(clean(record.get("journal_id", "")), ""),
            "authors": record.get("authors", []),
            "keywords": record.get("keywords", []),
            "coauthor_count": len(
                set().union(*(author_documents[name] for name in record.get("authors", [])))
                - {doc_id}
            ) if record.get("authors") else 0,
            "neighbour_agreement": agreement.get(doc_id),
        }
        if b:
            b_topic = int(b["topic"])
            provenance_counts[assignment_provenance(
                b_topic, float(b["probability_pre_outlier_reduction"])
            )] += 1
            point["bertopic"] = b_topic
            point["bertopic_reduced"] = int(ladder_lookup.get(doc_id, -1))
            source_row = abstract_index.get(doc_id)
            if source_row:
                point["preview"] = clean(source_row.get("preview", ""))
        if lda:
            point["lda_topic"] = int(lda["topic"])
        points.append(point)

    agreement_values = [value for value in agreement.values() if value is not None]
    payload = {
        "release": "2026-08-30",
        "cohort": {
            "label": "Complete catalogue",
            "n": len(points),
            "catalogue_n": len(points),
            "coverage": {
                "bertopic": sum("bertopic" in point for point in points),
                "lda": sum("lda_topic" in point for point in points),
                "neighbour_agreement": len(agreement_values),
                "publisher": sum(bool(point["publisher"]) for point in points),
                "journal": sum(bool(point["journal"]) for point in points),
                "keywords": sum(bool(point["keywords"]) for point in points),
                "authors": sum(bool(point["authors"]) for point in points),
            },
        },
        "geometry": {
            "embedding": "SPECTER title embeddings",
            "projection": "UMAP",
            "parameters": PROJECTION,
            "quality": projection_quality,
            "bounds": {
                "x": [round(float(projection[:, 0].min()), 5), round(float(projection[:, 0].max()), 5)],
                "y": [round(float(projection[:, 1].min()), 5), round(float(projection[:, 1].max()), 5)],
            },
            "interpretation": (
                "Local proximity approximates title-semantic neighbourhoods. Axis direction, "
                "orientation, area and empty space have no intrinsic meaning."
            ),
        },
        "topics": {
            "bertopic": list(bert_topics.values()),
            "bertopic_reduced": ladder_topics,
            "lda": lda_topics,
        },
        "facets": {
            "publishers": facet_counts(points, "publisher"),
            "journals": facet_counts(points, "journal"),
            "keywords": facet_counts(points, "keywords", many=True),
            "maximum_selection": 30,
        },
        "agreement": {
            "eligible": len(agreement_values),
            "minimum": round(min(agreement_values), 4),
            "median": round(float(np.median(agreement_values)), 4),
            "maximum": round(max(agreement_values), 4),
            "definition": (
                "Jaccard overlap between BERTopic- and LDA-same-topic sets among each paper's "
                "30 nearest neighbours in the abstract SPECTER embedding."
            ),
        },
        "points": points,
    }
    audit = {
        "embedding_rows": len(catalogue),
        "unique_ids": len({item["id"] for item in catalogue}),
        "bertopic_rows": len(bert),
        "lda_joined": sum("lda_topic" in point for point in points),
        "agreement_eligible": len(agreement_values),
        "journal_direct": sum(bool(clean(lda_lookup.get(point["id"], {}).get("journal", ""))) for point in points),
        "journal_propagated": sum(bool(point["journal"]) and not bool(clean(lda_lookup.get(point["id"], {}).get("journal", ""))) for point in points),
        "journal_identifier_names": len(journal_lookup),
        "journal_identifier_ambiguous": len(ambiguous_journal_ids),
        "bertopic_outliers": int((bert["topic"] == -1).sum()),
        "provenance_counts": dict(provenance_counts),
        "cross_method": comparison,
        "bertopic_labels": bert_labels,
    }
    return payload, audit


def selected_assignments(cohort: str) -> pd.DataFrame:
    frame = pd.read_csv(SOURCE / f"{cohort}_selected_assignments.csv")
    frame["topic"] = frame["topic"].astype(int)
    frame["probability_pre_outlier_reduction"] = frame[
        "probability_pre_outlier_reduction"
    ].astype(float)
    return frame


def build_methods(map_audit: dict) -> dict:
    lda_lookup, lda_topics = lda_data()
    abstract_topics, _ = topic_words(SOURCE / "abstracts_selected_topic_words.csv", 30)
    abs_paired_topics, abs_paired_labels = topic_words(
        SOURCE / "abstracts_paired_selected_topic_words.csv", 14
    )
    full_paired_topics, full_paired_labels = topic_words(
        SOURCE / "fulltext_paired_selected_topic_words.csv", 23
    )
    abs_paired = selected_assignments("abstracts_paired")
    full_paired = selected_assignments("fulltext_paired")
    paired = abs_paired.merge(
        full_paired,
        on="doc_id",
        how="inner",
        suffixes=("_abstract", "_fulltext"),
        validate="one_to_one",
    )
    if len(paired) != 423:
        raise AssertionError(f"Expected 423 paired papers, found {len(paired)}")
    paired_valid = paired[(paired["topic_abstract"] >= 0) & (paired["topic_fulltext"] >= 0)]
    pair_cells = (
        paired.groupby(["topic_abstract", "topic_fulltext"]).size().rename("count").reset_index()
    )
    pair_records = []
    for _, row in paired.iterrows():
        doc_id = clean(row["doc_id"])
        lda = lda_lookup.get(doc_id, {})
        pair_records.append(
            {
                "id": doc_id,
                "title": lda.get("title") or f"JSTOR record {doc_id.rsplit('/', 1)[-1]}",
                "abstract_topic": int(row["topic_abstract"]),
                "fulltext_topic": int(row["topic_fulltext"]),
                "abstract_provenance": assignment_provenance(
                    int(row["topic_abstract"]), float(row["probability_pre_outlier_reduction_abstract"])
                ),
                "fulltext_provenance": assignment_provenance(
                    int(row["topic_fulltext"]), float(row["probability_pre_outlier_reduction_fulltext"])
                ),
            }
        )

    metrics = pd.read_csv(SOURCE / "selected_model_metrics.csv")
    metric_fields = [
        "cohort", "run_id", "embedding", "pooling", "umap_n_neighbors",
        "hdbscan_min_cluster_size", "n_topics", "outlier_pct_after",
        "silhouette", "silhouette_emb", "topic_diversity", "npmi_coherence",
    ]
    model_rows = []
    for _, row in metrics.iterrows():
        record = {}
        for field in metric_fields:
            value = row.get(field)
            if pd.isna(value):
                record[field] = None
            elif field in {"cohort", "embedding", "pooling"}:
                record[field] = clean(value)
            elif field in {"run_id", "umap_n_neighbors", "hdbscan_min_cluster_size", "n_topics"}:
                record[field] = int(float(value))
            else:
                record[field] = round(float(value), 6)
        model_rows.append(record)

    return {
        "cross_method": map_audit["cross_method"],
        "paired": {
            "eligible_n": 423,
            "both_non_outlier_n": int(len(paired_valid)),
            "fulltext_assigned_n": int((paired["topic_fulltext"] >= 0).sum()),
            "ari_non_outliers": round(
                float(adjusted_rand_score(paired_valid["topic_abstract"], paired_valid["topic_fulltext"])), 6
            ),
            "ami_non_outliers": round(
                float(adjusted_mutual_info_score(paired_valid["topic_abstract"], paired_valid["topic_fulltext"])), 6
            ),
            "cells": [
                {
                    "abstract": int(row["topic_abstract"]),
                    "fulltext": int(row["topic_fulltext"]),
                    "count": int(row["count"]),
                }
                for _, row in pair_cells.iterrows()
            ],
            "papers": pair_records,
            "abstract_topics": list(abs_paired_topics.values()),
            "fulltext_topics": list(full_paired_topics.values()),
        },
        "topics": {
            "abstract": list(abstract_topics.values()),
            "lda": lda_topics,
        },
        "selected_models": model_rows,
        "cautions": [
            "The abstract and full-text selected models use different encoders and hyperparameters.",
            "NPMI values use source-specific reference corpora and are not directly comparable across sources.",
            "UMAP-space silhouette is descriptive of the visualization used for clustering; encoder-space silhouette is the less circular separation check.",
            "The paired analyses are single selected fits and do not provide variance estimates.",
        ],
    }


def build_network() -> tuple[dict, dict]:
    source = json.loads((SOURCE / "keyword_graph.json").read_text(encoding="utf-8"))
    full = source["full"]
    bipartite = source["bipartite"]
    meta = source["meta"]
    # Retain community identities while applying the audited dark-field palette.
    for node in full["nodes"]:
        node["topColour"] = NETWORK_TOP_PALETTE[int(node["topCommunity"])]
        node["splitColour"] = NETWORK_SPLIT_PALETTE[str(node["splitCommunity"])]
    for node in bipartite["nodes"]:
        if node.get("kind") == "keyword":
            full_node = next(item for item in full["nodes"] if item["id"] == node["id"])
            node["topColour"] = full_node["topColour"]
            node["splitColour"] = full_node["splitColour"]
    for item in meta["topCommunities"]:
        item["colour"] = NETWORK_TOP_PALETTE[int(item["id"])]
    for item in meta["splitCommunities"]:
        item["colour"] = NETWORK_SPLIT_PALETTE[str(item["id"])]
    if len(full["nodes"]) != 534 or len(full["edges"]) != 4474:
        raise AssertionError("Keyword graph counts differ from the frozen source")
    if len(bipartite["nodes"]) != 1735 or len(bipartite["edges"]) != 9330:
        raise AssertionError("Keyword–journal graph counts differ from the frozen source")
    keyword_nodes = [node for node in bipartite["nodes"] if node.get("kind") == "keyword"]
    journal_nodes = [node for node in bipartite["nodes"] if node.get("kind") == "journal"]
    payload = {
        "release": "2026-08-30",
        "full": full,
        "bipartite": bipartite,
        "meta": meta,
        "method": {
            "edge_definition": "Keywords are connected when they co-occur in a paper.",
            "weight_definition": "Published keyword graph weight used by the source visualization.",
            "threshold": "Keywords retained after the published occurrence and cleaning pipeline.",
        },
    }
    audit = {
        "keyword_nodes": len(full["nodes"]),
        "keyword_edges": len(full["edges"]),
        "bipartite_nodes": len(bipartite["nodes"]),
        "bipartite_edges": len(bipartite["edges"]),
        "bipartite_keyword_nodes": len(keyword_nodes),
        "bipartite_journal_nodes": len(journal_nodes),
        "top_communities": len(meta["topCommunities"]),
        "split_communities": len(meta["splitCommunities"]),
    }
    return payload, audit


def build_publishing(network_meta: dict) -> dict:
    colour_lookup = {
        int(item["id"]): item["colour"] for item in network_meta["topCommunities"]
    }
    profiles = []
    for profile in PUBLISHER_PROFILES:
        profiles.append(
            {
                **profile,
                "colour": colour_lookup[profile["community"]],
                "publishers": [
                    {"name": name, "share": share} for name, share in profile["publishers"]
                ],
            }
        )
    return {
        "publisher_profiles": profiles,
        "publisher_scope": (
            "Aggregate percentage of papers within each top-level keyword community. "
            "The current release does not infer a paper-level publisher join."
        ),
        "journal_scope": (
            "The journal–keyword network contains 1,201 journals and 9,330 weighted associations."
        ),
    }


def source_manifest() -> list[dict]:
    descriptions = {
        "specter.npy": "Persisted abstract SPECTER embeddings",
        "specter2.npy": "Persisted abstract SPECTER2 embeddings",
        "s_scibert.npy": "Persisted abstract S-SciBERT embeddings",
        "doc_index.csv": "Canonical abstract embedding row index",
        "bertopic_assignments.csv": "Final abstract BERTopic assignments",
        "bertopic_topic_info.csv": "Final abstract BERTopic topic metadata",
        "bertopic_topic_words.csv": "Final abstract BERTopic terms",
        "lda_assignments.csv": "Final interpretable LDA assignment export",
        "lda_topic_terms.csv": "Final LDA top-word table transcribed from the executed notebook output",
        "keyword_graph.json": "Frozen keyword and keyword–journal graph export",
        "publisher_community_source.png": "Source figure for publisher/community aggregates",
    }
    result = []
    for path in sorted(SOURCE.iterdir()):
        if path.is_file():
            result.append(
                {
                    "file": path.name,
                    "description": descriptions.get(path.name, "Frozen analysis source artifact"),
                    "bytes": path.stat().st_size,
                    "sha256": sha256(path),
                }
            )
    return result


def main() -> None:
    catalogue_embeddings = np.load(CATALOGUE_EMBEDDING)
    if catalogue_embeddings.shape != (7076, 768):
        raise AssertionError(f"Unexpected catalogue embedding shape: {catalogue_embeddings.shape}")
    if CATALOGUE_PROJECTION.exists() and CATALOGUE_PROJECTION_AUDIT.exists():
        projection = np.load(CATALOGUE_PROJECTION)
        projection_quality = json.loads(CATALOGUE_PROJECTION_AUDIT.read_text(encoding="utf-8"))
    else:
        projection, projection_quality = catalogue_projection_audit(catalogue_embeddings)
        np.save(CATALOGUE_PROJECTION, projection)
        write_json(CATALOGUE_PROJECTION_AUDIT, projection_quality)
    if projection.shape != (7076, 2) or not np.isfinite(projection).all():
        raise AssertionError(f"Unexpected catalogue projection shape or values: {projection.shape}")
    map_payload, map_audit = build_map(projection, projection_quality)
    methods_payload = build_methods(map_audit)
    network_payload, network_audit = build_network()
    publishing_payload = build_publishing(network_payload["meta"])

    write_json(PUBLIC / "map.json", map_payload)
    write_json(PUBLIC / "methods.json", methods_payload)
    write_json(PUBLIC / "network.json", network_payload)
    write_json(PUBLIC / "publishing.json", publishing_payload)

    derived = []
    for path in sorted(PUBLIC.glob("*.json")):
        if path.name == "manifest.json":
            continue
        derived.append(
            {"file": path.name, "bytes": path.stat().st_size, "sha256": sha256(path)}
        )
    manifest = {
        "release": "2026-08-30",
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "software": {
            "python": platform.python_version(),
            "numpy": np.__version__,
            "pandas": pd.__version__,
            "scipy": scipy.__version__,
            "scikit_learn": sklearn_version,
            "umap_learn": umap.__version__,
        },
        "cohorts": {
            "catalogue": 7076,
            "abstract_model": 2057,
            "abstract_lda": 2052,
            "fulltext_model": 1789,
            "paired_eligible": 423,
            "paired_fulltext_assigned": 389,
        },
        "projection_candidates": {"SPECTER title embeddings": projection_quality},
        "selected_geometry": "SPECTER title embeddings",
        "map_audit": {k: v for k, v in map_audit.items() if k not in {"cross_method", "bertopic_labels"}},
        "network_audit": network_audit,
        "sources": source_manifest(),
        "derived": derived,
        "limitations": [
            "The common semantic terrain uses titles because titles are the only semantic text field available for all 7,076 records.",
            "BERTopic covers 2,057 records and the released abstract-only LDA model covers 2,052.",
            "Journal titles are propagated only through unambiguous exact JSTOR journal identifiers established by named source records.",
            "Controlled keywords are exact normalized intersections with the frozen 534-keyword network vocabulary.",
            "Per-topic LDA stability is available for the most and least stable published topics; the complete stability table was not distributed with this release.",
            "Creator strings and publisher names are retained as supplied and are not authority-normalized.",
            "The paired abstract/full-text comparison changes both document source and selected model configuration.",
        ],
    }
    write_json(PUBLIC / "manifest.json", manifest)
    print(json.dumps({
        "selected_geometry": "SPECTER title embeddings",
        "projection_metrics": projection_quality,
        "map_audit": manifest["map_audit"],
        "network_audit": network_audit,
        "derived": derived,
    }, indent=2))


if __name__ == "__main__":
    try:
        main()
    except Exception as exc:
        print(f"Data build failed: {exc}", file=sys.stderr)
        raise
