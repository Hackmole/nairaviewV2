    /* ---- Per-stock icons: real company logos where we have them
       (assets/logos/{TICKER}.png, see window.NV_LOGOS), falling back to a
       deterministic two-letter monogram badge so no stock renders icon-less. ---- */
    (function stockBadges() {
      var PALETTE = ['#1d4ed8', '#0e7490', '#0f766e', '#15803d', '#4d7c0f', '#a16207',
                     '#b45309', '#b91c1c', '#be123c', '#7c3aed', '#6d28d9', '#0c4a6e'];
      function initials(sym) {
        var s = String(sym || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
        if (!s) return '?';
        return s.length <= 2 ? s : s.charAt(0) + s.charAt(1);
      }
      function colorFor(sym) {
        var s = String(sym || '').toUpperCase();
        var h = 0, i;
        for (i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) % 997;
        return PALETTE[h % PALETTE.length];
      }
      function monoHTML(sym, size) {
        var cls = 'stk-badge' + (size ? ' ' + size : '');
        return '<span class="' + cls + '" style="background:' + colorFor(sym) +
               '" aria-hidden="true">' + initials(sym) + '</span>';
      }
      window.nvMonoHTML = monoHTML;
      /* Old directory tickers that were renamed on the NGX. */
      var LOGO_ALIAS = { GUARANTY: 'GTCO', ACCESS: 'ACCESSCORP', TOTALNG: 'TOTAL', CCNN: 'BUACEMENT' };
      function logoKey(sym) { return LOGO_ALIAS[sym] || sym; }
      function logoBase() {
        return window.location.pathname.indexOf('/stocks/') !== -1 ? '../assets/logos/' : 'assets/logos/';
      }
      window.nvBadgeHTML = function (sym, size) {
        var cls = 'stk-badge' + (size ? ' ' + size : '');
        var key = logoKey(sym);
        if (window.NV_LOGOS && window.NV_LOGOS[key]) {
          return '<span class="' + cls + ' stk-logo" aria-hidden="true">' +
            '<img class="stk-img" data-sym="' + sym + '" data-size="' + (size || '') + '"' +
            ' src="' + logoBase() + key + '.png" alt="" loading="lazy"></span>';
        }
        return monoHTML(sym, size);
      };
      window.nvBadge = function (sym, size) {
        var d = document.createElement('div');
        d.innerHTML = window.nvBadgeHTML(sym, size);
        return d.firstChild;
      };
      /* If a logo image fails to load, swap in the monogram badge. */
      document.addEventListener('error', function (ev) {
        var t = ev.target;
        if (t && t.tagName === 'IMG' && t.className.indexOf('stk-img') !== -1 && !t.getAttribute('data-fbk')) {
          t.setAttribute('data-fbk', '1');
          var d = document.createElement('div');
          d.innerHTML = monoHTML(t.getAttribute('data-sym'), t.getAttribute('data-size') || undefined);
          if (t.parentNode) t.parentNode.replaceWith(d.firstChild);
        }
      }, true);
    }());

    /* ---- Theme: manual light/dark override, runs before first paint where possible ---- */
    (function themeInit() {
      function saved() { try { return localStorage.getItem('nv-theme'); } catch (e) { return null; } }
      function apply(t) {
        if (t === 'light' || t === 'dark') document.documentElement.setAttribute('data-theme', t);
        else document.documentElement.removeAttribute('data-theme');
        paintLogo();
      }
      function isDark() {
        var t = document.documentElement.getAttribute('data-theme');
        if (t) return t === 'dark';
        return window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
      }
      function paintLogo() {
        var img = document.querySelector('.brand img');
        if (!img) return;
        var src = img.getAttribute('src') || '';
        var base = src.replace(/logo(-dark)?\.svg$/, '');
        if (!base) return;
        img.setAttribute('src', base + (isDark() ? 'logo-dark.svg' : 'logo.svg'));
        var pic = img.closest('picture');
        if (pic) { var s = pic.querySelector('source'); if (s) s.remove(); }
      }
      apply(saved());
      if (window.matchMedia) {
        var mq = window.matchMedia('(prefers-color-scheme: dark)');
        if (mq.addEventListener) mq.addEventListener('change', function () { var sv2 = saved(); if (!sv2 || sv2 === 'system') paintLogo(); });
      }
      /* Theme toggle: dark -> light -> system -> dark. Dark is the default
         on this edition; "system" follows the OS and reacts to OS changes. */
      var header = document.querySelector('.header-inner');
      if (header && !header.querySelector('.theme-toggle')) {
        var btn = document.createElement('button');
        btn.type = 'button'; btn.className = 'theme-toggle';
        var icons = { light: '\u2600', dark: '\u263E', system: '\u25D0' };
        var labels = { light: 'Appearance: light', dark: 'Appearance: dark', system: 'Appearance: follow system' };
        function state() {
          var sv = saved();
          return sv === 'light' ? 'light' : sv === 'system' ? 'system' : 'dark';
        }
        function paint() {
          var st = state();
          btn.textContent = icons[st];
          btn.setAttribute('aria-label', labels[st] + ', activate to change');
          btn.title = labels[st];
        }
        btn.addEventListener('click', function () {
          var st = state();
          var next = st === 'dark' ? 'light' : st === 'light' ? 'system' : 'dark';
          try { localStorage.setItem('nv-theme', next); } catch (e) {}
          apply(next);
          paint();
        });
        paint();
        header.appendChild(btn);
      }
    }());
    /* ---- Market status + countdown: NGX trades Mon–Fri 9:30–16:00 WAT ----
       Ticks every minute (mobile redesign brief 4). Cheap text, no requests. */
    (function marketStatus() {
      var statusEl = document.querySelector('.topline .status');
      if (!statusEl) return;
      function watNow() {
        var now = new Date();
        return new Date(now.getTime() + (now.getTimezoneOffset() + 60) * 60000);
      }
      function fmtDur(mins) {
        mins = Math.max(0, Math.round(mins));
        var h = Math.floor(mins / 60), m = mins % 60;
        return h > 0 ? h + 'H ' + String(m).padStart(2, '0') + 'M' : m + 'M';
      }
      var DAYN = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'];
      /* Shared with live.js: its feed-driven repaints must keep the countdown. */
      window.NV = window.NV || {};
      window.NV.marketLabel = function (open) {
        var wat = watNow();
        var day = wat.getDay(), mins = wat.getHours() * 60 + wat.getMinutes();
        if (open) return 'MARKET OPEN \u00B7 CLOSES IN ' + fmtDur(960 - mins);
        if (day >= 1 && day <= 5 && mins < 570) return 'MARKET CLOSED \u00B7 OPENS IN ' + fmtDur(570 - mins);
        var add = day === 0 ? 1 : day === 6 ? 2 : (day === 5 ? 3 : 1);
        var openDay = new Date(wat.getTime() + add * 86400000).getDay();
        return 'MARKET CLOSED \u00B7 OPENS ' + DAYN[openDay] + ' 9:30';
      };
      function paint() {
        var wat = watNow();
        var day = wat.getDay(), mins = wat.getHours() * 60 + wat.getMinutes();
        var open = day >= 1 && day <= 5 && mins >= 570 && mins < 960;
        /* live.js may know better (exchange holidays): prefer its feed state. */
        if (window.NV && typeof window.NV.marketOpenFeed === 'boolean') open = window.NV.marketOpenFeed;
        var label = window.NV.marketLabel(open);
        statusEl.innerHTML = '<i class="status-dot" aria-hidden="true"></i> ' + label;
        statusEl.classList.toggle('closed', !open);
        /* whisper of motion on each 60s tick: brief opacity dip */
        statusEl.classList.add('tick-fade');
        setTimeout(function () { statusEl.classList.remove('tick-fade'); }, 200);
        var hh = String(wat.getHours()).padStart(2, '0'), mm = String(wat.getMinutes()).padStart(2, '0');
        statusEl.title = 'Nigerian Exchange trading hours: Mon–Fri 9:30–16:00 WAT. Now ' + hh + ':' + mm + ' WAT.';
      }
      paint();
      setInterval(paint, 60000);
    }());
    /* ---- Auth nav: runs FIRST so links appear even if a widget below throws ---- */
    (function authNav() {
      var nav = document.querySelector('.site-nav');
      if (!nav || nav.querySelector('[data-authnav]')) return;
      var prefix = window.location.pathname.indexOf('/stocks/') === 0 ? '../' : '';
      var here = window.location.pathname.replace(/\/$/, '');
      /* Single Portfolio entry: logged-out visitors are routed through sign-in
         by portfolio.html itself; logged-in users land on their holdings. */
      var a = document.createElement('a');
      a.href = prefix + 'portfolio'; a.textContent = 'Portfolio'; a.setAttribute('data-authnav', '1');
      if (/portfolio$/.test(here)) a.className = 'active';
      nav.appendChild(a);
    }());
    /* ---- Nav link icons: every header link gets a small inline SVG icon. ---- */
    (function navIcons() {
      var S = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">';
      var ICONS = {
        'home': S + '<path d="M3 9.5 12 3l9 6.5V20a1 1 0 0 1-1 1h-5v-6h-6v6H4a1 1 0 0 1-1-1z"/></svg>',
        'stocks': S + '<path d="M3 17l6-6 4 4 8-8"/><path d="M15 7h6v6"/></svg>',
        'screener': S + '<path d="M4 5h16l-6 7v5l-4 2v-7z"/></svg>',
        'offers': S + '<path d="M20.6 13.4 12 22 2 12V2h10l8.6 8.6a2 2 0 0 0 0 2.8z"/><circle cx="7.5" cy="7.5" r="1.5"/></svg>',
        'calendar': S + '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M8 3v4M16 3v4M3 10h18"/></svg>',
        'news': S + '<path d="M4 6h13v12H6a2 2 0 0 1-2-2z"/><path d="M17 8h2a1 1 0 0 1 1 1v9a2 2 0 0 1-2 2H4"/><path d="M7 10h7M7 14h5"/></svg>',
        'learn': S + '<path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20V4H6.5A2.5 2.5 0 0 0 4 6.5z"/><path d="M4 19.5A2.5 2.5 0 0 0 6.5 22H20v-5"/></svg>',
        'recap': S + '<rect x="5" y="4" width="14" height="17" rx="2"/><path d="M9 9h6M9 13h6M9 17h4"/></svg>',
        'fx': S + '<path d="M8 3 4 7l4 4"/><path d="M4 7h16"/><path d="m16 21 4-4-4-4"/><path d="M20 17H4"/></svg>',
        'fixed income': S + '<path d="M19 5 5 19"/><circle cx="6.5" cy="6.5" r="2.5"/><circle cx="17.5" cy="17.5" r="2.5"/></svg>',
        'economy': S + '<circle cx="12" cy="12" r="9"/><path d="M3 12h18"/><path d="M12 3c2.5 2.6 3.8 5.7 3.8 9s-1.3 6.4-3.8 9c-2.5-2.6-3.8-5.7-3.8-9S9.5 5.6 12 3z"/></svg>',
        'brokers': S + '<rect x="3" y="8" width="18" height="12" rx="2"/><path d="M9 8V6a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v2"/><path d="M3 13h18"/></svg>',
        'portfolio': S + '<path d="M21.2 15.9A10 10 0 1 1 8 2.8"/><path d="M22 12A10 10 0 0 0 12 2v10z"/></svg>',
        'markets': S + '<rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/></svg>'
      };
      function paint() {
        var nav = document.querySelector('.site-nav');
        if (!nav) return;
        Array.prototype.forEach.call(nav.querySelectorAll('a, button.nav-hub'), function (a) {
          if (a.querySelector('svg')) return;
          /* Skip dropdown subpages — icons on top-level items only */
          if (a.closest('.nav-dropdown')) return;
          var key = a.textContent.trim().toLowerCase();
          if (ICONS[key]) a.insertAdjacentHTML('afterbegin', ICONS[key]);
        });
      }
      paint();
      /* Re-run after any late nav injection so new links get icons too. */
      if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', paint);
      else setTimeout(paint, 0);
    }());
    (function () {
      /* Open a collapsible section when its anchor is targeted (e.g. news.html#news). */
      function openHash() {
        var id = (location.hash || '').slice(1);
        if (!id) return;
        var sec = document.getElementById(id);
        var det = sec && sec.querySelector('details.collapse');
        if (det) det.open = true;
      }
      if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', openHash);
      else openHash();
      window.addEventListener('hashchange', openHash);
    }());
    (function () {
      /* Direction arrow for a row: ▲/▼ double-encodes the color signal.
         Volume and no-snapshot rows carry no direction. */
      function dirArrow(r) {
        if (!r || r.vol || r.noSnap) return '';
        var v = Number(r.cv);
        if (v > 0) return '▲ ';
        if (v < 0) return '▼ ';
        return '';
      }
      var rangeSessions = { '1W': 5, '1M': 22, '3M': 66, '6M': 132, 'YTD': 'ytd' };
      var currentRange = '1W';
      /* Points for a range: last N sessions, or every session since 1 Jan for YTD.
         Works on the snapshot asiHistory and on live data swapped in later. */
      function rangePoints(range) {
        if (range === 'YTD') {
          var yr = String(new Date().getFullYear());
          var pts = asiHistory.filter(function (p) { return p.d >= yr + '-01-01'; });
          return pts.length > 1 ? pts : asiHistory.slice(-22);
        }
        return asiHistory.slice(-Math.min(rangeSessions[range] || 22, asiHistory.length));
      }
      function fmtAsiLabel(iso) {
        var months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
        var parts = String(iso).split('-');
        return parts[2].replace(/^0/, '') + ' ' + months[Number(parts[1]) - 1] + ' ' + parts[0];
      }
      var svg = document.getElementById('asiChart');
      var tooltip = document.getElementById('tooltip');
      var periodLabel = document.getElementById('periodLabel');
      var chartChange = document.getElementById('chartChange');
      var NS = 'http://www.w3.org/2000/svg';

      function formatNumber(n) { return n.toLocaleString('en-NG', { minimumFractionDigits: 2, maximumFractionDigits: 2 }); }
      function node(name, attrs) {
        var el = document.createElementNS(NS, name);
        Object.keys(attrs || {}).forEach(function (key) { el.setAttribute(key, attrs[key]); });
        return el;
      }
      function draw(range, animate) {
        while (svg.firstChild) svg.removeChild(svg.firstChild);
        var points = rangePoints(range);
        if (!points.length) return;
        function plabel(p) { return p.label || fmtAsiLabel(p.d); }
        function fmtPct(v) {
          if (Math.abs(v) < 0.0005) return '0%';
          return (v < 0 ? '−' : '+') + Math.abs(v).toFixed(2) + '%';
        }
        var title = node('title', { id: 'chartTitle' }); title.textContent = 'NGX All-Share Index performance vs range start'; svg.appendChild(title);
        var desc = node('desc', { id: 'chartDesc' }); desc.textContent = 'Percent change of the ASI from the first selected close (' + plabel(points[0]) + ') to ' + plabel(points[points.length - 1]) + '.'; svg.appendChild(desc);
        var defs = node('defs', {});
        /* Each fill's own bounding box frames its gradient: the up fill fades
           from green at the line to transparent at zero; the down fill from
           transparent at zero to red at the line. */
        var gradUp = node('linearGradient', { id: 'asiUpGrad', x1: '0', y1: '0', x2: '0', y2: '1' });
        gradUp.appendChild(node('stop', { offset: '0%' }));
        gradUp.appendChild(node('stop', { offset: '100%' }));
        var gradDown = node('linearGradient', { id: 'asiDownGrad', x1: '0', y1: '0', x2: '0', y2: '1' });
        gradDown.appendChild(node('stop', { offset: '0%' }));
        gradDown.appendChild(node('stop', { offset: '100%' }));
        defs.appendChild(gradUp); defs.appendChild(gradDown);
        svg.appendChild(defs);
        var W = 1000, H = 360, L = 72, R = 28, T = 34, B = 46;
        var base = points[0].v;
        var pcts = points.map(function (p) { return base ? (p.v - base) / base * 100 : 0; });
        var minP = Math.min.apply(null, pcts), maxP = Math.max.apply(null, pcts);
        var span = Math.max(Math.abs(minP), Math.abs(maxP), 0.05) * 1.18;
        function x(i) { return points.length === 1 ? (L + W - R) / 2 : L + i * (W - L - R) / (points.length - 1); }
        function y(pct) { return T + (span - pct) * (H - T - B) / (2 * span); }
        var zeroY = y(0);
        /* Fewer, larger axis labels on narrow screens: the 1000-unit viewBox
           squeezes ~3x on phones, so 5 ticks at 10 units render tiny. */
        var narrowChart = svg.clientWidth > 0 && svg.clientWidth < 560;
        var tickFs = narrowChart ? [-1, 0, 1] : [-1, -0.5, 0, 0.5, 1];
        tickFs.forEach(function (f) {
          var gy = y(span * f);
          svg.appendChild(node('line', { x1: L, x2: W - R, y1: gy, y2: gy, 'class': 'grid-line' }));
          var label = node('text', { x: L - 12, y: gy + 4, 'text-anchor': 'end', 'class': 'axis-label' });
          if (narrowChart) label.style.fontSize = '30px'; /* inline: beats the .axis-label CSS rule */
          label.textContent = fmtPct(span * f); svg.appendChild(label);
        });
        var coords = pcts.map(function (pc, idx) { return [x(idx), y(pc)]; });
        /* Split the line and the zero-anchored fills at the zero line so no
           fill ever leaks across it. side 1 = above zero, side -1 = below. */
        function splitPaths(side) {
          function inR(pct) { return side === 1 ? pct >= -1e-9 : pct <= 1e-9; }
          function crossX(x1, y1, x2, y2) { var t = (zeroY - y1) / (y2 - y1); return (t > 0 && t < 1) ? x1 + t * (x2 - x1) : null; }
          function fx(n) { return n.toFixed(1); }
          var line = '', area = '', open = false, i, x1, y1, x2, y2, c1, c2, cx;
          function lemit(px, py) { line += (open ? 'L' : 'M') + fx(px) + ',' + fx(py) + ' '; open = true; }
          function aemit(px, py) { area += (area ? 'L' : 'M') + fx(px) + ',' + fx(py) + ' '; }
          for (i = 0; i < coords.length - 1; i++) {
            x1 = coords[i][0]; y1 = coords[i][1]; x2 = coords[i + 1][0]; y2 = coords[i + 1][1];
            c1 = inR(pcts[i]); c2 = inR(pcts[i + 1]);
            if (c1 && c2) { aemit(x1, y1); if (i === coords.length - 2) aemit(x2, y2); }
            else if (c1) { aemit(x1, y1); cx = crossX(x1, y1, x2, y2); if (cx !== null) aemit(cx, zeroY); }
            else if (c2) { cx = crossX(x1, y1, x2, y2); if (cx !== null) aemit(cx, zeroY); if (i === coords.length - 2) aemit(x2, y2); }
            else { aemit(x1, zeroY); aemit(x2, zeroY); }
          }
          open = false;
          for (i = 0; i < coords.length - 1; i++) {
            x1 = coords[i][0]; y1 = coords[i][1]; x2 = coords[i + 1][0]; y2 = coords[i + 1][1];
            c1 = inR(pcts[i]); c2 = inR(pcts[i + 1]);
            if (c1 && c2) { lemit(x1, y1); if (i === coords.length - 2) lemit(x2, y2); }
            else if (c1) { lemit(x1, y1); cx = crossX(x1, y1, x2, y2); if (cx !== null) lemit(cx, zeroY); open = false; }
            else if (c2) { cx = crossX(x1, y1, x2, y2); open = false; if (cx !== null) { lemit(cx, zeroY); lemit(x2, y2); } }
            else { open = false; }
          }
          var areaD = '';
          if (area) areaD = area + 'L' + fx(coords[coords.length - 1][0]) + ',' + fx(zeroY) + ' L' + fx(coords[0][0]) + ',' + fx(zeroY) + ' Z';
          return { line: line, area: areaD };
        }
        var up = splitPaths(1), down = splitPaths(-1);
        if (down.area) svg.appendChild(node('path', { d: down.area, 'class': 'area-down' }));
        if (up.area) svg.appendChild(node('path', { d: up.area, 'class': 'area-up' }));
        /* Zero line sits above the fills so it stays crisp where they meet it. */
        svg.appendChild(node('line', { x1: L, x2: W - R, y1: zeroY, y2: zeroY, 'class': 'zero-line' }));
        if (down.line) svg.appendChild(node('path', { d: down.line, 'class': 'series-down' + (animate ? ' asi-draw' : ''), pathLength: '1' }));
        if (up.line) svg.appendChild(node('path', { d: up.line, 'class': 'series-up' + (animate ? ' asi-draw' : ''), pathLength: '1' }));
        points.forEach(function (p, idx) {
          var dot = node('circle', { cx: coords[idx][0], cy: coords[idx][1], r: 5, 'class': 'chart-dot ' + (pcts[idx] < 0 ? 'down' : 'up'), tabindex: '0', role: 'button', 'aria-label': plabel(p) + ': ' + formatNumber(p.v) + ' (' + fmtPct(pcts[idx]) + ')' });
          function show() {
            var wrap = svg.parentElement.getBoundingClientRect();
            var box = svg.getBoundingClientRect();
            tooltip.textContent = plabel(p) + ' · ' + formatNumber(p.v) + ' (' + fmtPct(pcts[idx]) + ')';
            tooltip.style.left = ((coords[idx][0] / W) * box.width + box.left - wrap.left) + 'px';
            tooltip.style.top = ((coords[idx][1] / H) * box.height + box.top - wrap.top) + 'px';
            tooltip.classList.add('visible'); tooltip.setAttribute('aria-hidden', 'false');
          }
          function hide() { tooltip.classList.remove('visible'); tooltip.setAttribute('aria-hidden', 'true'); }
          dot.addEventListener('mouseenter', show); dot.addEventListener('focus', show); dot.addEventListener('click', show); dot.addEventListener('mouseleave', hide); dot.addEventListener('blur', hide);
          svg.appendChild(dot);
        });
        var first = node('text', { x: L, y: H - 17, 'text-anchor': 'start', 'class': 'axis-label' }); first.textContent = plabel(points[0]); svg.appendChild(first);
        var last = node('text', { x: W - R, y: H - 17, 'text-anchor': 'end', 'class': 'axis-label' }); last.textContent = plabel(points[points.length-1]); svg.appendChild(last);
        var chgPct = pcts[pcts.length - 1];
        chartChange.textContent = fmtPct(chgPct) + ' since ' + plabel(points[0]);
        chartChange.className = 'chart-change ' + (chgPct < 0 ? 'down' : 'up');
        periodLabel.textContent = plabel(points[0]) + ' · ' + plabel(points[points.length-1]);
      }
      document.querySelectorAll('.range-button').forEach(function (button) {
        button.addEventListener('click', function () {
          document.querySelectorAll('.range-button').forEach(function (b) { b.setAttribute('aria-pressed', 'false'); });
          button.setAttribute('aria-pressed', 'true');
          currentRange = button.getAttribute('data-range');
          draw(currentRange, true);
        });
      });
      /* Return-embedded range chips (brief 11): each pill shows its period return. */
      function paintRangeReturns() {
        document.querySelectorAll('.range-button').forEach(function (btn) {
          var range = btn.getAttribute('data-range');
          var pts = rangePoints(range);
          if (pts.length < 2) return;
          var ret = (pts[pts.length - 1].v - pts[0].v) / pts[0].v * 100;
          var sign = ret < 0 ? '−' : '+';
          var label = range + ' ' + sign + Math.abs(ret).toFixed(1) + '%';
          /* keep the range name for screen readers */
          btn.innerHTML = '<span class="rb-range">' + range + '</span> <span class="rb-ret ' + (ret < 0 ? 'down' : 'up') + '">' + sign + Math.abs(ret).toFixed(1) + '%</span>';
          btn.setAttribute('aria-label', 'Show ' + range + ', return ' + label);
        });
      }
      paintRangeReturns();
      window.NV = window.NV || {};
      window.NV.paintRangeReturns = paintRangeReturns;

      
      var dirState = { query: '', sector: 'All' };
      var dirSearch = document.getElementById('dirSearch');
      var dirList = document.getElementById('directoryList');
      var dirCount = document.getElementById('dirCount');
      var sectorChips = document.getElementById('sectorChips');
      function dirRows() {
        var q = dirState.query.toLowerCase();
        /* Map current NGX tickers back to the old directory symbols. */
        var REV_ALIAS = { GUARANTY: 'GTCO', ACCESS: 'ACCESSCORP', TOTALNG: 'TOTAL', CCNN: 'BUACEMENT', FBNH: 'FIRSTHOLDCO' };
        return directory.filter(function (e) {
          if (dirState.sector !== 'All' && e.g !== dirState.sector) return false;
          if (!q) return true;
          if (e.s.toLowerCase().indexOf(q) !== -1 || e.c.toLowerCase().indexOf(q) !== -1 || e.g.toLowerCase().indexOf(q) !== -1) return true;
          var aq = REV_ALIAS[q.toUpperCase()]; if (aq && e.s === aq) return true;
        }).sort(function (a, b) { return a.s < b.s ? -1 : a.s > b.s ? 1 : 0; });
      }
      function renderDirectory() {
        if (!dirList) return;
        dirList.innerHTML = '';
        var rows = dirRows();
        dirCount.textContent = rows.length + (rows.length === 1 ? ' stock' : ' stocks');
        if (!rows.length) {
          var empty = document.createElement('div'); empty.className = 'empty-note';
          empty.textContent = 'No stocks match your search.';
          dirList.appendChild(empty); return;
        }
        rows.forEach(function (r) {
          var item = document.createElement('div'); item.className = 'market-row';
          var star = document.createElement('button'); star.type = 'button'; star.className = 'star';
          var starred = isStarred(r.s);
          star.setAttribute('aria-pressed', starred ? 'true' : 'false');
          star.setAttribute('aria-label', (starred ? 'Remove ' : 'Add ') + r.s + (starred ? ' from' : ' to') + ' watchlist');
          star.textContent = starred ? '★' : '☆';
          star.addEventListener('click', function (ev) { ev.stopPropagation(); toggleStar(r.s); });
          var main = document.createElement('button'); main.type = 'button'; main.className = 'row-main';
          main.setAttribute('aria-label', r.s + ', ' + r.c + ', view details');
          var symbol = document.createElement('span'); symbol.className = 'symbol'; symbol.textContent = r.s;
          var tag = document.createElement('span'); tag.className = 'list-tag'; tag.textContent = r.g;
          var sep1 = document.createElement('span'); sep1.className = 'sym-sep'; sep1.textContent = ' \u00b7 ';
          symbol.appendChild(sep1); symbol.appendChild(tag);
          var company = document.createElement('span'); company.className = 'company'; company.textContent = r.c;
          var rowText = document.createElement('span'); rowText.className = 'row-text'; rowText.appendChild(symbol); rowText.appendChild(company); main.appendChild(window.nvBadge(r.s)); main.appendChild(rowText);
          main.addEventListener('click', function () { openModal(r.s, main); });
          var price = document.createElement('div'); price.className = 'price'; price.textContent = r.p;
          var move = document.createElement('div'); move.className = 'move ' + (r.d || ''); move.textContent = dirArrow(r) + r.m;
          item.appendChild(star); item.appendChild(main); item.appendChild(price); item.appendChild(move);
          dirList.appendChild(item);
        });
      }
      if (sectorChips) (function buildSectorChips() {
        var sectors = ['All'];
        directory.forEach(function (e) { if (sectors.indexOf(e.g) === -1) sectors.push(e.g); });
        sectors.forEach(function (name) {
          var b = document.createElement('button'); b.type = 'button'; b.className = 'sector-chip';
          b.textContent = name; b.setAttribute('aria-pressed', name === 'All' ? 'true' : 'false');
          b.addEventListener('click', function () {
            dirState.sector = name;
            sectorChips.querySelectorAll('.sector-chip').forEach(function (c) { c.setAttribute('aria-pressed', c === b ? 'true' : 'false'); });
            renderDirectory();
          });
          sectorChips.appendChild(b);
        });
      }());
      var dirTimer = null;
      if (dirSearch) dirSearch.addEventListener('input', function () {
        clearTimeout(dirTimer);
        dirTimer = setTimeout(function () { dirState.query = dirSearch.value.trim(); renderDirectory(); }, 160);
      });
      var marketList = document.getElementById('market-list');
      var searchInput = document.getElementById('stockSearch');
      var watchCount = document.getElementById('watchCount');
      /* ---- Market breadth: leaders & laggards side by side ---- */
      var leadersList = document.getElementById('leadersList');
      var laggardsList = document.getElementById('laggardsList');
      var breadthCols = document.getElementById('breadthCols');
      var state = { view: 'breadth', query: '' };
      var watchlist = [];
      try { watchlist = JSON.parse(localStorage.getItem('ngxWatchlist') || '[]'); } catch (e) { watchlist = []; }
      function saveWatchlist() { try { localStorage.setItem('ngxWatchlist', JSON.stringify(watchlist)); } catch (e) {} }
      function isStarred(s) { return watchlist.indexOf(s) !== -1; }
      function updateWatchCount() { if (!watchCount) return; watchCount.textContent = watchlist.length ? '(' + watchlist.length + ')' : ''; }
      function findStock(s) {
        for (var k in tables) {
          for (var i = 0; i < tables[k].length; i++) {
            if (tables[k][i].s === s) return { row: tables[k][i], list: k };
          }
        }
        for (var j = 0; j < directory.length; j++) {
          if (directory[j].s === s) return { row: directory[j], list: 'directory' };
        }
        return null;
      }
      function toggleStar(s) {
        var i = watchlist.indexOf(s);
        if (i === -1) watchlist.push(s); else watchlist.splice(i, 1);
        saveWatchlist(); updateWatchCount(); render(); renderDirectory();
        if (currentModal === s) paintModalStar(s);
      }
      function buildRow(r, i, tag) {
        var item = document.createElement('div'); item.className = 'market-row';
        var star = document.createElement('button'); star.type = 'button'; star.className = 'star';
        var starred = isStarred(r.s);
        star.setAttribute('aria-pressed', starred ? 'true' : 'false');
        star.setAttribute('aria-label', (starred ? 'Remove ' : 'Add ') + r.s + (starred ? ' from' : ' to') + ' watchlist');
        star.textContent = starred ? '\u2605' : '\u2606';
        star.addEventListener('click', function (ev) { ev.stopPropagation(); toggleStar(r.s); });
        var main = document.createElement('button'); main.type = 'button'; main.className = 'row-main';
        main.setAttribute('aria-label', r.s + ', ' + r.c + ' \u2014 view details');
        var symbol = document.createElement('span'); symbol.className = 'symbol'; symbol.textContent = (i + 1) + '. ' + r.s;
        if (tag) {
          var tg = document.createElement('span'); tg.className = 'list-tag'; tg.textContent = tag;
          var sep2 = document.createElement('span'); sep2.className = 'sym-sep'; sep2.textContent = ' \u00b7 ';
          symbol.appendChild(sep2); symbol.appendChild(tg);
        }
        var company = document.createElement('span'); company.className = 'company'; company.textContent = r.c;
        var rowText = document.createElement('span'); rowText.className = 'row-text'; rowText.appendChild(symbol); rowText.appendChild(company);
        main.appendChild(window.nvBadge(r.s)); main.appendChild(rowText);
        main.addEventListener('click', function () { openModal(r.s, main); });
        var price = document.createElement('div'); price.className = 'price'; price.textContent = r.p;
        var move = document.createElement('div');
        move.className = 'move' + (r.vol ? '' : ' ' + (r.d || ''));
        move.textContent = r.vol ? r.m + ' shares' : dirArrow(r) + r.m;
        item.appendChild(star); item.appendChild(main);
        var spark = sparkEl(r.sp, r.d);
        if (spark) item.appendChild(spark);
        item.appendChild(price); item.appendChild(move);
        return item;
      }
      /* Mini sparkline from baked closes (brief 6); skipped when no data.
         Colored by the day's direction to match the row. */
      function sparkEl(closes, dir) {
        if (!closes || closes.length < 2) return null;
        var w = 64, h = 22;
        var min = Math.min.apply(null, closes), max = Math.max.apply(null, closes);
        var rng = (max - min) || 1;
        var pts = [];
        for (var i = 0; i < closes.length; i++) {
          var x = (i / (closes.length - 1) * w).toFixed(1);
          var y = (h - 2 - (closes[i] - min) / rng * (h - 4)).toFixed(1);
          pts.push(x + "," + y);
        }
        var wrap = document.createElement("span");
        wrap.className = "spark " + (dir === "down" ? "down" : "up");
        wrap.setAttribute("aria-hidden", "true");
        wrap.innerHTML = '<svg viewBox="0 0 ' + w + ' ' + h + '">' +
          '<polyline points="' + pts.join(" ") + '" fill="none" stroke="currentColor" stroke-width="1.5"/></svg>';
        return wrap;
      }
      function renderBreadth() {
        if (!breadthCols || !leadersList || !laggardsList) return;
        leadersList.innerHTML = ''; laggardsList.innerHTML = '';
        tables.gainers.slice(0, 5).forEach(function (r, i) { leadersList.appendChild(buildRow(r, i)); });
        tables.losers.slice(0, 5).forEach(function (r, i) { laggardsList.appendChild(buildRow(r, i)); });
      }
      function flatRows() {
        var q = state.query.trim().toLowerCase();
        if (q) {
          var out = [];
          ['gainers', 'losers', 'volume'].forEach(function (k) {
            tables[k].forEach(function (r) {
              if (r.s.toLowerCase().indexOf(q) !== -1 || r.c.toLowerCase().indexOf(q) !== -1) out.push({ row: r, list: k });
            });
          });
          return out;
        }
        if (state.view === 'watchlist') return watchlist.map(findStock).filter(Boolean);
        return tables.volume.map(function (r) { return { row: r, list: 'volume' }; });
      }
      function paintTabs() {
        document.querySelectorAll('.breadth-toggle button').forEach(function (b) {
          b.setAttribute('aria-selected', state.query ? 'false' : (b.getAttribute('data-view') === state.view ? 'true' : 'false'));
        });
      }
      function render() {
        paintTabs();
        if (!marketList) return;
        var inBreadth = state.view === 'breadth' && !state.query.trim();
        if (breadthCols) breadthCols.hidden = !inBreadth;
        marketList.hidden = inBreadth;
        if (inBreadth) { renderBreadth(); return; }
        marketList.innerHTML = '';
        var rows = flatRows();
        if (!rows.length) {
          var empty = document.createElement('div'); empty.className = 'empty-note';
          empty.textContent = (state.view === 'watchlist' && !state.query.trim())
            ? 'Your watchlist is empty. Tap the \u2606 on any stock, or star it inside its details, to pin it here. It stays saved in this browser.'
            : 'No stocks match your search.';
          marketList.appendChild(empty);
          return;
        }
        rows.forEach(function (entry, i) {
          marketList.appendChild(buildRow(entry.row, i, entry.list && typeof listNames !== 'undefined' ? listNames[entry.list] : ''));
        });
      }
      document.querySelectorAll('.breadth-toggle button').forEach(function (button) {
        button.addEventListener('click', function () {
          state.view = button.getAttribute('data-view');
          state.query = ''; if (searchInput) searchInput.value = '';
          marketList.setAttribute('aria-labelledby', button.id);
          render();
        });
      });
      var searchTimer = null;
      if (searchInput) searchInput.addEventListener('input', function () {
        clearTimeout(searchTimer);
        searchTimer = setTimeout(function () { state.query = searchInput.value.trim(); render(); }, 160);
      });
      var backdrop = document.getElementById('modalBackdrop');
      var modalClose = document.getElementById('modalClose');
      var modalStar = document.getElementById('modalStar');
      var currentModal = null, lastFocused = null;
      function paintModalStar(s) {
        modalStar.textContent = isStarred(s) ? '★ Starred: tap to remove from watchlist' : '☆ Add to watchlist';
      }
      window.nvOpenModal = openModal;
      function openModal(s, opener) {
        var found = findStock(s); if (!found) return;
        var r = found.row;
        var isDir = found.list === 'directory';
        currentModal = s; lastFocused = opener || document.activeElement;
        var snapShort = window.NVTradeDate || '25 Sep 2026';
        document.getElementById('modalList').textContent = isDir ? 'Market directory' : (listNames[found.list] + ' \u00b7 Snapshot ' + snapShort);
        var msEl = document.getElementById('modalSymbol');
        msEl.innerHTML = '';
        msEl.appendChild(window.nvBadge(r.s, 'lg'));
        var msTx = document.createElement('span'); msTx.textContent = r.s; msEl.appendChild(msTx);
        document.getElementById('modalCompany').textContent = r.c + (isDir && r.g ? ' \u00b7 ' + r.g : '');
        document.getElementById('modalPrice').textContent = r.p;
        document.getElementById('modalMoveLabel').textContent = r.vol ? 'Volume' : (r.noSnap ? 'Sector' : 'Day change');
        var mm = document.getElementById('modalMove');
        mm.textContent = r.noSnap ? r.g : (r.vol ? r.m + ' shares' : dirArrow(r) + r.m);
        mm.style.color = r.noSnap ? 'inherit' : (r.d === 'up' ? 'var(--green-strong)' : 'var(--red)');
        var mpEl = document.getElementById('modalPage');
        if (mpEl) {
          var hasPage = !!(window.NV_STOCK_PAGES && window.NV_STOCK_PAGES[s]);
          mpEl.hidden = !hasPage;
          if (hasPage) mpEl.href = 'stocks/' + s;
        }
        paintModalStar(s);
        backdrop.hidden = false;
        document.body.style.overflow = 'hidden';
        modalClose.focus();
      }
      function closeModal() {
        backdrop.hidden = true;
        document.body.style.overflow = '';
        currentModal = null;
        if (lastFocused && lastFocused.focus) lastFocused.focus();
      }
      if (modalClose) modalClose.addEventListener('click', closeModal);
      if (backdrop) backdrop.addEventListener('click', function (ev) { if (ev.target === backdrop) closeModal(); });
      document.addEventListener('keydown', function (ev) { if (ev.key === 'Escape' && backdrop && !backdrop.hidden) closeModal(); });
      if (modalStar) modalStar.addEventListener('click', function () { if (currentModal) toggleStar(currentModal); });
      var newsState = { sector: 'All' };
      var newsChips = document.getElementById('newsChips');
      function getNewsCards() { return Array.prototype.slice.call(document.querySelectorAll('.news-card')); }
      var newsSectors = ['All', 'Market-wide', 'Banking', 'Insurance', 'Oil & Gas', 'Consumer Goods', 'Industrial Goods'];
      var newsKeys = { 'All': 'all', 'Market-wide': 'market', 'Banking': 'banking', 'Insurance': 'insurance', 'Oil & Gas': 'oilgas', 'Consumer Goods': 'consumer', 'Industrial Goods': 'industrial' };
      function renderNews() {
        var key = newsKeys[newsState.sector];
        var n = 0;
        getNewsCards().forEach(function (c) {
          var show = key === 'all' || c.getAttribute('data-sector') === key;
          c.style.display = show ? '' : 'none';
          if (show) n++;
        });
        var newsCountEl = document.getElementById('newsCount');
        if (newsCountEl) newsCountEl.textContent = n + (n === 1 ? ' story' : ' stories');
      }
      if (newsChips) newsSectors.forEach(function (name) {
        var b = document.createElement('button'); b.type = 'button'; b.className = 'sector-chip';
        b.textContent = name; b.setAttribute('aria-pressed', name === 'All' ? 'true' : 'false');
        b.addEventListener('click', function () {
          newsState.sector = name;
          newsChips.querySelectorAll('.sector-chip').forEach(function (x) { x.setAttribute('aria-pressed', x === b ? 'true' : 'false'); });
          renderNews();
        });
        newsChips.appendChild(b);
      });
      renderNews();
      // Live headlines from the auto newsroom (worker refreshes the feed every few hours).
      (function loadLiveNews() {
        var grid = document.getElementById('liveNewsGrid');
        if (!grid) return;
        var section = document.getElementById('liveNewsSection');
        var updatedEl = document.getElementById('liveNewsUpdated');
        var sectorKey = { 'market-wide': 'market', 'banking': 'banking', 'insurance': 'insurance', 'oil & gas': 'oilgas', 'consumer goods': 'consumer', 'industrial goods': 'industrial' };
        var sectorLabel = { 'market-wide': 'Market-wide', 'banking': 'Banking', 'insurance': 'Insurance', 'oil & gas': 'Oil & Gas', 'consumer goods': 'Consumer Goods', 'industrial goods': 'Industrial Goods' };
        function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
        function fmtDate(ts) {
          var d = new Date(ts);
          var months = ['JAN','FEB','MAR','APR','MAY','JUN','JUL','AUG','SEP','OCT','NOV','DEC'];
          return d.getDate() + ' ' + months[d.getMonth()];
        }
        function ago(ts) {
          var m = Math.round((Date.now() - ts) / 60000);
          if (m < 1) return 'just now';
          if (m < 60) return m + 'm ago';
          var h = Math.round(m / 60);
          return h < 24 ? h + 'h ago' : Math.round(h / 24) + 'd ago';
        }
        fetch('https://nairaview-api.meetomidiora.workers.dev/api/news')
          .then(function (r) { if (!r.ok) throw new Error('news feed unavailable'); return r.json(); })
          .then(function (data) {
            var items = (data && data.items) || [];
            if (!items.length) { if (section) section.style.display = 'none'; return; }
            var html = '';
            items.slice(0, 24).forEach(function (it) {
              var key = sectorKey[it.sector] || 'market';
              var thumbHtml = it.image ? '<div class="news-thumb"><img src="' + esc(it.image) + '" alt="" loading="lazy" onerror="this.closest(\'.news-thumb\').remove()"></div>' : '';
              html += '<a class="news-card" data-sector="' + key + '" href="' + esc(it.link) + '" target="_blank" rel="noopener noreferrer">'
                + thumbHtml
                + '<div class="news-meta"><span>' + esc((it.source || '').toUpperCase()) + '</span><span>' + esc(fmtDate(it.published_at)) + '</span><span class="news-sector">' + esc(sectorLabel[it.sector] || 'Market-wide') + '</span></div>'
                + '<h3>' + esc(it.title) + '</h3>'
                + (it.description ? '<p>' + esc(it.description) + '</p>' : '')
                + '<span class="arrow" aria-hidden="true">\u2197</span></a>';
            });
            grid.innerHTML = html;
            if (updatedEl && data.updated_at) updatedEl.textContent = 'Updated ' + ago(data.updated_at);
            renderNews();
          })
          .catch(function () { if (section) section.style.display = 'none'; });
      })();
      /* (ticker chips now handled by the brief-13 implementation below) */
      var stickyClosed = false;
      function revealAds() {
        var anySticky = false;
        document.querySelectorAll('.ad-slot').forEach(function (slot) {
          if (slot.id === 'adSticky' && stickyClosed) return;
          var frame = slot.querySelector('iframe');
          if (frame) {
            /* Only reveal if the ad actually rendered (non-zero size) */
            try {
              var r = frame.getBoundingClientRect();
              if (r.width > 10 && r.height > 10) {
                slot.classList.add('ad-live');
                if (slot.id === 'adSticky') anySticky = true;
              }
            } catch (e) {}
          }
        });
        document.body.classList.toggle('ad-sticky-on', anySticky);
      }
      var adTries = 0;
      function pollAds() {
        revealAds();
        if (++adTries < 15 && !document.querySelector('.ad-slot.ad-live')) setTimeout(pollAds, 1000);
      }
      window.addEventListener('load', function () { setTimeout(pollAds, 1500); });
      var adClose = document.getElementById('adStickyClose');
      if (adClose) adClose.addEventListener('click', function () {
        stickyClosed = true;
        document.getElementById('adSticky').classList.remove('ad-live');
        document.body.classList.remove('ad-sticky-on');
      });
      /* ---- Native market ticker (own snapshot data; replaces blocked ngnmarket iframe) ---- */
      function renderTape() {
        var track = document.getElementById('tickerTrack');
        if (!track) return;
        var rows = (typeof tables !== 'undefined') ? tables.gainers.concat(tables.losers) : [];
        if (!rows.length) { track.parentNode.style.display = 'none'; return; }
        var html = rows.map(function (r) {
          return '<span class="ticker-item">' + window.nvBadgeHTML(r.s, 'sm') + '<span class="tk-s">' + r.s + '</span>' +
            '<span class="tk-p">' + r.p + '</span>' +
            '<span class="tk-m ' + (r.d === 'up' ? 'up' : 'down') + '">' + dirArrow(r) + r.m + '</span></span>';
        }).join('');
        track.innerHTML = html + html; /* duplicate for a seamless -50% loop */
      }
      renderTape();
      /* ---- Market heatmap: cap-weighted treemap ----
         Tile area follows sqrt(market cap) so giants read as giants;
         direction is triple-encoded (pastel tint + colored figure + arrow),
         and every figure keeps dark text. */
      function renderHeatmap() {
        var host = document.getElementById('heatTiles');
        if (!host) return;
        /* snapshot direction per symbol so repainted tiles that flipped flash */
        var prevDir = {};
        Array.prototype.forEach.call(host.querySelectorAll('.heat-tile'), function (tile) {
          var s = tile.querySelector('.ht-s');
          if (s) prevDir[s.textContent] = tile.classList.contains('heat-down');
        });
        host.innerHTML = '';
        var rows = tables.gainers.concat(tables.losers);
        if (!rows.length) return;
        var roots = rows.map(function (r) { return Math.sqrt(Number(r.mc) || 0); });
        var maxRoot = Math.max.apply(null, roots.concat([1]));
        rows.forEach(function (r, idx) {
          var t = document.createElement('button');
          t.type = 'button'; t.className = 'heat-tile'; t.setAttribute('role', 'listitem');
          var grow = 1 + Math.round(11 * roots[idx] / maxRoot);
          /* Basis carries the weight (no shrink, so small tiles can't be
             equalized); leftover row space still distributes by grow. */
          t.style.flex = grow + ' 0 ' + (80 + grow * 50) + 'px';
          /* Cap the width so a lone tile on the last row can't stretch
             full-width and read as the biggest company. */
          t.style.maxWidth = (grow * 170) + 'px';
          t.style.background = r.cv >= 0 ? 'var(--green-soft)' : 'var(--red-soft)';
          t.classList.add(r.cv >= 0 ? 'heat-up' : 'heat-down');
          if (prevDir[r.s] !== undefined && prevDir[r.s] !== (r.cv < 0)) t.classList.add('heat-flip');
          var s1 = document.createElement('span'); s1.className = 'ht-s'; s1.textContent = r.s;
          var s2 = document.createElement('span'); s2.className = 'ht-c ' + (r.cv >= 0 ? 'up' : 'down'); s2.textContent = dirArrow(r) + r.m;
          var s3 = document.createElement('span'); s3.className = 'ht-p'; s3.textContent = r.p;
          t.insertBefore(window.nvBadge(r.s, 'sm'), t.firstChild);
          t.appendChild(s1); t.appendChild(s2); t.appendChild(s3);
          t.setAttribute('aria-label', r.s + ', ' + r.c + ', day change ' + r.m + ' \u2014 view details');
          t.addEventListener('click', function () { openModal(r.s, t); });
          host.appendChild(t);
        });
      }
      renderHeatmap();
      /* ---- Stock screener ---- */
      if (document.getElementById('screenList') && !(window.NV_ISLANDS && window.NV_ISLANDS.screener)) {
      var scrState = { mover: 'all', sector: 'All', minP: '', maxP: '', minC: '', maxC: '', sort: 'chg-desc' };
      var screenList = document.getElementById('screenList');
      var screenCount = document.getElementById('screenCount');
      function scrKey(e, what) {
        if (what === 'chg') return (!e.vol && e.pv !== null && !e.noSnap) ? e.cv : null;
        if (what === 'price') return e.pv;
        if (what === 'vol') return e.vol ? e.cv : null;
        return null;
      }
      function scrRows() {
        var minP = parseFloat(scrState.minP), maxP = parseFloat(scrState.maxP);
        var minC = parseFloat(scrState.minC), maxC = parseFloat(scrState.maxC);
        var priceOn = !isNaN(minP) || !isNaN(maxP);
        var chgOn = !isNaN(minC) || !isNaN(maxC);
        var rows = directory.filter(function (e) {
          if (scrState.mover === 'gainers' && !(!e.vol && e.d === 'up')) return false;
          if (scrState.mover === 'losers' && e.d !== 'down') return false;
          if (scrState.mover === 'volume' && !e.vol) return false;
          if (scrState.sector !== 'All' && e.g !== scrState.sector) return false;
          if (priceOn) {
            if (e.pv === null) return false;
            if (!isNaN(minP) && e.pv < minP) return false;
            if (!isNaN(maxP) && e.pv > maxP) return false;
          }
          if (chgOn) {
            var c = scrKey(e, 'chg');
            if (c === null) return false;
            if (!isNaN(minC) && c < minC) return false;
            if (!isNaN(maxC) && c > maxC) return false;
          }
          return true;
        });
        var key = scrState.sort;
        rows.sort(function (a, b) {
          if (key === 'name') return a.s < b.s ? -1 : a.s > b.s ? 1 : 0;
          var wk = key === 'vol-desc' ? 'vol' : (key.indexOf('chg') === 0 ? 'chg' : 'price');
          var ka = scrKey(a, wk), kb = scrKey(b, wk);
          if (ka === null && kb === null) return 0;
          if (ka === null) return 1;
          if (kb === null) return -1;
          return (key === 'chg-asc' || key === 'price-asc') ? ka - kb : kb - ka;
        });
        return rows;
      }
      function renderScreener() {
        screenList.innerHTML = '';
        var rows = scrRows();
        screenCount.textContent = rows.length + (rows.length === 1 ? ' stock' : ' stocks');
        if (!rows.length) {
          var empty = document.createElement('div'); empty.className = 'empty-note';
          empty.textContent = 'No stocks match these filters.';
          screenList.appendChild(empty); return;
        }
        rows.forEach(function (r) {
          var item = document.createElement('div'); item.className = 'market-row';
          var star = document.createElement('button'); star.type = 'button'; star.className = 'star';
          var starred = isStarred(r.s);
          star.setAttribute('aria-pressed', starred ? 'true' : 'false');
          star.setAttribute('aria-label', (starred ? 'Remove ' : 'Add ') + r.s + (starred ? ' from' : ' to') + ' watchlist');
          star.textContent = starred ? '★' : '☆';
          star.addEventListener('click', function (ev) { ev.stopPropagation(); toggleStar(r.s); renderScreener(); });
          var main = document.createElement('button'); main.type = 'button'; main.className = 'row-main';
          main.setAttribute('aria-label', r.s + ', ' + r.c + ', view details');
          var symbol = document.createElement('span'); symbol.className = 'symbol'; symbol.textContent = r.s;
          var tag = document.createElement('span'); tag.className = 'list-tag'; tag.textContent = r.g;
          var sep1 = document.createElement('span'); sep1.className = 'sym-sep'; sep1.textContent = ' \u00b7 ';
          symbol.appendChild(sep1); symbol.appendChild(tag);
          var company = document.createElement('span'); company.className = 'company'; company.textContent = r.c;
          var rowText = document.createElement('span'); rowText.className = 'row-text'; rowText.appendChild(symbol); rowText.appendChild(company); main.appendChild(window.nvBadge(r.s)); main.appendChild(rowText);
          main.addEventListener('click', function () { openModal(r.s, main); });
          var price = document.createElement('div'); price.className = 'price'; price.textContent = r.p;
          var move = document.createElement('div'); move.className = 'move ' + (r.d || ''); move.textContent = r.vol ? r.m + ' shares' : dirArrow(r) + r.m;
          item.appendChild(star); item.appendChild(main); item.appendChild(price); item.appendChild(move);
          screenList.appendChild(item);
        });
      }
      (function buildScreenChips() {
        var host = document.getElementById('screenMover');
        [['all', 'All'], ['gainers', 'Gainers'], ['losers', 'Losers'], ['volume', 'Most traded']].forEach(function (opt) {
          var b = document.createElement('button'); b.type = 'button'; b.className = 'sector-chip';
          b.textContent = opt[1]; b.setAttribute('aria-pressed', opt[0] === 'all' ? 'true' : 'false');
          b.addEventListener('click', function () {
            scrState.mover = opt[0];
            host.querySelectorAll('.sector-chip').forEach(function (c) { c.setAttribute('aria-pressed', c === b ? 'true' : 'false'); });
            renderScreener();
          });
          host.appendChild(b);
        });
      }());
      (function buildScreenSectors() {
        var sel = document.getElementById('screenSector');
        var sectors = ['All'];
        directory.forEach(function (e) { if (sectors.indexOf(e.g) === -1) sectors.push(e.g); });
        sectors.forEach(function (name) {
          var o = document.createElement('option'); o.value = name;
          o.textContent = name === 'All' ? 'All sectors' : name;
          sel.appendChild(o);
        });
        sel.addEventListener('change', function () { scrState.sector = sel.value; renderScreener(); });
      }());
      [['screenMinP', 'minP'], ['screenMaxP', 'maxP'], ['screenMinC', 'minC'], ['screenMaxC', 'maxC']].forEach(function (pair) {
        document.getElementById(pair[0]).addEventListener('input', function (ev) { scrState[pair[1]] = ev.target.value; renderScreener(); });
      });
      document.getElementById('screenSort').addEventListener('change', function (ev) { scrState.sort = ev.target.value; renderScreener(); });
      document.getElementById('screenReset').addEventListener('click', function () {
        scrState = { mover: 'all', sector: 'All', minP: '', maxP: '', minC: '', maxC: '', sort: 'chg-desc' };
        document.getElementById('screenSector').value = 'All';
        document.getElementById('screenSort').value = 'chg-desc';
        ['screenMinP', 'screenMaxP', 'screenMinC', 'screenMaxC'].forEach(function (id) { document.getElementById(id).value = ''; });
        document.querySelectorAll('#screenMover .sector-chip').forEach(function (c, i) { c.setAttribute('aria-pressed', i === 0 ? 'true' : 'false'); });
        renderScreener();
      });
      renderScreener();
      }
      /* ---- Calendar type filters ---- */
      (function buildCalChips() {
        var host = document.getElementById('calChips');
        if (!host) return;
        ['All', 'Dividend', 'Offer', 'Earnings', 'Regulatory'].forEach(function (name, i) {
          var b = document.createElement('button'); b.type = 'button'; b.className = 'sector-chip';
          b.textContent = name; b.setAttribute('aria-pressed', i === 0 ? 'true' : 'false');
          b.addEventListener('click', function () {
            host.querySelectorAll('.sector-chip').forEach(function (c) { c.setAttribute('aria-pressed', c === b ? 'true' : 'false'); });
            document.querySelectorAll('.cal-event').forEach(function (ev) {
              ev.style.display = (name === 'All' || ev.getAttribute('data-type') === name) ? '' : 'none';
            });
          });
          host.appendChild(b);
        });
      }());
      updateWatchCount();
      if (document.getElementById('asiChart')) draw(currentRange, true);
      render();
      renderDirectory();
      /* Live-data hooks: assets/live.js swaps in fresh market data after load
         and calls these to repaint without a page reload. */
      window.NV = window.NV || {};
      window.NV.redrawAsi = function (r) { if (document.getElementById('asiChart')) draw(r || currentRange); if (window.NV.paintRangeReturns) window.NV.paintRangeReturns(); };
      window.NV.renderTape = function () { renderTape(); };
      window.NV.renderHeatmap = function () { renderHeatmap(); };
      window.NV.renderTables = function () { render(); };
      window.NV.renderDirectory = function () { renderDirectory(); };
      window.NV.renderScreener = function () { if (typeof renderScreener === 'function' && document.getElementById('screenList')) renderScreener(); };
    }());
    /* ---- 11. Sticky section sub-nav scroll-spy (homepage only) ---- */
    (function () {
      var nav = document.querySelector('.section-subnav');
      if (!nav || !('IntersectionObserver' in window)) return;
      var links = Array.prototype.slice.call(nav.querySelectorAll('a'));
      var map = {};
      links.forEach(function (a) {
        var id = a.getAttribute('href').slice(1);
        if (document.getElementById(id)) map[id] = a;
      });
      if (!links.length) return;
      var obs = new IntersectionObserver(function (entries) {
        entries.forEach(function (e) {
          if (e.isIntersecting) {
            links.forEach(function (a) { a.classList.toggle('active', a === map[e.target.id]); });
          }
        });
      }, { rootMargin: '-40% 0px -55% 0px' });
      Object.keys(map).forEach(function (id) { obs.observe(document.getElementById(id)); });
    }());
    /* ---- 12. Close-based price alerts (stock pages; signed-in users) ---- */
    (function priceAlerts() {
      var API = 'https://nairaview-api.meetomidiora.workers.dev';
      var m = window.location.pathname.match(/\/stocks\/([A-Za-z0-9]+)/);
      if (!m) return;
      var ticker = m[1].toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 12);
      if (!ticker) return;
      var heading = document.querySelector('.section-heading');
      var anchor = heading ? heading.querySelector('p.asof') : null;
      if (!anchor) return;
      function esc(s) {
        return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
          return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
        });
      }
      function money(n) {
        return '\u20A6' + Number(n).toLocaleString('en-NG', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
      }
      var box = document.createElement('div');
      box.className = 'alert-widget';
      box.innerHTML =
        '<h3 class="alert-title">Price alerts</h3>' +
        '<p class="guide-p alert-note">We check each daily close and email you once when ' + esc(ticker) + ' hits your target.</p>' +
        '<div class="alert-list"></div>' +
        '<p class="guide-p alert-signin" hidden>Please <a href="../account">sign in</a> to set a price alert.</p>' +
        '<form class="alert-form" hidden>' +
        '<label>Target (\u20A6)<input type="number" name="alerttarget" min="0.01" step="0.01" inputmode="decimal" required placeholder="0.00"></label>' +
        '<label>Direction<select name="alertdirection"><option value="above">at or above</option><option value="below">at or below</option></select></label>' +
        '<button type="submit" class="btn-primary">Set alert</button></form>' +
        '<p class="form-error" role="alert" hidden></p>';
      anchor.parentNode.insertBefore(box, anchor.nextSibling);
      var listEl = box.querySelector('.alert-list');
      var form = box.querySelector('.alert-form');
      var signin = box.querySelector('.alert-signin');
      var errEl = box.querySelector('.form-error');
      function showErr(msg) { errEl.textContent = msg || ''; errEl.hidden = !msg; }
      function renderAlerts(alerts) {
        var mine = (alerts || []).filter(function (a) { return a && a.ticker === ticker; });
        if (!mine.length) { listEl.innerHTML = ''; return; }
        listEl.innerHTML = mine.map(function (a) {
          var label = a.active === false
            ? 'Triggered at ' + money(a.triggered_price) + ' · now off'
            : (a.direction === 'below' ? 'At or below ' : 'At or above ') + money(a.target);
          return '<div class="alert-row"><span>' + esc(label) + '</span>' +
            '<button type="button" class="btn-ghost alert-del" data-id="' + esc(a.id) + '">Remove</button></div>';
        }).join('');
      }
      function readJson(res) { return res.json().then(function (j) { return { ok: res.ok, j: j }; }); }
      listEl.addEventListener('click', function (e) {
        var b = e.target && e.target.closest ? e.target.closest('.alert-del') : null;
        if (!b) return;
        showErr('');
        fetch(API + '/api/alerts?id=' + encodeURIComponent(b.getAttribute('data-id')),
          { method: 'DELETE', credentials: 'include' })
          .then(readJson)
          .then(function (r) { if (!r.ok) throw new Error((r.j && r.j.error) || 'Could not remove.'); load(); })
          .catch(function (e2) { showErr(e2.message); });
      });
      form.addEventListener('submit', function (e) {
        e.preventDefault();
        showErr('');
        var target = Number(form.querySelector('[name=alerttarget]').value);
        var direction = form.querySelector('[name=alertdirection]').value;
        fetch(API + '/api/alerts', {
          method: 'POST', credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ticker: ticker, target: target, direction: direction })
        })
          .then(readJson)
          .then(function (r) { if (!r.ok) throw new Error((r.j && r.j.error) || 'Could not save.'); form.reset(); load(); })
          .catch(function (e2) { showErr(e2.message); });
      });
      function load() {
        fetch(API + '/api/alerts', { credentials: 'include' })
          .then(function (r) { if (!r.ok) throw new Error('load'); return r.json(); })
          .then(function (j) { renderAlerts(j.alerts); })
          .catch(function () { renderAlerts([]); });
      }
      fetch(API + '/api/auth/me', { credentials: 'include' })
        .then(function (r) { return r.ok ? r.json() : null; })
        .then(function (me) {
          if (me && me.email) { form.hidden = false; load(); }
          else { signin.hidden = false; box.classList.add('is-signed-out'); }
        })
        .catch(function () { signin.hidden = false; box.classList.add('is-signed-out'); });
    }());

