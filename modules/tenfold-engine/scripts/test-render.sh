#!/bin/sh
# End-to-end media pipeline check on the Mac (synthetic clip → analyze → export with captions).
set -e
cd "$(dirname "$0")/../ios"
OUT_DIR="${1:-${TMPDIR:-/tmp}}"
BIN="${TMPDIR:-/tmp}/tenfold-render-harness"
swiftc -O -parse-as-library -swift-version 5 -target arm64-apple-macosx15.0 -o "$BIN" Engine/Core/*.swift Engine/Media/*.swift Tests/RenderHarness.swift
"$BIN" "$OUT_DIR"
