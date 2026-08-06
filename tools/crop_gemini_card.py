"""Crop the black backdrop out of the generated card mockup and optimize it."""
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
SRC = Path(r"C:\Users\natna\Downloads\ChatGPT Image Aug 4, 2026, 11_40_11 PM.png")
OUT = ROOT / "frontend" / "public" / "gemini-card.jpg"

img = Image.open(SRC).convert("RGB")
w, h = img.size

# Find the bounding box of the non-black (card) region.
gray = img.convert("L")
px = gray.load()
threshold = 40  # anything brighter than near-black counts as card

cols = [0] * w
rows = [0] * h
step = 4  # sample for speed
for y in range(0, h, step):
    for x in range(0, w, step):
        if px[x, y] > threshold:
            cols[x] = 1
            rows[y] = 1

xs = [i for i, v in enumerate(cols) if v]
ys = [i for i, v in enumerate(rows) if v]
left, right = max(0, min(xs) - 2), min(w, max(xs) + 3)
top, bottom = max(0, min(ys) - 2), min(h, max(ys) + 3)
print(f"crop box: ({left},{top}) -> ({right},{bottom}) of {w}x{h}")

card = img.crop((left, top, right, bottom))
# Light resize for web (card renders <= ~730px wide at 2x DPR on phones).
if card.width > 1100:
    card = card.resize((1100, round(card.height * 1100 / card.width)), Image.LANCZOS)

OUT.parent.mkdir(parents=True, exist_ok=True)
card.save(OUT, "JPEG", quality=90, optimize=True)
print(f"saved: {OUT} {card.size} {OUT.stat().st_size // 1024}KB")
