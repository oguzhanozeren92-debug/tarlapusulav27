#!/usr/bin/env python3
"""Native TarlaPusula Android icons, approved light/dark emblem only.

Does not change the moving/in-app Pusula character or application theme.
"""
from __future__ import annotations

from pathlib import Path
from PIL import Image, ImageDraw

from generate_ios_app_icon import ROOT, render_icon

RES = ROOT / "android/app/src/main/res"
DENSITIES = {"mdpi": 1, "hdpi": 1.5, "xhdpi": 2, "xxhdpi": 3, "xxxhdpi": 4}
RESAMPLE = Image.Resampling.LANCZOS


def circular_icon(original: Image.Image, side: int) -> Image.Image:
    img = original.resize((side, side), RESAMPLE).convert("RGBA")
    mask = Image.new("L", (side, side), 0)
    ImageDraw.Draw(mask).ellipse((0, 0, side - 1, side - 1), fill=255)
    img.putalpha(mask)
    return img


def adaptive_icon(original: Image.Image, side: int) -> Image.Image:
    # 108dp adaptive icon with central safe region. Launcher shapes can differ.
    output = Image.new("RGBA", (side, side), (0, 0, 0, 0))
    logo_side = int(round(side * 0.67))
    logo = original.resize((logo_side, logo_side), RESAMPLE).convert("RGBA")
    output.alpha_composite(logo, ((side - logo_side) // 2, (side - logo_side) // 2))
    return output


def make_resources(variant: str, qualifier: str) -> None:
    art = render_icon(variant)
    for density, scale in DENSITIES.items():
        dest = RES / f"mipmap{qualifier}-{density}"
        dest.mkdir(parents=True, exist_ok=True)
        size = int(round(48 * scale))
        adaptive_size = int(round(108 * scale))
        art.resize((size, size), RESAMPLE).save(dest / "ic_launcher.png", optimize=True)
        circular_icon(art, size).save(dest / "ic_launcher_round.png", optimize=True)
        adaptive_icon(art, adaptive_size).save(dest / "ic_launcher_foreground.png", optimize=True)
        print(f"Android {variant}/{density}: {size}px launcher")


def main() -> None:
    make_resources("light", "")
    make_resources("dark", "-night")
    for directory, color in (("values", "#FFFFFF"), ("values-night", "#090909")):
        target = RES / directory
        target.mkdir(parents=True, exist_ok=True)
        (target / "ic_launcher_background.xml").write_text(
            '<?xml version="1.0" encoding="utf-8"?>\n'
            '<resources>\n'
            f'    <color name="ic_launcher_background">{color}</color>\n'
            '</resources>\n',
            encoding="utf-8",
        )
    store_icon = ROOT / "assets/app-icons/play-store-icon-512.png"
    render_icon("light").resize((512, 512), RESAMPLE).save(store_icon, optimize=True)
    print(f"Google Play 512 icon: {store_icon}")


if __name__ == "__main__":
    main()
