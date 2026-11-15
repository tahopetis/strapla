#!/usr/bin/env bash
# security-gate — run every armed scanner, then hand the verdict to normalize.mjs.
#
#   bash ci/run-security.sh                     # secrets + deps + sast
#   SCANNERS=secrets,deps bash ci/run-security.sh
#   FAIL_ON=none bash ci/run-security.sh        # shadow mode: report, never fail
#
# Exit code is the verdict, and nothing else:
#   0  SECURITY: PASS
#   1  SECURITY: FAIL <n>
#   2  SECURITY: ERROR   (fail-closed: something could not be verified)
#   3  SECURITY: SETUP   (the repo or the config is not scannable)
#
# Deliberately NOT `set -e`: a scanner that dies must downgrade its own verdict
# and let the remaining scanners run, so the report says what is broken instead
# of the run vanishing at the first problem.

set -uo pipefail

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"

SCANNERS="${SCANNERS:-secrets,deps,sast,misconfig}"
REPORT_DIR="${REPORT_DIR:-findings}"
# Scanners are downloaded outside the repo: they must never sit in the tree
# that the secrets scanner walks, and a missing .gitignore entry must not leak
# a 50 MB binary into a commit.
DEFAULT_TOOL_DIR="${RUNNER_TEMP:-${TMPDIR:-/tmp}}/security-gate-tools"
TOOL_DIR="${TOOL_DIR:-$DEFAULT_TOOL_DIR}"
FAIL_ON="${FAIL_ON:-high}"
SECRET_FLOOR="${SECRET_FLOOR:-critical}"
BASELINE="${BASELINE:-$SCRIPT_DIR/security-baseline.json}"

# Pinned tool versions: bumping one is a reviewable line, not a floating tag.
GITLEAKS_VERSION="${GITLEAKS_VERSION:-8.30.1}"
OSV_VERSION="${OSV_VERSION:-2.7.1}"
SEMGREP_VERSION="${SEMGREP_VERSION:-1.185.0}"
TRIVY_VERSION="${TRIVY_VERSION:-0.76.2}"

SEMGREP_CONFIG="${SEMGREP_CONFIG:-p/default}"
GITLEAKS_CONFIG="${GITLEAKS_CONFIG:-}"
OSV_ARGS="${OSV_ARGS:-scan source --recursive}"

export SEMGREP_SEND_METRICS=off

log() { printf '%s\n' "$*" >&2; }

# gitleaks names builds x64/arm64; osv-scanner names them amd64/arm64.
ARCH_GL=""
ARCH_OSV=""
ARCH_TRIVY=""
detect_arch() {
  case "$(uname -m)" in
    x86_64 | amd64)   ARCH_GL=x64   ARCH_OSV=amd64 ARCH_TRIVY=64bit ;;
    aarch64 | arm64)  ARCH_GL=arm64 ARCH_OSV=arm64 ARCH_TRIVY=ARM64 ;;
    *) log "unsupported architecture $(uname -m)"; return 1 ;;
  esac
}

# Last meaningful line of a scanner log, short enough to survive the 140-char
# commit-status description and still say something.
last_reason() {
  local logfile="$1" line
  [ -s "$logfile" ] || return 0
  line=$(grep -iE "error|fatal|invalid|unrecognized|no files|not found|traceback" "$logfile" 2>/dev/null | tail -1)
  [ -n "$line" ] || line=$(grep -v "^[[:space:]]*$" "$logfile" 2>/dev/null | tail -1)
  line=$(printf "%s" "$line" | tr -d "\r" | cut -c1-80)
  [ -n "$line" ] && printf " — %s" "$line"
}

record() { # record <scanner> <ok|crashed> [detail]
  printf '%s\n' "$2" >"$REPORT_DIR/$1.status"
  if [ -n "${3:-}" ]; then printf '%s\n' "$3" >"$REPORT_DIR/$1.detail"; fi
  return 0
}

