#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd -- "${SCRIPT_DIR}/.." && pwd)"
ENV_FILE="${SCRIPT_DIR}/.env.standalone.example"
COMPOSE_FILE="${SCRIPT_DIR}/docker-compose.yml"
PLATFORM=""
AGENT_SDK_ENV_UNSET_ARGS=(
  -u ANTHROPIC_BASE_URL
  -u ANTHROPIC_AUTH_TOKEN
  -u ANTHROPIC_API_KEY
  -u ANTHROPIC_MODEL
  -u ANTHROPIC_DEFAULT_OPUS_MODEL
  -u ANTHROPIC_DEFAULT_SONNET_MODEL
  -u ANTHROPIC_DEFAULT_HAIKU_MODEL
  -u CLAUDE_CODE_SUBAGENT_MODEL
  -u CLAUDE_CODE_EFFORT_LEVEL
  -u CLAUDE_CODE_AUTO_COMPACT_WINDOW
  -u CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC
  -u API_TIMEOUT_MS
  -u AI_PAGE_BUILDER_AI_PROVIDERS_CONFIG_FILE
  -u AI_PAGE_BUILDER_AGENT_MODELS_CONFIG_FILE
  -u AI_PAGE_BUILDER_ANTHROPIC_API_KEY
  -u AI_PAGE_BUILDER_ANTHROPIC_BASE_URL
)

run_docker_compose() {
  env "${AGENT_SDK_ENV_UNSET_ARGS[@]}" docker compose "$@"
}

usage() {
  cat <<'EOF'
Usage: ./build/start-page-builder.sh [--env-file <file>] [--platform <platform>]

Examples:
  ./build/start-page-builder.sh
  ./build/start-page-builder.sh --env-file build/.env.cms.example
  ./build/start-page-builder.sh --platform linux/amd64
EOF
}

while [ $# -gt 0 ]; do
  case "$1" in
    --env-file)
      shift
      if [ $# -eq 0 ]; then
        echo "--env-file requires a value." >&2
        usage >&2
        exit 1
      fi
      ENV_FILE="$1"
      ;;
    --env-file=*)
      ENV_FILE="${1#*=}"
      ;;
    --platform)
      shift
      if [ $# -eq 0 ]; then
        echo "--platform requires a value." >&2
        usage >&2
        exit 1
      fi
      PLATFORM="$1"
      ;;
    --platform=*)
      PLATFORM="${1#*=}"
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      echo "Unknown argument: $1" >&2
      usage >&2
      exit 1
      ;;
  esac
  shift
done

case "${ENV_FILE}" in
  /*) ;;
  *)
    if [ -f "${REPO_ROOT}/${ENV_FILE}" ]; then
      ENV_FILE="${REPO_ROOT}/${ENV_FILE}"
    else
      ENV_FILE="${SCRIPT_DIR}/${ENV_FILE}"
    fi
    ;;
esac

if ! command -v docker >/dev/null 2>&1; then
  echo "docker is not installed or not on PATH." >&2
  exit 1
fi

if ! docker compose version >/dev/null 2>&1; then
  echo "docker compose is not available." >&2
  exit 1
fi

if [ ! -f "${ENV_FILE}" ]; then
  echo "env file is missing: ${ENV_FILE}. Use build/.env.standalone.example or build/.env.cms.example." >&2
  exit 1
fi

cd "${REPO_ROOT}"

if [ -n "${PLATFORM}" ]; then
  if ! docker buildx version >/dev/null 2>&1; then
    echo "docker buildx is not available." >&2
    exit 1
  fi

  docker buildx build \
    --platform "${PLATFORM}" \
    --load \
    --tag ai-page-builder-server \
    --file "${SCRIPT_DIR}/Dockerfile.page-builder-app" \
    "${REPO_ROOT}"

  docker buildx build \
    --platform "${PLATFORM}" \
    --load \
    --tag ai-page-builder-web \
    --file "${SCRIPT_DIR}/Dockerfile.page-builder-web" \
    "${REPO_ROOT}"

  run_docker_compose \
    --env-file "${ENV_FILE}" \
    -f "${COMPOSE_FILE}" \
    up -d --no-build server playwright web
else
  run_docker_compose \
    --env-file "${ENV_FILE}" \
    -f "${COMPOSE_FILE}" \
    up -d --build server playwright web
fi

PORT="$(awk -F= '/^PAGE_BUILDER_PORT=/{print $2}' "${ENV_FILE}" | tail -n 1)"
if [ -z "${PORT}" ]; then
  PORT="3333"
fi
PORT="${PORT%\"}"
PORT="${PORT#\"}"

BASE_PATH="$(awk -F= '/^AI_PAGE_BUILDER_BASE_PATH=/{print $2}' "${ENV_FILE}" | tail -n 1)"
BASE_PATH="${BASE_PATH%\"}"
BASE_PATH="${BASE_PATH#\"}"
BASE_PATH="${BASE_PATH%\'}"
BASE_PATH="${BASE_PATH#\'}"
if [ -n "${BASE_PATH}" ] && [ "${BASE_PATH}" != "/" ]; then
  case "${BASE_PATH}" in
    /*) ;;
    *) BASE_PATH="/${BASE_PATH}" ;;
  esac
  BASE_PATH="${BASE_PATH%/}"
else
  BASE_PATH=""
fi

PUBLIC_URL="http://localhost:${PORT}${BASE_PATH}/"

if [ -n "${PLATFORM}" ]; then
  echo "Page Builder is available at ${PUBLIC_URL} (platform: ${PLATFORM})"
else
  echo "Page Builder is available at ${PUBLIC_URL}"
fi
