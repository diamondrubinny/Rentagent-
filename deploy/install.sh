#!/usr/bin/env bash
# RentAgent installer.
# Run from the extracted release bundle:  sudo ./install.sh
# Non-interactive:  sudo ./install.sh --domain agents.example.com --email admin@example.com --locale he --yes
set -Eeuo pipefail

RENTAGENT_HOME="${RENTAGENT_HOME:-/opt/rentagent}"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
MIN_RAM_MB=7500        # 8 GB nominal
HARD_MIN_RAM_MB=3500
MIN_DISK_GB=40
SUPPORTED_LOCALES="he en ar ru"

DOMAIN=""
ACME_EMAIL=""
LOCALE="en"
TARGET_VERSION="$(cat "$SCRIPT_DIR/VERSION" 2>/dev/null || echo latest)"
ASSUME_YES=0
BUILD_FROM_SOURCE=0
SKIP_CHECKS=0
SKIP_PULL=0

c_red=$'\033[31m'; c_yel=$'\033[33m'; c_grn=$'\033[32m'; c_off=$'\033[0m'
info() { printf '%s\n' "$*"; }
ok()   { printf '%s✔%s %s\n' "$c_grn" "$c_off" "$*"; }
warn() { printf '%s!%s %s\n' "$c_yel" "$c_off" "$*" >&2; }
die()  { printf '%s✘ %s%s\n' "$c_red" "$*" "$c_off" >&2; exit 1; }
trap 'die "Installation failed at line $LINENO. Nothing was started if the error happened before \"Starting services\"."' ERR

usage() {
  cat <<USAGE
Usage: sudo ./install.sh [options]
  --domain <name>     Public domain name pointing to this server (required)
  --email <address>   Email for Let's Encrypt certificate notices (recommended)
  --locale <code>     Default UI language: ${SUPPORTED_LOCALES// /, } (default: en)
  --version <tag>     Image version to install (default: ${TARGET_VERSION})
  --build             Build images from source (run from a repository checkout)
  --skip-pull         Use images already loaded locally (air-gapped installs: docker load -i …)
  --skip-checks       Skip hardware checks (not recommended)
  --yes               Do not ask for confirmation
USAGE
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --domain) DOMAIN="${2:-}"; shift 2 ;;
    --email) ACME_EMAIL="${2:-}"; shift 2 ;;
    --locale) LOCALE="${2:-}"; shift 2 ;;
    --version) TARGET_VERSION="${2:-}"; shift 2 ;;
    --build) BUILD_FROM_SOURCE=1; shift ;;
    --skip-checks) SKIP_CHECKS=1; shift ;;
    --skip-pull) SKIP_PULL=1; shift ;;
    --yes|-y) ASSUME_YES=1; shift ;;
    -h|--help) usage; exit 0 ;;
    *) usage; die "Unknown option: $1" ;;
  esac
done

# ---------------------------------------------------------------- checks
[[ $EUID -eq 0 ]] || die "Please run as root (sudo ./install.sh)."
[[ -f "$SCRIPT_DIR/docker-compose.yml" && -f "$SCRIPT_DIR/Caddyfile" && -f "$SCRIPT_DIR/rentagent" ]] \
  || die "Run this script from the extracted RentAgent bundle (docker-compose.yml not found)."
[[ -e "$RENTAGENT_HOME/.env" ]] && die "RentAgent is already installed in $RENTAGENT_HOME. Use 'rentagent update' instead."

info "RentAgent installer (version ${TARGET_VERSION})"
info "------------------------------------------"

if [[ -r /etc/os-release ]]; then
  # Read in a subshell: os-release defines VERSION, which must not overwrite ours.
  # shellcheck disable=SC1091
  os_id=$(. /etc/os-release && printf '%s:%s' "${ID:-}" "${VERSION_ID:-}")
  # shellcheck disable=SC1091
  os_name=$(. /etc/os-release && printf '%s' "${PRETTY_NAME:-unknown}")
  case "$os_id" in
    ubuntu:22.04|ubuntu:24.04|debian:12|debian:13) ok "Operating system: ${os_name}" ;;
    *) warn "Operating system ${os_name} is not officially supported (Ubuntu 22.04/24.04, Debian 12/13)." ;;
  esac