# Download, verify against the published checksums, and only then use it.
# A release asset with no matching checksum line is treated as unverifiable.
fetch_verified() { # fetch_verified <url> <checksums-url> <asset> <dest>
  local url="$1" sums_url="$2" asset="$3" dest="$4"
  local dl="$TOOL_DIR/dl" tmp="$TOOL_DIR/dl/$asset" want got

  mkdir -p "$dl" || return 1
  if ! curl -fsSL --retry 3 --retry-delay 2 -o "$tmp" "$url"; then
    log "download failed: $url"
    return 1
  fi
  if ! curl -fsSL --retry 3 --retry-delay 2 -o "$tmp.sums" "$sums_url"; then
    log "checksums download failed: $sums_url"
    return 1
  fi

  want=$(awk -v a="$asset" '
    { n = $NF; sub(/^\*/, "", n); sub(/^\.\//, "", n); if (n == a) { print $1; exit } }
  ' "$tmp.sums")
  if [ -z "$want" ]; then
    log "no checksum entry for $asset — refusing to run an unverified binary"
    return 1
  fi
  got=$(sha256sum "$tmp" | awk '{print $1}')
  if [ "$got" != "$want" ]; then
    log "checksum mismatch for $asset (want $want, got $got)"
    return 1
  fi

  mv "$tmp" "$dest" && chmod +x "$dest"
}

ensure_gitleaks() {
  local bin="$TOOL_DIR/gitleaks" asset
  if [ -x "$bin" ]; then printf '%s\n' "$bin"; return 0; fi
  detect_arch || return 1
  asset="gitleaks_${GITLEAKS_VERSION}_linux_${ARCH_GL}.tar.gz"
  fetch_verified \
    "https://github.com/gitleaks/gitleaks/releases/download/v${GITLEAKS_VERSION}/${asset}" \
    "https://github.com/gitleaks/gitleaks/releases/download/v${GITLEAKS_VERSION}/gitleaks_${GITLEAKS_VERSION}_checksums.txt" \
    "$asset" "$TOOL_DIR/$asset" || return 1
  tar -xzf "$TOOL_DIR/$asset" -C "$TOOL_DIR" gitleaks || { log "could not unpack $asset"; return 1; }
  chmod +x "$bin"
  [ -x "$bin" ] || return 1
  printf '%s\n' "$bin"
}

ensure_osv() {
  local bin="$TOOL_DIR/osv-scanner" asset
  if [ -x "$bin" ]; then printf '%s\n' "$bin"; return 0; fi
  detect_arch || return 1
  asset="osv-scanner_linux_${ARCH_OSV}"
  fetch_verified \
    "https://github.com/google/osv-scanner/releases/download/v${OSV_VERSION}/${asset}" \
    "https://github.com/google/osv-scanner/releases/download/v${OSV_VERSION}/osv-scanner_SHA256SUMS" \
    "$asset" "$bin" || return 1
  printf '%s\n' "$bin"
}

ensure_semgrep() {
  local venv="$TOOL_DIR/venv" bin="$TOOL_DIR/venv/bin/semgrep" install_log="$TOOL_DIR/semgrep-install.log"
  if [ -x "$bin" ]; then printf '%s\n' "$bin"; return 0; fi
  if ! command -v python3 >/dev/null 2>&1; then
    log "python3 not found; semgrep needs python3 -m venv"
    return 1
  fi
  mkdir -p "$TOOL_DIR" || return 1
  if ! python3 -m venv "$venv" >"$install_log" 2>&1; then
    log "python3 -m venv failed (see $install_log)"
    return 1
  fi
  if ! "$venv/bin/python" -m pip install --disable-pip-version-check --quiet \
    "semgrep==${SEMGREP_VERSION}" >>"$install_log" 2>&1; then
    log "pip install semgrep==${SEMGREP_VERSION} failed (see $install_log)"
    return 1
  fi
  [ -x "$bin" ] || { log "semgrep binary missing after install"; return 1; }
  printf '%s\n' "$bin"
}

ensure_trivy() {
  local bin="$TOOL_DIR/trivy" asset
  if [ -x "$bin" ]; then printf '%s\n' "$bin"; return 0; fi
  detect_arch || return 1
  asset="trivy_${TRIVY_VERSION}_Linux-${ARCH_TRIVY}.tar.gz"
  fetch_verified \
    "https://github.com/aquasecurity/trivy/releases/download/v${TRIVY_VERSION}/${asset}" \
    "https://github.com/aquasecurity/trivy/releases/download/v${TRIVY_VERSION}/trivy_${TRIVY_VERSION}_checksums.txt" \
    "$asset" "$TOOL_DIR/$asset" || return 1
  tar -xzf "$TOOL_DIR/$asset" -C "$TOOL_DIR" trivy || { log "could not unpack $asset"; return 1; }
  chmod +x "$bin"
  [ -x "$bin" ] || return 1
  printf '%s\n' "$bin"
}

# A scanner may exit 1 to mean "findings", so only a report-less or
# badly-broken run counts as crashed. Anything not ok is an ERROR downstream.
run_scanner() { # run_scanner <name> <cmd...>
  local name="$1"
  shift
  local logfile="$REPORT_DIR/$name.log" rc

  : >"$REPORT_DIR/$name.sarif"
  log "== $name =="
  "$@" 2>&1 | tee "$logfile"
  rc=${PIPESTATUS[0]}

  case "$rc" in
    0 | 1) record "$name" ok "" ;;
    *) record "$name" crashed "exit $rc$(last_reason "$logfile")" ;;
  esac
  if [ ! -s "$REPORT_DIR/$name.sarif" ]; then
    record "$name" crashed "no output$(last_reason "$logfile")"
  fi
  return 0
}

scan_secrets() {
  local bin
  if ! bin=$(ensure_gitleaks); then record secrets crashed "gitleaks install failed"; return 0; fi
  local -a args=(
    dir .
    --report-format sarif
    --report-path "$REPORT_DIR/secrets.sarif"
    --exit-code 0
    --redact
  )
  if [ -n "$GITLEAKS_CONFIG" ]; then args+=(--config "$GITLEAKS_CONFIG"); fi
  run_scanner secrets "$bin" "${args[@]}"
}

scan_deps() {
  local bin rc logfile="$REPORT_DIR/deps.log" out="$REPORT_DIR/deps.sarif"
  if ! bin=$(ensure_osv); then record deps crashed "osv-scanner install failed"; return 0; fi
  local -a args
  read -r -a args <<<"$OSV_ARGS"

  : >"$out"
  log "== deps =="
  "$bin" "${args[@]}" --format sarif --output-file "$out" . 2>&1 | tee "$logfile"
  rc=${PIPESTATUS[0]}

  # Exit 128 plus this message means the tree has no dependency manifest. The
  # scanner did its job and found nothing to check, so this is a clean result —
  # anything else non-zero is a crash and stays fail-closed.
  if [ "$rc" -eq 128 ] && grep -q "No package sources found" "$logfile"; then
    printf "%s\n" "{\"version\":\"2.1.0\",\"runs\":[]}" >"$out"
    record deps ok "no package sources in this repo"
    return 0
  fi

  case "$rc" in
    0 | 1) record deps ok "" ;;
    *) record deps crashed "exit $rc" ;;
  esac
  [ -s "$out" ] || record deps crashed "no SARIF written"
  return 0
}