/* ---- Nav dropdowns: hover reveals (CSS), click toggles, parent highlights on child pages ---- */
(function () {
  var nav = document.querySelector('.site-nav');
  if (!nav) return;
  var items = Array.prototype.slice.call(nav.querySelectorAll('.nav-item'));
  if (!items.length) return;

  function closeAll(except) {
    items.forEach(function (it) {
      if (it !== except) it.classList.remove('open');
      var link = it.querySelector(':scope > a, :scope > button.nav-hub');
      if (link && it !== except) link.setAttribute('aria-expanded', 'false');
    });
    if (!except) nav.classList.remove('drop-open');
  }

  items.forEach(function (it) {
    var link = it.querySelector(':scope > a, :scope > button.nav-hub');
    var drop = it.querySelector(':scope > .nav-dropdown');
    if (!link || !drop) return;
    link.setAttribute('aria-haspopup', 'true');
    link.setAttribute('aria-expanded', 'false');

    it.addEventListener('mouseenter', function () {
      nav.classList.add('drop-open');
      link.setAttribute('aria-expanded', 'true');
    });
    it.addEventListener('mouseleave', function () {
      link.setAttribute('aria-expanded', 'false');
      if (!nav.querySelector('.nav-item.open')) nav.classList.remove('drop-open');
    });

    /* first click opens the menu, second click follows the parent link
       (hub buttons have no link: second click closes instead) */
    link.addEventListener('click', function (e) {
      var isHub = link.tagName === 'BUTTON';
      if (!it.classList.contains('open')) {
        e.preventDefault();
        closeAll(it);
        it.classList.add('open');
        nav.classList.add('drop-open');
        link.setAttribute('aria-expanded', 'true');
      } else if (isHub) {
        e.preventDefault();
        closeAll(null);
      }
    });
  });

  document.addEventListener('click', function (e) {
    if (!e.target.closest('.nav-item')) closeAll(null);
  });
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape') closeAll(null);
  });

  /* highlight the parent when on a dropdown child page */
  var seg = location.pathname.split('/').pop().replace(/\.html$/, '');
  var childToParent = {
    'stocks': 'markets', 'screener': 'markets', 'compare': 'markets', 'highs-lows': 'markets',
    'etfs': 'markets', 'watchlist': 'markets',
    'fx': 'markets', 'fx-usd': 'markets', 'fx-eur': 'markets', 'fx-gbp': 'markets',
    'fixed-income': 'markets', 'economy': 'markets', 'brokers': 'markets',
    'dividends': 'calendar', 'corporate-actions': 'calendar', 'earnings': 'calendar',
    'insider-dealings': 'news', 'ipo-tracker': 'offers', 'market-recap': 'learn'
  };
  var parent = childToParent[seg];
  if (parent) {
    var hub = nav.querySelector('[data-hub="' + parent + '"]');
    if (hub) hub.classList.add('active');
    else {
      var plink = nav.querySelector('.nav-item > a[href$="' + parent + '"]');
      if (plink) plink.classList.add('active');
    }
  }
}());

