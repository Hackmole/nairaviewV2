#!/usr/bin/env python3
"""Generate one page per NGX ETF in etfs/{SYM}.html from assets/etfs.json.

Curated, hand-verified data (NGX Daily Official List + business press).
Every figure is labeled with its date. No invented data.
"""
import json, os, html

ROOT = os.path.expanduser('~/workspace/nairaviewV2')
ASSET_V = '20261011c'

def esc(t):
    return html.escape(str(t), quote=True)

def fmt_p(n):
    try:
        return '₦' + format(float(n), ',.2f')
    except (TypeError, ValueError):
        return '·'

def fmt_pct(n):
    try:
        v = float(n)
        return ('+' if v >= 0 else '−') + format(abs(v), '.2f') + '%'
    except (TypeError, ValueError):
        return '·'

NAV = '''          <a href="../">Home</a>
          <div class="nav-item"><a href="../stocks" class="active">Stocks</a><div class="nav-dropdown" role="menu"><a href="../stocks">All listed stocks</a><a href="../screener">Stock screener</a><a href="../compare">Compare stocks</a><a href="../highs-lows">Highs &amp; lows</a><a href="../etfs">ETFs</a><a href="../watchlist">My watchlist</a></div></div>
          <a href="../screener">Screener</a><div class="nav-item"><a href="../fx">FX</a><div class="nav-dropdown" role="menu"><a href="../fx">FX converter</a><a href="../fx-usd">US dollar</a><a href="../fx-eur">Euro</a><a href="../fx-gbp">British pound</a></div></div>
          <div class="nav-item"><a href="../offers">Offers</a><div class="nav-dropdown" role="menu"><a href="../offers">Public offers</a><a href="../ipo-tracker">IPO performance tracker</a></div></div>
          <div class="nav-item"><a href="../calendar">Calendar</a><div class="nav-dropdown" role="menu"><a href="../calendar">Market calendar</a><a href="../dividends">Dividends</a><a href="../corporate-actions">Corporate actions</a></div></div>
          <div class="nav-item"><a href="../news">News</a><div class="nav-dropdown" role="menu"><a href="../news">Market news</a><a href="../news-headlines">Latest headlines</a><a href="../news-newsroom">Newsroom</a><a href="../news-notes">Market notes</a><a href="../insider-dealings">Insider dealings</a></div></div>
          <a href="../learn">Learn</a>
          <a href="../market-recap">Recap</a>'''

FOOTER = '''  <footer class="site-footer">
    <div class="footer-inner">
      <div class="footer-grid">
        <div class="footer-brand">
          <a class="brand" href="../" aria-label="Nairaview home"><img src="../assets/logo-dark.svg" alt="Nairaview" height="34"></a>
          <p>The Nigerian Exchange, decoded daily. Prices, movers, offers, news and plain-language guides.</p>
        </div>
        <div class="footer-col">
          <h4>Markets</h4>
          <a href="../stocks">All listed stocks</a>
          <a href="../screener">Stock screener</a>
          <a href="../etfs">ETFs</a>
          <a href="../compare">Compare stocks</a>
          <a href="../offers">Public offers</a>
          <a href="../ipo-tracker">IPO tracker</a>
          <a href="../calendar">Market calendar</a>
        </div>
        <div class="footer-col">
          <h4>Nairaview</h4>
          <a href="../news">Market news</a>
          <a href="../learn">Learn</a>
          <a href="../portfolio">Portfolio tracker</a>
          <a href="../market-recap">Weekly recap</a>
        </div>
      </div>
      <div class="footer-legal">
        <span>&copy; 2026 Nairaview. information only, not investment advice.</span>
        <span>Market data is delayed. Prices may have changed, confirm before acting.</span>
      </div>
    </div>
  </footer>'''

