#!/usr/bin/env python3
"""Generate the daily FX market recap.

Reads /api/fx (latest + 13-day history), builds today's recap entry:
template lede from day-over-day moves, per-currency move table, and a
"what to watch" line from the fixed-income auction calendars.
Prepends to assets/fx-recaps.json, capped at 14 entries.

Numbers only: never asserts causes (YMYL). Drivers stay human-written.
"""
import json
import sys
from datetime import datetime, timezone

import requests

API = "https://nairaview-api.meetomidiora.workers.dev/api/fx"
OUT = "assets/fx-recaps.json"
FI = "assets/fixed-income.json"
CAP = 14

CCYS = [("USD", "dollar"), ("EUR", "euro"), ("GBP", "pound")]


def n(x):
    return f"\u20a6{x:,.2f}"


def fmt_date(iso):
    d = datetime.strptime(iso, "%Y-%m-%d")
    return d.strftime("%A, %-d %B %Y")


def move_word(chg_pct):
    a = abs(chg_pct)
    if a < 0.05:
        return "held steady"
    return "rose" if chg_pct > 0 else "eased"


def main():
    doc = requests.get(API, timeout=30).json()
    latest = doc.get("latest", {})
    history = doc.get("history", {})
    if not latest or not history:
        print("no fx data")
        return 1

    # trade date = latest history date across ccys
    dates = [p["date"] for h in history.values() for p in h]
    today = max(dates)
    moves = {}
    for code, _ in CCYS:
        h = sorted(history.get(code, []), key=lambda p: p["date"])
        if len(h) < 2:
            continue
        t, y = h[-1], h[-2]
        moves[code] = {
            "date": t["date"],
            "official": t["official"],
            "parallel": t["parallel"],
            "d_off": t["official"] - y["official"],
            "d_par": t["parallel"] - y["parallel"],
            "premium": (t["parallel"] - t["official"]) / t["official"] * 100,
        }

    u = moves.get("USD")
    if not u:
        print("no USD history")
        return 1

    w = move_word(u["d_par"] / (u["parallel"] - u["d_par"]) * 100)
    dsign = "up" if u["d_par"] >= 0 else "down"
    lede = (
        f"{fmt_date(u['date'])}: a dollar cost {n(u['parallel'])} on the parallel market "
        f"({w}, {dsign} {n(abs(u['d_par']))} on the day) against an official NFEM rate of "
        f"{n(u['official'])} ({'up' if u['d_off'] >= 0 else 'down'} {n(abs(u['d_off']))}). "
        f"The street premium stands at {u['premium']:.2f}%."
    )

    # what to watch: from fixed-income auction calendars
    watch = []
    try:
        fi = json.load(open(FI))
        cal = fi.get("auction_calendar", {})
        for d in cal.get("upcoming", []):
            if d >= today:
                watch.append(f"Next NTB auction: {fmt_date(d)}")
                break
        fba = fi.get("fgn_bond_auctions", {})
        for d in fba.get("upcoming", []):
            if d >= today:
                watch.append(f"Next FGN bond auction: {fmt_date(d)} ({fba.get('offer', '')} on offer)")
                break
    except Exception:
        pass

    entry = {
        "date": u["date"],
        "lede": lede,
        "moves": {
            code: {
                "official": m["official"],
                "parallel": m["parallel"],
                "d_official": round(m["d_off"], 2),
                "d_parallel": round(m["d_par"], 2),
                "premium_pct": round(m["premium"], 2),
            }
            for code, m in moves.items()
        },
        "watch": watch,
        "generated_at": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
    }

    try:
        recaps = json.load(open(OUT))
    except Exception:
        recaps = []
    recaps = [e for e in recaps if e.get("date") != entry["date"]]
    recaps.insert(0, entry)
    json.dump(recaps[:CAP], open(OUT, "w"), indent=2)
    print(f"recap written for {entry['date']} ({len(recaps[:CAP])} kept)")


if __name__ == "__main__":
    sys.exit(main())
