#!/usr/bin/env python3
"""Bump a cache-busted asset version across all V2 HTML files.

Usage: bump_versions.py <asset> <new_version>
  e.g. bump_versions.py islands.js 20261012a
       bump_versions.py styles.css 20261012a

Replaces every `assets/<asset>?v=<old>` with `assets/<asset>?v=<new_version>`
in *.html, stocks/*.html, etfs/*.html. Fails loudly if no file matched
(means the old version string is wrong or already bumped) and reports how
many files changed. Run from the repo root.
"""
import glob
import re
import sys

if len(sys.argv) != 3:
    sys.exit("usage: bump_versions.py <asset> <new_version>")

asset, new_v = sys.argv[1], sys.argv[2]
if not re.fullmatch(r"[A-Za-z0-9_.-]+\.(js|css)", asset):
    sys.exit("asset must look like site.js / styles.css / islands.js")
if not re.fullmatch(r"\d{8}[a-z]", new_v):
    sys.exit("new_version must look like 20261012a")

pat = re.compile(r"assets/" + re.escape(asset) + r"\?v=\d{8}[a-z]")
changed, files = 0, []
for f in glob.glob("*.html") + glob.glob("stocks/*.html") + glob.glob("etfs/*.html"):
    s = open(f).read()
    s2, n = pat.subn("assets/" + asset + "?v=" + new_v, s)
    if n:
        open(f, "w").write(s2)
        changed += n
        files.append(f)

if not files:
    sys.exit("no files matched — check the asset name and current version")

print(f"bumped assets/{asset} to ?v={new_v}: {changed} refs in {len(files)} files")
