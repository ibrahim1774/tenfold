#!/bin/sh
# Compiles the pure engine core with the test runner and runs it on the Mac (no Xcode project needed).
set -e
cd "$(dirname "$0")/../ios"
OUT="${TMPDIR:-/tmp}/tenfold-core-tests"
swiftc -O -parse-as-library -o "$OUT" Engine/Core/*.swift Tests/CoreTests.swift
"$OUT"
