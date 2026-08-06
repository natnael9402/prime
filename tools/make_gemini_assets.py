"""Process Gemini logo (white -> transparent, crop, upscale) and build a noise tile."""
from pathlib import Path

from PIL import Image
import random

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / "tools" / "gemini-src.png"
LOGO_OUT = ROOT / "frontend" / "public" / "gemini-logo.png"
NOISE_OUT = ROOT / "frontend" / "public" / "noise.png"


def process_logo() -> None:
    img = Image.open(SRC).convert("RGBA")
    px = img.load()
    w, h = img.size
    # Near-white pixels -> transparent, with a soft feather band.
    for y in range(h):
        for x in range(w):
            r, g, b, a = px[x, y]
            m = min(r, g, b)
            if m >= 245:
                px[x, y] = (r, g, b, 0)
            elif m >= 225:
                # feather: scale alpha down as it approaches white
                keep = (245 - m) / 20.0
                px[x, y] = (r, g, b, int(a * keep))

    # Autocrop to non-transparent content with small padding.
    bbox = img.getbbox()
    if bbox:
        pad = 4
        left = max(0, bbox[0] - pad)
        top = max(0, bbox[1] - pad)
        right = min(w, bbox[2] + pad)
        bottom = min(h, bbox[3] + pad)
        img = img.crop((left, top, right, bottom))

    # Upscale ~2x for crisp rendering.
    img = img.resize((img.width * 2, img.height * 2), Image.LANCZOS)
    LOGO_OUT.parent.mkdir(parents=True, exist_ok=True)
    img.save(LOGO_OUT)
    print(f"logo saved: {LOGO_OUT} size={img.size}")


def make_noise() -> None:
    size = 128
    img = Image.new("RGBA", (size, size))
    px = img.load()
    rnd = random.Random(42)
    for y in range(size):
        for x in range(size):
            v = 128 + rnd.randint(-30, 30)
            # low alpha grain; CSS will control overall opacity
            px[x, y] = (v, v, v, 28)
    NOISE_OUT.parent.mkdir(parents=True, exist_ok=True)
    img.save(NOISE_OUT)
    print(f"noise saved: {NOISE_OUT} size={img.size}")


if __name__ == "__main__":
    process_logo()
    make_noise()
