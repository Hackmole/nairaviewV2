#!/usr/bin/env python3
"""Generate Nairaview V2 Release 2 pages: fixed-income, brokers, earnings, economy."""
import os

ROOT = os.path.expanduser('~/workspace/nairaviewV2')
assert os.path.basename(ROOT) == 'nairaviewV2', 'gen_release2.py must run against the V2 repo, not production'
V = '20261011d'  # new asset cache version for this release

HEAD = '''<!doctype html>
<html lang="en">
<head>
<script>try{{var t=localStorage.getItem("nv-theme");document.documentElement.setAttribute("data-theme",t==="light"?"light":"dark");}}catch(e){{document.documentElement.setAttribute("data-theme","dark");}}</script>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
  <meta name="color-scheme" content="light dark" />
  <meta name="theme-color" content="#022126" />
<meta property="og:type" content="website" />
<meta property="og:site_name" content="Nairaview" />
<meta property="og:title" content="{ogtitle}" />
<meta property="og:description" content="{ogdesc}" />
<meta property="og:url" content="https://nairaview.com/{slug}" />
<meta property="og:image" content="https://nairaview.com/assets/og-default.png" />
<meta name="twitter:card" content="summary_large_image" />
<meta name="twitter:title" content="{ogtitle}" />
<meta name="twitter:description" content="{ogdesc}" />
<meta name="twitter:image" content="https://nairaview.com/assets/og-default.png" />
<link rel="canonical" href="https://nairaview.com/{slug}" />
    <meta name="description" content="{ogdesc}" />
  <link rel="icon" href="assets/logo-icon.svg" type="image/svg+xml">
  <link rel="icon" href="assets/favicon-32.png" sizes="32x32" type="image/png">
  <link rel="icon" href="assets/favicon-48.png" sizes="48x48" type="image/png">
  <link rel="icon" href="assets/favicon-96.png" sizes="96x96" type="image/png">
  <link rel="apple-touch-icon" href="assets/apple-touch-icon.png">
  <title>{title} | Nairaview</title>
  <link rel="stylesheet" href="assets/styles.css?v={v}" />
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@400;500;600&family=Barlow+Semi+Condensed:wght@600;700&family=Barlow:wght@400;500;600;700&display=swap" rel="stylesheet">
  </head>
<body>
  <header class="site-header">
    <div class="header-inner">
      <a class="brand" href="./" aria-label="Nairaview home"><picture><source srcset="assets/logo-dark.svg" media="(prefers-color-scheme: dark)"><img src="assets/logo.svg" alt="Nairaview" height="34"></picture></a>
      <nav class="site-nav" aria-label="Primary">
          <a href="./">Home</a>
          <div class="nav-item"><a href="stocks">Stocks</a><div class="nav-dropdown" role="menu"><a href="stocks">All listed stocks</a><a href="screener">Stock screener</a><a href="compare">Compare stocks</a><a href="highs-lows">Highs &amp; lows</a><a href="etfs">ETFs</a><a href="watchlist">My watchlist</a></div></div>
          <div class="nav-item"><a href="fx">FX</a><div class="nav-dropdown" role="menu"><a href="fx">FX converter</a><a href="fx-usd">US dollar</a><a href="fx-eur">Euro</a><a href="fx-gbp">British pound</a></div></div>
          <a href="fixed-income">Fixed Income</a>
          <a href="brokers">Brokers</a>
          <div class="nav-item"><a href="offers">Offers</a><div class="nav-dropdown" role="menu"><a href="offers">Public offers</a><a href="ipo-tracker">IPO performance tracker</a></div></div>
          <a href="economy">Economy</a>
          <div class="nav-item"><a href="calendar">Calendar</a><div class="nav-dropdown" role="menu"><a href="calendar">Market calendar</a><a href="dividends">Dividends</a><a href="corporate-actions">Corporate actions</a><a href="earnings">Earnings</a></div></div>
          <div class="nav-item"><a href="news">News</a><div class="nav-dropdown" role="menu"><a href="news-headlines">Latest headlines</a><a href="news-newsroom">Newsroom</a><a href="news-notes">Market notes</a><a href="insider-dealings">Insider dealings</a></div></div>
          <a href="learn">Learn</a>
          <a href="market-recap">Recap</a>
      </nav>
    </div>
  </header>
  <div class="shell">
    <div class="live-ticker" role="region" aria-label="Live NGX price ticker">
          <iframe
            src="https://ngnmarket.com/widget/marquee"
            width="100%"
            height="60"
            frameborder="0"
            scrolling="no"
            style="border:none;"
            title="Live NGX market ticker"
          ></iframe>
        </div>
    <div class="topline">
          <span class="status"><i class="status-dot" aria-hidden="true"></i> MARKET CLOSED</span>
          <span class="topline-date">DAILY CLOSE &middot; FRI 9 OCT 2026 &middot; WAT</span>
        </div>
    <main>
      <div class="page-hero">
              <div>
                <div class="eyebrow">{eyebrow}</div>
                <h1>{h1}</h1>
                <p class="lede">{lede}</p>
              </div>
            </div>
{body}
    </main>
    </div>
  <footer class="site-footer">
    <div class="footer-inner">
      <div class="footer-grid">
        <div class="footer-brand">
          <a class="brand" href="./" aria-label="Nairaview home"><img src="assets/logo-dark.svg" alt="Nairaview" height="34"></a>
          <p>The Nigerian Exchange, decoded daily. Prices, movers, offers, news and plain-language guides.</p>
          <a class="footer-x" href="https://x.com/naira_view" target="_blank" rel="noopener" aria-label="Nairaview on X"><svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor" aria-hidden="true"><path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/></svg></a><a class="footer-x" style="margin-left:12px" href="mailto:hello@nairaview.com" aria-label="Email Nairaview"><svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor" aria-hidden="true"><path d="M20 4H4c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V6c0-1.1-.9-2-2-2zm0 4l-8 5-8-5V6l8 5 8-5v2z"/></svg></a>
        </div>
        <div class="footer-col">
          <h4>Markets</h4>
          <a href="stocks">All listed stocks</a>
          <a href="screener">Stock screener</a>
          <a href="highs-lows">Highs &amp; lows</a>
          <a href="dividends">Dividends</a>
          <a href="corporate-actions">Corporate actions</a>
          <a href="insider-dealings">Insider dealings</a>
          <a href="offers">Public offers</a>
          <a href="brokers">Stockbrokers</a>
          <a href="calendar">Market calendar</a>
          <a href="earnings">Earnings dashboard</a>
          <a href="fx">Dollar / naira</a>
          <a href="fixed-income">Fixed income</a>
          <a href="economy">Economy</a>
        </div>
        <div class="footer-col">
          <h4>Nairaview</h4>

          <a href="learn">Learn</a>
          <a href="portfolio">Portfolio tracker</a>
          <a href="watchlist">My watchlist</a>
          <a href="market-recap">Weekly recap</a>
        </div>
      </div>
      <div class="footer-legal">
        <span>&copy; 2026 Nairaview. information only, not investment advice.</span>
        <span>Market data is delayed. Prices may have changed, confirm before acting.</span>
      </div>
    </div>
  </footer>
    <div class="ad-slot ad-sticky-mobile" id="adSticky" aria-hidden="true">
      <button class="ad-close" id="adStickyClose" type="button" aria-label="Close advertisement">&times;</button>
      <div class="ad-label">Advertisement</div>
      <script>
  atOptions = {{
    'key' : '2c91ae62a5b6daf76d6821ebc779a810',
    'format' : 'iframe',
    'height' : 50,
    'width' : 320,
    'params' : {{}}
  }};
</script>
<script src="https://www.highrevenueformat.com/2c91ae62a5b6daf76d6821ebc779a810/invoke.js"></script>
    </div>
  <script src="assets/data.js?v=20261009adark39"></script>
  <script src="assets/logos.js"></script>
  <script src="assets/stock-pages.js"></script>
{nvisland}
  <script src="assets/site.js?v={v}"></script>
  <script src="assets/islands.js?v={v}"></script>
  <script src="assets/live.js?v=20261009adark39"></script>
    <!-- Cloudflare Web Analytics --><script defer src='https://static.cloudflareinsights.com/beacon.min.js' data-cf-beacon='{{"token": "a9f4136dd40547a7b1acca41e62cc7a5"}}'></script><!-- End Cloudflare Web Analytics -->
</body>
</html>
'''

