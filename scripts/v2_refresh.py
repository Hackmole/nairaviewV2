#!/usr/bin/env python3
"""Post-pull static refresh for nairaviewV2 (staging).

Runs after the weekday market pull. Refreshes every hardcoded fallback —
dates, prices, market wrap, baked data.js tables, stock pages, highs-lows,
dividends pages, portfolio snapshot — so the staging site never shows a
stale trade date. Then commits, pushes, and verifies the GitHub Pages deploy.

Idempotent: exits quietly if the trade date hasn't changed since the last
run (failed pull, holiday).

API note (2026-10-06): use `requests`, not urllib, for /api/prices — stdlib
gets truncated bodies through the egress proxy.
"""
import hashlib
import json
import os
import re
import subprocess
import sys
import time
from datetime import datetime, timezone

REPO = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
API = "https://nairaview-api.meetomidiora.workers.dev"
SITE = "https://hackmole.github.io/nairaviewV2/"
HIDDEN = os.path.expanduser("~/workspace/goals/nairaview-ngx-website-build/hidden_files")
WATERMARK = os.path.join(HIDDEN, "v2-refresh-watermark.txt")
LOG = os.path.join(HIDDEN, "v2-refresh.log")

WEEKDAYS = ["MON", "TUE", "WED", "THU", "FRI", "SAT", "SUN"]
WEEKDAYS_LONG = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"]
MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun",
          "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]
MONTHS_LONG = ["January", "February", "March", "April", "May", "June", "July",
               "August", "September", "October", "November", "December"]
MONTHS_UP = [m.upper() for m in MONTHS]
MINUS = "\u2212"  # U+2212, used in baked display strings for negatives


def log(msg):
    line = f"{datetime.now(timezone.utc).strftime('%Y-%m-%d %H:%M:%S')}Z {msg}"
    print(line, flush=True)
    os.makedirs(HIDDEN, exist_ok=True)
    with open(LOG, "a") as fh:
        fh.write(line + "\n")


def get_json(path, timeout=45):
    import requests
    r = requests.get(API + path, headers={"User-Agent": "nairaview-v2-refresh/1.0"},
                     timeout=timeout)
    r.raise_for_status()
    return r.json()


def run(cmd, **kw):
    return subprocess.run(cmd, cwd=REPO, capture_output=True, text=True,
                          timeout=kw.get("timeout", 180))


# ---------- formatters (match the baked page conventions) ----------
def fmt_price(v):
    return f"\u20a6{v:,.2f}"


def fmt_vol(v):
    if not v:
        return "\u2013"
    if v >= 1e9:
        return f"{v / 1e9:.2f}bn"
    return f"{v / 1e6:.1f}m"


def fmt_mcap(v):
    if not v:
        return "\u2013"
    if v >= 1e12:
        return f"\u20a6{v / 1e12:.2f} trillion"
    if v >= 1e9:
        return f"\u20a6{v / 1e9:.2f}bn"
    return f"\u20a6{v / 1e6:.2f}m"


def fmt_pct(v):
    s = f"{abs(v):.2f}%"
    return ("+" if v > 0 else ("-" if v < 0 else "")) + s


def disp_pct(v):
    """Display string with U+2212 minus, e.g. '+10.00%' / '−10.00%'."""
    if v > 0:
        return f"+{v:.2f}%"
    if v < 0:
        return f"{MINUS}{abs(v):.2f}%"
    return "0.00%"


def direction(v):
    return "up" if v > 0 else ("down" if v < 0 else "flat")


def market_narrative(asi, day_chg, d_short, adv, dec, gainers, losers):
    """One-paragraph 'Today on the NGX' ambient summary (brief 6)."""
    if abs(day_chg) < 0.005:
        s1 = f"The ASI closed flat at {asi:,.2f} on {d_short}"
    else:
        verb = "rose" if day_chg > 0 else "slipped"
        s1 = f"The ASI {verb} {abs(day_chg):.2f}% to {asi:,.2f} on {d_short}"
    s1 += f", with {adv} advancers against {dec} decliners."
    parts = [s1]
    def chgof(x):
        c = x.get("official_change_percent")
        return c if c is not None else (x.get("change_percent") or 0)
    if gainers and losers:
        parts.append(f"{gainers[0]['symbol']} led the gainers at {disp_pct(chgof(gainers[0]))}, "
                     f"while {losers[0]['symbol']} paced the losers at {disp_pct(chgof(losers[0]))}.")
    elif gainers:
        parts.append(f"{gainers[0]['symbol']} led the gainers at {disp_pct(chgof(gainers[0]))}.")
    elif losers:
        parts.append(f"{losers[0]['symbol']} paced the losers at {disp_pct(chgof(losers[0]))}.")
    return " ".join(parts)


def spark_closes(sym, n=15):
    """Last n daily closes for a ticker, for homepage sparklines (brief 6)."""
    try:
        h = get_json(f"/api/history?symbol={sym}")
        closes = [p["close"] for p in (h.get("prices") or []) if p.get("close")]
        return [round(v, 2) for v in closes[-n:]] if len(closes) >= 2 else []
    except Exception:
        return []


