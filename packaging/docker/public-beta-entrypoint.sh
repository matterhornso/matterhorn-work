#!/bin/sh
set -eu

require_secret() {
  name="$1"
  eval "value=\${$name:-}"
  if [ "${#value}" -lt 32 ]; then
    echo "Public Beta startup blocked: $name must be set to a high-entropy server secret." >&2
    exit 1
  fi
}

require_secret MATTERHORN_WORK_TOKEN
require_secret MATTERHORN_WORK_HOST_TOKEN
require_secret MATTERHORN_WORK_TRUSTED_PROXY_SECRET

if ! printf '%s' "${MATTERHORN_BUILD_COMMIT:-}" | grep -Eq '^[0-9a-fA-F]{40}$'; then
  echo "Public Beta startup blocked: MATTERHORN_BUILD_COMMIT must be a full 40-character SHA." >&2
  exit 1
fi

case "${MATTERHORN_WORK_CORS_ORIGINS:-}" in
  https://* ) ;;
  * ) echo "Public Beta startup blocked: MATTERHORN_WORK_CORS_ORIGINS must be the exact HTTPS app origin." >&2; exit 1 ;;
esac
case "${MATTERHORN_WORK_CORS_ORIGINS}" in
  *,*|*\** ) echo "Public Beta startup blocked: use one exact CORS origin, never a list or wildcard." >&2; exit 1 ;;
esac

export OPENWORK_PORT="${PORT:-${OPENWORK_PORT:-8787}}"
install -d -m 0700 -o node -g node "${MATTERHORN_WORK_DATA_DIR}" "${MATTERHORN_WORK_WORKSPACES}"

exec gosu node bun /app/apps/server/src/cli.ts
