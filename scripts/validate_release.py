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
    assert atlas["cohort"]["n"] == len(points) == 7076
    assert atlas["cohort"]["catalogue_n"] == 7076
    assert len({paper["id"] for paper in points}) == len(points)
    assert all(math.isfinite(paper[axis]) for paper in points for axis in ("x", "y"))
    coverage = atlas["cohort"]["coverage"]
    assert coverage == {
        "bertopic": 2057,
        "lda": 2052,
        "neighbour_agreement": 1797,
        "publisher": 7076,
        "journal": 3784,
        "keywords": 6023,
        "authors": 5265,
    }
    assert sum(topic["count"] for topic in atlas["topics"]["bertopic"]) == 2057
    assert sum(topic["count"] for topic in atlas["topics"]["bertopic_reduced"]) == 2057
    assert sum(topic["count"] for topic in atlas["topics"]["lda"]) == 2052
    assert sum("bertopic" in paper for paper in points) == 2057
    assert sum("lda_topic" in paper for paper in points) == 2052
    assert sum(bool(paper["journal"]) for paper in points) == 3784
    assert manifest["map_audit"]["journal_direct"] == 2015
    assert manifest["map_audit"]["journal_propagated"] == 1769
    assert manifest["map_audit"]["journal_identifier_ambiguous"] == 2
    assert sum(bool(paper["keywords"]) for paper in points) == 6023
    assert sum(bool(paper["authors"]) for paper in points) == 5265
    assert all(paper["title"] and paper["publisher"] for paper in points)
    assert atlas["geometry"]["parameters"]["n_neighbors"] == 30
    assert atlas["geometry"]["parameters"]["min_dist"] == 0.08
    quality = atlas["geometry"]["quality"]
    assert quality["trustworthiness_15"] >= 0.85
    assert quality["finite"] is True
    assert all(0 <= item["neighbour_overlap_15"] <= 1 for item in quality["seed_stability"])

    agreement = [paper["neighbour_agreement"] for paper in points if paper["neighbour_agreement"] is not None]
    assert len(agreement) == coverage["neighbour_agreement"]
    assert all(0 <= value <= 1 for value in agreement)
    assert min(agreement) == atlas["agreement"]["minimum"]
    assert max(agreement) == atlas["agreement"]["maximum"]

    for field, source_field, many in (
        ("publishers", "publisher", False),
        ("journals", "journal", False),
        ("keywords", "keywords", True),
    ):
        observed = Counter()
        for paper in points:
            values = paper[source_field] if many else [paper[source_field]]
            observed.update(value for value in values if value)
        released = {item["value"]: item["count"] for item in atlas["facets"][field]}
        assert released == observed

    author_documents = {}
    for paper in points:
        for author in paper["authors"]:
            author_documents.setdefault(author, set()).add(paper["id"])
    for paper in points:
        connected = set().union(*(author_documents[author] for author in paper["authors"])) - {paper["id"]} if paper["authors"] else set()
        assert paper["coauthor_count"] == len(connected)

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
        "checks": 51,
        "papers": len(points),
        "method_comparison": methods["cross_method"]["n"],
        "paired": methods["paired"]["eligible_n"],
        "keywords": len(keyword_ids),
        "journals": sum(node["kind"] == "journal" for node in network["bipartite"]["nodes"]),
        "manifest_artifacts": len(derived),
    }, indent=2))


if __name__ == "__main__":
    main()
