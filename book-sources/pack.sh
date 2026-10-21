#!/bin/sh
# Packs each folder in book-sources/ into book-app/library/<name>.epub.
# The mimetype file must be first and uncompressed, per the EPUB spec.
set -e
cd "$(dirname "$0")"
mkdir -p ../book-app/library
for dir in */; do
  name=${dir%/}
  out="../book-app/library/$name.epub"
  rm -f "$out"
  (cd "$name" && zip -X0q "../$out" mimetype && zip -Xr9Dq "../$out" META-INF OEBPS)
  echo "packed $out"
done
