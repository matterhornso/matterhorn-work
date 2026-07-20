#!/usr/bin/env sh
set -eu

OPENWORK_WORKSPACE="${OPENWORK_WORKSPACE:-/workspace}"
OPENWORK_DATA_DIR="${OPENWORK_DATA_DIR:-/data/openwork-orchestrator}"
OPENWORK_SIDECAR_DIR="${OPENWORK_SIDECAR_DIR:-/data/sidecars}"
OPENWORK_PORT="${OPENWORK_PORT:-8787}"
OPENWORK_OPENCODE_PORT="${OPENWORK_OPENCODE_PORT:-4096}"
MATTERHORN_WORK_TOKEN="${MATTERHORN_WORK_TOKEN:-${OPENWORK_TOKEN:-}}"
MATTERHORN_WORK_HOST_TOKEN="${MATTERHORN_WORK_HOST_TOKEN:-${OPENWORK_HOST_TOKEN:-}}"
MATTERHORN_WORK_APPROVAL_MODE="${MATTERHORN_WORK_APPROVAL_MODE:-${OPENWORK_APPROVAL_MODE:-manual}}"
MATTERHORN_WORK_CORS_ORIGINS="${MATTERHORN_WORK_CORS_ORIGINS:-${OPENWORK_CORS_ORIGINS:-http://localhost:5173,http://127.0.0.1:5173}}"
OPENWORK_CONNECT_HOST="${OPENWORK_CONNECT_HOST:-127.0.0.1}"
HOME="${HOME:-/root}"
USER="${USER:-root}"
SHELL="${SHELL:-/bin/sh}"
XDG_CONFIG_HOME="${XDG_CONFIG_HOME:-$HOME/.config}"
XDG_CACHE_HOME="${XDG_CACHE_HOME:-$HOME/.cache}"
XDG_DATA_HOME="${XDG_DATA_HOME:-$HOME/.local/share}"
XDG_STATE_HOME="${XDG_STATE_HOME:-$HOME/.local/state}"

if [ "$HOME" = "/" ]; then
  HOME=/root
  XDG_CONFIG_HOME="$HOME/.config"
  XDG_CACHE_HOME="$HOME/.cache"
  XDG_DATA_HOME="$HOME/.local/share"
  XDG_STATE_HOME="$HOME/.local/state"
fi

export HOME USER SHELL XDG_CONFIG_HOME XDG_CACHE_HOME XDG_DATA_HOME XDG_STATE_HOME
export MATTERHORN_WORK_TOKEN MATTERHORN_WORK_HOST_TOKEN
export MATTERHORN_WORK_APPROVAL_MODE MATTERHORN_WORK_CORS_ORIGINS

: "${MATTERHORN_WORK_TOKEN:?Set MATTERHORN_WORK_TOKEN using the deployment secret manager.}"
: "${MATTERHORN_WORK_HOST_TOKEN:?Set MATTERHORN_WORK_HOST_TOKEN using the deployment secret manager.}"

mkdir -p "$OPENWORK_WORKSPACE" "$OPENWORK_DATA_DIR" "$OPENWORK_SIDECAR_DIR"
mkdir -p "$HOME" "$XDG_CONFIG_HOME" "$XDG_CACHE_HOME" "$XDG_DATA_HOME" "$XDG_STATE_HOME"

printf '%s\n' "Starting Matterhorn Desks micro-sandbox"
printf '%s\n' "- workspace: $OPENWORK_WORKSPACE"
printf '%s\n' "- home: $HOME"
printf '%s\n' "- Matterhorn URL: http://$OPENWORK_CONNECT_HOST:$OPENWORK_PORT"
printf '%s\n' "- client and host credentials: configured"
printf '%s\n' "- approval mode: $MATTERHORN_WORK_APPROVAL_MODE"
printf '%s\n' "- health: curl http://$OPENWORK_CONNECT_HOST:$OPENWORK_PORT/health"
printf '%s\n' "- authenticated workspace check: GET /workspaces"

exec matterhorn-work serve \
  --workspace "$OPENWORK_WORKSPACE" \
  --remote-access \
  --openwork-port "$OPENWORK_PORT" \
  --opencode-host 127.0.0.1 \
  --opencode-port "$OPENWORK_OPENCODE_PORT" \
  --approval "$MATTERHORN_WORK_APPROVAL_MODE" \
  --cors "$MATTERHORN_WORK_CORS_ORIGINS" \
  --connect-host "$OPENWORK_CONNECT_HOST" \
  --allow-external \
  --sidecar-source external \
  --opencode-source external \
  --openwork-server-bin /usr/local/bin/matterhorn-work-server \
  --opencode-bin /usr/local/bin/opencode \
  --no-opencode-router
