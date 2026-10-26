#!/bin/sh
# Builds Shared/Allowlist.swift with its tests and runs them against WebKit.
set -e
cd "$(dirname "$0")/../.."
out="${TMPDIR:-/tmp}/rinse-allowlist-tests.bin"
swiftc -o "$out" Shared/Settings.swift Shared/Allowlist.swift tools/tests/allowlist/main.swift 2>&1 | grep -v "^$" || true
"$out"
