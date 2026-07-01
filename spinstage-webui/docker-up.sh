#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
COMPOSE_FILE="${ROOT}/docker-compose.yml"

if [[ ! -f "$COMPOSE_FILE" ]]; then
    COMPOSE_FILE="${ROOT}/docker-compose.example.yml"
fi

if [[ ! -f "$COMPOSE_FILE" ]]; then
    echo "No docker-compose.yml or docker-compose.example.yml in ${ROOT}" >&2
    exit 1
fi

cd "$ROOT"
exec docker compose -f "$COMPOSE_FILE" "$@"
