#!/usr/bin/env python3
"""Fail-fast contrast and separation audit for released categorical colours."""

from __future__ import annotations

import json
import re
from pathlib import Path

from generate_palette import BACKGROUND, contrast, distance

ROOT = Path(__file__).resolve().parents[1]


def unique_colours(items: list[dict]) -> list[str]:
    return list(dict.fromkeys(item["colour"].upper() for item in items))


def audit(name: str, colours: list[str]) -> dict[str, float | int | str]:
    minimum_contrast = min(contrast(colour, BACKGROUND) for colour in colours)
    minimum_distance = min(
        distance(colour, other)
        for index, colour in enumerate(colours)
        for other in colours[index + 1:]
    ) if len(colours) > 1 else 1.0
    assert len(colours) == len(set(colours)), f"{name}: duplicate colours"
    assert minimum_contrast >= 4.5, f"{name}: contrast {minimum_contrast:.3f}"
    assert minimum_distance >= 0.07, f"{name}: OKLab distance {minimum_distance:.4f}"
    return {
        "name": name,
        "colours": len(colours),
        "minimum_contrast": round(minimum_contrast, 3),
        "minimum_oklab_distance": round(minimum_distance, 4),
    }


def main() -> None:
    atlas = json.loads((ROOT / "public" / "data" / "map.json").read_text(encoding="utf-8"))
    network = json.loads((ROOT / "public" / "data" / "network.json").read_text(encoding="utf-8"))
    visual_source = (ROOT / "lib" / "atlas-visual.ts").read_text(encoding="utf-8")
    category_colours = re.findall(r"#[0-9A-Fa-f]{6}", visual_source.split("] as const", 1)[0])
    results = [
        audit("selectable categories", [colour.upper() for colour in category_colours]),
        audit("BERTopic", unique_colours([topic for topic in atlas["topics"]["bertopic"] if topic["id"] >= 0])),
        audit("LDA", unique_colours(atlas["topics"]["lda"])),
        audit("six-community partition", unique_colours(network["meta"]["topCommunities"])),
        audit("21-community partition", unique_colours(network["meta"]["splitCommunities"])),
    ]
    print(json.dumps({"status": "pass", "background": BACKGROUND, "audits": results}, indent=2))


if __name__ == "__main__":
    main()
