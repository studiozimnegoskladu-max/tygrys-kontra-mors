from PIL import Image
from pathlib import Path

source = Path("assets/Studio Zimnego Składu ikony llllllllll.png")
out = Path("assets")
image = Image.open(source).convert("RGBA")

# Crop the complete illustrated characters only; labels are deliberately excluded.
crops = {
    "mascot-bobr.png": (193, 51, 635, 565),
    "mascot-lama.png": (964, 0, 1513, 680),
    "mascot-osmiornica.png": (406, 923, 958, 1328),
    "mascot-mors.png": (328, 1475, 731, 1955),
}
for filename, bounds in crops.items():
    image.crop(bounds).save(out / filename, optimize=True)
    print(f"Saved {out / filename}")
