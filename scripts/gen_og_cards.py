#!/usr/bin/env python3
"""Per-stock og:image cards (1200x630) for Nairaview V2 stock pages."""
import os, requests
from PIL import Image, ImageDraw, ImageFont

REPO = "/home/hatch/workspace/nairaviewV2"
OUT = os.path.join(REPO, "assets/img/og/stocks")
API = "https://nairaview-api.meetomidiora.workers.dev"
FB = "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf"
FR = "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf"

DARK = (2, 33, 38); GREEN = (119, 252, 73); GOLD = (201, 162, 39)
WHITE = (255, 255, 255); MUTED = (140, 160, 150); RED = (255, 110, 110)

def font(path, size):
    return ImageFont.truetype(path, size)

def card(sym, name, price, chg, dstr):
    img = Image.new("RGB", (1200, 630), DARK)
    dr = ImageDraw.Draw(img)
    # top accent bar
    dr.rectangle([0, 0, 1200, 10], fill=GREEN)
    # wordmark
    f_wm = font(FB, 44)
    dr.text((70, 46), "\u20a6", font=f_wm, fill=GOLD)
    dr.text((108, 46), "airaview", font=f_wm, fill=GREEN)
    # ticker
    f_sym = font(FB, 120)
    dr.text((70, 150), sym, font=f_sym, fill=WHITE)
    # name (truncate)
    f_name = font(FR, 40)
    nm = name if len(name) <= 42 else name[:41] + "\u2026"
    dr.text((72, 300), nm, font=f_name, fill=MUTED)
    # price
    f_px = font(FB, 96)
    dr.text((70, 380), "\u20a6{:,.2f}".format(price), font=f_px, fill=WHITE)
    # change pill
    f_chg = font(FB, 44)
    up = chg >= 0
    txt = ("▲ +" if up else "▼ \u2212") + "{:.2f}%".format(abs(chg))
    col = GREEN if up else RED
    dr.text((72, 500), txt, font=f_chg, fill=col)
    # footer
    f_ft = font(FR, 30)
    dr.text((70, 570), "nairaview.com", font=f_ft, fill=MUTED)
    dr.text((880, 570), dstr, font=f_ft, fill=MUTED)
    return img

def main():
    os.makedirs(OUT, exist_ok=True)
    doc = requests.get(API + "/api/prices", timeout=60).json()["stocks"]["stocks"]
    mdoc = requests.get(API + "/api/market", timeout=30).json()["overview"]["data"]
    dstr = "As of the {} close".format(mdoc["trade_date"][:10])
    n = 0
    for st in doc:
        sym = st.get("symbol")
        px = st.get("current_price")
        if not sym or not px:
            continue
        chg = st.get("official_change_percent")
        if chg is None:
            chg = st.get("change_percent") or 0.0
        img = card(sym, st.get("name") or sym, px, chg, dstr)
        img.save(os.path.join(OUT, sym + ".png"), optimize=True)
        n += 1
    print("og cards:", n)

if __name__ == "__main__":
    main()
