#!/bin/sh
# Download the filter lists named in filters/sources.json and recompile every blocker.
# Then check the output with WebKit: swift tools/filters/validate.swift Extensions/Blockers/*/blockerList.json
set -e
cd "$(dirname "$0")/.."
mkdir -p filters/cache
python3 - <<'PY' | while read -r file url; do curl -fsSL -o "filters/cache/$file" "$url" && echo "downloaded $file"; done
import json
for f, meta in json.load(open("filters/sources.json"))["lists"].items():
    if "url" in meta: print(f, meta["url"])
PY
python3 tools/filters/compile.py
