"""Pinned, resumable local SPECTER encoding; no text leaves this computer.

Token-weighted CLS means within passages; equal passage means per document.
Abstracts are divided into contiguous token windows without truncating their body.
Full text uses the source script's bounded stratified windows. Paired full text is
also encoded for a within-record source sensitivity audit, not duplicate points.
"""

import argparse
import hashlib
import json
import shutil
import time
import zipfile
from pathlib import Path

import numpy as np
import torch
import transformers
from transformers import AutoModel, AutoTokenizer

ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / "data/source"
MODEL = "allenai/specter"
REVISION = "81cbfb43d4fc2e728d5b4201ce14987db8d0854c"
BODY_TOKENS = 448
TITLE_TOKENS = 32


def normalise(v):
    return v / np.maximum(np.linalg.norm(v, axis=-1, keepdims=True), 1e-12)


def pool_chunks(vectors, lengths):
    """A two-token remainder must not weigh as much as a 448-token body chunk."""
    return normalise(
        np.average(
            vectors, axis=0, weights=np.asarray(lengths, dtype=np.float32)
        ).astype(np.float32)
    )


def encoder_protocol(input_hash):
    return dict(
        model=MODEL,
        revision=REVISION,
        body_tokens=BODY_TOKENS,
        title_tokens=TITLE_TOKENS,
        pooling="token-weighted unit CLS mean within passages; equal passage mean; unit document vector",
        dtype="float32",
        input_sha256=input_hash,
    )


def cached_valid(path):
    try:
        with np.load(path) as item:
            for name in ("abstract", "fulltext", "four"):
                value = item[name]
                if value.shape != (768,) or not np.isfinite(value).all():
                    return False
                norm = np.linalg.norm(value)
                if not (norm == 0 or abs(norm - 1) < 1e-5):
                    return False
            return item["diagnostics"].shape == (4,)
    except (OSError, ValueError, KeyError, EOFError, zipfile.BadZipFile):
        return False