/* ---- Mobile hamburger drawer: clones the desktop nav into a slide-in panel ---- */
(function () {
  var nav = document.querySelector('.site-nav');
  var header = document.querySelector('.header-inner');
  if (!nav || !header) return;
  /* Clear any stale drawer from bfcache or double-execution. */
  var stale = document.querySelectorAll('.nav-drawer, .drawer-scrim, .nav-burger');
  Array.prototype.forEach.call(stale, function (el) { el.parentNode.removeChild(el); });
  var burger = document.createElement('button');
  burger.type = 'button'; burger.className = 'nav-burger';
  burger.setAttribute('aria-label', 'Open menu'); burger.setAttribute('aria-expanded', 'false');
  burger.textContent = '\u2630';
  header.appendChild(burger);
  var scrim = document.createElement('div');
  scrim.className = 'drawer-scrim'; scrim.setAttribute('aria-hidden', 'true');
  var drawer = document.createElement('nav');
  drawer.className = 'nav-drawer'; drawer.setAttribute('aria-label', 'Mobile');
  var head = document.createElement('div'); head.className = 'd-head';
  var close = document.createElement('button');
  close.type = 'button'; close.className = 'd-close';
  close.setAttribute('aria-label', 'Close menu'); close.textContent = '\u2715';
  head.appendChild(close); drawer.appendChild(head);
  function linkEl(text, href, cls) {
    var a = document.createElement('a');
    a.className = cls; a.setAttribute('href', href); a.textContent = text;
    return a;
  }
  /* Drawer mirrors the desktop nav: each .nav-item becomes a collapsible
     group; drophead labels are kept as section headers. Home/Portfolio
     stay plain links. */
  function dropRows(drop, wrap) {
    var hasOn = false;
    /* Walk dropheads and links in document order via a single selector —
       avoids :scope/children quirks entirely. */
    var nodes = drop.querySelectorAll('.nav-drophead, a');
    Array.prototype.forEach.call(nodes, function (el) {
      if (el.classList.contains('nav-drophead')) {
        var hd = document.createElement('span');
        hd.className = 'd-drophead'; hd.textContent = el.textContent;
        wrap.appendChild(hd);
      } else {
        var href = el.getAttribute('href');
        if (!href) return;
        if (el.classList.contains('active')) hasOn = true;
        wrap.appendChild(linkEl(el.textContent, href,
          'd-sub' + (el.classList.contains('active') ? ' on' : '')));
      }
      /* .nav-div hairlines are skipped in the drawer */
    });
    return hasOn;
  }
  Array.prototype.forEach.call(nav.children, function (node) {
    var isItem = !!(node.classList && node.classList.contains('nav-item'));
    /* Find the top link/hub and dropdown among direct children without :scope. */
    var top = null, drop = null;
    if (isItem) {
      var kids = node.children;
      for (var ci = 0; ci < kids.length; ci++) {
        var kk = kids[ci];
        if (!top && (kk.tagName === 'A' ||
            (kk.tagName === 'BUTTON' && kk.classList.contains('nav-hub')))) top = kk;
        if (!drop && kk.classList.contains('nav-dropdown')) drop = kk;
      }
    } else if (node.tagName === 'A') { top = node; }
    if (!top) return;
    var topOn = top.classList.contains('active');
    if (!drop) {
      drawer.appendChild(linkEl(top.textContent, top.getAttribute('href'),
        'd-sec' + (topOn ? ' on' : '')));
      return;
    }
    var label = top.textContent.trim();
    var group = document.createElement('div');
    group.className = 'd-group';
    var hb = document.createElement('button');
    hb.type = 'button'; hb.className = 'd-hub' + (topOn ? ' on' : '');
    hb.setAttribute('aria-expanded', 'false');
    hb.setAttribute('aria-label', 'Show ' + label + ' pages');
    var hbl = document.createElement('span'); hbl.textContent = label;
    hb.appendChild(hbl); group.appendChild(hb);
    var wrap = document.createElement('div');
    wrap.className = 'd-subs'; group.appendChild(wrap);
    var populated = false;
    function ensureSubs() {
      if (populated) return;
      populated = true;
      dropRows(drop, wrap);
    }
    ensureSubs();
    /* Auto-open if this section (or one of its subpages) is active. */
    var hasOn = topOn;
    if (!hasOn) {
      var subLinks = drop.querySelectorAll('a');
      for (var si = 0; si < subLinks.length; si++) {
        if (subLinks[si].classList.contains('active')) { hasOn = true; break; }
      }
    }
    hb.addEventListener('click', function () {
      ensureSubs();
      var isOpen = group.classList.toggle('open');
      /* iOS Safari sometimes skips repainting the toggled subtree; force it. */
      void wrap.offsetHeight;
      hb.setAttribute('aria-expanded', isOpen ? 'true' : 'false');
      if (isOpen) {
        Array.prototype.forEach.call(drawer.querySelectorAll('.d-group.open'), function (og) {
          if (og !== group) {
            og.classList.remove('open');
            var ob = og.querySelector('.d-hub');
            if (ob) ob.setAttribute('aria-expanded', 'false');
          }
        });
      }
    });
    if (hasOn) { group.classList.add('open'); hb.setAttribute('aria-expanded', 'true'); }
    drawer.appendChild(group);
  });
  document.body.appendChild(scrim);
  document.body.appendChild(drawer);
  function open() {
    document.body.classList.add('drawer-open');
    burger.setAttribute('aria-expanded', 'true');
    burger.textContent = '\u2715';
  }
  function shut() {
    document.body.classList.remove('drawer-open');
    burger.setAttribute('aria-expanded', 'false');
    burger.textContent = '\u2630';
  }
  burger.addEventListener('click', function () {
    if (document.body.classList.contains('drawer-open')) shut(); else open();
  });
  close.addEventListener('click', shut);
  scrim.addEventListener('click', shut);
  drawer.addEventListener('click', function (e) { if (e.target.closest('a')) shut(); });
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape') shut(); });
}());

