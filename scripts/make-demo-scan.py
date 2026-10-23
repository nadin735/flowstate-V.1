"""
Generates demo/flowstate-demo-scan.pdf: a FICTIONAL process-baseline data sheet that looks
like a scanned paper form (grey paper, slight skew, noise, stamp, handwriting) and carries
an invisible text layer, like the "searchable PDF" output of office scanners with OCR.
The text layer is written from the form source so the demo is reproducible (real OCR
output varies and may drop decimal commas — FLOWSTATE's review step flags such values).

Requires: reportlab, Pillow and pdftoppm (poppler).
Usage:    python3 scripts/make-demo-scan.py
"""
import os
import random
import subprocess
import tempfile

from PIL import Image, ImageDraw, ImageFilter, ImageFont, ImageOps
from reportlab.lib.pagesizes import A4
from reportlab.lib.units import mm
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.pdfgen import canvas

OUT_DIR = os.path.join(os.path.dirname(__file__), "..", "demo")
OUT = os.path.join(OUT_DIR, "flowstate-demo-scan.pdf")
FONT = "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf"
FONT_B = "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf"
pdfmetrics.registerFont(TTFont("Sans", FONT))
pdfmetrics.registerFont(TTFont("SansB", FONT_B))

STEPS = [
    ("Rechnungseingang", "2,5", "10 %", "1,5 %", "12", "1,0", "Poststelle"),
    ("Datenerfassung", "5,0", "5 %", "5,0 %", "20", "1,8", "Kreditoren"),
    ("Prüfung", "4,0", "15 %", "3,5 %", "30", "2,2", "Kreditoren"),
    ("Freigabe", "3,0", "0 %", "1,0 %", "15", "4,5", "Kostenstellen"),
    ("Zahlung", "1,5", "55 %", "0,5 %", "25", "2,0", "Treasury"),
]


def draw_form(c) -> None:
    w, h = A4
    x0 = 20 * mm
    y = h - 22 * mm
    c.setFont("SansB", 15)
    c.drawString(x0, y, "Prozessaufnahme Kreditorenbuchhaltung")
    c.setFont("Sans", 9)
    y -= 6 * mm
    c.drawString(x0, y, "Formular PA-03  |  Rechnungseingang bis Zahlung  |  DEMO-DOKUMENT, fiktive Daten")
    c.line(x0, y - 3 * mm, w - x0, y - 3 * mm)

    def section(title: str, yy: float) -> float:
        c.setFont("SansB", 11)
        c.drawString(x0, yy, title)
        return yy - 8 * mm

    def kv(label: str, value: str, yy: float, x: float = x0) -> None:
        c.setFont("Sans", 10.5)
        c.drawString(x, yy, f"{label}: {value}")

    y = section("1. Stammdaten", y - 12 * mm)
    kv("Unternehmen", "Hanse Präzisionsteile GmbH", y)
    y -= 7 * mm
    kv("Branche", "Maschinenbau", y)
    kv("Land", "Deutschland", y, x0 + 95 * mm)
    y -= 7 * mm
    kv("ERP-System", "SAP S/4HANA", y)
    kv("Mitarbeitende", "640", y, x0 + 95 * mm)
    y -= 7 * mm
    kv("Projektleitung", "Katrin Albers", y)
    kv("Sponsor", "Dr. Jens Hoffmann", y, x0 + 95 * mm)

    y = section("2. Volumen und Kosten", y - 13 * mm)
    kv("Rechnungen pro Monat", "3.600", y)
    kv("Durchschnittlicher Rechnungsbetrag", "2.150 EUR", y, x0 + 95 * mm)
    y -= 7 * mm
    kv("Stundensatz", "44,00 EUR (Vollkosten)", y)
    kv("Skonto-Anteil", "35 %", y, x0 + 95 * mm)
    y -= 7 * mm
    kv("Skontosatz", "2 %", y)
    kv("Skonto genutzt", "30 %", y, x0 + 95 * mm)

    y = section("3. Prozessschritte (Durchschnitt je Rechnung)", y - 13 * mm)
    cols = [x0, x0 + 50 * mm, x0 + 72 * mm, x0 + 93 * mm, x0 + 114 * mm, x0 + 134 * mm, x0 + 151 * mm]
    heads = ["Prozessschritt", "Minuten", "Autom.", "Fehler", "Nacharb.", "Warten", "Verantw."]
    sub = ["", "je Rechnung", "Anteil", "Quote", "Min.", "Tage", ""]
    c.setFont("SansB", 9.5)
    for cx, t in zip(cols, heads):
        c.drawString(cx, y, t)
    c.setFont("Sans", 8)
    for cx, t in zip(cols, sub):
        c.drawString(cx, y - 4 * mm, t)
    y -= 7 * mm
    c.line(x0, y, w - x0, y)
    y -= 8 * mm
    c.setFont("Sans", 13)
    for row in STEPS:
        for cx, t in zip(cols, row):
            c.drawString(cx, y, t)
        y -= 6 * mm
        c.setLineWidth(0.3)
        c.line(x0, y + 2 * mm, w - x0, y + 2 * mm)
        y -= 4 * mm

    y = section("4. Anmerkungen", y - 8 * mm)
    c.setFont("Sans", 10)
    for line in [
        "Ca. 60 % der Rechnungen kommen als PDF per E-Mail, 25 % auf Papier.",
        "Freigaben laufen per E-Mail; keine Vertreterregelung bei Abwesenheit.",
        "Skonto wird regelmäßig verpasst.",
    ]:
        c.drawString(x0, y, line)
        y -= 6 * mm

    c.setFont("Sans", 9)
    c.line(x0, 40 * mm, x0 + 60 * mm, 40 * mm)
    c.drawString(x0, 35 * mm, "Datum, Unterschrift Kreditorenbuchhaltung")
    c.line(w - x0 - 60 * mm, 40 * mm, w - x0, 40 * mm)
    c.drawString(w - x0 - 60 * mm, 35 * mm, "Gepr. Controlling")


