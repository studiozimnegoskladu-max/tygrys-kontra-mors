from PIL import Image
from pathlib import Path

# Arkusz referencyjny ma podgląd 1100 x 1473 px.
# Współrzędne są podawane w tym układzie i skalowane do oryginalnej
# rozdzielczości, tak samo jak w prepare_mors_frames.py.
source = Path("assets/Studio Zimnego Składu ikony llllllllll.png")
out = Path("assets")
image = Image.open(source).convert("RGBA")
W, H = image.size
REFERENCE_W, REFERENCE_H = 1100, 1473
sx, sy = W / REFERENCE_W, H / REFERENCE_H

# Pełne sylwetki postaci, bez podpisów pod ilustracjami.
regions = {
    "mascot-bobr.png": (125, 28, 455, 405),
    "mascot-lama.png": (660, 0, 1100, 485),
    "mascot-osmiornica.png": (275, 640, 650, 930),
    "mascot-mors.png": (215, 1000, 525, 1380),
}

for filename, (x0, y0, x1, y1) in regions.items():
    box = (
        round(x0 * sx),
        round(y0 * sy),
        round(x1 * sx),
        round(y1 * sy),
    )
    cropped = image.crop(box)
    alpha_bbox = cropped.getchannel("A").getbbox()
    if alpha_bbox is None:
        raise SystemExit(f"Postać {filename} ma pusty kadr: {box}")

    left, top, right, bottom = alpha_bbox
    pad = 16
    cropped = cropped.crop((
        max(0, left - pad),
        max(0, top - pad),
        min(cropped.width, right + pad),
        min(cropped.height, bottom + pad),
    ))
    cropped.save(out / filename, optimize=True)
    print(f"Saved {out / filename}: {cropped.size}")

print(f"Gotowe. Oryginał: {W}x{H}; skala: {sx:.3f} x {sy:.3f}.")
