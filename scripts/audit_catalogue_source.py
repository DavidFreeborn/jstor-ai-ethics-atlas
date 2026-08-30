"""Audit catalogue metadata coverage before building paper-level atlas lenses.

The source JSONL is large, so this script streams it and writes a compact,
reproducible coverage report. It intentionally never reads or exports full text.
"""

from __future__ import annotations

import argparse
import csv
import gzip
import json
import sys
from collections import Counter
from pathlib import Path


def clean(value: object) -> str:
    return " ".join(str(value or "").split()).strip()


def as_list(value: object) -> list[str]:
    if value is None:
        return []
    if isinstance(value, list):
        return [clean(item) for item in value if clean(item)]
    text = clean(value)
    return [text] if text else []


def normalise_phrase(value: object) -> str:
    return clean(value).casefold()


def load_ids(path: Path, field: str) -> set[str]:
    with path.open("r", encoding="utf-8-sig", newline="") as handle:
        return {clean(row[field]) for row in csv.DictReader(handle) if clean(row.get(field))}


def percentile(values: list[int], proportion: float) -> int:
    if not values:
        return 0
    ordered = sorted(values)
    return ordered[round((len(ordered) - 1) * proportion)]


def main() -> None:
    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    parser = argparse.ArgumentParser()
    parser.add_argument("--source", type=Path, default=Path("data/source/jstor_catalogue.jsonl.gz"))
    parser.add_argument("--doc-index", type=Path, default=Path("data/source/doc_index.csv"))
    parser.add_argument("--lda", type=Path, default=Path("data/source/lda_assignments.csv"))
    parser.add_argument("--keyword-graph", type=Path, default=Path("data/source/keyword_graph.json"))
    parser.add_argument("--output", type=Path, default=Path("data/source/catalogue_coverage_audit.json"))
    args = parser.parse_args()

    mapped_ids = load_ids(args.doc_index, "doc_id")
    journal_ids = load_ids(args.lda, "id")
    with args.lda.open("r", encoding="utf-8-sig", newline="") as handle:
        journal_value_ids = {
            clean(row["id"])
            for row in csv.DictReader(handle)
            if clean(row.get("id")) and clean(row.get("journal"))
        }
    with args.keyword_graph.open("r", encoding="utf-8") as handle:
        graph = json.load(handle)
    controlled_keywords = {
        normalise_phrase(node["id"])
        for node in graph["full"]["nodes"]
        if normalise_phrase(node.get("id"))
    }

    counts: Counter[str] = Counter()
    doc_types: Counter[str] = Counter()
    publishers: Counter[str] = Counter()
    mapped_publishers: Counter[str] = Counter()
    raw_keywords: Counter[str] = Counter()
    controlled_keyword_docs: Counter[str] = Counter()
    mapped_controlled_keyword_docs: Counter[str] = Counter()
    authors: Counter[str] = Counter()
    mapped_authors: Counter[str] = Counter()
    seen_ids: set[str] = set()
    mapped_seen: set[str] = set()
    keyword_multiplicity: list[int] = []
    mapped_keyword_multiplicity: list[int] = []

    with gzip.open(args.source, "rt", encoding="utf-8") as handle:
        for line in handle:
            if not line.strip():
                continue
            record = json.loads(line)
            counts["records"] += 1
            doc_id = clean(record.get("id"))
            if doc_id:
                seen_ids.add(doc_id)
            is_mapped = doc_id in mapped_ids
            if is_mapped:
                mapped_seen.add(doc_id)

            title = clean(record.get("title"))
            publisher = clean(record.get("publisher"))
            creators = list(dict.fromkeys(as_list(record.get("creator"))))
            phrases = list(dict.fromkeys(normalise_phrase(item) for item in as_list(record.get("keyphrase"))))
            matched_phrases = [item for item in phrases if item in controlled_keywords]
            doc_type = clean(record.get("docType")) or "Unknown"

            doc_types[doc_type] += 1
            counts["with_title"] += bool(title)
            counts["with_publisher"] += bool(publisher)
            counts["with_creators"] += bool(creators)
            counts["with_multiple_creators"] += len(creators) > 1
            counts["with_raw_keyphrases"] += bool(phrases)
            counts["with_controlled_keywords"] += bool(matched_phrases)
            counts["with_full_text"] += bool(clean(record.get("fullText")))
            keyword_multiplicity.append(len(matched_phrases))

            if publisher:
                publishers[publisher] += 1
            for author in creators:
                authors[author] += 1
            for phrase in phrases:
                raw_keywords[phrase] += 1
            for phrase in matched_phrases:
                controlled_keyword_docs[phrase] += 1

            if is_mapped:
                counts["mapped_with_title"] += bool(title)
                counts["mapped_with_publisher"] += bool(publisher)
                counts["mapped_with_creators"] += bool(creators)
                counts["mapped_with_multiple_creators"] += len(creators) > 1
                counts["mapped_with_raw_keyphrases"] += bool(phrases)
                counts["mapped_with_controlled_keywords"] += bool(matched_phrases)
                counts["mapped_with_full_text"] += bool(clean(record.get("fullText")))
                mapped_keyword_multiplicity.append(len(matched_phrases))
                if publisher:
                    mapped_publishers[publisher] += 1
                for author in creators:
                    mapped_authors[author] += 1
                for phrase in matched_phrases:
                    mapped_controlled_keyword_docs[phrase] += 1

    recurring_publishers = {name for name, n in publishers.items() if n >= 2}
    recurring_mapped_publishers = {name for name, n in mapped_publishers.items() if n >= 2}
    recurring_authors = {name for name, n in authors.items() if n >= 2}
    recurring_mapped_authors = {name for name, n in mapped_authors.items() if n >= 2}

    report = {
        "catalogue": {
            "records": counts["records"],
            "unique_ids": len(seen_ids),
            "titles": counts["with_title"],
            "publishers": counts["with_publisher"],
            "creators": counts["with_creators"],
            "multiple_creators": counts["with_multiple_creators"],
            "raw_keyphrases": counts["with_raw_keyphrases"],
            "controlled_keywords": counts["with_controlled_keywords"],
            "full_text": counts["with_full_text"],
            "lda_assignments": len(seen_ids & journal_ids),
            "journal_metadata": len(seen_ids & journal_value_ids),
        },
        "mapped_subset": {
            "expected": len(mapped_ids),
            "found": len(mapped_seen),
            "missing_from_catalogue": sorted(mapped_ids - seen_ids),
            "titles": counts["mapped_with_title"],
            "publishers": counts["mapped_with_publisher"],
            "creators": counts["mapped_with_creators"],
            "multiple_creators": counts["mapped_with_multiple_creators"],
            "raw_keyphrases": counts["mapped_with_raw_keyphrases"],
            "controlled_keywords": counts["mapped_with_controlled_keywords"],
            "full_text": counts["mapped_with_full_text"],
            "lda_assignments": len(mapped_ids & journal_ids),
            "journal_metadata": len(mapped_ids & journal_value_ids),
        },
        "connectivity": {
            "publishers_with_multiple_catalogue_records": len(recurring_publishers),
            "catalogue_records_in_recurring_publishers": sum(n for name, n in publishers.items() if name in recurring_publishers),
            "publishers_with_multiple_mapped_records": len(recurring_mapped_publishers),
            "mapped_records_in_recurring_publishers": sum(n for name, n in mapped_publishers.items() if name in recurring_mapped_publishers),
            "authors_with_multiple_catalogue_records": len(recurring_authors),
            "catalogue_author_occurrences_in_recurring_authors": sum(n for name, n in authors.items() if name in recurring_authors),
            "authors_with_multiple_mapped_records": len(recurring_mapped_authors),
            "mapped_author_occurrences_in_recurring_authors": sum(n for name, n in mapped_authors.items() if name in recurring_mapped_authors),
        },
        "keyword_multiplicity": {
            "catalogue": {
                "median": percentile(keyword_multiplicity, 0.5),
                "p75": percentile(keyword_multiplicity, 0.75),
                "p90": percentile(keyword_multiplicity, 0.9),
                "p95": percentile(keyword_multiplicity, 0.95),
                "maximum": max(keyword_multiplicity, default=0),
            },
            "mapped_subset": {
                "median": percentile(mapped_keyword_multiplicity, 0.5),
                "p75": percentile(mapped_keyword_multiplicity, 0.75),
                "p90": percentile(mapped_keyword_multiplicity, 0.9),
                "p95": percentile(mapped_keyword_multiplicity, 0.95),
                "maximum": max(mapped_keyword_multiplicity, default=0),
            },
        },
        "doc_types": doc_types.most_common(),
        "top_publishers": publishers.most_common(30),
        "top_mapped_publishers": mapped_publishers.most_common(30),
        "top_controlled_keywords": controlled_keyword_docs.most_common(30),
        "top_mapped_controlled_keywords": mapped_controlled_keyword_docs.most_common(30),
        "top_authors": authors.most_common(30),
        "top_mapped_authors": mapped_authors.most_common(30),
        "vocabularies": {
            "controlled_keywords": len(controlled_keywords),
            "raw_keywords_observed": len(raw_keywords),
            "publishers": len(publishers),
            "authors": len(authors),
        },
    }
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(report, indent=2, ensure_ascii=False), encoding="utf-8")
    print(json.dumps(report, indent=2, ensure_ascii=False))


if __name__ == "__main__":
    main()