class TextLayer:
    """Canvas stand-in that writes only invisible text (render mode 3) — the OCR layer."""

    def __init__(self, c):
        self.c = c
        self.font = ("Sans", 10)

    def setFont(self, name, size):
        self.font = (name, size)

    def drawString(self, x, y, text):
        t = self.c.beginText(x, y)
        t.setTextRenderMode(3)
        t.setFont(*self.font)
        t.textOut(text)
        self.c.drawText(t)

    def line(self, *a):
        pass

    def setLineWidth(self, *a):
        pass


def scanify(png_in: str, png_out: str) -> None:
    random.seed(7)
    img = Image.open(png_in).convert("L")
    w, h = img.size
    # Handwriting-like fill-ins and a stamp
    d = ImageDraw.Draw(img)
    hand = ImageFont.truetype("/usr/share/fonts/truetype/dejavu/DejaVuSerif-Bold.ttf" if os.path.exists("/usr/share/fonts/truetype/dejavu/DejaVuSerif-Bold.ttf") else FONT_B, 38)
    d.text((int(w * 0.12), int(h * 0.832)), "14.10.2026   K. Albers", fill=70, font=hand)
    stamp = Image.new("L", (520, 170), 255)
    sd = ImageDraw.Draw(stamp)
    sd.rectangle([4, 4, 515, 165], outline=110, width=7)
    sd.text((40, 38), "EINGEGANGEN", fill=110, font=ImageFont.truetype(FONT_B, 60))
    sd.text((150, 112), "15. OKT. 2026", fill=110, font=ImageFont.truetype(FONT_B, 34))
    stamp = stamp.rotate(-8, expand=True, fillcolor=255)
    img.paste(Image.composite(Image.new("L", stamp.size, 110), img.crop((int(w * 0.6), int(h * 0.63), int(w * 0.6) + stamp.width, int(h * 0.63) + stamp.height)), ImageOps.invert(stamp).point(lambda p: 255 if p > 40 else 0)), (int(w * 0.6), int(h * 0.63)))
    # Paper tone, skew, blur and noise
    img = img.rotate(0.7, resample=Image.BICUBIC, expand=False, fillcolor=255)
    img = img.filter(ImageFilter.GaussianBlur(0.45))
    px = img.load()
    for _ in range(int(w * h * 0.0025)):
        x, y = random.randrange(w), random.randrange(h)
        px[x, y] = random.randrange(90, 200)
    tone = Image.new("L", img.size, 236)
    img = Image.composite(img, tone, img.point(lambda p: 255 if p < 225 else 0))
    # Darker scanner edge on the left
    edge = Image.linear_gradient("L").rotate(90).resize((60, h)).point(lambda p: 150 + p // 3)
    img.paste(edge, (0, 0))
    img.save(png_out, dpi=(300, 300))


def main() -> None:
    os.makedirs(OUT_DIR, exist_ok=True)
    with tempfile.TemporaryDirectory() as tmp:
        form = os.path.join(tmp, "form.pdf")
        c = canvas.Canvas(form, pagesize=A4)
        draw_form(c)
        c.showPage()
        c.save()
        subprocess.run(["pdftoppm", "-r", "200", "-png", "-singlefile", form, os.path.join(tmp, "page")], check=True)
        scan = os.path.join(tmp, "scan.jpg")
        png = os.path.join(tmp, "scan.png")
        scanify(os.path.join(tmp, "page.png"), png)
        Image.open(png).convert("L").save(scan, quality=72)
        out = canvas.Canvas(OUT, pagesize=A4)
        out.setTitle("Prozessaufnahme Kreditorenbuchhaltung (Demo-Scan)")
        out.setAuthor("FLOWSTATE demo")
        w, h = A4
        out.drawImage(scan, 0, 0, width=w, height=h)
        draw_form(TextLayer(out))
        out.showPage()
        out.save()
    print("wrote", os.path.relpath(OUT))


if __name__ == "__main__":
    main()
