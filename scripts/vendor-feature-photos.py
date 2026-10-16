"""Fetch curated free-to-use feature photography at build-time once, and vendor it locally.

Runs only in the dedicated GitHub Action. App clients never contact Unsplash.
Photos: Unsplash License; credits are written to PHOTO_SOURCES.md.
"""
from __future__ import annotations
import io
import pathlib
import time
import urllib.error
import urllib.request
from PIL import Image, ImageOps, UnidentifiedImageError

ROOT = pathlib.Path(__file__).resolve().parents[1] / "public" / "feature-discovery"
ROOT.mkdir(parents=True, exist_ok=True)
# The short Unsplash photo IDs below were handpicked to match the actual feature.
PHOTO = {
    "satellite": ("photo-1500937386664-56d1dfef3854", "Aerial farmland / agricultural fields"),
    "irrigation": ("6DMht7wYt6g", "Lumin Osity — Corn field sprinkler irrigation"),
    "ai": ("7Hp6yu2P8wU", "Vitaly Gariev — Photographing plants with a phone"),
    "spray": ("E-zxxavpZlw", "Annie Spratt — Tractor spraying crop field"),
    "workability": ("Rem5sqFVYwE", "Adarsh PG — Tractor in muddy field"),
    "soil": ("BcZZ_WqbkJM", "Elham Abdi — Exposed layered soil profile"),
    "frost": ("LDQ_TTUedAc", "Andreas Fickl — Frost on leaves"),
    "health": ("photo-1500382017468-9049fed747ef", "Cultivated healthy farmland"),
    "pdf": ("lPG6XtwcKsY", "Farm data on smartphone"),
    "agenda": ("YbXUymsk07E", "John Cardamone — Printed newspaper news"),
    "market": ("7Ab1ewrV0e0", "Elif Basgıcılar — Grain sacks"),
    "guide": ("Akf6BuBjJss", "Zoe Richardson — Farmer holding a plant"),
}

def candidates(photo_id: str):
    if photo_id.startswith("photo-"):
        yield f"https://images.unsplash.com/{photo_id}?fm=jpg&w=1450&q=78&fit=crop"
        yield f"https://images.unsplash.com/{photo_id}?w=1450&q=78"
    else:
        yield f"https://unsplash.com/photos/{photo_id}/download?force=true&w=1450&q=80"
        yield f"https://unsplash.com/photos/{photo_id}/download?force=true"

def fetch_image(photo_id: str) -> Image.Image:
    errs = []
    for link in candidates(photo_id):
        for attempt in range(2):
            try:
                request = urllib.request.Request(link, headers={
                    "User-Agent": "Mozilla/5.0 (compatible; TarlaPusulaFeaturePhotos/1.0)",
                    "Accept": "image/avif,image/webp,image/apng,image/*,*/*;q=0.8",
                })
                with urllib.request.urlopen(request, timeout=40) as response:
                    contents = response.read(9_000_000)
                    ctype = response.headers.get("Content-Type", "")
                if "image" not in ctype and contents[:3] != b"\\xff\\xd8":
                    raise ValueError(f"Unexpected content type: {ctype}")
                image = Image.open(io.BytesIO(contents))
                image.load()
                if image.width < 500 or image.height < 350:
                    raise ValueError(f"Image too small: {image.size}")
                return image
            except Exception as exc:
                errs.append(str(exc)[:140])
                time.sleep(1 + attempt)
    raise RuntimeError(f"No usable photo for {photo_id}: " + " | ".join(errs))

lines = ["# TarlaPusula feature photography", "",
         "Images are distributed under the [Unsplash License](https://unsplash.com/license).",
         "Photography is illustrative; it is not a current satellite view or a live farm measurement.", ""]
for name, (identifier, credit) in PHOTO.items():
    print(f"Downloading {name}: {identifier}", flush=True)
    image = fetch_image(identifier)
    image = ImageOps.exif_transpose(image).convert("RGB")
    # One consistent aspect ratio for all mobile discovery cards.
    image = ImageOps.fit(image, (1400, 840), method=Image.Resampling.LANCZOS, centering=(0.5, 0.5))
    output = ROOT / f"{name}.jpg"
    image.save(output, "JPEG", quality=80, optimize=True, progressive=True, subsampling=0)
    if output.stat().st_size < 10_000 or output.stat().st_size > 1_500_000:
        raise ValueError(f"Invalid output size for {name}: {output.stat().st_size}")
    source = (f"https://unsplash.com/photos/{identifier}" if not identifier.startswith("photo-")
              else f"https://images.unsplash.com/{identifier}")
    lines.append(f"- **{name}**: {credit}. Source: {source}")
    print(f"  ready: {output.stat().st_size} bytes", flush=True)
(ROOT / "PHOTO_SOURCES.md").write_text("\n".join(lines) + "\n", encoding="utf-8")
print("All 12 feature images are validated and ready.", flush=True)