TEMPLATE = '''<!doctype html>
<html lang="en">
<head>
<script>try{var t=localStorage.getItem("nv-theme");document.documentElement.setAttribute("data-theme",t==="light"?"light":"dark");}catch(e){document.documentElement.setAttribute("data-theme","dark");}</script>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
  <meta name="color-scheme" content="light dark" />
  <meta name="theme-color" content="#022126" />
<meta property="og:type" content="website" />
<meta property="og:site_name" content="Nairaview" />
<meta property="og:title" content="@@OG_TITLE@@" />
<meta property="og:description" content="@@OG_DESC@@" />
<meta property="og:url" content="https://nairaview.com/etfs/@@SYM@@.html" />
<meta property="og:image" content="https://nairaview.com/assets/og-default.png" />
<meta name="twitter:card" content="summary_large_image" />
<meta name="twitter:title" content="@@OG_TITLE@@" />
<meta name="twitter:description" content="@@OG_DESC@@" />
<meta name="twitter:image" content="https://nairaview.com/assets/og-default.png" />
<link rel="canonical" href="https://nairaview.com/etfs/@@SYM@@.html" />
  <meta name="description" content="@@META_DESC@@" />
  <link rel="icon" href="../assets/logo-icon.svg" type="image/svg+xml">
  <link rel="icon" href="../assets/favicon-32.png" sizes="32x32" type="image/png">
  <link rel="icon" href="../assets/favicon-48.png" sizes="48x48" type="image/png">
  <link rel="icon" href="../assets/favicon-96.png" sizes="96x96" type="image/png">
  <link rel="apple-touch-icon" href="../assets/apple-touch-icon.png">
  <title>@@TITLE@@</title>
  <link rel="stylesheet" href="../assets/styles.css?v=@@V@@" />
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@400;500;600&family=Barlow+Semi+Condensed:wght@600;700&family=Barlow:wght@400;500;600;700&display=swap" rel="stylesheet">
<script type="application/ld+json">
@@JSONLD@@
</script>
  </head>
<body>
  <header class="site-header">
    <div class="header-inner">
      <a class="brand" href="../" aria-label="Nairaview home"><picture><source srcset="../assets/logo-dark.svg" media="(prefers-color-scheme: dark)"><img src="../assets/logo.svg" alt="Nairaview" height="34"></picture></a>
      <nav class="site-nav" aria-label="Primary">
@@NAV@@
      </nav>
    </div>
  </header>
  <div class="shell">
    <main>
      <nav class="crumbs" aria-label="Breadcrumb"><a href="../">Home</a><span class="sep">/</span><a href="../etfs">ETFs</a><span class="sep">/</span><span>@@SYM@@</span></nav>
      <div class="quote-hero">
        <div class="section-heading">
          <p class="kicker">ETF &middot; @@MANAGER@@</p>
          <div class="quote-top">
            <div class="quote-id"><div><h1>@@SYM@@ &middot; @@NAME@@</h1></div></div>
            <div><span class="status-pill"><span class="dot"></span>Hand-verified</span></div>
          </div>
          <div class="quote-price">@@PRICE@@</div>
          <p class="asof">Last verified close &middot; @@CLOSE_DATE@@ &middot; NGX Daily Official List (ETFs).</p>
        </div>
      </div>
      <div class="kstats"><div class="kstats-title">Key statistics</div>
      <div class="kstats-grid">
        <div class="kstat"><div class="k">Tracks</div><div class="v" style="font-size:15px">@@UNDERLYING@@</div></div>
        <div class="kstat"><div class="k">Manager</div><div class="v" style="font-size:15px">@@MANAGER@@</div></div>
        <div class="kstat"><div class="k">52-week high</div><div class="v">@@HI52@@</div></div>
        <div class="kstat"><div class="k">52-week low</div><div class="v">@@LO52@@</div></div>
        <div class="kstat"><div class="k">YTD return</div><div class="v @@YTD_CLASS@@">@@YTD@@</div></div>
        <div class="kstat"><div class="k">9-month return</div><div class="v @@NINE_CLASS@@">@@NINE_MO@@</div></div>
      </div></div>
      <div class="section" style="padding-top:34px">
        <h2 class="guide-h2">About this fund</h2>
        <p class="guide-p">@@DESC@@</p>
        <p class="guide-p">ETF prices on the NGX can trade at wide premiums or discounts to the value of what the fund holds. Check the fund manager's published net asset value before buying. The last traded price is not the whole story.</p>
        <h2 class="guide-h2">How to buy @@SYM@@</h2>
        <p class="guide-p">Open an account with an NGX-licensed stockbroker and place a buy order for <strong>@@SYM@@</strong>, exactly like an ordinary share. First time buying? <a href="../learn-buy-first-stock">This walkthrough</a> covers each step.</p>
        <h2 class="guide-h2">Frequently asked questions</h2>
        <details class="faq-item"><summary class="faq-q">What does @@SYM@@ track?</summary><div class="faq-a"><p class="guide-p">@@NAME@@ (@@SYM@@) tracks @@UNDERLYING@@. It is managed by @@MANAGER@@.</p></div></details>
        <details class="faq-item"><summary class="faq-q">What is the current @@SYM@@ price?</summary><div class="faq-a"><p class="guide-p">The last hand-verified close was <strong>@@PRICE@@</strong> on @@CLOSE_DATE@@ (NGX Daily Official List). Prices move every trading day. Confirm the live quote with your broker before trading.</p></div></details>
        <details class="faq-item"><summary class="faq-q">Is @@SYM@@ a good investment?</summary><div class="faq-a"><p class="guide-p">Nairaview provides market data, not investment advice. Consider the fund's tracking, costs, and your goals, and speak to a licensed adviser before deciding.</p></div></details>
        <h2 class="guide-h2">Other NGX ETFs</h2>
        <ul class="guide-list">
@@PEERS@@
        </ul>
      </div>
    </main>
  </div>
@@FOOTER@@
  <script src="../assets/data.js?v=20261009adark39"></script>
  <script src="../assets/site.js?v=20261010c"></script>
  <script src="../assets/live.js?v=20261009adark39"></script>
  <!-- Cloudflare Web Analytics --><script defer src='https://static.cloudflareinsights.com/beacon.min.js' data-cf-beacon='{"token": "a9f4136dd40547a7b1acca41e62cc7a5"}'></script><!-- End Cloudflare Web Analytics -->
</body>
</html>
'''