def main():
    transformers.utils.logging.disable_progress_bar()
    parser = argparse.ArgumentParser()
    parser.add_argument("--batch-size", type=int, default=8)
    parser.add_argument("--threads", type=int, default=4)
    parser.add_argument(
        "--limit",
        type=int,
        default=0,
        help="Benchmark only; does not publish embeddings",
    )
    args = parser.parse_args()
    torch.set_num_threads(args.threads)
    torch.manual_seed(42)
    torch.use_deterministic_algorithms(True)
    tokenizer = AutoTokenizer.from_pretrained(
        MODEL, revision=REVISION, local_files_only=True
    )
    model = AutoModel.from_pretrained(
        MODEL, revision=REVISION, local_files_only=True
    ).eval()
    input_path = SOURCE / "union_text_input.jsonl"
    rows = [
        json.loads(line) for line in input_path.read_text(encoding="utf-8").splitlines()
    ]
    input_hash = hashlib.sha256(input_path.read_bytes()).hexdigest()
    protocol = encoder_protocol(input_hash)
    cache_key = hashlib.sha256(
        json.dumps(protocol, sort_keys=True).encode()
    ).hexdigest()[:16]
    cache = SOURCE / f"union_encoded_{cache_key}"
    cache.mkdir(exist_ok=True)
    # Reuse only provably equivalent single-chunk passages from the initial run.
    legacy = {
        **protocol,
        "pooling": "mean of unit CLS vectors, then unit document vector",
    }
    legacy_key = hashlib.sha256(
        json.dumps(legacy, sort_keys=True).encode()
    ).hexdigest()[:16]
    legacy_cache = SOURCE / f"union_encoded_{legacy_key}"
    output, four_window, paired, diagnostic = [], [], [], []
    start = time.monotonic()
    for i, row in enumerate(rows[: args.limit] if args.limit else rows):
        path = cache / f"{i:04d}.npz"
        old = legacy_cache / path.name
        if not path.exists() and cached_valid(old):
            with np.load(old) as previous:
                d = previous["diagnostics"]
                equivalent = d[0] <= 1 and d[2] == d[1]
            if equivalent:
                shutil.copyfile(old, path)
        if not cached_valid(path):
            title = tokenizer.encode(row["title"], add_special_tokens=False)[
                :TITLE_TOKENS
            ]
            body = (
                tokenizer.encode(
                    row["abstract"], add_special_tokens=False, verbose=False
                )
                if row["abstract"]
                else []
            )
            abstract_chunks = [
                body[j : j + BODY_TOKENS] for j in range(0, len(body), BODY_TOKENS)
            ]
            full_tokens = [
                tokenizer.encode(w, add_special_tokens=False, verbose=False)
                for w in row["fulltext_windows"]
            ]
            # Split sampled windows rather than silently clipping OCR-heavy passages.
            full_chunks = [
                w[j : j + BODY_TOKENS]
                for w in full_tokens
                for j in range(0, len(w), BODY_TOKENS)
            ]
            chunks = abstract_chunks + full_chunks
            assert chunks, row["id"]
            vectors = []
            with torch.inference_mode():
                for j in range(0, len(chunks), args.batch_size):
                    tokens = [
                        dict(
                            input_ids=[tokenizer.cls_token_id]
                            + title
                            + [tokenizer.sep_token_id]
                            + w
                            + [tokenizer.sep_token_id]
                        )
                        for w in chunks[j : j + args.batch_size]
                    ]
                    batch = tokenizer.pad(tokens, padding=True, return_tensors="pt")
                    encoded = (
                        model(**batch)
                        .last_hidden_state[:, 0, :]
                        .numpy()
                        .astype(np.float32)
                    )
                    vectors.extend(normalise(encoded))
            vectors = np.array(vectors)
            ab = (
                pool_chunks(
                    vectors[: len(abstract_chunks)], list(map(len, abstract_chunks))
                )
                if abstract_chunks
                else np.zeros(768, dtype=np.float32)
            )
            # Each sampled window contributes equally, even if it required a split.
            ft_windows, offset = [], len(abstract_chunks)
            for w in full_tokens:
                n = (len(w) + BODY_TOKENS - 1) // BODY_TOKENS
                lengths = [
                    len(w[j : j + BODY_TOKENS]) for j in range(0, len(w), BODY_TOKENS)
                ]
                ft_windows.append(pool_chunks(vectors[offset : offset + n], lengths))
                offset += n
            ft = (
                normalise(np.mean(ft_windows, axis=0))
                if ft_windows
                else np.zeros(768, dtype=np.float32)
            )
            four = normalise(np.mean(ft_windows[::2], axis=0)) if ft_windows else ft
            temporary = path.with_suffix(".partial.npz")
            np.savez(
                temporary,
                abstract=ab,
                fulltext=ft,
                four=four,
                diagnostics=np.array(
                    [
                        len(abstract_chunks),
                        len(full_tokens),
                        len(full_chunks),
                        sum(map(len, full_tokens)),
                    ]
                ),
            )
            temporary.replace(path)
        with np.load(path) as item:
            output.append(
                item["abstract"] if row["source"] == "abstract" else item["fulltext"]
            )
            four_window.append(
                item["abstract"] if row["source"] == "abstract" else item["four"]
            )
            paired.append(
                item["fulltext"]
                if row["source"] == "abstract"
                else np.zeros(768, dtype=np.float32)
            )
            diagnostic.append(item["diagnostics"].tolist())
        if i == 0 or (i + 1) % 25 == 0 or i + 1 == len(rows):
            print(
                f"Encoded {i + 1:,}/{len(rows):,}; elapsed {time.monotonic() - start:.1f}s",
                flush=True,
            )
    if args.limit:
        print(
            f"Benchmark: {len(output)} documents in {time.monotonic() - start:.1f}s",
            flush=True,
        )
        return
    embeddings = np.array(output, dtype=np.float32)
    assert embeddings.shape == (len(rows), 768) and np.isfinite(embeddings).all()
    assert np.allclose(np.linalg.norm(embeddings, axis=1), 1, atol=1e-5)
    np.save(SOURCE / "union_specter.npy", embeddings)
    np.save(
        SOURCE / "union_specter_four_windows.npy",
        np.array(four_window, dtype=np.float32),
    )
    np.save(SOURCE / "union_paired_fulltext.npy", np.array(paired, dtype=np.float32))
    audit = dict(
        protocol=protocol,
        documents=len(rows),
        software=dict(
            torch=torch.__version__,
            transformers=transformers.__version__,
            numpy=np.__version__,
        ),
        diagnostics_columns=[
            "abstract_chunks",
            "fulltext_windows",
            "fulltext_chunks",
            "sampled_fulltext_tokens",
        ],
        diagnostics=diagnostic,
        body_tokens_discarded=0,
        model_input_maximum=BODY_TOKENS + TITLE_TOKENS + 3,
    )
    (SOURCE / "union_encoder_audit.json").write_text(
        json.dumps(audit, indent=2) + "\n", encoding="utf-8"
    )


if __name__ == "__main__":
    main()