/* ---- Screener: "back to all stocks" when arriving via a theme link ---- */
(function () {
  var list = document.getElementById('screenList');
  if (!list) return;
  var q;
  try { q = new URLSearchParams(window.location.search); } catch (e) { return; }
  var hasFilter = q.get('preset') || q.get('sector') || q.get('mover') ||
    q.get('minP') || q.get('maxP') || q.get('minC') || q.get('maxC');
  if (!hasFilter) return;
  if (document.getElementById('backToStocks')) return;
  var a = document.createElement('a');
  a.id = 'backToStocks';
  a.href = 'stocks';
  a.className = 'back-link';
  a.innerHTML = '&larr; All listed stocks';
  list.parentNode.insertBefore(a, list);
}());

/* ---- Ticker sub-nav scroll-spy (stock pages; no-op elsewhere) ---- */
(function () {
  var tnav = document.querySelector('.ticker-nav');
  if (!tnav) return;
  var links = Array.prototype.slice.call(tnav.querySelectorAll('a'));
  var secs = [];
  links.forEach(function (a) {
    var s = document.querySelector(a.getAttribute('href'));
    if (s) secs.push({ link: a, el: s });
  });
  if (!secs.length) return;
  function spy() {
    var y = window.scrollY + 140;
    var cur = secs[0];
    for (var i = 0; i < secs.length; i++) {
      if (secs[i].el.getBoundingClientRect().top + window.scrollY <= y) cur = secs[i];
    }
    links.forEach(function (a) { a.classList.toggle('active', a === cur.link); });
  }
  window.addEventListener('scroll', spy, { passive: true });
  spy();
}());