data = json.load(open(os.path.join(ROOT, 'assets', 'etfs.json')))
etfs = data['etfs']
outdir = os.path.join(ROOT, 'etfs')
os.makedirs(outdir, exist_ok=True)

def peer_lis(sym):
    return '\n'.join(
        '          <li><a href="%s.html">%s &mdash; %s</a></li>' % (e['symbol'], esc(e['symbol']), esc(e['name']))
        for e in etfs if e['symbol'] != sym)

made = []
for e in etfs:
    sym = e['symbol']
    ytd = e.get('ytd')
    nine = e.get('nine_mo')
    faq = [
        ('What does %s track?' % sym,
         '%s (%s) tracks %s. It is managed by %s.' % (e['name'], sym, e['underlying'], e['manager'])),
        ('What is the current %s price?' % sym,
         'The last hand-verified close was %s on %s (NGX Daily Official List).' % (fmt_p(e['close']), e['close_date'])),
        ('Is %s a good investment?' % sym,
         'Nairaview provides market data, not investment advice. Speak to a licensed adviser before deciding.'),
    ]
    jsonld = json.dumps({
        '@context': 'https://schema.org',
        '@type': 'FAQPage',
        'mainEntity': [{'question': {'@type': 'Question', 'name': q},
                        'acceptedAnswer': {'@type': 'Answer', 'text': a}} for q, a in faq],
    }, ensure_ascii=False, indent=2)
    og_title = '%s · %s ETF | Nairaview' % (sym, e['name'])
    og_desc = '%s (%s) tracks %s. Last verified close %s (%s).' % (sym, e['name'], e['underlying'], fmt_p(e['close']), e['close_date'])
    vals = {
        'SYM': esc(sym), 'V': ASSET_V, 'NAV': NAV, 'FOOTER': FOOTER,
        'NAME': esc(e['name']), 'MANAGER': esc(e['manager']), 'UNDERLYING': esc(e['underlying']),
        'DESC': esc(e['desc']), 'PRICE': fmt_p(e['close']), 'CLOSE_DATE': esc(e['close_date']),
        'HI52': fmt_p(e.get('hi52')), 'LO52': fmt_p(e.get('lo52')),
        'YTD': fmt_pct(ytd), 'YTD_CLASS': 'up' if (ytd or 0) > 0 else ('down' if (ytd or 0) < 0 else ''),
        'NINE_MO': fmt_pct(nine) if nine is not None else '·',
        'NINE_CLASS': 'up' if (nine or 0) > 0 else ('down' if (nine or 0) < 0 else ''),
        'PEERS': peer_lis(sym),
        'OG_TITLE': esc(og_title), 'OG_DESC': esc(og_desc),
        'TITLE': esc('%s (%s) ETF Price & Info | Nairaview' % (sym, e['name'])),
        'META_DESC': esc(og_desc + ' Managed by %s.' % e['manager']),
        'JSONLD': jsonld,
    }
    page = TEMPLATE
    for kk, vv in vals.items():
        page = page.replace('@@' + kk + '@@', vv)
    assert '@@' not in page, 'unreplaced placeholder in ' + sym
    with open(os.path.join(outdir, sym + '.html'), 'w') as fh:
        fh.write(page)
    made.append(sym)

print('generated:', len(made))