SECTION = '''            <section class="section">
{content}
            </section>
'''

def table(headers, rows, cls="movers-table"):
    h = "".join(f"<th>{c}</th>" for c in headers)
    b = "".join("<tr>" + "".join(f"<td>{c}</td>" for c in r) + "</tr>" for r in rows)
    return f'''              <div class="movers-col"><table class="{cls}">
                <thead><tr>{h}</tr></thead>
                <tbody>{b}</tbody>
              </table></div>'''

def h2(t, mt=28):
    return f'''              <h2 class="guide-h2" style="margin-top:{mt}px">{t}</h2>'''

NOTE = '''              <p class="lab-note">{t}</p>'''

# ---------------------------------------------------------------- fixed income
ntb_svg = '''              <div class="chart-wrap">
              <svg viewBox="0 0 620 240" role="img" aria-label="364-day NTB stop rate falling from 17.70% on 8 July 2026 to 15.85% on 7 October 2026" style="width:100%;height:auto;display:block">
                <line x1="40" y1="20" x2="40" y2="200" stroke="var(--line)" stroke-width="1"/>
                <line x1="40" y1="200" x2="600" y2="200" stroke="var(--line)" stroke-width="1"/>
                <text x="8" y="45" fill="var(--muted)" font-size="11" font-family="IBM Plex Mono,monospace">18%</text>
                <text x="8" y="105" fill="var(--muted)" font-size="11" font-family="IBM Plex Mono,monospace">17%</text>
                <text x="8" y="165" fill="var(--muted)" font-size="11" font-family="IBM Plex Mono,monospace">16%</text>
                <polyline points="60,95 200,135 305,140 445,168 570,169" fill="none" stroke="#32D9EB" stroke-width="3"/>
                <circle cx="60" cy="95" r="4" fill="#32D9EB"/><circle cx="200" cy="135" r="4" fill="#32D9EB"/><circle cx="305" cy="140" r="4" fill="#32D9EB"/><circle cx="445" cy="168" r="4" fill="#32D9EB"/><circle cx="570" cy="169" r="4" fill="#32D9EB"/>
                <text x="60" y="82" fill="var(--ink)" font-size="11" font-family="IBM Plex Mono,monospace">17.70%</text>
                <text x="200" y="122" fill="var(--ink)" font-size="11" font-family="IBM Plex Mono,monospace">16.84%</text>
                <text x="305" y="127" fill="var(--ink)" font-size="11" font-family="IBM Plex Mono,monospace">16.62%</text>
                <text x="445" y="190" fill="var(--ink)" font-size="11" font-family="IBM Plex Mono,monospace">15.89%</text>
                <text x="520" y="190" fill="var(--ink)" font-size="11" font-family="IBM Plex Mono,monospace">15.85%</text>
                <text x="52" y="220" fill="var(--muted)" font-size="10" font-family="IBM Plex Mono,monospace">8 Jul</text>
                <text x="192" y="220" fill="var(--muted)" font-size="10" font-family="IBM Plex Mono,monospace">2 Sep</text>
                <text x="296" y="220" fill="var(--muted)" font-size="10" font-family="IBM Plex Mono,monospace">9 Sep</text>
                <text x="436" y="220" fill="var(--muted)" font-size="10" font-family="IBM Plex Mono,monospace">23 Sep</text>
                <text x="562" y="220" fill="var(--muted)" font-size="10" font-family="IBM Plex Mono,monospace">7 Oct</text>
              </svg>
              </div>'''

