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
    "irrigation": ("photo-1692369584496-3216a88f94c1", "Lumin Osity — Cornfield sprinkler irrigation"),
    "ai": ("photo-1464226184884-fa280b87c399", "Growing crops in a field"),
    "spray": ("photo-1625246333195-78d9c38ad449", "Farm machinery on cultivated land"),
    "workability": ("photo-1592982537447-7440770cbfc9", "Tractor and farm work"),
    "soil": ("photo-1518977676601-b53f82aba655", "Crops and ground-level soil"),
    "frost": ("photo-1700943131513-f2ddb656f5a5", "Seven Colors — Frost crystals on leaves"),
    "health": ("photo-1500382017468-9049fed747ef", "Cultivated healthy farmland"),
    "pdf": ("photo-1495107334309-fcf20504a5ab", "Reports and documents"),
    "agenda": ("photo-1504711434969-e33886168f5c", "News and journalism"),
    "market": ("pexels-18404065", "Timon Cornelissen — Commodity grains in sacks at a market"),
    "guide": ("photo-1456513080510-7bf3a84b82f8", "Study and knowledge resources"),
}

def candidates(photo_id: str):
    if photo_id.startswith("pexels-"):
        n = photo_id.removeprefix("pexels-")
        yield f"https://images.pexels.com/photos/{n}/pexels-photo-{n}.jpeg?auto=compress&cs=tinysrgb&w=1400"
    elif photo_id.startswith("photo-"):
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
         "Sources: [Unsplash License](https://unsplash.com/license) and [Pexels License](https://www.pexels.com/license/).",
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
    source = (f"https://www.pexels.com/photo/{identifier.removeprefix('pexels-')}/"
              if identifier.startswith("pexels-") else
              f"https://unsplash.com/photos/{identifier}" if not identifier.startswith("photo-")
              else f"https://images.unsplash.com/{identifier}")
    lines.append(f"- **{name}**: {credit}. Source: {source}")
    print(f"  ready: {output.stat().st_size} bytes", flush=True)
(ROOT / "PHOTO_SOURCES.md").write_text("\n".join(lines) + "\n", encoding="utf-8")
print("All 12 feature images are validated and ready.", flush=True)