/* ---- Inline jargon definitions (brief 4): dotted-underline terms with
   hover/tap tooltips, auto-wrapped on key-stat labels + history headers. ---- */
(function () {
  var GLOSSARY = {
    "previous close": "The last traded price when the previous session ended.",
    "open": "The first price traded when the session started.",
    "day high": "The highest price any shares traded at today.",
    "day low": "The lowest price any shares traded at today.",
    "high": "The highest price traded in that session.",
    "low": "The lowest price traded in that session.",
    "close": "The last price traded before the session ended.",
    "change": "How far the price moved versus the previous close.",
    "volume": "How many shares changed hands.",
    "avg volume": "The typical number of shares traded per day.",
    "value traded": "The total naira exchanged, volume times price.",
    "market cap": "What the whole company is worth on the market: price times all shares.",
    "shares outstanding": "Every share the company has issued.",
    "7-day change": "How far the price has moved in the last 7 days.",
    "high \u00b7 tracked": "The highest close since we started tracking this stock.",
    "low \u00b7 tracked": "The lowest close since we started tracking this stock.",
    "sector": "The industry group the company belongs to."
  };
  function defFor(term) {
    var t = String(term || "").toLowerCase().replace(/\s+/g, " ").trim();
    return GLOSSARY[t] || null;
  }
  var targets = document.querySelectorAll(".kstat .k, .hist-table th");
  for (var i = 0; i < targets.length; i++) {
    (function (el) {
      var d = el.hasAttribute("data-term") ? defFor(el.getAttribute("data-term")) : defFor(el.textContent);
      if (!d || el.querySelector(".jargon")) return;
      var s = document.createElement("span");
      s.className = "jargon";
      s.setAttribute("tabindex", "0");
      s.setAttribute("data-def", d);
      s.textContent = el.textContent;
      el.textContent = "";
      el.appendChild(s);
    })(targets[i]);
  }
}());

