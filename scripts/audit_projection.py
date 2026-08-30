#!/usr/bin/env python3
"""Recheck the frozen full-catalogue title projection against its audit record."""

from __future__ import annotations

import json

import numpy as np
from sklearn.manifold import trustworthiness

from build_atlas_data import (
    CATALOGUE_EMBEDDING,
    CATALOGUE_PROJECTION,
    CATALOGUE_PROJECTION_AUDIT,
    neighbour_recall,
)


def main() -> None:
    values = np.load(CATALOGUE_EMBEDDING)
    projection = np.load(CATALOGUE_PROJECTION)
    recorded = json.loads(CATALOGUE_PROJECTION_AUDIT.read_text(encoding="utf-8"))
    measured = {
        "trustworthiness_15": round(
            float(trustworthiness(values, projection, n_neighbors=15, metric="cosine")), 6
        ),
        "trustworthiness_30": round(
            float(trustworthiness(values, projection, n_neighbors=30, metric="cosine")), 6
        ),
        "neighbour_recall_15": round(neighbour_recall(values, projection, 15), 6),
        "neighbour_recall_30": round(neighbour_recall(values, projection, 30), 6),
    }
    assert values.shape == (7076, 768)
    assert projection.shape == (7076, 2)
    assert np.isfinite(values).all() and np.isfinite(projection).all()
    assert measured == {name: recorded[name] for name in measured}
    assert measured["trustworthiness_15"] >= 0.85
    assert recorded["seed_stability"]
    print(json.dumps({"status": "pass", **measured, "seed_stability": recorded["seed_stability"]}, indent=2))


if __name__ == "__main__":
    main()
