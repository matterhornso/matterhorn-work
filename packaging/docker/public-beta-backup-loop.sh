#!/bin/sh
# Daily host recovery upload. Runs inside the Public Beta container because only
# it mounts /data. Retries until the first upload succeeds so /health/ready's
# backup freshness gate (MATTERHORN_HOST_BACKUP_REQUIRED) can pass on a fresh
# instance, then repeats on the configured interval.
set -u
[ "${MATTERHORN_HOST_BACKUP_REQUIRED:-0}" = "1" ] || exit 0
interval="${MATTERHORN_HOST_BACKUP_INTERVAL_SECONDS:-86400}"
retry="${MATTERHORN_HOST_BACKUP_RETRY_SECONDS:-300}"
scratch="$(mktemp -d)/host-recovery.json.gz"

log() { printf '{"level":"%s","component":"host-backup","msg":"%s"}\n' "$1" "$2"; }

opencode_db() {
  if [ -n "${OPENCODE_DB:-}" ]; then printf '%s' "$OPENCODE_DB"; return; fi
  for candidate in "${XDG_DATA_HOME}/opencode/opencode-local.db" "${XDG_DATA_HOME}/opencode/opencode.db"; do
    if [ -f "$candidate" ]; then printf '%s' "$candidate"; return; fi
  done
}

while :; do
  db="$(opencode_db)"
  if [ -z "$db" ]; then
    log warn "opencode database not present yet; retrying"
    sleep "$retry"; continue
  fi
  if node /app/scripts/matterhorn-host-recovery.mjs \
      --data-root "$MATTERHORN_WORK_DATA_DIR" \
      --opencode-db "$db" \
      --output "$scratch" \
      --upload --json >/dev/null; then
    rm -f "$scratch"
    log info "host recovery upload succeeded"
    sleep "$interval"
  else
    rm -f "$scratch"
    log error "host recovery upload failed; retrying"
    sleep "$retry"
  fi
done
