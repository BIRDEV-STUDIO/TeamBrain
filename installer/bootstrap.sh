#!/usr/bin/env sh
set -eu
ROOT="${1:-.}"
node "$(dirname "$0")/../bin/teambrain.js" bootstrap --root "$ROOT" --project "${2:-teambrain}"
