#!/usr/bin/env python3
"""Generate Android launch icons from the same genuine Pusula assets as iOS.

Usage: python -m pip install Pillow && python scripts/generate_android_app_icons.py
Produces Android legacy, round and adaptive foreground images at each density.
The adaptive foreground is intentionally limited to Android's central safe zone.
"""
from __future__ import annotations

from pathlib import Path
from PIL import Image, ImageDraw
from generate_ios_app_icon import fetch_image, SOURCES, BACKGROUND

ROOT = Path(__file__).resolve().parents[1]
RESOURCE_DIR = ROOT / "android/app/src/main/res"
DENSITIES = {"mdpi": 1, "hdpi": 1.5, "xhdpi": 2, "xxhdpi": 3, "xxxhdpi": 4}
RESAMPLING = Image.Resampling.LANCZOS

def centered_layers(side: int, layers: list[Image.Image], logo_scale: float, background=None) -> Image.Image:
    image = Image.new("RGBA", (side, side), background or (0, 0, 0, 0))
    fit_side = side * logo_scale
    for layer in layers:
        ratio = min(fit_side / layer.width, fit_side / layer.height)
        w, h = max(1, round(layer.width * ratio)), max(1, round(layer.height * ratio))
        overlay = layer.resize((w, h), RESAMPLING)
        image.alpha_composite(overlay, ((side - w) // 2, (side - h) // 2))
    return image

def main() -> None:
    layers = [fetch_image(kind, url) for kind, url in SOURCES]
    icon_color = tuple(BACKGROUND)
    # The 1024px icon is composed from the very same layers and margin as iOS.
    legacy_master = centered_layers(1024, layers, 940 / 1024, icon_color).convert("RGB")
    round_master = centered_layers(1024, layers, 0.86, icon_color).convert("RGBA")
    mask = Image.new("L", (1024, 1024), 0)
    ImageDraw.Draw(mask).ellipse((0, 0, 1023, 1023), fill=255)
    round_master.putalpha(mask)

    # Adaptive icons have 108dp layers; Android may crop to a 72dp circle.
    # A 64dp logo stays safely centered in both square and circular masks.
    foreground_master = centered_layers(1080, layers, 64 / 108, (0, 0, 0, 0))

    for density, multiplier in DENSITIES.items():
        destination = RESOURCE_DIR / f"mipmap-{density}"
        destination.mkdir(parents=True, exist_ok=True)
        standard_px = round(48 * multiplier)
        adaptive_px = round(108 * multiplier)
        legacy_master.resize((standard_px, standard_px), RESAMPLING).save(destination / "ic_launcher.png", "PNG", optimize=True)
        round_master.resize((standard_px, standard_px), RESAMPLING).save(destination / "ic_launcher_round.png", "PNG", optimize=True)
        foreground_master.resize((adaptive_px, adaptive_px), RESAMPLING).save(destination / "ic_launcher_foreground.png", "PNG", optimize=True)
        for icon_file in ("ic_launcher.png", "ic_launcher_round.png", "ic_launcher_foreground.png"):
            with Image.open(destination / icon_file) as check:
                assert check.format == "PNG"
        print(f"{density}: launcher {standard_px}px, adaptive foreground {adaptive_px}px")

    # Adaptive launcher background matches the dark iOS App Store artwork.
    (RESOURCE_DIR / "values/ic_launcher_background.xml").write_text(
        '<?xml version="1.0" encoding="utf-8"?>\n<resources>\n'
        '    <color name="ic_launcher_background">#080A0B</color>\n'
        '</resources>\n',
        encoding="utf-8",
    )
    print("Android launcher icons ready — same official Pusula branding as iOS.")

if __name__ == "__main__":
    main()