fi

case "$(uname -m)" in
  x86_64|aarch64|arm64) ok "Architecture: $(uname -m)" ;;
  *) die "Unsupported CPU architecture: $(uname -m) (x86_64 or arm64 required)." ;;
esac

if [[ $SKIP_CHECKS -eq 0 ]]; then
  ram_mb=$(awk '/MemTotal/ {print int($2/1024)}' /proc/meminfo)
  (( ram_mb >= HARD_MIN_RAM_MB )) || die "At least 4 GB RAM is required (found ${ram_mb} MB)."
  if (( ram_mb < MIN_RAM_MB )); then warn "8 GB RAM recommended (found ${ram_mb} MB). Malware scanning (ClamAV) will stay disabled."
  else ok "Memory: ${ram_mb} MB"; fi

  mkdir -p "$RENTAGENT_HOME"
  disk_gb=$(df -BG --output=avail "$RENTAGENT_HOME" | tail -1 | tr -dc '0-9')
  (( disk_gb >= MIN_DISK_GB )) || warn "At least ${MIN_DISK_GB} GB free disk recommended (found ${disk_gb} GB)."
  (( disk_gb >= 10 )) || die "Not enough free disk space (${disk_gb} GB)."
  ok "Free disk: ${disk_gb} GB"
fi

command -v docker >/dev/null || die "Docker is not installed. Install Docker Engine: https://docs.docker.com/engine/install/"
docker info >/dev/null 2>&1 || die "Docker is installed but not running (try: systemctl start docker)."
docker compose version >/dev/null 2>&1 || die "Docker Compose v2 plugin is missing: https://docs.docker.com/compose/install/linux/"
ok "Docker $(docker version --format '{{.Server.Version}}'), $(docker compose version --short)"
command -v openssl >/dev/null || die "openssl is required to generate secrets."

for port in 80 443; do
  if command -v ss >/dev/null && ss -ltnH "sport = :$port" | grep -q .; then
    die "Port $port is already in use. Stop the web server using it (e.g. nginx/apache) and retry."
  fi
done
ok "Ports 80 and 443 are free"

# ---------------------------------------------------------------- questions
ask() { # ask <var> <prompt> [default]
  local __var=$1 __prompt=$2 __default=${3:-} __answer
  if [[ $ASSUME_YES -eq 1 ]]; then printf -v "$__var" '%s' "${!__var:-$__default}"; return; fi
  read -r -p "$__prompt${__default:+ [$__default]}: " __answer
  printf -v "$__var" '%s' "${__answer:-$__default}"
}

[[ -n "$DOMAIN" ]] || ask DOMAIN "Domain name (e.g. agents.example.com)"
[[ -n "$DOMAIN" ]] || die "A domain name is required."
[[ "$DOMAIN" =~ ^[A-Za-z0-9]([A-Za-z0-9.-]{0,251}[A-Za-z0-9])?$ ]] || die "Invalid domain name: $DOMAIN"
[[ -n "$ACME_EMAIL" ]] || ask ACME_EMAIL "Email for certificate notices (optional)"
[[ -z "$ACME_EMAIL" || "$ACME_EMAIL" =~ ^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$ ]] || die "Invalid email: $ACME_EMAIL"
[[ " $SUPPORTED_LOCALES " == *" $LOCALE "* ]] || die "Unsupported locale '$LOCALE' (use one of: $SUPPORTED_LOCALES)."

if [[ "$DOMAIN" != "localhost" ]] && command -v getent >/dev/null; then
  resolved=$(getent ahostsv4 "$DOMAIN" | awk 'NR==1 {print $1}' || true)
  if [[ -z "$resolved" ]]; then
    warn "$DOMAIN does not resolve yet. HTTPS certificates will be issued once DNS points to this server."
  else
    ok "$DOMAIN resolves to $resolved"
  fi
fi

if [[ $ASSUME_YES -eq 0 ]]; then
  read -r -p "Install RentAgent to $RENTAGENT_HOME for https://$DOMAIN ? [y/N] " confirm
  [[ "$confirm" =~ ^[Yy]$ ]] || die "Aborted."
fi

