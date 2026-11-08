from PIL import Image
from pathlib import Path

SOURCE = Path("assets/komplet ikon.png")
OUT = Path("assets")
image = Image.open(SOURCE).convert("RGBA")
W, H = image.size

# Współrzędne rozpoznane na podglądzie arkusza (1100 x 1473).
# Przeliczamy je proporcjonalnie na rzeczywistą rozdzielczość PNG.
REFERENCE_W, REFERENCE_H = 1100, 1473
REGIONS = [
    (25, 25, 285, 285),       # 00 śpi
    (295, 15, 530, 290),      # 01 stoi i macha
    (520, 20, 795, 295),      # 02 biegnie
    (795, 15, 1005, 290),     # 03 zdziwiony
    (55, 315, 290, 610),      # 04 zły
    (315, 300, 600, 625),     # 05 triumf
    (630, 300, 980, 625),     # 06 maluje
    (0, 680, 285, 1080),      # 07 piątka
    (275, 680, 575, 1080),    # 08 pozdrawia
    (565, 680, 875, 1080),    # 09 foch
    (865, 680, 1100, 1080),   # 10 smutek
    (10, 1060, 260, 1473),    # 11 hura
    (270, 1060, 555, 1473),  # 12 macha
    (555, 1060, 865, 1473),  # 13 gotowość
    (860, 1060, 1100, 1473), # 14 myśli
]

if len(REGIONS) != 15:
    raise SystemExit("Lista kadrów musi zawierać dokładnie 15 pozycji.")

sx, sy = W / REFERENCE_W, H / REFERENCE_H
for index, (x0, y0, x1, y1) in enumerate(REGIONS):
    box = (round(x0*sx), round(y0*sy), round(x1*sx), round(y1*sy))
    crop = image.crop(box)
    bbox = crop.getchannel("A").getbbox()
    if bbox is None:
        raise SystemExit(f"Kadr {index} jest pusty: {box}")
    l, t, r, b = bbox
    pad = 12
    crop = crop.crop((max(0,l-pad), max(0,t-pad), min(crop.width,r+pad), min(crop.height,b+pad)))
    crop.save(OUT / f"mors-{index:02d}.png", optimize=True)

print(f"Gotowe: {len(REGIONS)} kadrów. Oryginał: {W}x{H}; skala: {sx:.3f} x {sy:.3f}.")