/* ---- Command palette: Ctrl+K search (brief 5) ---- */
(function () {
  var PAGES = [
    ["All listed stocks", "stocks"], ["Stock screener", "screener"],
    ["Compare stocks", "compare"], ["Highs & lows", "highs-lows"],
    ["ETFs", "etfs"], ["My watchlist", "watchlist"],
    ["FX converter", "fx"], ["US dollar", "fx-usd"], ["Euro", "fx-eur"],
    ["British pound", "fx-gbp"], ["Fixed Income", "fixed-income"],
    ["Economy", "economy"], ["Brokers", "brokers"],
    ["Public offers", "offers"], ["IPO performance tracker", "ipo-tracker"],
    ["Market calendar", "calendar"], ["Dividends", "dividends"],
    ["Corporate actions", "corporate-actions"], ["Earnings", "earnings"],
    ["Latest headlines", "news-headlines"], ["Newsroom", "news-newsroom"],
    ["Market notes", "news-notes"], ["Insider dealings", "insider-dealings"],
    ["All guides", "learn"], ["Weekly recap", "market-recap"],
    ["Portfolio tracker", "portfolio"],
    ["What is the NGX?", "learn-what-is-ngx"],
    ["How shares work", "learn-how-shares-work"],
    ["Buy your first stock", "learn-buy-first-stock"],
    ["Stockbrokers & CSCS", "learn-stockbroker-cscs"],
    ["Beginner mistakes", "learn-beginner-mistakes"]
  ];
  var POPULAR = [["Stock screener", "screener"], ["Highs & lows", "highs-lows"],
    ["Compare stocks", "compare"], ["Brokers", "brokers"],
    ["Buy your first stock", "learn-buy-first-stock"]];
  var prefix = window.location.pathname.indexOf("/stocks/") !== -1 ? "../" : "";
  var isMac = /Mac|iPhone|iPad/.test(navigator.platform || "");
  var header = document.querySelector(".header-inner");
  if (!header) return;

  var trigger = document.createElement("button");
  trigger.type = "button";
  trigger.className = "search-trigger";
  trigger.setAttribute("aria-label", "Search Nairaview (Ctrl+K)");
  trigger.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><circle cx="11" cy="11" r="7"/><path d="M21 21l-4.3-4.3"/></svg>' +
    '<span class="st-text">Search</span><kbd class="st-kbd">' + (isMac ? "&#8984;K" : "Ctrl K") + "</kbd>";
  var themeBtn = header.querySelector(".theme-toggle");
  if (themeBtn) header.insertBefore(trigger, themeBtn);
  else header.appendChild(trigger);

  var overlay = document.createElement("div");
  overlay.className = "palette-overlay";
  overlay.hidden = true;
  overlay.innerHTML = '<div class="palette" role="dialog" aria-modal="true" aria-label="Search Nairaview">' +
    '<input class="palette-input" type="text" placeholder="Search stocks, pages, guides..." aria-label="Search Nairaview" autocomplete="off" spellcheck="false">' +
    '<div class="palette-results" role="listbox" aria-label="Search results"></div>' +
    '<div class="palette-hint"><span>&#8593;&#8595; navigate</span><span>Enter open</span><span>Esc close</span></div></div>';
  document.body.appendChild(overlay);
  var input = overlay.querySelector(".palette-input");
  var results = overlay.querySelector(".palette-results");
  var items = [], active = -1, opener = null;

  function esc(s) {
    return String(s).replace(/[&<>"]/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c];
    });
  }
  function toRes(label, sub, url, kind, sym) {
    return { label: label, sub: sub, url: url, kind: kind, sym: sym || "" };
  }
  function search(q) {
    q = q.toLowerCase().trim();
    var out = [], i;
    if (!q) {
      for (i = 0; i < POPULAR.length; i++)
        out.push(toRes(POPULAR[i][0], "Popular", prefix + POPULAR[i][1], "Page"));
      return out;
    }
    var dir = window.directory || [];
    for (i = 0; i < dir.length; i++) {
      var sym = dir[i].s, name = dir[i].c || "";
      var sl = sym.toLowerCase(), nl = name.toLowerCase(), score = 0;
      if (sl === q) score = 100;
      else if (sl.indexOf(q) === 0) score = 80;
      else if (nl.indexOf(q) === 0) score = 70;
      else if (sl.indexOf(q) !== -1) score = 60;
      else if (nl.indexOf(q) !== -1) score = 50;
      if (score) out.push({ r: toRes(sym, name, prefix + "stocks/" + sym, "Stock", sym), score: score });
    }
    for (i = 0; i < PAGES.length; i++) {
      if (PAGES[i][0].toLowerCase().indexOf(q) !== -1)
        out.push({ r: toRes(PAGES[i][0], "Page", prefix + PAGES[i][1], "Page"), score: 40 });
    }
    out.sort(function (a, b) { return b.score - a.score; });
    return out.slice(0, 8).map(function (x) { return x.r; });
  }
  function render(list) {
    results.innerHTML = "";
    items = [];
    setActive(-1);
    if (!list.length) {
      results.innerHTML = '<div class="palette-empty">No matches. Try a ticker like DANGCEM or GTCO.</div>';
      return;
    }
    list.forEach(function (r, idx) {
      var el = document.createElement("div");
      el.className = "palette-item";
      el.setAttribute("role", "option");
      el.innerHTML = (r.sym ? '<span class="pi-sym">' + esc(r.sym) + "</span>" : "") +
        '<span class="pi-main"><span class="pi-label">' + esc(r.label) + "</span>" +
        '<span class="pi-sub">' + esc(r.sub) + "</span></span>" +
        '<span class="pi-kind">' + esc(r.kind) + "</span>";
      el.addEventListener("click", function () { window.location.href = r.url; });
      el.addEventListener("mousemove", function () { setActive(idx); });
      results.appendChild(el);
      items.push({ el: el, url: r.url });
    });
    setActive(0);
  }
  function setActive(i) {
    if (active >= 0 && items[active]) items[active].el.classList.remove("active");
    active = i;
    if (active >= 0 && items[active]) {
      items[active].el.classList.add("active");
      items[active].el.setAttribute("aria-selected", "true");
    }
  }
  function open(op) {
    opener = op || null;
    overlay.hidden = false;
    overlay.classList.add('palette-open');
    document.body.style.overflow = "hidden";
    input.value = "";
    render(search(""));
    input.focus();
  }
  function close() {
    overlay.hidden = true;
    overlay.classList.remove('palette-open');
    document.body.style.overflow = "";
    if (opener) opener.focus();
  }
  window.NV = window.NV || {};
  window.NV.openPalette = open;
  trigger.addEventListener("click", function () { open(trigger); });
  overlay.addEventListener("click", function (e) { if (e.target === overlay) close(); });
  input.addEventListener("input", function () { render(search(input.value)); });
  input.addEventListener("keydown", function (e) {
    if (e.key === "ArrowDown") { e.preventDefault(); if (items.length) setActive((active + 1) % items.length); }
    else if (e.key === "ArrowUp") { e.preventDefault(); if (items.length) setActive((active - 1 + items.length) % items.length); }
    else if (e.key === "Enter") { if (active >= 0 && items[active]) window.location.href = items[active].url; }
    else if (e.key === "Escape") { close(); }
  });
  document.addEventListener("keydown", function (e) {
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
      e.preventDefault();
      if (overlay.hidden) open(null); else close();
    } else if (e.key === "Escape" && !overlay.hidden) { close(); }
  });
}());

