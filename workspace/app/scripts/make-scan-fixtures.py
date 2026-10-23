"""Regenerates the synthetic scan fixtures used by the OCR tests. Synthetic text only. Needs Pillow and LibreOffice (soffice) for the text-layer PDF.
Run from workspace/app: python3 scripts/make-scan-fixtures.py"""
import pathlib, subprocess, shutil, tempfile
from PIL import Image, ImageDraw, ImageFont, ImageFilter

OUT = pathlib.Path(__file__).resolve().parent.parent / "fixtures" / "synthetic" / "scans"
OUT.mkdir(parents=True, exist_ok=True)
TEXT = "As of: 2026-09-21\nRevenue: $1,803,622.07\nNet income: $319,421.48\nTotal assets: $1,200,771.07\nTotal liabilities: $538,677.31\nTotal equity: $662,093.76"
FONT = ImageFont.truetype("/usr/share/fonts/truetype/dejavu/DejaVuSansMono.ttf", 30)

def degrade(img):
    """A poor fax-like scan: downscale hard, blur, add seeded speckle noise, then scale back up."""
    import random
    random.seed(7)
    w, h = img.size
    img = img.resize((int(w * 0.28), int(h * 0.28)), Image.BILINEAR).resize((w, h), Image.BILINEAR).filter(ImageFilter.GaussianBlur(1.6))
    px = img.load()
    for _ in range(int(w * h * 0.04)):
        px[random.randrange(w), random.randrange(h)] = random.choice((0, 255, 120))
    return img

def render(text, size=(1300, 420), noise=False):
    img = Image.new("L", size, 255)
    d = ImageDraw.Draw(img)
    y = 30
    for line in text.split("\n"):
        d.text((50, y), line, font=FONT, fill=20); y += 56
    if noise:
        img = degrade(img)
    return img

render(TEXT).convert("RGB").save(OUT / "statement.png", optimize=True)
render(TEXT).convert("RGB").save(OUT / "statement.jpg", quality=85)
render(TEXT, noise=True).convert("RGB").save(OUT / "statement-blurry.png", optimize=True)
render(TEXT).convert("RGB").save(OUT / "scan.pdf", resolution=150)  # an image-only PDF: no text layer
# a PDF with a real text layer, made from a plain text file
tmp = pathlib.Path(tempfile.mkdtemp())
(tmp / "text.txt").write_text(TEXT.replace("\n", "\n\n"))
subprocess.run(["soffice", "--headless", "--convert-to", "pdf", "--outdir", str(tmp), str(tmp / "text.txt")], check=True, capture_output=True)
shutil.copy(tmp / "text.pdf", OUT / "text-layer.pdf")
pages = [Image.new("RGB", (200, 100), "white") for _ in range(21)]  # over the 20-page limit
pages[0].save(OUT / "many-pages.pdf", save_all=True, append_images=pages[1:])
print("ok", sorted(p.name for p in OUT.iterdir()))
