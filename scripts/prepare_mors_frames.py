from PIL import Image
from pathlib import Path
source = Image.open("assets/komplet ikon.png").convert("RGBA")
W, H = source.size
regions = [
 (20,35,285,280),(295,0,535,285),(535,0,805,285),(800,0,1005,285),
 (55,300,290,600),(315,295,615,605),(625,295,985,610),
 (0,675,285,1040),(265,675,575,1040),(555,675,860,1040),(845,675,W,1040),
 (0,1050,275,H),(255,1050,565,H),(555,1050,855,H),(835,1050,W,H)
]
out=Path("assets")
for i, region in enumerate(regions):
    crop=source.crop(region)
    bbox=crop.getchannel("A").getbbox()
    if bbox:
        l,t,r,b=bbox; pad=7
        crop=crop.crop((max(0,l-pad),max(0,t-pad),min(crop.width,r+pad),min(crop.height,b+pad)))
    crop.save(out/f"mors-{i:02d}.png", optimize=True)
print(f"Przygotowano {len(regions)} kadrów z arkusza {W}x{H}.")