/* ---- Trust signals (brief 7): methodology link + source attribution ---- */
(function () {
  var prefix = window.location.pathname.indexOf("/stocks/") !== -1 ? "../" : "";
  /* Footer: "Data & methodology" link in the Nairaview column. */
  try {
    var cols = document.querySelectorAll(".footer-col");
    for (var i = 0; i < cols.length; i++) {
      var h = cols[i].querySelector("h4");
      if (h && /nairaview/i.test(h.textContent) && !cols[i].querySelector('[data-trust="methodology"]')) {
        var a = document.createElement("a");
        a.href = prefix + "methodology";
        a.textContent = "Data & methodology";
        a.setAttribute("data-trust", "methodology");
        cols[i].appendChild(a);
        break;
      }
    }
  } catch (e) {}
  /* Source attribution under the data timestamp. */
  try {
    var target = document.querySelector(".quote-hero p.asof") || document.querySelector("#heroNote");
    if (target && !target.parentNode.querySelector(".src-attr")) {
      var s = document.createElement("p");
      s.className = "src-attr";
      s.innerHTML = 'Source: Nigerian Exchange (NGX) &middot; <a href="' + prefix + 'methodology">How we handle data</a>';
      target.parentNode.insertBefore(s, target.nextSibling);
    }
  } catch (e2) {}
}());

/* ---- Mobile table cards (brief 8): label history cells for card layout ---- */
(function () {
  var tables = document.querySelectorAll(".hist-table");
  for (var t = 0; t < tables.length; t++) {
    var headers = [];
    var ths = tables[t].querySelectorAll("thead th");
    for (var h = 0; h < ths.length; h++) headers.push(ths[h].textContent.trim());
    var rows = tables[t].querySelectorAll("tbody tr");
    for (var r = 0; r < rows.length; r++) {
      var cells = rows[r].children;
      for (var c = 0; c < cells.length && c < headers.length; c++) {
        if (headers[c]) cells[c].setAttribute("data-th", headers[c]);
      }
    }
  }
}());

/* ---- IPO live banner (brief 9): dismissible, auto-expires after close ---- */
(function () {
  try {
    if (!document.querySelector("section.hero")) return; /* homepage only */
    var closeDate = new Date("2026-10-27T16:00:00+01:00");
    if (new Date() > closeDate) return; /* offer closed */
    if (localStorage.getItem("nv-ipo-banner-dismissed")) return;
    var hero = document.querySelector("section.hero");
    var b = document.createElement("div");
    b.className = "ipo-banner";
    b.setAttribute("role", "announcement");
    b.innerHTML = '<a href="dangote-refinery-ipo-guide"><span class="ipo-dot"></span><span>The Dangote Refinery IPO is open &middot; Subscribe from &#8358;5,250 &middot; Closes 27 Oct</span><span class="ipo-cta">See how</span></a><button type="button" class="ipo-x" aria-label="Dismiss">&times;</button>';
    hero.parentNode.insertBefore(b, hero);
    b.querySelector(".ipo-x").addEventListener("click", function () {
      try { localStorage.setItem("nv-ipo-banner-dismissed", "1"); } catch (e) {}
      b.remove();
    });
  } catch (e) {}
}());

/* ---- Ticker tape (brief 10): homepage market strip under header ---- */
(function () {
  try {
    if (document.getElementById("tape")) return;
    var t = document.createElement("div");
    t.className = "tape";
    t.id = "tape";
    t.setAttribute("aria-label", "Market snapshot");
    t.innerHTML = '<button type="button" class="tape-nav tape-prev" aria-label="Scroll tape left">&lsaquo;</button>' +
      '<div class="tape-view"><div class="tape-track" id="tapeTrack"></div></div>' +
      '<button type="button" class="tape-nav tape-next" aria-label="Scroll tape right">&rsaquo;</button>';
    var slot = document.querySelector(".live-ticker");
    if (slot) {
      /* hub pages: own tape replaces the old third-party ticker slot */
      slot.textContent = "";
      slot.appendChild(t);
    } else {
      if (!document.querySelector("section.hero")) return; /* homepage only */
      var header = document.querySelector("header.site-header");
      if (!header) return;
      header.parentNode.insertBefore(t, header.nextSibling);
    }
    var view = t.querySelector(".tape-view");
    t.querySelector(".tape-prev").addEventListener("click", function () { view.scrollBy({ left: -240, behavior: "smooth" }); });
    t.querySelector(".tape-next").addEventListener("click", function () { view.scrollBy({ left: 240, behavior: "smooth" }); });
    /* pause auto-scroll while the user interacts */
    ["mouseenter", "focusin", "touchstart"].forEach(function (ev) {
      t.addEventListener(ev, function () { t.classList.add("tape-paused"); }, { passive: true });
    });
    ["mouseleave", "focusout", "touchend"].forEach(function (ev) {
      t.addEventListener(ev, function () { t.classList.remove("tape-paused"); }, { passive: true });
    });
  } catch (e) {}
}());

/* ---- Market breadth panel (brief 12): adv/dec/unchanged under ASI chart ---- */
(function () {
  try {
    var card = document.querySelector("#performance .chart-card");
    if (!card || document.getElementById("breadth")) return;
    var b = document.createElement("div");
    b.className = "breadth";
    b.id = "breadth";
    b.setAttribute("aria-label", "Market breadth");
    b.innerHTML = '<div class="breadth-bar" aria-hidden="true"><span class="breadth-adv" id="breadthAdvBar"></span><span class="breadth-dec" id="breadthDecBar"></span></div>' +
      '<div class="breadth-stats">' +
      '<span class="breadth-stat"><span class="breadth-num up" id="breadthAdv">·</span><span class="breadth-lab">Advancers</span></span>' +
      '<span class="breadth-stat"><span class="breadth-num down" id="breadthDec">·</span><span class="breadth-lab">Decliners</span></span>' +
      '<span class="breadth-stat"><span class="breadth-num" id="breadthUnc">·</span><span class="breadth-lab">Unchanged</span></span>' +
      '</div>';
    card.parentNode.insertBefore(b, card.nextSibling);
  } catch (e) {}
}());

/* ---- News ticker chips (brief 13): symbol + day move on news cards ---- */
(function () {
  try {
    var dir = window.directory || [];
    if (!dir.length) return;
    var bySym = {};
    dir.forEach(function (e) { bySym[e.s] = e; });
    var prefix = window.location.pathname.indexOf("/stocks/") !== -1 ? "../" : "";
    document.querySelectorAll(".news-card[data-tickers], .news-feature[data-tickers]").forEach(function (card) {
      if (card.querySelector(".ticker-chips")) return;
      var syms = (card.getAttribute("data-tickers") || "").split(",").map(function (s) { return s.trim(); }).filter(Boolean);
      if (!syms.length) return;
      var wrap = document.createElement("div");
      wrap.className = "ticker-chips";
      wrap.setAttribute("aria-label", "Mentioned stocks");
      syms.slice(0, 4).forEach(function (sym) {
        var e = bySym[sym];
        if (!e) return;
        var b = document.createElement("button");
        b.type = "button";
        b.className = "ticker-chip" + (e.d ? " " + e.d : "");
        var move = (e.d === "up" || e.d === "down") ? " " + e.m : "";
        b.innerHTML = '<span class="tc-sym">' + sym + '</span><span class="tc-move">' + move + '</span>';
        b.setAttribute("aria-label", sym + (move ? ", " + move.trim() : "") + ", view stock page");
        b.addEventListener("click", function (ev) {
          ev.stopPropagation();
          ev.preventDefault();
          window.location.href = prefix + "stocks/" + sym + ".html";
        });
        wrap.appendChild(b);
      });
      if (wrap.children.length) card.appendChild(wrap);
    });
  } catch (e) {}
}());

/* ---- Confused-user links (brief 14): link guides from stock FAQs ---- */
(function () {
  try {
    var faq = document.getElementById("faq");
    if (!faq || document.querySelector(".faq-confused")) return;
    var prefix = window.location.pathname.indexOf("/stocks/") !== -1 ? "../" : "";
    var p = document.createElement("p");
    p.className = "faq-confused";
    p.innerHTML = 'Confused? <a href="' + prefix + 'learn-why-did-my-stock-fall">Why did my stock fall?</a> · <a href="' + prefix + 'learn-what-is-ex-div">What is ex-div?</a> · <a href="' + prefix + 'learn-why-is-my-order-pending">Why is my order pending?</a>';
    /* insert after the last faq-item */
    var items = faq.parentNode.querySelectorAll(".faq-item");
    var last = items.length ? items[items.length - 1] : faq;
    last.parentNode.insertBefore(p, last.nextSibling);
  } catch (e) {}
}());

/* ---- Share utilities (brief 15): copy link + share on X ---- */
(function () {
  try {
    var hero = document.querySelector(".quote-hero");
    if (!hero || hero.querySelector(".share-row")) return;
    var sym = (window.location.pathname.match(/\/stocks\/([A-Z0-9]+?)(?:\.html)?\/?$/) || [])[1] || "";
    if (!sym) return;
    var priceEl = hero.querySelector(".quote-price");
    var chgEl = hero.querySelector(".quote-chg");
    var price = priceEl ? priceEl.textContent.trim() : "";
    var chg = chgEl ? chgEl.textContent.trim() : "";
    var row = document.createElement("div");
    row.className = "share-row";
    var copyBtn = document.createElement("button");
    copyBtn.type = "button";
    copyBtn.className = "share-btn";
    copyBtn.innerHTML = '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/></svg><span>Copy link</span>';
    copyBtn.addEventListener("click", function () {
      function done(ok) {
        copyBtn.querySelector("span").textContent = ok ? "Copied!" : "Copy failed";
        setTimeout(function () { copyBtn.querySelector("span").textContent = "Copy link"; }, 1800);
      }
      var url = window.location.href;
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(url).then(function () { done(true); }, function () { done(false); });
      } else {
        var ta = document.createElement("textarea");
        ta.value = url; ta.style.position = "fixed"; ta.style.opacity = "0";
        document.body.appendChild(ta); ta.select();
        try { done(document.execCommand("copy")); } catch (e) { done(false); }
        document.body.removeChild(ta);
      }
    });
    var xLink = document.createElement("a");
    xLink.className = "share-btn";
    xLink.target = "_blank";
    xLink.rel = "noopener";
    var text = sym + " " + price + (chg ? " (" + chg + ")" : "") + " via @naira_view";
    xLink.href = "https://x.com/intent/post?text=" + encodeURIComponent(text) + "&url=" + encodeURIComponent(window.location.href);
    xLink.setAttribute("aria-label", "Share " + sym + " on X");
    xLink.innerHTML = '<svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/></svg><span>Share on X</span>';
    row.appendChild(copyBtn);
    row.appendChild(xLink);
    /* place after the source attribution (brief 7) or the asof line */
    var anchor = hero.querySelector(".src-attr") || hero.querySelector("p.asof");
    if (anchor) anchor.parentNode.insertBefore(row, anchor.nextSibling);
    else hero.appendChild(row);
  } catch (e) {}
}());

/* ---- FX rate alerts (brief 16): alert signup on currency pages ---- */
(function () {
  try {
    var section = document.querySelector('[data-island="fx-ccy"]');
    if (!section || document.querySelector(".fx-alert-box")) return;
    var ccy = section.getAttribute("data-ccy") || "USD";
    var pair = ccy + "/NGN";
    var grid = section.querySelector(".fx-grid");
    if (!grid) return;
    var API = "https://nairaview-api.meetomidiora.workers.dev";
    var box = document.createElement("div");
    box.className = "fx-alert-box";
    box.innerHTML = '<div class="kstats-title">Rate alerts &middot; ' + pair + '</div>' +
      '<p class="guide-p">Get an email when ' + pair + ' crosses your target. Uses the indicative parallel rate.</p>' +
      '<div class="alert-signin" hidden><a href="account">Sign in</a> to set rate alerts.</div>' +
      '<form class="alert-form" hidden>' +
      '<label>Target rate (₦)<input type="number" name="alerttarget" step="0.01" min="0" required></label>' +
      '<label>Direction<select name="alertdirection"><option value="above">At or above</option><option value="below">At or below</option></select></label>' +
      '<button type="submit" class="btn-gold">Set alert</button>' +
      '<p class="form-error" hidden></p></form>' +
      '<div class="alert-list"></div>';
    grid.parentNode.insertBefore(box, grid.nextSibling);
    var form = box.querySelector(".alert-form");
    var signin = box.querySelector(".alert-signin");
    var listEl = box.querySelector(".alert-list");
    var errEl = box.querySelector(".form-error");
    function showErr(msg) { errEl.textContent = msg || ""; errEl.hidden = !msg; }
    function money(n) { return "₦" + Number(n).toLocaleString("en-NG", { minimumFractionDigits: 2, maximumFractionDigits: 2 }); }
    function esc(s) { return String(s).replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; }); }
    function renderAlerts(alerts) {
      var mine = (alerts || []).filter(function (a) { return a && a.pair === pair; });
      if (!mine.length) { listEl.innerHTML = ""; return; }
      listEl.innerHTML = mine.map(function (a) {
        var label = a.active === false
          ? "Triggered at " + money(a.triggered_price) + " · now off"
          : (a.direction === "below" ? "At or below " : "At or above ") + money(a.target);
        return '<div class="alert-row"><span>' + esc(label) + '</span>' +
          '<button type="button" class="btn-ghost alert-del" data-id="' + esc(a.id) + '">Remove</button></div>';
      }).join("");
    }
    function readJson(res) { return res.json().then(function (j) { return { ok: res.ok, j: j }; }); }
    listEl.addEventListener("click", function (e) {
      var b = e.target && e.target.closest ? e.target.closest(".alert-del") : null;
      if (!b) return;
      showErr("");
      fetch(API + "/api/alerts?id=" + encodeURIComponent(b.getAttribute("data-id")),
        { method: "DELETE", credentials: "include" })
        .then(readJson)
        .then(function (r) { if (!r.ok) throw new Error((r.j && r.j.error) || "Could not remove."); load(); })
        .catch(function (e2) { showErr(e2.message); });
    });
    form.addEventListener("submit", function (e) {
      e.preventDefault();
      showErr("");
      var target = Number(form.querySelector("[name=alerttarget]").value);
      var direction = form.querySelector("[name=alertdirection]").value;
      fetch(API + "/api/alerts", {
        method: "POST", credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pair: pair, target: target, direction: direction })
      })
        .then(readJson)
        .then(function (r) { if (!r.ok) throw new Error((r.j && r.j.error) || "Could not save."); form.reset(); load(); })
        .catch(function (e2) { showErr(e2.message); });
    });
    function load() {
      fetch(API + "/api/alerts", { credentials: "include" })
        .then(function (r) { if (!r.ok) throw new Error("load"); return r.json(); })
        .then(function (j) { renderAlerts(j.alerts); })
        .catch(function () { renderAlerts([]); });
    }
    fetch(API + "/api/auth/me", { credentials: "include" })
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (me) {
        if (me && me.email) { form.hidden = false; load(); }
        else { signin.hidden = false; }
      })
      .catch(function () { signin.hidden = false; });
  } catch (e) {}
}());