fi_body = SECTION.format(content="\n".join([
    h2("Latest NTB auction &mdash; 7 October 2026", 0),
    NOTE.format(t="Stop rates set by the DMO/CBN at the primary market auction. Rates are annualised."),
    table(["Tenor", "Stop rate", "Change"],
          [["91-day", "15.50%", "unchanged"],
           ["182-day", "15.80%", "unchanged"],
           ["364-day", "15.85%", "&minus;4 bps"]]),
    h2("364-day stop rate trend"),
    NOTE.format(t="Four straight cuts since the 8 July peak of 17.70%, after the CBN cut the MPR by 350 bps to 23.00% in September."),
    ntb_svg,
    h2("FGN Savings Bond &mdash; October 2026 offer"),
    NOTE.format(t="Subscriptions ran 5&ndash;9 October 2026. Minimum subscription &#8358;5,000."),
    table(["Tenor", "Coupon", "Offer"],
          [["2-year", "13.071%", "October 2026"],
           ["3-year", "14.071%", "October 2026"]]),
    h2("T-bills vs stocks"),
    NOTE.format(t="The 364-day T-bill now yields 15.85% against August inflation of 15.39% &mdash; the risk-free return barely beats inflation. Falling T-bill yields (as now) usually make equities look more attractive, since the &lsquo;safe&rsquo; alternative pays less. Rising yields do the opposite."),
    NOTE.format(t="Figures as of 11 October 2026. Auction results update after each DMO/CBN primary market auction."),
]))

