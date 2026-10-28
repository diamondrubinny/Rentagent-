#!/usr/bin/env bash
# Builds the customer-facing release bundle: rentagent-<version>.tar.gz
# Usage: scripts/package-release.sh <version> [output-dir]
set -Eeuo pipefail

version=${1:?Usage: scripts/package-release.sh <version> [output-dir]}
out_dir=${2:-dist}
root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
name="rentagent-${version}"
staging="$(mktemp -d)"
trap 'rm -rf "$staging"' EXIT

mkdir -p "$staging/$name" "$out_dir"
cp "$root"/deploy/{install.sh,rentagent,docker-compose.yml,Caddyfile,REQUIREMENTS.md} "$staging/$name/"
cp "$root"/docs/{OPERATOR.md,PRODUCTION-CHECKLIST.md} "$staging/$name/"
printf '%s\n' "$version" > "$staging/$name/VERSION"
chmod 0755 "$staging/$name/install.sh" "$staging/$name/rentagent"

tar -C "$staging" -czf "$out_dir/$name.tar.gz" "$name"
(cd "$out_dir" && sha256sum "$name.tar.gz" > "$name.tar.gz.sha256")
echo "Created $out_dir/$name.tar.gz"
