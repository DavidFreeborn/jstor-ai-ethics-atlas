"""Stream licensed texts into a local-only, bounded union embedding input.

Abstract eligibility is the frozen released ID set. Full-text eligibility adds
English-tagged records with at least 50 whitespace words, 30 alphabetic words,
and 20 distinct alphabetic words. No language inference or topic filtering.
"""

import csv
import gzip
import hashlib
import json
import re
from collections import Counter
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / "data/source"
WINDOW_WORDS = 256
MAX_WINDOWS = 8


def text(value):
    if isinstance(value, list):
        return " ".join(text(v) for v in value)
    return " ".join(value.split()) if isinstance(value, str) else ""


def windows(words):
    """Non-overlapping equal-width windows, centred in equal-length strata."""
    count = min(MAX_WINDOWS, max(1, (len(words) + WINDOW_WORDS - 1) // WINDOW_WORDS))
    if len(words) <= MAX_WINDOWS * WINDOW_WORDS:
        return [
            " ".join(words[i : i + WINDOW_WORDS])
            for i in range(0, len(words), WINDOW_WORDS)
        ]
    starts = [
        int((i + 0.5) * len(words) / count - WINDOW_WORDS / 2) for i in range(count)
    ]
    return [" ".join(words[i : i + WINDOW_WORDS]) for i in starts]


def usable_text(words):
    alpha = [w.casefold() for w in words if re.search(r"[a-zA-Z]{2}", w)]
    return len(words) >= 50 and len(alpha) >= 30 and len(set(alpha)) >= 20


def main():
    catalogue = json.loads((ROOT / "public/data/map.json").read_text(encoding="utf-8"))
    catalogue_ids = [p["id"] for p in catalogue["points"]]
    abstract_ids = {p["id"] for p in catalogue["points"] if "bertopic" in p}
    seen, recovered, by_id = set(), set(), {}
    counts, types, languages = Counter(), {}, Counter()
    outside_abstract_release = []
    with gzip.open(
        SOURCE / "jstor_catalogue.jsonl.gz", "rt", encoding="utf-8"
    ) as handle:
        for line in handle:
            if not line.strip():
                continue
            r = json.loads(line)
            identifier = r["id"]
            assert identifier not in seen, identifier
            seen.add(identifier)
            abstract, full = text(r.get("abstract")), text(r.get("fullText"))
            lang = {v.casefold() for v in (r.get("language") or [])}
            words = full.split()
            english = bool(lang & {"eng", "en", "english"})
            usable = usable_text(words)
            full_eligible = english and usable
            counts["catalogue"] += 1
            counts["raw_abstract_nonempty"] += bool(abstract)
            counts["raw_fulltext_nonempty"] += bool(full)
            counts["fulltext_non_english_or_unlabelled"] += bool(full) and not english
            counts["english_fulltext_below_quality_threshold"] += (
                bool(full) and english and not usable
            )
            counts["usable_english_fulltext"] += full_eligible
            if full:
                languages.update([" / ".join(sorted(lang)) or "unlabelled"])
            released = identifier in abstract_ids
            if abstract and not released:
                outside_abstract_release.append(
                    dict(
                        id=identifier,
                        words=len(abstract.split()),
                        language=sorted(lang),
                        fulltext_eligible=full_eligible,
                        preview=abstract[:240],
                    )
                )
            if released:
                assert abstract and len(abstract.split()) >= 10, identifier
                recovered.add(identifier)
            if not (released or full_eligible):
                continue
            kind = "abstract" if released else "fulltext"
            counts[kind] += 1
            counts["paired_usable"] += released and full_eligible
            doc_type = text(r.get("docType")) or "Unknown"
            types.setdefault(doc_type, Counter())[kind] += 1
            record = dict(
                id=identifier,
                title=text(r.get("title")),
                source=kind,
                abstract=abstract if released else "",
                fulltext_windows=windows(words) if full_eligible else [],
                fulltext_words=len(words),
                type=doc_type,
            )
            by_id[identifier] = record
            if len(seen) % 500 == 0:
                print(
                    f"Read {len(seen):,} records; retained {len(by_id):,}", flush=True
                )
    assert seen == set(catalogue_ids) and recovered == abstract_ids
    rows = [by_id[i] for i in catalogue_ids if i in by_id]
    output = SOURCE / "union_text_input.jsonl"
    with output.open("w", encoding="utf-8", newline="\n") as handle:
        for row in rows:
            handle.write(
                json.dumps(row, ensure_ascii=False, separators=(",", ":")) + "\n"
            )
    with (SOURCE / "union_doc_index.csv").open(
        "w", encoding="utf-8", newline=""
    ) as handle:
        writer = csv.writer(handle)
        writer.writerow(["row_index", "doc_id", "source"])
        writer.writerows((i, r["id"], r["source"]) for i, r in enumerate(rows))
    audit = dict(
        counts=dict(counts),
        union=len(rows),
        by_type=types,
        fulltext_languages=dict(languages),
        source_policy="Released abstract where available; usable English full text otherwise",
        fulltext_minimum=dict(
            words=50, alphabetic_words=30, distinct_alphabetic_words=20
        ),
        sampling=dict(
            max_windows=MAX_WINDOWS,
            window_words=WINDOW_WORDS,
            placement="centres of equal-length strata; all windows for shorter texts",
        ),
        input_sha256=hashlib.sha256(output.read_bytes()).hexdigest(),
    )
    (SOURCE / "union_coverage_audit.json").write_text(
        json.dumps(audit, indent=2) + "\n", encoding="utf-8"
    )
    (SOURCE / "union_excluded_abstracts.json").write_text(
        json.dumps(outside_abstract_release, indent=2) + "\n", encoding="utf-8"
    )
    print(json.dumps(audit, indent=2), flush=True)


if __name__ == "__main__":
    main()