# ---------------------------------------------------------------- files & secrets
umask 077
mkdir -p "$RENTAGENT_HOME/backups"
install -m 0644 "$SCRIPT_DIR/docker-compose.yml" "$SCRIPT_DIR/Caddyfile" "$RENTAGENT_HOME/"
[[ -f "$SCRIPT_DIR/docker-compose.build.yml" ]] && install -m 0644 "$SCRIPT_DIR/docker-compose.build.yml" "$RENTAGENT_HOME/"
[[ -f "$SCRIPT_DIR/REQUIREMENTS.md" ]] && install -m 0644 "$SCRIPT_DIR/REQUIREMENTS.md" "$RENTAGENT_HOME/"
install -m 0755 "$SCRIPT_DIR/rentagent" /usr/local/bin/rentagent

rand_alnum() { openssl rand -base64 64 | tr -dc 'A-Za-z0-9' | head -c "$1"; }
pg_password=$(rand_alnum 40)
redis_password=$(rand_alnum 40)
setup_token=$(rand_alnum 48)
encryption_key=$(openssl rand -base64 32)

if [[ $BUILD_FROM_SOURCE -eq 1 ]]; then
  repo_root="$(cd "$SCRIPT_DIR/.." && pwd)"
  [[ -f "$repo_root/deploy/docker/Dockerfile" ]] || die "--build requires a repository checkout."
  sed -i "s#context: \.\.#context: ${repo_root}#" "$RENTAGENT_HOME/docker-compose.build.yml"
  compose_files="docker-compose.yml:docker-compose.build.yml"
else
  compose_files="docker-compose.yml"
fi

cat > "$RENTAGENT_HOME/.env" <<ENV
# RentAgent configuration. Generated by install.sh on $(date -u +%Y-%m-%dT%H:%M:%SZ).
# KEEP THIS FILE SECRET AND BACKED UP: losing APP_ENCRYPTION_KEY makes stored secrets unreadable.
COMPOSE_FILE=${compose_files}
COMPOSE_PROFILES=
RENTAGENT_VERSION=${TARGET_VERSION}
RENTAGENT_IMAGE_PREFIX=ghcr.io/diamondrubinny/rentagent

APP_DOMAIN=${DOMAIN}
APP_URL=https://${DOMAIN}
ACME_EMAIL=${ACME_EMAIL}
DEFAULT_LOCALE=${LOCALE}

POSTGRES_USER=rentagent
POSTGRES_DB=rentagent
POSTGRES_PASSWORD=${pg_password}
DATABASE_URL=postgresql://rentagent:${pg_password}@postgres:5432/rentagent
REDIS_PASSWORD=${redis_password}
REDIS_URL=redis://:${redis_password}@redis:6379

APP_ENCRYPTION_KEY=${encryption_key}
APP_ENCRYPTION_KEYS_PREVIOUS=
SETUP_TOKEN=${setup_token}

FILES_DIR=/data/files
LOG_LEVEL=info
NEXT_TELEMETRY_DISABLED=1
ENV
chmod 600 "$RENTAGENT_HOME/.env"
ok "Configuration written to $RENTAGENT_HOME/.env (mode 600)"

# ---------------------------------------------------------------- start
info "Starting services (this can take a few minutes on first run)…"
cd "$RENTAGENT_HOME"
trap - ERR
if [[ $BUILD_FROM_SOURCE -eq 1 ]]; then
  docker compose build
elif [[ $SKIP_PULL -eq 0 ]]; then
  docker compose pull --quiet
fi
# A failing container makes `up` return non-zero; the health wait below reports it clearly.
docker compose up -d || true

if ! /usr/local/bin/rentagent wait-healthy 300; then
  die "Services did not become healthy. Inspect with: rentagent status && rentagent logs"
fi

cat <<DONE

${c_grn}RentAgent is running.${c_off}

  1. Open:         https://${DOMAIN}/${LOCALE}/setup
  2. Setup token:  ${setup_token}
     (show it again any time with: sudo rentagent setup-token)

  Manage:          sudo rentagent status | logs | backup | update | help
  Configuration:   ${RENTAGENT_HOME}/.env  — back it up somewhere safe.

DONE
