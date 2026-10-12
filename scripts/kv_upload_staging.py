#!/usr/bin/env python3
"""Upload the built V2 site into the nairaview-v2-staging KV namespace.

Chunked bulk writes through the Cloudflare API using the stored
custom.cloudflare credential (surrogate helper; never handles the raw token).
Re-run any time; KV put is idempotent per key.
"""
import base64
import json
import os
import sys
import urllib.request
import urllib.error

sys.path.insert(0, "/opt/hatch/skills/skill-creator/bin")
from dynamic_credentials import add_surrogate_to_request, read_json_response

API = "https://api.cloudflare.com/client/v4"
ACCT = "78f7403e4711bd80041a4100bf94ca3b"
NS = "d30dba3962aa4af5a7ad00bc4cffe3b7"
REPO = os.path.expanduser("~/workspace/nairaviewV2")
CHUNK = 60

CT = {".html": "text/html; charset=utf-8", ".css": "text/css; charset=utf-8",
      ".js": "text/javascript; charset=utf-8", ".json": "application/json; charset=utf-8",
      ".svg": "image/svg+xml", ".png": "image/png", ".ico": "image/x-icon",
      ".xml": "application/xml; charset=utf-8", ".txt": "text/plain; charset=utf-8"}
BIN = {".png", ".ico"}


def collect():
    pairs = []
    for root, dirs, files in os.walk(REPO):
        dirs[:] = [d for d in dirs if d not in ("node_modules", ".git")]
        rel_root = os.path.relpath(root, REPO)
        if rel_root in ("scripts", "src") or rel_root.startswith(("scripts/", "src/")):
            dirs[:] = []
            continue
        for f in files:
            ext = os.path.splitext(f)[1].lower()
            if ext not in CT:
                continue
            p = os.path.join(root, f)
            if "robots.production.txt" in p:
                continue
            key = os.path.relpath(p, REPO)
            with open(p, "rb") as fh:
                raw = fh.read()
            if ext in BIN:
                pairs.append({"key": key, "value": base64.b64encode(raw).decode(),
                              "base64": True, "metadata": {"ct": CT[ext]}})
            else:
                pairs.append({"key": key, "value": raw.decode("utf-8"),
                              "metadata": {"ct": CT[ext]}})
    return pairs


def put_chunk(pairs):
    body = json.dumps(pairs).encode()
    req = urllib.request.Request(
        API + f"/accounts/{ACCT}/storage/kv/namespaces/{NS}/bulk",
        data=body, method="PUT", headers={"Content-Type": "application/json"})
    add_surrogate_to_request(req, "custom.cloudflare", allowed_hosts=["api.cloudflare.com"])
    try:
        resp = urllib.request.urlopen(req, timeout=120)
    except urllib.error.HTTPError as e:
        raise RuntimeError(f"bulk upload -> {e.code}: {e.read().decode()[:500]}")
    out = read_json_response(resp)
    if not out.get("success"):
        raise RuntimeError(f"bulk upload unsuccessful: {out.get('errors')}")


def main():
    pairs = collect()
    print(f"uploading {len(pairs)} files in chunks of {CHUNK}")
    for i in range(0, len(pairs), CHUNK):
        put_chunk(pairs[i:i + CHUNK])
        print(f"  {min(i + CHUNK, len(pairs))}/{len(pairs)}")
    print("done")


if __name__ == "__main__":
    main()
