"""Generate a deterministic high-separation palette for a near-black plot field."""

from __future__ import annotations

import colorsys
import math

BACKGROUND = "#090C10"
COUNT = 37


def rgb(hex_colour: str) -> tuple[float, float, float]:
    return tuple(int(hex_colour[index:index + 2], 16) / 255 for index in (1, 3, 5))


def relative_luminance(hex_colour: str) -> float:
    channels = [channel / 12.92 if channel <= 0.04045 else ((channel + 0.055) / 1.055) ** 2.4 for channel in rgb(hex_colour)]
    return 0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2]


def contrast(a: str, b: str) -> float:
    high, low = sorted((relative_luminance(a), relative_luminance(b)), reverse=True)
    return (high + 0.05) / (low + 0.05)


def oklab(hex_colour: str) -> tuple[float, float, float]:
    linear = [channel / 12.92 if channel <= 0.04045 else ((channel + 0.055) / 1.055) ** 2.4 for channel in rgb(hex_colour)]
    red, green, blue = linear
    l_value = 0.4122214708 * red + 0.5363325363 * green + 0.0514459929 * blue
    m_value = 0.2119034982 * red + 0.6806995451 * green + 0.1073969566 * blue
    s_value = 0.0883024619 * red + 0.2817188376 * green + 0.6299787005 * blue
    l_root, m_root, s_root = (value ** (1 / 3) for value in (l_value, m_value, s_value))
    return (
        0.2104542553 * l_root + 0.7936177850 * m_root - 0.0040720468 * s_root,
        1.9779984951 * l_root - 2.4285922050 * m_root + 0.4505937099 * s_root,
        0.0259040371 * l_root + 0.7827717662 * m_root - 0.8086757660 * s_root,
    )


def distance(a: str, b: str) -> float:
    return math.dist(oklab(a), oklab(b))


def make_candidates() -> list[str]:
    output: set[str] = set()
    for hue in range(0, 360, 4):
        for saturation in (0.62, 0.78, 0.94):
            for value in (0.76, 0.88, 1.0):
                channels = colorsys.hsv_to_rgb(hue / 360, saturation, value)
                colour = "#" + "".join(f"{round(channel * 255):02X}" for channel in channels)
                if contrast(colour, BACKGROUND) >= 4.5:
                    output.add(colour)
    return sorted(output)


def generate() -> list[str]:
    candidates = make_candidates()
    selected = ["#35D7FF"]
    while len(selected) < COUNT:
        choice = max(
            (candidate for candidate in candidates if candidate not in selected),
            key=lambda candidate: (min(distance(candidate, current) for current in selected), contrast(candidate, BACKGROUND), candidate),
        )
        selected.append(choice)
    return selected


if __name__ == "__main__":
    palette = generate()
    print("[\n    " + ", ".join(f'"{colour}"' for colour in palette) + "\n]")
    print(f"minimum contrast: {min(contrast(colour, BACKGROUND) for colour in palette):.3f}")
    print(f"minimum OKLab distance: {min(distance(a, b) for index, a in enumerate(palette) for b in palette[index + 1:]):.4f}")