# ---------------------------------------------------------------- brokers
br_body = SECTION.format(content="\n".join([
    h2("What will this trade cost me?", 0),
    NOTE.format(t="Enter a trade value and your broker&rsquo;s commission. Fees follow the NGX schedule: brokerage 0.75&ndash;1.35% + 7.5% VAT; SEC 0.3% on buys (+VAT); NGX 0.3% and CSCS 0.3% on sells (+VAT); stamp duty 0.075%; &#8358;4 trade alert per transaction."),
    '''              <div id="feeCalc" data-island="fee-calculator"></div>''',
    h2("Compare stockbrokers"),
    NOTE.format(t="All are NGX dealing members with online trading. Brokerage is negotiable within the 0.75&ndash;1.35% band &mdash; online trades usually price at the lower end. Confirm the exact rate with the broker before funding; it feeds straight into the calculator above."),
    table(["Broker", "Online trading", "Commission guide"],
          [["Meristem Stockbrokers", "Web + mobile app", "0.75&ndash;1.35% + VAT"],
           ["CardinalStone Securities", "Web + mobile app", "0.75&ndash;1.35% + VAT"],
           ["Stanbic IBTC Stockbrokers", "Web + mobile app", "0.75&ndash;1.35% + VAT"],
           ["ARM Securities", "Web + mobile app", "0.75&ndash;1.35% + VAT"],
           ["Vetiva Capital", "Web + mobile app", "0.75&ndash;1.35% + VAT"]]),
    h2("Before you choose"),
    '''              <ul class="check-list">
                <li>Ask for the exact commission rate in writing &mdash; &ldquo;negotiable&rdquo; means it moves.</li>
                <li>Check you get a CSCS statement and can track dividends in your own name.</li>
                <li>Test the app during a trading session, not just the demo.</li>
                <li>Ask how corporate actions (bonuses, rights) are handled and what they cost.</li>
              </ul>''',
    NOTE.format(t="No Nigerian stockbroker currently runs a publisher affiliate programme; this page takes no referral fees."),
]))

# ---------------------------------------------------------------- earnings
er_body = SECTION.format(content="\n".join([
    h2("Q3 2026 season status", 0),
    NOTE.format(t="The third quarter ended 30 September 2026. Unaudited Q3 statements are due on the NGX by 30 October 2026. Filings typically cluster in the final two weeks of October."),
    table(["Company", "Status", "Detail"],
          [["FCMB Group", "Delayed", "Q3 now due on or before 29 Dec 2026 &mdash; interim audit of First City Monument Bank is still running. H1 profit before tax was &#8358;157.3bn, up 99% year-on-year."],
           ["All other listed companies", "Due", "Q3 2026 statements expected by 30 Oct 2026."]]),
    h2("The H1 backlog &mdash; context"),
    NOTE.format(t="Several big banks needed extra time for audited half-year accounts while awaiting CBN clearance: GTCO, Access Holdings, UBA and Fidelity Bank pushed to 30 September; Zenith Bank to 9 October; Stanbic IBTC flagged a possible delay. Late filings are common in earnings season &mdash; the deadline that matters is the one in the filing notice."),
    h2("How to read a result"),
    '''              <ul class="check-list">
                <li><strong>Revenue / gross earnings</strong> &mdash; is the top line growing?</li>
                <li><strong>Profit before tax vs the same quarter last year</strong> &mdash; NGX companies rarely give guidance, so last year is the benchmark.</li>
                <li><strong>Dividend declared alongside</strong> &mdash; interim dividends often land with Q3 results; the payout ratio tells you how shareholder-friendly the board is.</li>
                <li><strong>Price reaction</strong> &mdash; a great result can still sell off if the market expected more. Watch the next session&rsquo;s tape.</li>
              </ul>''',
    NOTE.format(t="Statuses as of 11 October 2026. This board updates as Q3 filings hit the NGX."),
]))

