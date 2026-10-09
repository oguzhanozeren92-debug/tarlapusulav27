#!/usr/bin/env python3
"""Build the native iOS icon from the SAME Pusula layers used in-app.

Run: python3 -m pip install pillow && python3 scripts/generate_ios_app_icon.py

Important: keep this deterministic. Do not use generic/placeholder artwork or
the web app favicon. iOS App Store icons must be opaque and 1024 x 1024 pixels.
"""
from __future__ import annotations

import hashlib
from io import BytesIO
from pathlib import Path
from urllib.request import Request, urlopen

from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
OUTPUT = ROOT / "ios/App/App/Assets.xcassets/AppIcon.appiconset/AppIcon-512@2x.png"
BASE = "https://xwyfidtktauxivsosmex.supabase.co/storage/v1/object/public/pusula"
SOURCES = [
    ("body", f"{BASE}/compass-body.webp"),
    ("needle", f"{BASE}/compass-needle-centered.webp"),
]

SIZE = 1024
LOGO_SIDE = 940
# Near-black, opaque background; iOS applies its own app icon corner radius.
BACKGROUND = (8, 10, 11, 255)


def fetch_image(kind: str, url: str) -> Image.Image:
    req = Request(url, headers={"User-Agent": "TarlaPusula-iOS-Icon-Builder/1.0"})
    with urlopen(req, timeout=30) as response:
        mime_type = response.headers.get("Content-Type", "")
        payload = response.read(4_000_000)
    if "image/" not in mime_type or len(payload) < 1000:
        raise RuntimeError(f"Invalid {kind} logo asset from official Supabase storage")
    img = Image.open(BytesIO(payload))
    img.load()
    if min(img.size) < 100:
        raise RuntimeError(f"{kind} logo source resolution too small: {img.size}")
    print(f"{kind}: {img.size}, SHA256 {hashlib.sha256(payload).hexdigest()[:16]}")
    return img.convert("RGBA")


def paste_fitted(base: Image.Image, layer: Image.Image) -> None:
    # Matches CSS object-fit:contain used for body and needle in the app.
    width, height = layer.size
    scale = min(LOGO_SIDE / width, LOGO_SIDE / height)
    fitted = layer.resize(
        (round(width * scale), round(height * scale)), Image.Resampling.LANCZOS
    )
    x = (SIZE - fitted.width) // 2
    y = (SIZE - fitted.height) // 2
    base.alpha_composite(fitted, (x, y))


def main() -> None:
    icon = Image.new("RGBA", (SIZE, SIZE), BACKGROUND)
    for kind, url in SOURCES:
        paste_fitted(icon, fetch_image(kind, url))
    # PNG alpha must not be included in the actual App Store asset.
    rgb = icon.convert("RGB")
    OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    rgb.save(OUTPUT, "PNG", optimize=True)
    check = Image.open(OUTPUT)
    assert check.size == (1024, 1024) and check.mode == "RGB"
    print(f"iOS icon OK: {OUTPUT.relative_to(ROOT)} ({OUTPUT.stat().st_size} bytes)")


if __name__ == "__main__":
    main()
