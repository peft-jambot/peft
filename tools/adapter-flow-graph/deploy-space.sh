#!/usr/bin/env bash
#
# Deploy ./space/ as a static Hugging Face Space.
#
# Requires a User Access Token that can CREATE repos and write to the target
# namespace (the checked-in HF_TOKEN / HF_JOBS_TOKEN in this profile are
# read-only / job-scoped and will not work — see README).
#
# Usage:
#     export HF_SPACE_TOKEN=hf_xxx            # token with repo create + write
#     export SPACE_ID=BenjaminB/peft-adapter-flow   # optional; defaults to <user>/peft-adapter-flow
#     ./deploy-space.sh                       # add --private to keep it private
#
set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
NAME="peft-adapter-flow"

TOKEN="${HF_SPACE_TOKEN:-${HF_TOKEN:-}}"
if [ -z "$TOKEN" ]; then
  echo "ERROR: set HF_SPACE_TOKEN (or HF_TOKEN) to a token with repo-create + write access." >&2
  exit 1
fi

export HF_TOKEN="$TOKEN"
PRIVACY_FLAG="--public"
for arg in "$@"; do
  case "$arg" in
    --private) PRIVACY_FLAG="--private" ;;
    --public)  PRIVACY_FLAG="--public" ;;
    *) echo "unknown argument: $arg" >&2; exit 2 ;;
  esac
done

if [ -z "${SPACE_ID:-}" ]; then
  USER="$(hf auth whoami --format json 2>/dev/null | python3 -c 'import json,sys; print(json.load(sys.stdin)["name"])')"
  SPACE_ID="$USER/$NAME"
fi

echo "==> building space/"
"$HERE/build-space.sh"

echo "==> creating $SPACE_ID (static, $PRIVACY_FLAG)"
hf repos create "$SPACE_ID" --repo-type space --space-sdk static --exist-ok "$PRIVACY_FLAG"

echo "==> uploading"
hf upload "$SPACE_ID" "$HERE/space" . --repo-type space

echo
echo "deployed: https://huggingface.co/spaces/$SPACE_ID"
echo "(first build takes a few seconds; a static Space has no build step to wait for)"