# ---------------------------------------------------------------- economy
ec_body = SECTION.format(content="\n".join([
    h2("The numbers right now", 0),
    '''              <div class="stat-cards">
                <div class="stat-card"><div class="stat-label">MPR (CBN)</div><div class="stat-value">23.00%</div><div class="stat-sub">cut 350 bps, 22 Sep 2026</div></div>
                <div class="stat-card"><div class="stat-label">Inflation (NBS)</div><div class="stat-value">15.39%</div><div class="stat-sub">August 2026; September pending</div></div>
                <div class="stat-card"><div class="stat-label">GDP growth</div><div class="stat-value">+4.43%</div><div class="stat-sub">Q2 2026, year-on-year</div></div>
                <div class="stat-card"><div class="stat-label">Next MPC meeting</div><div class="stat-value">23&ndash;24 Nov</div><div class="stat-sub">2026 &mdash; rate decision expected</div></div>
              </div>''',
    h2("MPR path in 2026"),
    table(["MPC meeting", "Decision"],
          [["Held through mid-2026", "26.50% &mdash; on hold"],
           ["21&ndash;22 September 2026", "Cut 350 bps to 23.00%"],
           ["23&ndash;24 November 2026", "Upcoming"]]),
    h2("Inflation picture"),
    NOTE.format(t="Headline inflation eased to 15.39% in August 2026 (NBS). But the CBN&rsquo;s September household survey found 77.2% of households still perceive inflation as high, up from 67.2% in August &mdash; official easing hasn&rsquo;t reached the market yet."),
    h2("What it means for stocks"),
    '''              <ul class="check-list">
                <li><strong>Rate cuts</strong> push T-bill and bond yields down, making dividend and growth stocks relatively more attractive.</li>
                <li><strong>Banks</strong> earn less on government securities when rates fall, but cheaper credit can grow loan books.</li>
                <li><strong>Consumer names</strong> benefit as easing inflation restores purchasing power.</li>
                <li><strong>The naira</strong> matters too: the street rate sat near &#8358;1,415/$ in early October &mdash; check the <a href="fx">FX converter</a>.</li>
              </ul>''',
    NOTE.format(t="Figures as of 11 October 2026."),
]))

PAGES = [
    dict(slug="fixed-income", title="Fixed Income \u2014 T-Bill Rates & FGN Savings Bond",
         ogtitle="Fixed Income \u2014 T-Bill Rates & FGN Savings Bond | Nairaview",
         ogdesc="Latest NTB auction stop rates, 364-day yield trend and FGN Savings Bond offers.",
         eyebrow="Rates", h1="Fixed income",
         lede="Treasury bill auction results, FGN Savings Bond offers and the risk-free rates every equity investor should watch.",
         body=fi_body, nvisland=""),
    dict(slug="brokers", title="Stockbrokers \u2014 Compare & Fee Calculator",
         ogtitle="Stockbrokers \u2014 Compare & Fee Calculator | Nairaview",
         ogdesc="Compare Nigerian stockbrokers and calculate exactly what a buy or sell order costs.",
         eyebrow="Start here", h1="Stockbrokers",
         lede="Compare Nigerian stockbrokers and see exactly what a trade costs before you place it.",
         body=br_body,
         nvisland='  <script>window.NV_ISLANDS = window.NV_ISLANDS || {}; window.NV_ISLANDS["fee-calculator"] = true;</script>'),
    dict(slug="earnings", title="Earnings Dashboard \u2014 Q3 2026 Season",
         ogtitle="Earnings Dashboard \u2014 Q3 2026 Season | Nairaview",
         ogdesc="Who's due, who's filed and who's late in the Q3 2026 NGX earnings season.",
         eyebrow="Q3 2026 season", h1="Earnings dashboard",
         lede="Who\u2019s due, who\u2019s filed and who\u2019s late \u2014 tracking the Q3 2026 earnings season on the NGX.",
         body=er_body, nvisland=""),
    dict(slug="economy", title="Economy \u2014 Rates, Inflation & Growth",
         ogtitle="Economy \u2014 Rates, Inflation & Growth | Nairaview",
         ogdesc="MPR, inflation, GDP and the MPC calendar \u2014 the macro numbers that move the NGX.",
         eyebrow="Macro", h1="Economy",
         lede="Interest rates, inflation and growth \u2014 the macro numbers that move the NGX.",
         body=ec_body, nvisland=""),
]

for p in PAGES:
    html = HEAD.format(slug=p["slug"], title=p["title"], ogtitle=p["ogtitle"],
                       ogdesc=p["ogdesc"], eyebrow=p["eyebrow"], h1=p["h1"],
                       lede=p["lede"], body=p["body"], nvisland=p["nvisland"], v=V)
    path = os.path.join(ROOT, p["slug"] + ".html")
    open(path, "w").write(html)
    print("wrote", path)
