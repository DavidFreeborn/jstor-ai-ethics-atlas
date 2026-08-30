"""Build compact catalogue metadata and title-only SPECTER embeddings.

The compressed JSTOR export contains full text, but the atlas needs only metadata.
This script streams the source, discards full text immediately, and persists a
compact deterministic research input plus one embedding row per catalogue ID.
"""

from __future__ import annotations

import argparse
import csv
import gzip
import json
import sys
from pathlib import Path

import numpy as np
import torch
from transformers import AutoModel, AutoTokenizer


MODEL_NAME = "allenai/specter"


def clean(value: object) -> str:
    return " ".join(str(value or "").split()).strip()


def as_list(value: object) -> list[str]:
    if value is None:
        return []
    if isinstance(value, list):
        return [clean(item) for item in value if clean(item)]
    text = clean(value)
    return [text] if text else []


def identifier_value(value: object, name: str) -> str:
    if not isinstance(value, list):
        return ""
    for item in value:
        if isinstance(item, dict) and clean(item.get("name")) == name:
            return clean(item.get("value"))
    return ""


def main() -> None:
    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    parser = argparse.ArgumentParser()
    parser.add_argument("--source", type=Path, default=Path("data/source/jstor_catalogue.jsonl.gz"))
    parser.add_argument("--keyword-graph", type=Path, default=Path("data/source/keyword_graph.json"))
    parser.add_argument("--metadata", type=Path, default=Path("data/source/catalogue_metadata.jsonl"))
    parser.add_argument("--index", type=Path, default=Path("data/source/catalogue_doc_index.csv"))
    parser.add_argument("--embeddings", type=Path, default=Path("data/source/catalogue_title_specter.npy"))
    parser.add_argument("--batch-size", type=int, default=32)
    parser.add_argument("--force-embeddings", action="store_true")
    args = parser.parse_args()

    graph = json.loads(args.keyword_graph.read_text(encoding="utf-8"))
    vocabulary = {
        clean(node["id"]).casefold()
        for node in graph["full"]["nodes"]
        if clean(node.get("id"))
    }

    args.metadata.parent.mkdir(parents=True, exist_ok=True)
    titles: list[str] = []
    ids: list[str] = []
    seen: set[str] = set()
    with (
        gzip.open(args.source, "rt", encoding="utf-8") as source,
        args.metadata.open("w", encoding="utf-8", newline="\n") as target,
        args.index.open("w", encoding="utf-8", newline="") as index_handle,
    ):
        writer = csv.DictWriter(index_handle, fieldnames=["row_index", "doc_id"])
        writer.writeheader()
        for row_index, line in enumerate(source):
            if not line.strip():
                continue
            record = json.loads(line)
            doc_id = clean(record.get("id"))
            title = clean(record.get("title"))
            if not doc_id or not title:
                raise ValueError(f"Record {row_index} lacks a canonical ID or title")
            if doc_id in seen:
                raise ValueError(f"Duplicate catalogue ID: {doc_id}")
            seen.add(doc_id)
            creators = list(dict.fromkeys(as_list(record.get("creator"))))
            raw_keywords = list(
                dict.fromkeys(clean(item).casefold() for item in as_list(record.get("keyphrase")))
            )
            controlled_keywords = [item for item in raw_keywords if item in vocabulary]
            compact = {
                "i": len(ids),
                "id": doc_id,
                "title": title,
                "year": clean(record.get("publicationYear") or record.get("datePublished")),
                "type": clean(record.get("docType")) or "Unknown",
                "publisher": clean(record.get("publisher")),
                "journal_id": identifier_value(record.get("identifier"), "journal_id"),
                "authors": creators,
                "keywords": controlled_keywords,
                "has_full_text": bool(clean(record.get("fullText"))),
            }
            target.write(json.dumps(compact, ensure_ascii=False, separators=(",", ":")) + "\n")
            writer.writerow({"row_index": len(ids), "doc_id": doc_id})
            ids.append(doc_id)
            titles.append(title)

    if len(ids) != 7076:
        raise AssertionError(f"Expected 7,076 catalogue rows, found {len(ids):,}")

    if args.embeddings.exists() and not args.force_embeddings:
        embeddings = np.load(args.embeddings, mmap_mode="r")
        if embeddings.shape != (len(ids), 768) or not np.isfinite(embeddings).all():
            raise AssertionError(f"Existing embedding artifact is invalid: {embeddings.shape}")
        print(f"Metadata rebuilt; retained valid embeddings {embeddings.shape}.")
        return

    device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
    tokenizer = AutoTokenizer.from_pretrained(MODEL_NAME)
    model = AutoModel.from_pretrained(MODEL_NAME).to(device)
    model.eval()
    batches: list[np.ndarray] = []
    with torch.inference_mode():
        for start in range(0, len(titles), args.batch_size):
            batch = titles[start : start + args.batch_size]
            tokens = tokenizer(
                batch,
                padding=True,
                truncation=True,
                max_length=128,
                return_tensors="pt",
            )
            tokens = {name: value.to(device) for name, value in tokens.items()}
            encoded = model(**tokens).last_hidden_state[:, 0, :]
            batches.append(encoded.detach().cpu().numpy().astype(np.float32))
            if start % (args.batch_size * 20) == 0:
                print(f"Encoded {min(start + args.batch_size, len(titles)):,}/{len(titles):,} titles", flush=True)
    embeddings = np.concatenate(batches, axis=0)
    if embeddings.shape != (len(ids), 768) or not np.isfinite(embeddings).all():
        raise AssertionError(f"Generated embedding artifact is invalid: {embeddings.shape}")
    np.save(args.embeddings, embeddings)
    print(f"Wrote {len(ids):,} metadata rows and embeddings {embeddings.shape} on {device}.")


if __name__ == "__main__":
    main()
