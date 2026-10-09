#!/usr/bin/env python3
"""Native TarlaPusula launch icons: approved white/light and black/dark variants.

Changes ONLY the iOS launcher artwork. The animated compass inside the app
is deliberately left untouched.
"""
from __future__ import annotations

import base64
import json
from io import BytesIO
from pathlib import Path

from PIL import Image, ImageOps

ROOT = Path(__file__).resolve().parents[1]
ASSET_DIR = ROOT / "assets" / "app-icons"
APPICON_DIR = ROOT / "ios/App/App/Assets.xcassets/AppIcon.appiconset"
SIZE = 1024


def get_approved_source(variant: str) -> Image.Image:
    filename = ASSET_DIR / f"tarlapusula-{variant}.jpg.base64"
    contents = base64.b64decode(filename.read_text(encoding="ascii").strip(), validate=True)
    with Image.open(BytesIO(contents)) as image:
        rgb = ImageOps.exif_transpose(image).convert("RGB")
    if min(rgb.size) < 900:
        raise RuntimeError(f"Approved {variant} source image is too small: {rgb.size}")
    return rgb


def render_icon(variant: str) -> Image.Image:
    image = get_approved_source(variant)
    # The artist's render contains an external preview margin. Crop just that
    # margin, retaining the actual embossed compass + farmland illustration.
    trim = int(min(image.size) * 0.047)
    image = image.crop((trim, trim, image.width - trim, image.height - trim))
    return ImageOps.fit(image, (SIZE, SIZE), method=Image.Resampling.LANCZOS)


def main() -> None:
    APPICON_DIR.mkdir(parents=True, exist_ok=True)
    for variant, filename in (
        ("light", "AppIcon-512@2x.png"),
        ("dark", "AppIconDark-512@2x.png"),
    ):
        icon = render_icon(variant)
        output = APPICON_DIR / filename
        icon.save(output, format="PNG", optimize=True)
        with Image.open(output) as check:
            assert check.size == (1024, 1024)
            assert check.mode == "RGB"
        print(f"TarlaPusula {variant} icon: {output} ({output.stat().st_size} bytes)")

    # Default = white/light. iOS 18+ automatically selects dark on
    # supported home-screen appearance settings.
    contents = {
        "images": [
            {
                "filename": "AppIcon-512@2x.png",
                "idiom": "universal",
                "platform": "ios",
                "size": "1024x1024",
            },
            {
                "filename": "AppIconDark-512@2x.png",
                "idiom": "universal",
                "platform": "ios",
                "size": "1024x1024",
                "appearances": [
                    {"appearance": "luminosity", "value": "dark"}
                ],
            },
        ],
        "info": {"author": "xcode", "version": 1},
    }
    (APPICON_DIR / "Contents.json").write_text(
        json.dumps(contents, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )


if __name__ == "__main__":
    main()
