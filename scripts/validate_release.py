#!/usr/bin/env python3
"""Fail-fast integrity checks for browser-ready atlas artifacts."""

from __future__ import annotations

import hashlib
import json
import math
from collections import Counter
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
PUBLIC = ROOT / "public" / "data"


def load(name: str) -> dict:
    return json.loads((PUBLIC / name).read_text(encoding="utf-8"))


def sha256(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def main() -> None:
    atlas = load("map.json")
    methods = load("methods.json")
    network = load("network.json")
    publishing = load("publishing.json")
    manifest = load("manifest.json")

    points = atlas["points"]
    assert atlas["cohort"]["n"] == len(points) == 2057
    assert atlas["cohort"]["catalogue_n"] == 7076
    assert len({paper["id"] for paper in points}) == len(points)
    assert all(math.isfinite(paper[axis]) for paper in points for axis in ("x", "y"))
    assert Counter(paper["provenance"] for paper in points) == Counter({"core": 1107, "reassigned": 708, "outlier": 242})
    assert sum(topic["count"] for topic in atlas["topics"]["bertopic"]) == len(points)
    assert sum(topic["count"] for topic in atlas["topics"]["bertopic_reduced"]) == len(points)
    assert sum(topic["count"] for topic in atlas["topics"]["lda"]) == 2052
    assert sum("lda" in paper for paper in points) == 2051
    assert atlas["geometry"]["parameters"]["n_neighbors"] == 30
    assert atlas["geometry"]["parameters"]["min_dist"] == 0.08
    quality = atlas["geometry"]["quality"]
    assert quality["trustworthiness_15"] >= 0.85
    assert min(item["neighbour_overlap_15"] for item in quality["seed_stability"]) >= 0.45

    assert methods["cross_method"]["n"] == sum(cell["count"] for cell in methods["cross_method"]["cells"]) == 1810
    assert methods["paired"]["eligible_n"] == 423
    assert methods["paired"]["fulltext_assigned_n"] == 389
    paired_non_outlier = sum(cell["count"] for cell in methods["paired"]["cells"] if cell["abstract"] >= 0 and cell["fulltext"] >= 0)
    assert methods["paired"]["both_non_outlier_n"] == paired_non_outlier == 383
    assert sum(cell["count"] for cell in methods["paired"]["cells"]) == 423
    assert len(methods["topics"]["lda"]) == 37
    assert all(len(topic["terms"]) == 10 for topic in methods["topics"]["lda"])

    keyword_ids = {node["id"] for node in network["full"]["nodes"]}
    bipartite_ids = {node["id"] for node in network["bipartite"]["nodes"]}
    assert len(keyword_ids) == 534 and len(network["full"]["edges"]) == 4474
    assert len(bipartite_ids) == 1735 and len(network["bipartite"]["edges"]) == 9330
    assert all(edge["source"] in keyword_ids and edge["target"] in keyword_ids for edge in network["full"]["edges"])
    assert all(edge["source"] in bipartite_ids and edge["target"] in bipartite_ids for edge in network["bipartite"]["edges"])
    assert len(network["meta"]["topCommunities"]) == 6
    assert len(network["meta"]["splitCommunities"]) == 21

    assert len(publishing["publisher_profiles"]) == 6
    assert all(len(profile["publishers"]) == 5 for profile in publishing["publisher_profiles"])
    assert all(profile["publishers"] == sorted(profile["publishers"], key=lambda row: row["share"], reverse=True) for profile in publishing["publisher_profiles"])

    derived = {item["file"]: item for item in manifest["derived"]}
    for name in ("map.json", "methods.json", "network.json", "publishing.json"):
        path = PUBLIC / name
        assert derived[name]["bytes"] == path.stat().st_size
        assert derived[name]["sha256"] == sha256(path)
    print(json.dumps({
        "status": "pass",
        "checks": 31,
        "papers": len(points),
        "method_comparison": methods["cross_method"]["n"],
        "paired": methods["paired"]["eligible_n"],
        "keywords": len(keyword_ids),
        "journals": sum(node["kind"] == "journal" for node in network["bipartite"]["nodes"]),
        "manifest_artifacts": len(derived),
    }, indent=2))


if __name__ == "__main__":
    main()
