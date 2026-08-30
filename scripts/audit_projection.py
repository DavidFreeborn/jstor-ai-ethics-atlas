#!/usr/bin/env python3
"""Sensitivity audit for the atlas reference projection."""

from __future__ import annotations

import json
from itertools import product

import numpy as np
from scipy.linalg import orthogonal_procrustes
from sklearn.manifold import trustworthiness
from sklearn.neighbors import NearestNeighbors
import umap

from build_atlas_data import SOURCE, neighbour_recall


def low_neighbours(values: np.ndarray, k: int = 15) -> np.ndarray:
    return NearestNeighbors(n_neighbors=k + 1, metric="euclidean").fit(values).kneighbors(return_distance=False)[:, 1:]


def overlap(left: np.ndarray, right: np.ndarray) -> float:
    k = left.shape[1]
    return float(np.mean([len(set(a).intersection(b)) / k for a, b in zip(left, right)]))


def align(base: np.ndarray, alternate: np.ndarray) -> tuple[float, float]:
    base_c = base - base.mean(axis=0)
    alt_c = alternate - alternate.mean(axis=0)
    rotation, _ = orthogonal_procrustes(alt_c, base_c)
    fitted = alt_c @ rotation
    fitted *= np.linalg.norm(base_c) / max(np.linalg.norm(fitted), 1e-12)
    displacement = np.linalg.norm(fitted - base_c, axis=1) / max(np.ptp(base_c, axis=0).max(), 1e-12)
    return float(np.median(displacement)), float(np.quantile(displacement, 0.9))


def main() -> None:
    values = np.load(SOURCE / "specter.npy")
    results = []
    for neighbours, min_dist in product((20, 30, 50, 75), (0.08, 0.20)):
        runs = []
        for seed in (42, 43, 44):
            projection = umap.UMAP(n_neighbors=neighbours, min_dist=min_dist, n_components=2, metric="cosine", random_state=seed, n_jobs=1).fit_transform(values).astype(np.float32)
            runs.append(projection)
        base_nn = low_neighbours(runs[0])
        medians, p90s, overlaps = [], [], []
        for alternate in runs[1:]:
            median, p90 = align(runs[0], alternate)
            medians.append(median)
            p90s.append(p90)
            overlaps.append(overlap(base_nn, low_neighbours(alternate)))
        quality = 0.55 * trustworthiness(values, runs[0], n_neighbors=15, metric="cosine") + 0.25 * neighbour_recall(values, runs[0], 15) + 0.20 * float(np.mean(overlaps))
        results.append({
            "n_neighbors": neighbours,
            "min_dist": min_dist,
            "trustworthiness_15": round(float(trustworthiness(values, runs[0], n_neighbors=15, metric="cosine")), 6),
            "neighbour_recall_15": round(neighbour_recall(values, runs[0], 15), 6),
            "seed_neighbour_overlap_15_mean": round(float(np.mean(overlaps)), 6),
            "seed_median_displacement_mean": round(float(np.mean(medians)), 6),
            "seed_p90_displacement_mean": round(float(np.mean(p90s)), 6),
            "robustness_score": round(float(quality), 6),
        })
    print(json.dumps(sorted(results, key=lambda row: row["robustness_score"], reverse=True), indent=2))


if __name__ == "__main__":
    main()