scan_sast() {
  local bin
  if ! bin=$(ensure_semgrep); then record sast crashed "semgrep install failed"; return 0; fi

  local -a args=(
    scan
    --config "$SEMGREP_CONFIG"
    --sarif --output "$REPORT_DIR/sast.sarif"
    --disable-version-check --quiet
  )
  if [ "$SEMGREP_CONFIG" = "auto" ]; then
    # Semgrep refuses --config auto with metrics disabled: choosing the ruleset
    # for a repo is itself a metrics-bearing request. Say so out loud instead of
    # quietly turning telemetry on.
    log "semgrep: config=auto requires metrics, so telemetry stays at semgrep's default"
  else
    args+=(--metrics off)
  fi
  args+=(.)
  run_scanner sast "$bin" "${args[@]}"
}

scan_misconfig() {
  local bin
  if ! bin=$(ensure_trivy); then record misconfig crashed "trivy install failed"; return 0; fi
  local -a args=(
    fs
    --scanners misconfig
    --format sarif
    --output "$REPORT_DIR/misconfig.sarif"
    --exit-code 1
    --quiet
    --skip-db-update
    --skip-dirs node_modules
    --skip-dirs .next
    --skip-dirs findings
    .
  )
  run_scanner misconfig "$bin" "${args[@]}"
}

main() {
  mkdir -p "$REPORT_DIR" "$TOOL_DIR" || {
    log "cannot create $REPORT_DIR / $TOOL_DIR"
    exit 3
  }
  rm -f "$REPORT_DIR"/*.status "$REPORT_DIR"/*.detail "$REPORT_DIR"/*.sarif \
    "$REPORT_DIR"/*.log "$REPORT_DIR"/verdict.txt 2>/dev/null

  : >"$REPORT_DIR/expected.txt"
  local list="${SCANNERS//,/ }" s
  for s in $list; do printf '%s\n' "$s" >>"$REPORT_DIR/expected.txt"; done

  log "security-gate: scanners=[${list}] fail_on=${FAIL_ON} report_dir=${REPORT_DIR}"

  for s in $list; do
    case "$s" in
      secrets) scan_secrets ;;
      deps)    scan_deps ;;
      sast)    scan_sast ;;
      misconfig) scan_misconfig ;;
      *)
        log "unknown scanner '$s' — recording it as crashed so the gate fails closed"
        record "$s" crashed "unknown scanner id"
        ;;
    esac
  done

  EXPECTED_SCANNERS="$SCANNERS" \
    REPORT_DIR="$REPORT_DIR" \
    FAIL_ON="$FAIL_ON" \
    SECRET_FLOOR="$SECRET_FLOOR" \
    BASELINE="$BASELINE" \
    node "$SCRIPT_DIR/normalize.mjs"
  exit $?
}

main "$@"
