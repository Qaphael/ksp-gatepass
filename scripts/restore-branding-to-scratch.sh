#!/usr/bin/env bash
set -Eeuo pipefail

ARCHIVE="${1:-}"
SCRATCH_DIR="${2:-}"
if [[ -z "$ARCHIVE" || -z "$SCRATCH_DIR" || ! -f "$ARCHIVE" ]]; then
  echo "Usage: $0 <branding.tar.gz> <new_scratch_directory>" >&2
  exit 2
fi
if [[ ! "$(basename "$SCRATCH_DIR")" =~ ^ksp_branding_restore_[a-z0-9_]+$ ]]; then
  echo "Scratch directory name must start with ksp_branding_restore_ and use lowercase letters, numbers or underscores." >&2
  exit 2
fi

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SCRATCH_DIR="$(realpath -m "$SCRATCH_DIR")"
case "$SCRATCH_DIR/" in
  "$ROOT_DIR/"*) echo "Scratch directory must be outside the application project directory." >&2; exit 2 ;;
esac
if [[ -e "$SCRATCH_DIR" ]]; then
  echo "Scratch directory must not already exist; no files were changed." >&2
  exit 2
fi

tar -tzf "$ARCHIVE" >/dev/null
while IFS= read -r entry; do
  if [[ "$entry" != "branding/" && ! "$entry" =~ ^branding/[A-Za-z0-9_-]{32}(-thumbnail|-display)?\.webp$ ]]; then
    echo "Branding archive contains an unexpected path: $entry" >&2
    exit 2
  fi
done < <(tar -tzf "$ARCHIVE")

mkdir -m 700 "$SCRATCH_DIR"
tar -xzf "$ARCHIVE" -C "$SCRATCH_DIR" --no-same-owner --no-same-permissions
if find "$SCRATCH_DIR/branding" -type l -print -quit | grep -q .; then
  echo "Branding restore contains a symbolic link; inspect the scratch directory before use." >&2
  exit 1
fi
echo "Branding archive extracted to scratch directory: $SCRATCH_DIR/branding"
echo "Inspect the files, then remove this scratch directory through a separate deliberate operator action."