def whats_happening(sym, st, hlinfo, d_short, has_chart):
    """Plain-English 2-3 sentence market summary for a stock page (brief 3).

    Built from fresh pull data only (day move, 7-day trend, tracked-range
    position). Regenerated on every refresh between the WHATHAPPENING
    markers; chips link to the sections that exist on the page."""
    price = st["current_price"]
    prev = st.get("previous_close") or price
    chg = st.get("official_change_percent")
    chg = chg if chg is not None else (st.get("change_percent") or 0.0)
    move = price - prev
    w7 = st.get("pct_change_7d") or 0.0
    parts = []
    if abs(chg) < 0.005:
        parts.append(f"{sym} closed flat at {fmt_price(price)} on {d_short}, unchanged on the day.")
    else:
        verb = "rose" if chg > 0 else "fell"
        mv = f"{'+' if move >= 0 else MINUS}\u20a6{abs(move):,.2f}"
        parts.append(f"{sym} {verb} {abs(chg):.2f}% to {fmt_price(price)} on {d_short} ({mv} on the day).")
    if abs(w7) >= 0.05:
        wverb = "up" if w7 > 0 else "down"
        parts.append(f"It\u2019s {wverb} {abs(w7):.2f}% over the last 7 days.")
    hi = (hlinfo or {}).get("high")
    lo = (hlinfo or {}).get("low")
    if hi and lo and hi > lo:
        pos = (price - lo) / (hi - lo)
        if pos >= 0.8:
            parts.append(f"It trades near its tracked high of {fmt_price(hi)}.")
        elif pos <= 0.2:
            parts.append(f"It trades near its tracked low of {fmt_price(lo)}.")
    text = " ".join(parts)
    if has_chart:
        chips = ('<a href="#pchartMount">Price chart</a>'
                 '<a href="#history">Historical data</a>'
                 '<a href="#buy">How to buy</a>')
    else:
        chips = ('<a href="#buy">How to buy</a>'
                 '<a href="#faq">FAQ</a>'
                 '<a href="#related">Related stocks</a>')
    return ("<!-- WHATHAPPENING -->\n<div class=\"whathap\">\n"
            f"  <div class=\"kstats-title\">What\u2019s happening with {sym}?</div>\n"
            f"  <p class=\"guide-p\">{text}</p>\n"
            f"  <div class=\"whathap-chips\">{chips}</div>\n</div>\n"
            "<!-- /WHATHAPPENING -->")


def arrow(v):
    return "\u25b2" if v > 0 else ("\u25bc" if v < 0 else "\u2013")


def compact_py(n):
    """Python mirror of live.js compact(): ₦163.655tn / 708.81m / 42,434."""
    n = float(n or 0)
    if n >= 1e12:
        return "\u20a6" + f"{n / 1e12:.3f}tn"
    if n >= 1e9:
        return "\u20a6" + f"{n / 1e9:.2f}bn"
    if n >= 1e6:
        return f"{n / 1e6:.2f}m"
    if n >= 1e3:
        return f"{n / 1e3:.1f}k"
    return str(round(n))


