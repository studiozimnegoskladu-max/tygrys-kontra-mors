from PIL import Image
from pathlib import Path

SOURCE = Path("assets/komplet ikon.png")
OUT = Path("assets")
image = Image.open(SOURCE).convert("RGBA")
W, H = image.size

# Rzeczywiste obszary poszczególnych rysunków na arkuszu 1097 x 1473.
# Każda poza ma własny kadr; nie dzielimy arkusza na równą siatkę.
REGIONS = [
    (25, 25, 285, 285),       # 00 śpi
    (295, 15, 530, 290),      # 01 stoi i macha
    (520, 20, 795, 295),      # 02 biegnie
    (795, 15, 1005, 290),     # 03 zdziwiony
    (55, 315, 290, 610),      # 04 zły
    (315, 300, 600, 625),     # 05 triumf
    (630, 300, 980, 625),     # 06 maluje
    (0, 680, 285, 1030),      # 07 piątka
    (275, 680, 575, 1030),    # 08 pozdrawia
    (565, 680, 875, 1030),   # 09 foch
    (865, 680, W, 1030),     # 10 smutek
    (10, 1060, 260, H),      # 11 hura
    (270, 1060, 555, H),     # 12 macha
    (555, 1060, 865, H),     # 13 gotowość
    (860, 1060, W, H),       # 14 myśli
]

if len(REGIONS) != 15:
    raise SystemExit("Lista kadrów musi zawierać dokładnie 15 pozycji.")

for index, (left, top, right, bottom) in enumerate(REGIONS):
    left, top = max(0, left), max(0, top)
    right, bottom = min(W, right), min(H, bottom)
    crop = image.crop((left, top, right, bottom))
    alpha = crop.getchannel("A")
    bbox = alpha.getbbox()
    if bbox is None:
        raise SystemExit(f"Kadr {index} jest pusty: {(left, top, right, bottom)}")
    # Przycinamy do faktycznie widocznych pikseli z niewielkim marginesem.
    x0, y0, x1, y1 = bbox
    pad = 9
    crop = crop.crop((
        max(0, x0 - pad), max(0, y0 - pad),
        min(crop.width, x1 + pad), min(crop.height, y1 + pad)
    ))
    crop.save(OUT / f"mors-{index:02d}.png", optimize=True)

print(f"Gotowe: {len(REGIONS)} osobnych kadrów z oryginalnego arkusza {W}x{H}.")
