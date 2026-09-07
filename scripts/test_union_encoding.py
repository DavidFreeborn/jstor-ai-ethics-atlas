"""Independent single-window reconstruction of cached union document vectors.

Optional local verification requiring the pinned model and private text inputs.
It changes batch size and recomputes representative abstract and full-text records.
"""

import hashlib
import json

import numpy as np
import torch
import transformers
from transformers import AutoModel, AutoTokenizer

from build_union_embeddings import (
    SOURCE,
    MODEL,
    REVISION,
    BODY_TOKENS,
    TITLE_TOKENS,
    normalise,
    encoder_protocol,
    pool_chunks,
)


def main():
    torch.set_num_threads(4)
    transformers.utils.logging.disable_progress_bar()
    rows = [
        json.loads(line)
        for line in (SOURCE / "union_text_input.jsonl")
        .read_text(encoding="utf-8")
        .splitlines()
    ]
    input_hash = hashlib.sha256(
        (SOURCE / "union_text_input.jsonl").read_bytes()
    ).hexdigest()
    protocol = encoder_protocol(input_hash)
    key = hashlib.sha256(json.dumps(protocol, sort_keys=True).encode()).hexdigest()[:16]
    cache = SOURCE / f"union_encoded_{key}"
    tokenizer = AutoTokenizer.from_pretrained(
        MODEL, revision=REVISION, local_files_only=True
    )
    model = AutoModel.from_pretrained(
        MODEL, revision=REVISION, local_files_only=True
    ).eval()
    chosen = [
        next(i for i, r in enumerate(rows) if r["source"] == source)
        for source in ("abstract", "fulltext")
    ]
    for i, row in enumerate(rows):
        path = cache / f"{i:04d}.npz"
        if path.exists():
            with np.load(path) as item:
                if row["source"] == "abstract" and item["diagnostics"][0] > 1:
                    chosen.append(i)
                    break
    metrics = []
    with torch.inference_mode():
        for i in chosen:
            row = rows[i]
            title = tokenizer.encode(row["title"], add_special_tokens=False)[
                :TITLE_TOKENS
            ]
            passages = (
                [row["abstract"]]
                if row["source"] == "abstract"
                else row["fulltext_windows"]
            )
            vectors = []
            for passage in passages:
                tokens = tokenizer.encode(
                    passage, add_special_tokens=False, verbose=False
                )
                pieces, lengths = [], []
                for j in range(0, len(tokens), BODY_TOKENS):
                    ids = (
                        [tokenizer.cls_token_id]
                        + title
                        + [tokenizer.sep_token_id]
                        + tokens[j : j + BODY_TOKENS]
                        + [tokenizer.sep_token_id]
                    )
                    encoded = (
                        model(
                            input_ids=torch.tensor([ids]),
                            attention_mask=torch.ones((1, len(ids)), dtype=torch.long),
                        )
                        .last_hidden_state[0, 0]
                        .numpy()
                    )
                    pieces.append(normalise(encoded))
                    lengths.append(len(tokens[j : j + BODY_TOKENS]))
                vectors.append(normalise(np.average(pieces, axis=0, weights=lengths)))
            actual = normalise(np.mean(vectors, axis=0))
            with np.load(cache / f"{i:04d}.npz") as item:
                expected = item[row["source"]]
            difference = float(np.max(np.abs(actual - expected)))
            assert difference < 2e-6, difference
            metrics.append(
                dict(
                    id=row["id"],
                    source=row["source"],
                    maximum_absolute_difference=difference,
                )
            )
    boundary = pool_chunks(
        np.array([[1.0, 0.0], [0.0, 1.0]], dtype=np.float32), [448, 2]
    )
    assert boundary[0] > 0.9999 and boundary[1] < 0.0045
    print(
        json.dumps(
            dict(
                status="pass",
                recomputed_with="batch size 1, four CPU threads",
                tail_weight_boundary="448-token body / 2-token remainder",
                checks=metrics,
            ),
            indent=2,
        ),
        flush=True,
    )


if __name__ == "__main__":
    main()
