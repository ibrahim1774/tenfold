#!/bin/sh
# Stress run of the real media pipeline on the Mac: every clip in <clipDir> through import → analyse → plan →
# export (watermark + captions + text overlay), each in its own process under a timeout with peak memory,
# then a long sequential batch in one process to watch memory growth.
# Make the clips first: scripts/stress-corpus.sh <clipDir> [--long]
# Usage: stress-render.sh <clipDir> <outDir> [batchJobs=60]
# Stops (kills the running job) if the startup disk drops under MIN_FREE_KB (default 2.1 GB).
set -u
HERE="$(cd "$(dirname "$0")" && pwd)"
CLIPS="${1:?usage: stress-render.sh <clipDir> <outDir> [batchJobs]}"
OUT="${2:?usage: stress-render.sh <clipDir> <outDir> [batchJobs]}"
JOBS="${3:-60}"
MIN_FREE_KB="${MIN_FREE_KB:-2202010}"
BIN="${TMPDIR:-/tmp}/tenfold-stress-harness"
mkdir -p "$OUT"
cd "$HERE/../ios"
swiftc -O -parse-as-library -swift-version 5 -target arm64-apple-macosx15.0 -o "$BIN" \
  Engine/Core/*.swift Engine/Media/*.swift Tests/RenderHarness.swift Tests/StressHarness.swift || exit 1

free_kb() { df -k / | awk 'NR==2 {print $4}'; }

# run <timeoutSecs> <logFile> args... : harness under a timeout and /usr/bin/time -l, with a disk watchdog.
run() {
  secs=$1 log=$2; shift 2
  perl -e 'alarm shift; exec @ARGV' "$secs" /usr/bin/time -l "$BIN" "$@" > "$log" 2>&1 &
  pid=$!
  while kill -0 $pid 2>/dev/null; do
    if [ "$(free_kb)" -lt "$MIN_FREE_KB" ]; then
      echo "DISK LOW ($(free_kb) KB free): killing job" | tee -a "$log"
      pkill -P $pid 2>/dev/null; kill $pid 2>/dev/null
      touch "$OUT/DISK_LOW"
    fi
    sleep 1
  done
  wait $pid
  return $?
}

echo "free before: $(free_kb) KB"
printf "%-30s %-6s %-5s %8s %8s  %s\n" clip result code wall_s peak_MB detail
for f in "$CLIPS"/*; do
  [ -f "$f" ] || continue
  case "$f" in *.wav) continue ;; esac
  [ -e "$OUT/DISK_LOW" ] && { echo "stopped: disk low"; break; }
  name=$(basename "$f")
  # Timeout: 60 s + 1 s per second of media (probe may fail; then 60 s).
  dur=$(ffprobe -v error -show_entries format=duration -of csv=p=0 "$f" 2>/dev/null | cut -d. -f1)
  t=$((60 + ${dur:-0}))
  extra=""
  case "$name" in uhd_*) extra="--uhd" ;; esac
  run $t "$OUT/$name.log" --stress one "$f" "$OUT" $extra
  code=$?
  case $code in
    0) res=PASS ;; 1) res=FAIL ;; 142) res=HANG ;; 133|134|139|138|132) res=CRASH ;; *) res="EXIT" ;;
  esac
  wall=$(awk '/real/ {print $1; exit}' "$OUT/$name.log")
  peak=$(awk '/peak memory footprint/ {printf "%.0f", $1/1048576}' "$OUT/$name.log")
  detail=$(grep '^RESULT' "$OUT/$name.log" | sed 's/^RESULT [^|]*| //' | cut -c1-220)
  printf "%-30s %-6s %-5s %8s %8s  %s\n" "$name" "$res" "$code" "$wall" "$peak" "$detail"
  if [ "$name" = "hdr_hlg_10bit.mov" ]; then
    run $t "$OUT/$name.keephdr.log" --stress one "$f" "$OUT" --keep-hdr
    code=$?
    printf "%-30s %-6s %-5s %8s %8s  %s\n" "$name+keepHDR" "$([ $code = 0 ] && echo PASS || echo FAIL)" "$code" \
      "$(awk '/real/ {print $1; exit}' "$OUT/$name.keephdr.log")" "$(awk '/peak memory footprint/ {printf "%.0f", $1/1048576}' "$OUT/$name.keephdr.log")" \
      "$(grep '^RESULT' "$OUT/$name.keephdr.log" | sed 's/^RESULT [^|]*| //' | cut -c1-220)"
  fi
done
echo "free after singles: $(free_kb) KB"

[ -e "$OUT/DISK_LOW" ] && exit 3
[ "$JOBS" -gt 0 ] || exit 0
# Batches: the everyday clips round-robin, then one 1080p clip over and over (no 10-minute / 4K / broken files).
ls "$CLIPS"/*.mp4 "$CLIPS"/*.mov | grep -Ev 'long_|uhd_|zero_|random_|truncated_|audio_only' > "$OUT/batch.txt"
echo "$CLIPS/portrait_1080x1920_30.mp4" > "$OUT/same.txt"
for b in batch same; do
  run $((JOBS * 30)) "$OUT/$b.log" --stress batch "$OUT/$b.txt" "$OUT" "$JOBS"
  echo "$b exit $?: $(grep -c 'PASS' "$OUT/$b.log") pass, $(grep -c '| FAIL' "$OUT/$b.log") fail"
  grep -E '^(START|BATCH)' "$OUT/$b.log"
  awk '/peak memory footprint/ {printf "  peak footprint %.0f MB\n", $1/1048576}' "$OUT/$b.log"
done
echo "free after batches: $(free_kb) KB"