# ---------- main ----------
def main():
    try:
        market = get_json("/api/market")["overview"]["data"]
        prices = get_json("/api/prices")["stocks"]["stocks"]
        asi_hist = get_json("/api/asi-history")
    except Exception as e:
        log(f"ABORT: could not fetch API data: {e}")
        return 1

    trade_date = market["trade_date"][:10]
    last_wm = open(WATERMARK).read().strip() if os.path.exists(WATERMARK) else ""
    if trade_date == last_wm:
        log(f"SKIP: trade date {trade_date} unchanged since last refresh")
        return 0

    dt = datetime.strptime(trade_date, "%Y-%m-%d")
    wd, wd_long = WEEKDAYS[dt.weekday()], WEEKDAYS_LONG[dt.weekday()]
    d, mon, mon_long, mon_up, yyyy = (dt.day, MONTHS[dt.month - 1],
                                     MONTHS_LONG[dt.month - 1],
                                     MONTHS_UP[dt.month - 1], dt.year)
    d_short = f"{d} {mon} {yyyy}"          # 8 Oct 2026
    d_up = f"{wd} {d} {mon_up} {yyyy}"    # THU 8 OCT 2026

    asi = market["asi"]
    day_chg = market.get("pct_change") or 0.0
    adv, dec = market.get("advancers", 0), market.get("decliners", 0)
    mcap_tn = (market.get("market_cap") or 0) / 1e12
    ytd_base = (asi_hist.get("ytd_base") or {}).get("value") or 0
    ytd = (asi - ytd_base) / ytd_base * 100 if ytd_base else 0
    hist = asi_hist.get("history") or []
    wk_chg = 0.0
    if hist:
        yw = dt.isocalendar()[:2]
        week_pts = [p for p in hist
                    if datetime.strptime(p["date"][:10], "%Y-%m-%d").isocalendar()[:2] == yw]
        if len(week_pts) >= 2:
            wk_chg = (week_pts[-1]["value"] - week_pts[0]["value"]) / week_pts[0]["value"] * 100
        elif len(hist) >= 6:
            wk_chg = (hist[-1]["value"] - hist[-6]["value"]) / hist[-6]["value"] * 100

    pmap = {s["symbol"]: s for s in prices}
    log(f"refreshing to trade date {trade_date} (ASI {asi:,.2f}, day {day_chg:+.2f}%)")
    changed = set()
    need_build = False

    # ---- 1. assets/data.js: asiHistory + tables ----
    dj = os.path.join(REPO, "assets", "data.js")
    s = open(dj, encoding="utf-8").read()
    have_dates = set(re.findall(r"\{ d: '(\d{4}-\d{2}-\d{2})'", s))
    new_pts = []
    for p in hist:
        pd = p["date"][:10]
        if pd not in have_dates:
            pdt = datetime.strptime(pd, "%Y-%m-%d")
            new_pts.append(
                f"        {{ d: '{pd}', label: '{pdt.day} {MONTHS[pdt.month - 1]} {pdt.year}', "
                f"v: {p['value']:.2f} }},")
            have_dates.add(pd)
    if new_pts:
        s = re.sub(r"(var asiHistory = \[\n(?:.*\n)*?)(      \];\n)",
                   lambda m: m.group(1) + "\n".join(new_pts) + "\n" + m.group(2), s, count=1)
    else:
        # ensure the trade-date point exists even if hist lacked it
        if trade_date not in have_dates:
            s = re.sub(r"(      \];\n)",
                       f"        {{ d: '{trade_date}', label: '{d_short}', v: {asi:.2f} }},\n\\1",
                       s, count=1)

    def row_gainer(st):
        chg = st.get("official_change_percent")
        chg = chg if chg is not None else (st.get("change_percent") or 0)
        px = st.get("current_price") or 0
        sp = SPARKS.get(st["symbol"], [])
        sp_str = ",".join(f"{v:.2f}" for v in sp)
        return ("          { s: '%s', c: '%s', p: '%s', m: '%s', d: '%s', pv: %.2f, cv: %.2f , mc: %d, sp: [%s]},"
                % (st["symbol"], st["name"].replace("'", "\\'"), fmt_price(px),
                   disp_pct(chg), direction(chg), px, chg, int(st.get("market_cap") or 0), sp_str))

    gainers = sorted([x for x in prices if (x.get("official_change_percent")
                                            if x.get("official_change_percent") is not None
                                            else (x.get("change_percent") or 0)) > 0],
                     key=lambda x: (x.get("official_change_percent")
                                    if x.get("official_change_percent") is not None
                                    else (x.get("change_percent") or 0)), reverse=True)[:5]
    losers = sorted([x for x in prices if (x.get("official_change_percent")
                                           if x.get("official_change_percent") is not None
                                           else (x.get("change_percent") or 0)) < 0],
                    key=lambda x: (x.get("official_change_percent")
                                   if x.get("official_change_percent") is not None
                                   else (x.get("change_percent") or 0)))[:5]
    byvol = sorted([x for x in prices if x.get("volume")], key=lambda x: x["volume"],
                   reverse=True)[:5]
    # sparkline closes for the 10 movers shown on the homepage (brief 6)
    SPARKS = {}
    for _sym in [x["symbol"] for x in gainers + losers]:
        _sp = spark_closes(_sym)
        if _sp:
            SPARKS[_sym] = _sp
    log(f"spark histories baked for {len(SPARKS)} movers")
    vol_rows = [("          { s: '%s', c: '%s', p: '\u2013', m: '%s', d: 'up', pv: null, cv: %.2f, vol: true },"
                 % (x["symbol"], x["name"].replace("'", "\\'"),
                    f"{x['volume'] / 1e6:.2f}m", x["volume"] / 1e6)) for x in byvol]
    tables_new = ("var tables = {\n        gainers: [\n" + "\n".join(row_gainer(x) for x in gainers)
                  + "\n        ],\n        losers: [\n" + "\n".join(row_gainer(x) for x in losers)
                  + "\n        ],\n        volume: [\n" + "\n".join(vol_rows)
                  + "\n        ]\n      };")
    s = re.sub(r"var tables = \{.*?\n      \};", lambda m: tables_new, s, flags=re.S, count=1)
    open(dj, "w", encoding="utf-8").write(s)
    changed.add("assets/data.js")

    # ---- 2. root HTML date labels (site chrome) ----
    topline_re = re.compile(r"DAILY CLOSE (?:\u00b7|&middot;) [A-Z]{3} \d{1,2} [A-Z]{3} \d{4} (?:\u00b7|&middot;) WAT")
    topline_new = f"DAILY CLOSE \u00b7 {d_up} \u00b7 WAT"
    modal_re = re.compile(r"Snapshot (?:\u00b7|&middot;) \d{1,2} [A-Z][a-z]{2} \d{4}")
    modal_new = f"Snapshot \u00b7 {d_short}"
    heat_re = re.compile(r'aria-label="Market heatmap, \d{1,2} [A-Z][a-z]+ \d{4}"')
    heat_new = f'aria-label="Market heatmap, {d} {mon_long} {yyyy}"'
    for root, _dirs, files in os.walk(REPO):
        if "stocks" in root.split(os.sep) or "scripts" in root.split(os.sep):
            continue
        for fn in files:
            if not fn.endswith(".html") or fn == "404.html":
                continue
            # dated articles keep their historical dates
            if fn.startswith("ngx-weekly-recap-") or fn.startswith("ngx-market-"):
                continue
            if fn.startswith("dividends-") and fn != "dividends.html":
                # monthly archive pages: topline may refresh, body is historical
                pass
            p = os.path.join(root, fn)
            t = open(p, encoding="utf-8").read()
            t2 = topline_re.sub(topline_new, t)
            t2 = re.sub(r'(id="modalList">)' + modal_re.pattern, r"\1" + modal_new, t2)
            t2 = heat_re.sub(heat_new, t2)
            if t2 != t:
                open(p, "w", encoding="utf-8").write(t2)
                changed.add(os.path.relpath(p, REPO))

    # ---- 3. index.html hero / chart / market wrap ----
    idx = os.path.join(REPO, "index.html")
    t = open(idx, encoding="utf-8").read()
    t = re.sub(r'(<h1 id="market-heading">)[\d,\.]+(</h1>)', rf"\g<1>{asi:,.2f}\g<2>", t)
    pts = asi * day_chg / 100
    hero_move = (f'<span class="{direction(day_chg)}">{arrow(day_chg)} {disp_pct(day_chg)}</span>'
                 f'<span class="points">{"\u2212" if pts < 0 else "+"}{abs(pts):,.2f} points today</span>')
    t = re.sub(r'(<div class="hero-move" id="heroMove">).*?(</div>)',
               lambda m: m.group(1) + hero_move + m.group(2), t, flags=re.S)
    t = re.sub(r'(<p class="hero-meta" id="heroNote">)As of the \d{1,2} [A-Z][a-z]{2} \d{4} close(</p>)',
               rf"\g<1>As of the {d_short} close\g<2>", t)
    t = re.sub(r'(<div class="chart-value" id="chartValue">)[\d,\.]+(</div>)', rf"\g<1>{asi:,.2f}\g<2>", t)
    t = re.sub(r'(<div class="chart-change" id="chartChange">)[^<]*(</div>)',
               rf"\g<1>{ytd:+.2f}% since 31 Dec 2025\g<2>", t)
    # Hero metric strip — baked fallback so the page is self-consistent on
    # surfaces where live.js can't repaint (e.g. GitHub Pages origin has no
    # API CORS); live.js repaints these same ids at runtime on nairaview.com.
    mcap_s = compact_py(market.get("market_cap") or 0)
    vol_s = compact_py(market.get("volume") or 0).replace("₦", "")
    deals_s = f"{int(round(market.get('deals') or 0)):,}"
    ytd_s = disp_pct(ytd)
    t = re.sub(r'(<span class="metric-value" id="metricMcap">).*?(</span>)',
               rf"\g<1>{mcap_s}\g<2>", t)
    t = re.sub(r'(<span class="metric-value" id="metricVol">).*?(</span>)',
               rf"\g<1>{vol_s}\g<2>", t)
    t = re.sub(r'(<span class="metric-value" id="metricDeals">).*?(</span>)',
               rf"\g<1>{deals_s}\g<2>", t)
    t = re.sub(r'(<span class="metric-value" id="metricYtd">).*?(</span>)',
               rf"\g<1>{ytd_s}\g<2>", t)
    t = re.sub(r'(<span id="periodLabel">)31 Dec 2025 \u2013 \d{1,2} [A-Z][a-z]{2} \d{4}(</span>)',
               rf"\g<1>31 Dec 2025 – {d_short}\g<2>", t)
    t = re.sub(r'(<desc id="chartDesc">).*?(</desc>)',
               rf"\g<1>Interactive chart showing selected verified market closes from 31 December 2025 to {d} {mon_long} {yyyy}.\g<2>", t)
    t = re.sub(r'(<span class="noteDate">)\d{1,2} [A-Z][a-z]{2} \d{4}(</span>)',
               rf"\g<1>{d_short}\g<2>", t)
    t = re.sub(r'(<div class="date" id="wrapDate">)MARKET WRAP \u00b7 \d{1,2} [A-Z]{3}(</div>)',
               rf"\g<1>MARKET WRAP · {d} {mon_up}\g<2>", t)
    w_word = "rises" if wk_chg >= 0 else "slips"
    h3 = (f"ASI {w_word} {abs(wk_chg):.2f}% on the week to {asi:,.2f}; "
          f"market cap \u20a6{mcap_tn:.2f}tn")
    day_word = "closed nearly flat" if abs(day_chg) < 0.1 else ("closed higher" if day_chg > 0 else "closed lower")
    lead = f" {gainers[0]['symbol']} and {gainers[1]['symbol']} led the gainers." if len(gainers) >= 2 else ""
    body = (f"{wd_long} {day_word} at {day_chg:+.2f}% with {adv} advancers against "
            f"{dec} decliners.{lead}")
    t = re.sub(r'(<div class="date" id="wrapDate">.*?</div>\s*<h3>).*?(</h3>)',
               lambda m: m.group(1) + h3 + m.group(2), t, flags=re.S)
    t = re.sub(r'(<div class="date" id="wrapDate">.*?</h3>\s*<p>).*?(</p>)',
               lambda m: m.group(1) + body + m.group(2), t, flags=re.S)
    def _recap_date(fn):
        m = re.search(r"(\d{2})-([a-z]{3})-(\d{4})", fn)
        if not m:
            return ""
        return f"{m.group(3)}-{MONTHS.index(m.group(2).capitalize()) + 1:02d}-{m.group(1)}"
    recaps = sorted([f for f in os.listdir(REPO)
                     if f.startswith("ngx-weekly-recap-") and f.endswith(".html")],
                    key=_recap_date, reverse=True)
    cta_href = recaps[0][:-5] if recaps else "market-recap"
    cta_text = "Read the weekly recap" if recaps else "See the market recap"
    t = re.sub(r'(<a class="btn-gold wrap-cta" href=")[^"]*(">).*?(</a>)',
               lambda m: m.group(1) + cta_href + m.group(2) + cta_text + ' <span aria-hidden="true">&rarr;</span>' + m.group(3),
               t, flags=re.S)
    # "Today on the NGX" ambient narrative (brief 6)
    narr = market_narrative(asi, day_chg, d_short, adv, dec, gainers, losers)
    t = re.sub(r'(<p id="marketNarrative">).*?(</p>)',
               lambda m: m.group(1) + narr + m.group(2), t, flags=re.S)
    open(idx, "w", encoding="utf-8").write(t)
    changed.add("index.html")

    # ---- 4. sector-banking.html date label ----
    sb = os.path.join(REPO, "sector-banking.html")
    if os.path.exists(sb):
        t = open(sb, encoding="utf-8").read()
        t2 = re.sub(r"(Figures as of the )\d{1,2} [A-Z][a-z]{2} \d{4}( close)",
                    rf"\g<1>{d_short}\g<2>", t)
        if t2 != t:
            open(sb, "w", encoding="utf-8").write(t2)
            changed.add("sector-banking.html")

    # ---- 5. highs-lows.json regen ----
    log("regenerating highs-lows.json...")
    r = run([sys.executable, "scripts/gen_highs_lows.py"], timeout=900)
    if r.returncode != 0:
        log(f"WARNING: gen_highs_lows failed: {r.stderr[:200]}")
    else:
        changed.add("assets/highs-lows.json")
    try:
        hl = json.load(open(os.path.join(REPO, "assets/highs-lows.json"), encoding="utf-8"))
        hl_syms = hl.get("symbols", {})
        ws = hl.get("window_start", "2026-09-18")
        wdt = datetime.strptime(ws[:10], "%Y-%m-%d")
        ws_label = f"{wdt.day} {MONTHS[wdt.month - 1]} {wdt.year}"
    except Exception as e:
        log(f"WARNING: could not read highs-lows.json: {e}")
        hl_syms, ws_label = {}, "18 Sep 2026"


    def build_hist_rows(hprices):
        """Rebuild <tbody id="histBody"> rows from /api/history (newest first, max 11)."""
        rows = []
        take = hprices[-12:]  # one extra session back for the oldest row's day change
        for i in range(len(take) - 1, max(0, len(take) - 12), -1):
            cur = take[i]
            prev = take[i - 1] if i > 0 else None
            close = cur.get("close")
            if close is None:
                continue
            try:
                dt = datetime.strptime(str(cur.get("date"))[:10], "%Y-%m-%d")
                dstr = f"{dt.day} {MONTHS[dt.month - 1]} {dt.year}"
            except Exception:
                dstr = str(cur.get("date") or "")
            def cell(v):
                return "\u00b7" if v is None else fmt_price(v)
            pc, dc = "", ""
            if prev and prev.get("close"):
                ch = (close - prev["close"]) / prev["close"] * 100
                pc, dc = disp_pct(ch), direction(ch)
            vol = cur.get("volume") or 0
            rows.append(
                f"<tr><td>{dstr}</td><td>{cell(cur.get('open'))}</td>"
                f"<td>{cell(cur.get('high'))}</td><td>{cell(cur.get('low'))}</td>"
                f"<td>{fmt_price(close)}</td>"
                f'<td class="{dc if dc != "flat" else ""}">{pc}</td>'
                f"<td>{fmt_vol(vol) if vol else chr(183)}</td></tr>")
            if len(rows) >= 11:
                break
        return "\n".join(rows)


    # ---- 6. stocks/*.html in-place refresh ----
    n_stocks = 0
    for fn in sorted(os.listdir(os.path.join(REPO, "stocks"))):
        if not fn.endswith(".html"):
            continue
        sym = fn[:-5]
        st = pmap.get(sym)
        if not st or not st.get("current_price"):
            continue  # keep baked values when the feed lacks this ticker
        p = os.path.join(REPO, "stocks", fn)
        t = open(p, encoding="utf-8").read()
        # Collapse any duplicated history card left by older runs
        t = re.sub(r'(<div class="hist-card" id="history">.*?</tbody></table></div></div>)'
                   r'\s*<div class="hist-card" id="history">.*?</tbody></table></div></div>',
                   r'\1', t, flags=re.S)
        # Fetch session history for the history-table rebuild (best effort)
        hist = None
        try:
            hdoc = get_json(f"/api/history?symbol={sym}", timeout=20)
            hprices = hdoc.get("prices") or []
            if len(hprices) >= 2:
                hist = hprices
        except Exception:
            hist = None
        if hist:
            # Stash the tbody so the blanket date swap below can't clobber real row dates
            t = re.sub(r'<tbody id="histBody">.*?</tbody>',
                       '<tbody id="histBody"><!--HISTBODY--></tbody>', t, flags=re.S)
        price = st["current_price"]
        prev = st.get("previous_close") or price
        chg = st.get("official_change_percent")
        chg = chg if chg is not None else (st.get("change_percent") or 0.0)
        move = price - prev
        w7 = st.get("pct_change_7d") or 0.0
        vol = st.get("volume") or 0
        mcap = st.get("market_cap") or 0
        shares = st.get("shares_outstanding") or 0
        name = st.get("name") or sym
        sector = st.get("sector") or ""
        dc = direction(chg)
        mv = f"{'+' if move >= 0 else '-'}\u20a6{abs(move):,.2f}"
        daystr = f"{fmt_pct(chg)} {arrow(chg)} ({mv})"
        w7str = f"{fmt_pct(w7)} {arrow(w7)}"

        t = re.sub(r'(<div class="quote-price">)[^<]*(</div>)',
                   rf"\g<1>{fmt_price(price)}\g<2>", t)
        t = re.sub(r'(<div class="quote-chg )\w+(">)[^<]*(</div>)',
                   rf"\g<1>{dc}\g<2>{daystr}\g<3>", t)
        t = re.sub(r'(data-stat="prevclose"><div class="k">Previous close</div><div class="v">)[^<]*(</div>)',
                   rf"\g<1>{fmt_price(prev)}\g<2>", t)
        t = re.sub(r'(data-stat="volume"><div class="k">Volume</div><div class="v">)[^<]*(</div>)',
                   rf"\g<1>{fmt_vol(vol)}\g<2>", t)
        t = re.sub(r'(<div class="k">Value traded</div><div class="v">)[^<]*(</div>)',
                   rf"\g<1>{fmt_mcap(vol * price)}\g<2>", t)
        t = re.sub(r'(<div class="k">Market cap</div><div class="v">)[^<]*(</div>)',
                   rf"\g<1>{fmt_mcap(mcap)}\g<2>", t)
        if shares:
            t = re.sub(r'(<div class="k">Shares outstanding</div><div class="v">)[^<]*(</div>)',
                       rf"\g<1>{shares:,.0f}\g<2>", t)
        t = re.sub(r'(data-stat="chg7d"><div class="k">7-day change</div><div class="v )\w+(">)[^<]*(</div>)',
                   rf"\g<1>{direction(w7)}\g<2>{w7str}\g<3>", t)
        hlinfo = hl_syms.get(sym)
        if hlinfo:
            hi, lo = hlinfo.get("high"), hlinfo.get("low")
            if hi and lo:
                t = re.sub(r'(data-stat="hitracked"><div class="k">High &middot; tracked</div><div class="v">)[^<]*(</div>)',
                           rf"\g<1>{fmt_price(hi)}\g<2>", t)
                t = re.sub(r'(data-stat="lotracked"><div class="k">Low &middot; tracked</div><div class="v">)[^<]*(</div>)',
                           rf"\g<1>{fmt_price(lo)}\g<2>", t)
                pos = 50.0 if hi == lo else max(0.0, min(100.0, (price - lo) / (hi - lo) * 100))
                t = re.sub(r'(<span class="prange-marker" style="left:)[\d\.]+(%"></span>)',
                           rf"\g<1>{pos:.1f}\g<2>", t)
                t = re.sub(r"(<span class=\"pl\">Low<b>)[^<]*(</b></span><span class=\"pl\">Now<b>)[^<]*(</b></span><span class=\"pl\">High<b>)[^<]*(</b></span>)",
                           rf"\g<1>{fmt_price(lo)}\g<2>{fmt_price(price)}\g<3>{fmt_price(hi)}\g<4>", t)
        t = re.sub(r"(Tracked range &middot; since )\d{1,2} [A-Z][a-z]{2} \d{4}",
                   rf"\g<1>{ws_label}", t)
        t = re.sub(r'(<div class="kstats-title">Key statistics &middot; )\d{1,2} [A-Z][a-z]{2} \d{4}( close</div>)',
                   rf"\g<1>{d_short}\g<2>", t)
        t = re.sub(r'(<p class="asof">As of the )\d{1,2} [A-Z][a-z]{2} \d{4}( close · 16:00 WAT\.</p>)',
                   rf"\g<1>{d_short}\g<2>", t)
        # Stock-page topline uses the all-caps format: DAILY CLOSE &middot; 5 OCT 2026 &middot; WAT
        d_up_short = f"{d} {mon_up} {yyyy}"
        t = re.sub(r'(DAILY CLOSE (?:\u00b7|&middot;) )\d{1,2} [A-Z]{3} \d{4}( (?:\u00b7|&middot;) WAT)',
                   rf"\g<1>{d_up_short}\g<2>", t)
        # "What's happening" summary block (brief 3): regenerated each refresh
        wh = whats_happening(sym, st, hlinfo, d_short, 'id="pchartMount"' in t)
        t = re.sub(r'<!-- WHATHAPPENING -->.*?<!-- /WHATHAPPENING -->',
                   lambda m: wh, t, flags=re.S)
        # meta descriptions + JSON-LD (recomputed, then blanket date swap for leftovers)
        meta_new = (f"{sym} ({name}) share price is {fmt_price(price)} ({daystr}) as of the "
                    f"{d_short} NGX close. 7-day change {w7str}, market cap {fmt_mcap(mcap)}, "
                    f"{sector} sector. Updated daily on Nairaview.")
        og_new = (f"{sym} ({name}) share price {fmt_price(price)} ({daystr}) at the "
                  f"{d_short} close. 7-day change {w7str}, market cap {fmt_mcap(mcap)}. "
                  f"Daily-close NGX data on Nairaview.")
        ld_new = (f"{name} ({sym}) last closed at {fmt_price(price)} ({daystr} on the day) "
                  f"on {d_short}.")
        t = re.sub(r'(<meta name="description" content=")[^"]*(")',
                   lambda m: m.group(1) + meta_new.replace('"', "&quot;") + m.group(2), t)
        t = re.sub(r'(<meta property="og:description" content=")[^"]*(")',
                   lambda m: m.group(1) + og_new.replace('"', "&quot;") + m.group(2), t)
        t = re.sub(r'(<meta name="twitter:description" content=")[^"]*(")',
                   lambda m: m.group(1) + og_new.replace('"', "&quot;") + m.group(2), t)
        # Visible FAQ: refresh the price answer (Q1) and the tracked-session count (Q3)
        faq1_new = (f"{name} ({sym}) last closed at <strong>{fmt_price(price)}</strong> "
                    f"({daystr}) on {d_short}. Prices update here after each NGX trading session.")
        t = re.sub(r'(What is the current [^<]*? share price\?</summary><div class="faq-a"><p class="guide-p">)'
                   r'.*?(</p></div></details>)',
                   lambda m: m.group(1) + faq1_new + m.group(2), t, count=1)
        n_sess = len(hist) if hist else 11
        t = re.sub(r'(covers (?:all|the last) )\d+( tracked sessions)',
                   rf"\g<1>{n_sess}\g<2>", t)
        # JSON-LD: rebuild the whole FAQPage block from the visible answers (valid JSON, no HTML)
        faq_entities = [
            {"@type": "Question", "name": f"What is the current {sym} share price?",
             "acceptedAnswer": {"@type": "Answer",
                "text": f"{name} ({sym}) last closed at {fmt_price(price)} ({daystr}) on {d_short}."}},
            {"@type": "Question", "name": f"What sector is {sym} in?",
             "acceptedAnswer": {"@type": "Answer",
                "text": f"{sym} is listed on the NGX Main Board under the {sector} sector."}},
            {"@type": "Question", "name": f"Where can I see {sym}\u2019s recent price trend?",
             "acceptedAnswer": {"@type": "Answer",
                "text": f"The interactive chart on this page covers the last {n_sess} tracked sessions for {sym}."}},
            {"@type": "Question", "name": f"Is {sym} a good investment?",
             "acceptedAnswer": {"@type": "Answer",
                "text": "Nairaview provides market data, not investment advice. Consider the company\u2019s "
                        "financials, your goals and risk tolerance, and speak to a licensed adviser before deciding."}},
        ]
        ld_doc = {"@context": "https://schema.org", "@type": "FAQPage", "mainEntity": faq_entities}
        ld_html = ('<script type="application/ld+json">\n' +
                   json.dumps(ld_doc, ensure_ascii=False, indent=2) +
                   '\n</script>')
        t = re.sub(r'<script type="application/ld\+json">.*?</script>',
                   lambda m: ld_html if '"FAQPage"' in m.group(0) else m.group(0),
                   t, flags=re.S, count=1)
        t = re.sub(r"\d{1,2} [A-Z][a-z]{2} \d{4}", d_short, t)
        if hist and "<!--HISTBODY-->" in t:
            t = t.replace("<!--HISTBODY-->", build_hist_rows(hist))
        open(p, "w", encoding="utf-8").write(t)
        n_stocks += 1
    log(f"refreshed {n_stocks} stock pages")
    if n_stocks:
        changed.add("stocks/*.html")

    # ---- 7. dividends pages ----
    log("running dividend automation...")
    r = run([sys.executable, "scripts/gen_dividends.py"], timeout=300)
    log("gen_dividends: " + (r.stdout.strip().splitlines()[-1] if r.stdout.strip() else "no output"))
    if "json_changed=True" in (r.stdout or ""):
        isl = os.path.join(REPO, "src/islands/Dividends.tsx")
        t = open(isl, encoding="utf-8").read()
        today = datetime.now(timezone.utc).strftime("%Y%m%d")
        m = re.search(r"dividends\.json\?v=" + today + r"([a-z]?)", t)
        letter = chr(ord((m.group(1) or "@")) + 1) if m else "a"
        t = re.sub(r"dividends\.json\?v=\d{8}[a-z]?", f"dividends.json?v={today}{letter}", t)
        open(isl, "w", encoding="utf-8").write(t)
        need_build = True
        log(f"dividends.json changed; island cache version bumped to {today}{letter}")

    # ---- 8. portfolio snapshot prices ----
    pf = os.path.join(REPO, "src/islands/Portfolio.tsx")
    t = open(pf, encoding="utf-8").read()
    m = re.search(r"const SNAPSHOT: Record<string, number> = \{([^}]*)\};", t, re.S)
    if m:
        syms = re.findall(r"(\w+):", m.group(1))
        parts = []
        for sym in syms:
            px = (pmap.get(sym) or {}).get("current_price")
            if px:
                parts.append(f"{sym}: {px}")
            else:
                old = re.search(sym + r": ([\d\.]+)", m.group(1))
                parts.append(f"{sym}: {old.group(1)}" if old else f"{sym}: 0")
        t = t.replace(m.group(0), "const SNAPSHOT: Record<string, number> = {\n  " +
                      ",\n  ".join(parts) + ",\n};")
        open(pf, "w", encoding="utf-8").write(t)
        need_build = True
        log("portfolio SNAPSHOT prices updated")

    # ---- 9. rebuild islands if a TSX island changed ----
    if need_build:
        log("rebuilding islands...")
        r = run(["npm", "run", "typecheck"], timeout=180)
        if r.returncode != 0:
            log(f"ABORT: typecheck failed: {r.stderr[:300]}")
            return 1
        r = run(["npm", "run", "build"], timeout=180)
        if r.returncode != 0:
            log(f"ABORT: build failed: {r.stderr[:300]}")
            return 1
        changed.add("assets/islands.js")

    # ---- 10. cache-version bump for changed assets ----
    r = run(["git", "status", "--porcelain", "assets/"])
    if r.stdout.strip():
        today = datetime.now(timezone.utc).strftime("%Y%m%d")
        blob = run(["git", "grep", "-h", "?v=", "--", "*.html"]).stdout or ""
        used = set(re.findall(r"\?v=" + today + r"([a-z])", blob))
        letter = chr(ord("a") + len(used)) if len(used) < 26 else "z"
        new_v = today + letter
        for line in run(["git", "status", "--porcelain"]).stdout.splitlines():
            f = line[3:].strip().strip('"')
            if f.endswith(".html"):
                p = os.path.join(REPO, f)
                if os.path.exists(p):
                    s = open(p, encoding="utf-8").read()

                    def _bump(m):
                        dark = re.search(r"dark(\d+)$", m.group(1))
                        return f"?v={new_v}" + (f"dark{dark.group(1)}" if dark else "")

                    s2 = re.sub(r"\?v=([^\"'&\s]+)", _bump, s)
                    if s2 != s:
                        open(p, "w", encoding="utf-8").write(s2)
        log(f"asset version bumped to {new_v}")

    # ---- 11. commit + push ----
    run(["git", "add", "-A"])
    r = run(["git", "status", "--porcelain"])
    if not r.stdout.strip():
        log("nothing changed after refresh; skipping commit")
    else:
        n = len(r.stdout.strip().splitlines())
        r = run(["git", "commit", "-m", f"auto: v2 refresh to {trade_date} close ({n} files)"])
        log("committed")
        r = run(["git", "push", "origin", "main"], timeout=180)
        if r.returncode != 0:
            log(f"ABORT: push failed: {r.stderr[:300]}")
            return 1
        log("pushed to main")
        deadline = time.time() + 300
        ok = False
        probe = f"{SITE}?cb=v2refresh{int(time.time())}"
        while time.time() < deadline:
            time.sleep(25)
            try:
                import requests
                html = requests.get(probe, headers={"User-Agent": "nairaview-v2-refresh/1.0"},
                                    timeout=30).text
                if d_up in html:
                    ok = True
                    break
            except Exception as e:
                log(f"verify probe failed: {e}")
        log("staging verified" if ok else "WARNING: staging did not show new content within 5 min")

    with open(WATERMARK, "w") as fh:
        fh.write(trade_date)
    log(f"done: refreshed to {trade_date}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
