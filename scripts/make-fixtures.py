"""Builds the PDF fixtures used by the end-to-end tests (needs reportlab + Pillow).

  python3 scripts/make-fixtures.py
"""
from io import BytesIO
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont
from reportlab.lib.pagesizes import A4
from reportlab.lib.utils import ImageReader
from reportlab.pdfgen import canvas

OUT = Path(__file__).resolve().parent.parent / "e2e" / "fixtures"
OUT.mkdir(parents=True, exist_ok=True)
W, H = A4


def photo(color, size=(480, 360)):
    img = Image.new("RGB", size, color)
    d = ImageDraw.Draw(img)
    for i in range(0, size[0], 24):
        d.line([(i, 0), (i + 60, size[1])], fill=(255, 255, 255), width=3)
    d.ellipse([140, 80, 340, 280], fill=(240, 200, 210))
    buf = BytesIO()
    img.save(buf, "JPEG")
    buf.seek(0)
    return ImageReader(buf)


def logo():
    img = Image.new("RGB", (64, 64), (30, 120, 200))
    buf = BytesIO()
    img.save(buf, "PNG")
    buf.seek(0)
    return ImageReader(buf)


def header_footer(c, page):
    c.drawImage(logo(), 40, H - 50, 24, 24)
    c.setFont("Helvetica", 9)
    c.drawString(72, H - 40, "Little Studio - crochet patterns")
    c.drawString(W / 2, 30, str(page))


def text_pdf():
    c = canvas.Canvas(str(OUT / "bunny.pdf"), pagesize=A4)
    c.setTitle("Spring Bunny")
    header_footer(c, 1)
    c.setFont("Helvetica-Bold", 26)
    c.drawString(60, H - 100, "Spring Bunny")
    c.drawImage(photo((120, 170, 120)), 60, H - 380, 240, 180)
    c.setFont("Helvetica", 11)
    y = H - 410
    for line in ["Hook: 3 mm", "Yarn: cotton, colour A: white", "8 mm safety eyes", "Finished size: about 12 cm"]:
        c.drawString(60, y, line)
        y -= 16
    # Two columns.
    y0 = H - 500
    c.setFont("Helvetica-Bold", 12)
    c.drawString(60, y0, "HEAD")
    c.drawString(320, y0, "EARS (make 2)")
    c.setFont("Helvetica", 11)
    left = ["R1: 6 sc in MR (6)", "R2: inc around (12)", "R3: (sc, inc) x6 (18)", "R4: (sc 2, inc) x6", "(24)", "R5-R8: sc around (24)"]
    right = ["R1: 5 sc in MR (5)", "R2: inc around (10)", "R3-R9: sc around (10)", "Fasten off, leave a long tail [3]."]
    for i, s in enumerate(left):
        c.drawString(60, y0 - 18 * (i + 1), s)
    for i, s in enumerate(right):
        c.drawString(320, y0 - 18 * (i + 1), s)
    c.showPage()

    header_footer(c, 2)
    c.setFont("Helvetica-Bold", 12)
    c.drawString(60, H - 100, "BODY")
    c.setFont("Helvetica-Bold", 10)
    for x, s in [(60, "Round"), (130, "Instructions"), (420, "Count")]:
        c.drawString(x, H - 125, s)
    c.setFont("Helvetica", 11)
    rows = [("1", "6 sc in MR", "6"), ("2", "inc around", "12"), ("3", "(sc, inc) x6", "18"), ("4", "sc around", "18")]
    for i, (a, b, n) in enumerate(rows):
        yy = H - 145 - 18 * i
        c.drawString(60, yy, a)
        c.drawString(130, yy, b)
        c.drawString(420, yy, n)
    # Superscript: "5th rnd".
    yy = H - 145 - 18 * 4
    c.drawString(60, yy, "5")
    c.setFont("Helvetica", 7)
    c.drawString(66.5, yy + 4, "th")
    c.setFont("Helvetica", 11)
    c.drawString(76, yy, "rnd: sc around (18)")
    c.drawImage(photo((200, 140, 90)), 300, 200, 200, 150)
    c.save()


def scanned_pdf():
    img = Image.new("L", (1240, 1754), 255)
    d = ImageDraw.Draw(img)
    try:
        font = ImageFont.truetype("/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf", 34)
        bold = ImageFont.truetype("/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf", 44)
    except OSError:
        font = bold = ImageFont.load_default()
    d.text((120, 120), "Petit Chat", font=bold, fill=0)
    lines = [
        "Crochet 2,5 mm, coton gris.",
        "",
        "TETE",
        "R1 : 6 ms dans un cercle magique (6)",
        "R2 : 6 aug (12)",
        "R3 : (1 ms, 1 aug) x 6 (18)",
        "R4 : (2 ms, 1 aug) x 6 (24)",
        "R5 : 1 ms dans chaque m (24)",
        "R6 : (2 ms, 1 dim) x 6 (18)",
    ]
    y = 240
    for s in lines:
        d.text((120, y), s, font=font, fill=0)
        y += 60
    buf = BytesIO()
    img.convert("RGB").save(buf, "JPEG", quality=92)
    buf.seek(0)
    c = canvas.Canvas(str(OUT / "chat-scan.pdf"), pagesize=A4)
    c.drawImage(ImageReader(buf), 0, 0, W, H)
    c.save()


text_pdf()
scanned_pdf()
print("fixtures written to", OUT)
