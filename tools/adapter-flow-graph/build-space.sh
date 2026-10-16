#!/usr/bin/env bash
#
# Build ./space/ — the exact tree that is uploaded as a static Hugging Face Space.
#
# A static Space is just a web root: README.md carries the Space card metadata
# (YAML frontmatter, sdk: static) and index.html is the entry point. Everything
# is referenced with relative paths and vendored, so the Space needs no network.
#
set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
OUT="$HERE/space"

# NOTE: no implicit deletion here on purpose. Pass --clean if you want the output
# directory emptied first (only needed if the file list shrinks).
if [ "${1:-}" = "--clean" ]; then
  rm -rf "$OUT"
fi
mkdir -p "$OUT/vendor"

install -m 644 "$HERE/index.html"     "$OUT/index.html"
install -m 644 "$HERE/app.js"         "$OUT/app.js"
install -m 644 "$HERE/graph-data.js"  "$OUT/graph-data.js"
install -m 644 "$HERE/style.css"      "$OUT/style.css"
install -m 644 "$HERE/vendor/cytoscape.min.js" "$OUT/vendor/cytoscape.min.js"
install -m 644 "$HERE/space-README.md" "$OUT/README.md"

# Sanity checks: the Space card must be valid and index.html must exist at the root.
head -n 1 "$OUT/README.md" | grep -qx -- '---' || { echo "ERROR: space README is missing YAML frontmatter" >&2; exit 1; }
grep -q '^sdk: static' "$OUT/README.md" || { echo "ERROR: space README must declare 'sdk: static'" >&2; exit 1; }
[ -f "$OUT/index.html" ] || { echo "ERROR: index.html missing" >&2; exit 1; }
if grep -qE '(src|href)="/' "$OUT/index.html"; then
  echo "ERROR: index.html has root-absolute paths (breaks under a Space subpath)" >&2
  exit 1
fi

echo "built $OUT"
find "$OUT" -type f -printf '%8s  %P\n' | sort -k2
