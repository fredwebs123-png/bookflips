#!/bin/sh
# Builds dist/kingdom-hearts-companion.epub from book/.
# The mimetype file must be first and uncompressed, per the EPUB spec.
set -e
cd "$(dirname "$0")"
mkdir -p dist
out="$PWD/dist/kingdom-hearts-companion.epub"
rm -f "$out"
cd book
zip -X0q "$out" mimetype
zip -Xr9Dq "$out" META-INF OEBPS
cd ..
echo "built $out ($(wc -c < "$out") bytes)"