/* ---- Learn path progress (brief 18): structured product ---- */
(function () {
  try {
    var PATH = ["learn-what-is-ngx", "learn-how-shares-work", "learn-stockbroker-cscs", "learn-buy-first-stock", "learn-beginner-mistakes"];
    var KEY = "nv-learn-progress";
    function getProgress() {
      try { return JSON.parse(localStorage.getItem(KEY) || "[]"); } catch (e) { return []; }
    }
    function setProgress(arr) {
      try { localStorage.setItem(KEY, JSON.stringify(arr)); } catch (e) {}
    }
    /* Learn hub: progress bar + step numbers */
    var steps = document.querySelector("#start-here .guide-steps");
    if (steps) {
      var done = getProgress();
      /* Mark completed steps via the CSS counter (add .done to li) */
      steps.querySelectorAll("li").forEach(function (li) {
        var a = li.querySelector("a");
        if (!a) return;
        var slug = a.getAttribute("href").replace(/^\.\//, "");
        if (done.indexOf(slug) !== -1) li.classList.add("step-done");
      });
      var pct = Math.round((done.filter(function (s) { return PATH.indexOf(s) !== -1; }).length / PATH.length) * 100);
      var bar = document.createElement("div");
      bar.className = "learn-progress";
      bar.innerHTML = '<div class="lp-bar"><div class="lp-fill" style="width:' + pct + '%"></div></div><div class="lp-label">' + pct + '% complete · ' + done.filter(function (s) { return PATH.indexOf(s) !== -1; }).length + ' of ' + PATH.length + ' lessons</div>';
      steps.parentNode.insertBefore(bar, steps);
    }
    /* Guide pages: mark-as-complete button */
    var kicker = document.querySelector("main .section .kicker");
    if (kicker && kicker.textContent.indexOf("LEARN") === 0) {
      var path = window.location.pathname;
      var slug = (path.match(/\/([^\/]+?)(?:\.html)?$/) || [])[1] || "";
      if (PATH.indexOf(slug) !== -1) {
        var main = document.querySelector("main .section");
        if (main && !document.querySelector(".complete-btn")) {
          var done = getProgress();
          var btn = document.createElement("button");
          btn.type = "button";
          btn.className = "complete-btn";
          btn.textContent = done.indexOf(slug) !== -1 ? "✓ Completed" : "Mark as complete";
          if (done.indexOf(slug) !== -1) btn.disabled = true;
          btn.addEventListener("click", function () {
            var d = getProgress();
            if (d.indexOf(slug) === -1) d.push(slug);
            setProgress(d);
            btn.textContent = "✓ Completed";
            btn.disabled = true;
            btn.classList.add('done-pop');
            setTimeout(function () { btn.classList.remove('done-pop'); }, 250);
            /* suggest next */
            var idx = PATH.indexOf(slug);
            if (idx < PATH.length - 1) {
              var next = document.createElement("p");
              next.className = "next-lesson";
              next.innerHTML = 'Next: <a href="' + PATH[idx + 1] + '">' + PATH[idx + 1].replace("learn-", "").replace(/-/g, " ") + '</a>';
              btn.parentNode.insertBefore(next, btn.nextSibling);
            }
          });
          main.appendChild(btn);
        }
      }
    }
  } catch (e) {}
}());

/* ---- Hide empty stats (audit fix): kstat with only · placeholder ---- */
(function () {
  try {
    document.querySelectorAll(".kstat .v").forEach(function (v) {
      if (v.textContent.trim() === "·" || v.textContent.trim() === "") {
        var kstat = v.closest(".kstat");
        if (kstat) kstat.style.display = "none";
      }
    });
  } catch (e) {}
}());

/* ---- Hero stats (audit fix): fill market cap, breadth, top gainer ---- */
(function () {
  try {
    var cap = document.getElementById("heroMktCap");
    var breadth = document.getElementById("heroBreadth");
    var gainer = document.getElementById("heroTopGainer");
    if (!cap && !breadth && !gainer) return;
    var API = "https://nairaview-api.meetomidiora.workers.dev";
    fetch(API + "/api/market").then(function (r) { return r.ok ? r.json() : null; }).then(function (d) {
      if (!d) return;
      if (cap && d.market_cap) cap.textContent = "₦" + (d.market_cap / 1e12).toFixed(2) + "tn";
      if (breadth && d.advancers !== undefined) breadth.textContent = d.advancers + "▲ " + d.decliners + "▼";
    }).catch(function () {});
    fetch(API + "/api/prices").then(function (r) { return r.ok ? r.json() : null; }).then(function (d) {
      if (!d || !gainer) return;
      var prices = d.prices || d;
      var top = null, topChg = -Infinity;
      Object.keys(prices).forEach(function (sym) {
        var p = prices[sym];
        var chg = p && (p.pct_change || p.change_pct);
        if (typeof chg === "number" && chg > topChg) { topChg = chg; top = sym; }
      });
      if (top) gainer.textContent = top + " +" + topChg.toFixed(2) + "%";
    }).catch(function () {});
  } catch (e) {}
}());

/* ---- Mobile bottom tab bar + search-first header (mobile redesign brief 1) ---- */
(function () {
  var S = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">';
  var IC = {
    home: S + '<path d="M3 9.5 12 3l9 6.5V20a1 1 0 0 1-1 1h-5v-6h-6v6H4a1 1 0 0 1-1-1z"/></svg>',
    stocks: S + '<path d="M3 17l6-6 4 4 8-8"/><path d="M15 7h6v6"/></svg>',
    screener: S + '<path d="M4 5h16l-6 7v5l-4 2v-7z"/></svg>',
    news: S + '<path d="M4 6h13v12H6a2 2 0 0 1-2-2z"/><path d="M17 8h2a1 1 0 0 1 1 1v9a2 2 0 0 1-2 2H4"/><path d="M7 10h7M7 14h5"/></svg>',
    learn: S + '<path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20V4H6.5A2.5 2.5 0 0 0 4 6.5z"/><path d="M4 19.5A2.5 2.5 0 0 0 6.5 22H20v-5"/></svg>',
    search: S + '<circle cx="11" cy="11" r="7"/><path d="M21 21l-4.3-4.3"/></svg>'
  };
  var prefix = window.location.pathname.indexOf("/stocks/") !== -1 ? "../" : "./";
  var TABS = [
    ["Home", prefix, "home", "home"],
    ["Stocks", prefix + "stocks", "stocks", "stocks"],
    ["Screener", prefix + "screener", "screener", "screener"],
    ["News", prefix + "news", "news", "news"],
    ["Learn", prefix + "learn", "learn", "learn"]
  ];
  var p = window.location.pathname.replace(/\/$/, "");
  var seg = p.split("/").pop();
  function isActive(key) {
    if (key === "home") return seg === "" || seg === "index" || seg === "index.html" || seg === "nairaviewV2";
    return new RegExp("(^|/)" + key + "([-/]|\\.|$)").test(p);
  }
  var bar = document.createElement("nav");
  bar.className = "mobile-tabbar";
  bar.setAttribute("aria-label", "Primary");
  TABS.forEach(function (t) {
    var a = document.createElement("a");
    a.href = t[1];
    a.innerHTML = IC[t[3]] + "<span>" + t[0] + "</span>";
    if (isActive(t[2])) { a.classList.add("active"); a.setAttribute("aria-current", "page"); }
    bar.appendChild(a);
  });
  document.body.appendChild(bar);

  /* Full-width search field under the header on mobile; opens the command palette */
  var header = document.querySelector(".site-header");
  if (header && window.NV && window.NV.openPalette) {
    var ms = document.createElement("button");
    ms.type = "button";
    ms.className = "mobile-search";
    ms.setAttribute("aria-label", "Search Nairaview");
    ms.innerHTML = IC.search + "<span>Search stocks, tickers, guides...</span>";
    ms.addEventListener("click", function () { window.NV.openPalette(ms); });
    var inner = header.querySelector(".header-inner");
    if (inner && inner.nextSibling) inner.parentNode.insertBefore(ms, inner.nextSibling);
    else if (inner) inner.parentNode.appendChild(ms);
    else header.appendChild(ms);
  }
}());

/* ---- Theme collection counts (mobile redesign brief 5) ---- */
(function () {
  var host = document.getElementById('themes');
  if (!host || !Array.isArray(window.directory)) return;
  host.querySelectorAll('[data-theme-count]').forEach(function (el) {
    var sector = el.getAttribute('data-theme-count');
    var n = window.directory.filter(function (r) { return r.g === sector; }).length;
    el.textContent = n + (n === 1 ? ' stock' : ' stocks');
  });
}());

/* ---- Trust strip above the footer (mobile redesign brief 6) ---- */
(function () {
  var prefix = window.location.pathname.indexOf("/stocks/") !== -1 ? "../" : "";
  var footer = document.querySelector(".site-footer");
  if (!footer) return;
  var prev = footer.previousElementSibling;
  if (prev && prev.classList.contains("trust-strip")) return;
  var strip = document.createElement("div");
  strip.className = "trust-strip";
  strip.innerHTML = "<span>Prices: Nigerian Exchange (NGX) <b>\u00B7</b> " +
    "Delayed ~30 min in session <b>\u00B7</b> No sign-up needed <b>\u00B7</b> " +
    '<a href="' + prefix + 'methodology">How we handle data</a></span>';
  footer.parentNode.insertBefore(strip, footer);
}());

/* ---- Sync --header-h to the real sticky header height ----
   The mobile search field (brief 1) changed the header height; a hardcoded
   value leaves a slit where scrolling content shows through under the header. */
(function () {
  var header = document.querySelector('.site-header');
  if (!header) return;
  function sync() {
    document.documentElement.style.setProperty('--header-h', header.offsetHeight + 'px');
  }
  sync();
  window.addEventListener('resize', sync);
  window.addEventListener('orientationchange', sync);
  window.addEventListener('load', sync);
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(sync);
  /* Re-sync after the mobile search field is injected (brief 1 runs at end of file too). */
  setTimeout(sync, 0);
  setTimeout(sync, 500);
}());

/* ---- ETF live prices: hub table + fund page heroes ---- */
(function () {
  try {
    var hub = document.getElementById("etfBody");
    var hero = document.querySelector(".quote-hero");
    var sym = null;
    if (!hub && hero && location.pathname.indexOf("/etfs/") !== -1) {
      var crumb = document.querySelector("nav.crumbs span:last-child");
      if (crumb) sym = crumb.textContent.trim();
    }
    if (!hub && !sym) return;
    function fmtP(n) { return "\u20A6" + Number(n).toLocaleString("en-NG", { minimumFractionDigits: 2, maximumFractionDigits: 2 }); }
    function fmtD(d) { var m = ["JAN","FEB","MAR","APR","MAY","JUN","JUL","AUG","SEP","OCT","NOV","DEC"]; return d.getDate() + " " + m[d.getMonth()] + " " + d.getFullYear(); }
    fetch("https://nairaview-api.meetomidiora.workers.dev/api/etfs").then(function (r) { return r.json(); }).then(function (doc) {
      var rows = doc.data || [];
      if (!rows.length) return;
      if (hub) {
        rows.forEach(function (f) {
          var tr = hub.querySelector('tr[data-etf="' + f.symbol + '"]');
          if (!tr) return;
          var pc = tr.querySelector(".etf-price"), cc = tr.querySelector(".etf-chg");
          if (pc && f.close != null) pc.textContent = fmtP(f.close);
          if (cc && f.change_percentage != null) {
            var c = Number(f.change_percentage);
            cc.textContent = (c >= 0 ? "+" : "") + c.toFixed(2) + "%";
            cc.classList.toggle("up", c >= 0);
            cc.classList.toggle("down", c < 0);
          }
        });
        if (doc.updated_at) {
          var el = document.getElementById("etfAsOf");
          if (el) el.textContent = "Closes as of " + fmtD(new Date(doc.updated_at)) + ". Click any fund for its full page.";
        }
      }
      if (sym && hero) {
        var f = null;
        rows.forEach(function (x) { if (x.symbol === sym) f = x; });
        if (!f || f.close == null) return;
        var qp = hero.querySelector(".quote-price");
        if (qp) qp.textContent = fmtP(f.close);
        var asof = hero.querySelector(".asof");
        if (asof && doc.updated_at) asof.innerHTML = "Close &middot; " + fmtD(new Date(doc.updated_at)) + " &middot; NGX ETF data.";
      }
    }).catch(function () { /* baked values stand */ });
  } catch (e) {}
}());
