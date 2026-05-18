#!/usr/bin/env bash
set -euo pipefail

REGISTRY="ccr.ccs.tencentyun.com"
NAMESPACE="ai-page-builder"
USERNAME="100029519653"
SOURCE_PREFIX="ai-page-builder"
TAG=""
PUSH_LATEST="true"

usage() {
  cat <<'EOF'
Usage: ./build/push-page-builder-tencent.sh --tag <tag> [options]

Tag and push local PageBuilder images to Tencent Cloud CCR.

Required:
  --tag <tag>                    Source and target version tag, for example v202605181005.

Options:
  --source-prefix <prefix>        Local image prefix. Default: ai-page-builder
  --registry <registry>           Registry host. Default: ccr.ccs.tencentyun.com
  --namespace <namespace>         Registry namespace. Default: ai-page-builder
  --username <username>           Registry username. Default: 100029519653
  --no-latest                     Do not push latest tags.
  -h, --help                      Show this help.

Authentication:
  Set TENCENT_REGISTRY_PASSWORD before running this script, or enter it when prompted.

Examples:
  TENCENT_REGISTRY_PASSWORD='***' ./build/push-page-builder-tencent.sh --tag v202605181005
  ./build/push-page-builder-tencent.sh --tag v202605181005 --no-latest

Source images:
  <source-prefix>/server:<tag>
  <source-prefix>/web:<tag>
  <source-prefix>/server:latest
  <source-prefix>/web:latest

Target images:
  ccr.ccs.tencentyun.com/ai-page-builder/page-builder-server:<tag>
  ccr.ccs.tencentyun.com/ai-page-builder/page-builder-web:<tag>
  ccr.ccs.tencentyun.com/ai-page-builder/page-builder-server:latest
  ccr.ccs.tencentyun.com/ai-page-builder/page-builder-web:latest
EOF
}

while [ $# -gt 0 ]; do
  case "$1" in
    --tag)
      shift
      if [ $# -eq 0 ]; then
        echo "--tag requires a value." >&2
        usage >&2
        exit 1
      fi
      TAG="$1"
      ;;
    --tag=*)
      TAG="${1#*=}"
      ;;
    --source-prefix)
      shift
      if [ $# -eq 0 ]; then
        echo "--source-prefix requires a value." >&2
        usage >&2
        exit 1
      fi
      SOURCE_PREFIX="$1"
      ;;
    --source-prefix=*)
      SOURCE_PREFIX="${1#*=}"
      ;;
    --registry)
      shift
      if [ $# -eq 0 ]; then
        echo "--registry requires a value." >&2
        usage >&2
        exit 1
      fi
      REGISTRY="$1"
      ;;
    --registry=*)
      REGISTRY="${1#*=}"
      ;;
    --namespace)
      shift
      if [ $# -eq 0 ]; then
        echo "--namespace requires a value." >&2
        usage >&2
        exit 1
      fi
      NAMESPACE="$1"
      ;;
    --namespace=*)
      NAMESPACE="${1#*=}"
      ;;
    --username)
      shift
      if [ $# -eq 0 ]; then
        echo "--username requires a value." >&2
        usage >&2
        exit 1
      fi
      USERNAME="$1"
      ;;
    --username=*)
      USERNAME="${1#*=}"
      ;;
    --no-latest)
      PUSH_LATEST="false"
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

if [ -z "${TAG}" ]; then
  echo "--tag is required." >&2
  usage >&2
  exit 1
fi

if ! command -v docker >/dev/null 2>&1; then
  echo "docker is not installed or not on PATH." >&2
  exit 1
fi

PASSWORD="${TENCENT_REGISTRY_PASSWORD:-}"
if [ -z "${PASSWORD}" ]; then
  if [ -t 0 ]; then
    printf 'Tencent registry password: ' >&2
    stty -echo
    read -r PASSWORD
    stty echo
    printf '\n' >&2
  else
    echo "TENCENT_REGISTRY_PASSWORD is required when stdin is not interactive." >&2
    exit 1
  fi
fi

printf '%s' "${PASSWORD}" | docker login "${REGISTRY}" --username "${USERNAME}" --password-stdin

SOURCE_SERVER_IMAGE="${SOURCE_PREFIX}/server:${TAG}"
SOURCE_WEB_IMAGE="${SOURCE_PREFIX}/web:${TAG}"
TARGET_SERVER_IMAGE="${REGISTRY}/${NAMESPACE}/page-builder-server:${TAG}"
TARGET_WEB_IMAGE="${REGISTRY}/${NAMESPACE}/page-builder-web:${TAG}"

docker image inspect "${SOURCE_SERVER_IMAGE}" >/dev/null
docker image inspect "${SOURCE_WEB_IMAGE}" >/dev/null

docker tag "${SOURCE_SERVER_IMAGE}" "${TARGET_SERVER_IMAGE}"
docker tag "${SOURCE_WEB_IMAGE}" "${TARGET_WEB_IMAGE}"

docker push "${TARGET_SERVER_IMAGE}"
docker push "${TARGET_WEB_IMAGE}"

if [ "${PUSH_LATEST}" = "true" ]; then
  SOURCE_SERVER_LATEST_IMAGE="${SOURCE_PREFIX}/server:latest"
  SOURCE_WEB_LATEST_IMAGE="${SOURCE_PREFIX}/web:latest"
  TARGET_SERVER_LATEST_IMAGE="${REGISTRY}/${NAMESPACE}/page-builder-server:latest"
  TARGET_WEB_LATEST_IMAGE="${REGISTRY}/${NAMESPACE}/page-builder-web:latest"

  docker image inspect "${SOURCE_SERVER_LATEST_IMAGE}" >/dev/null
  docker image inspect "${SOURCE_WEB_LATEST_IMAGE}" >/dev/null

  docker tag "${SOURCE_SERVER_LATEST_IMAGE}" "${TARGET_SERVER_LATEST_IMAGE}"
  docker tag "${SOURCE_WEB_LATEST_IMAGE}" "${TARGET_WEB_LATEST_IMAGE}"

  docker push "${TARGET_SERVER_LATEST_IMAGE}"
  docker push "${TARGET_WEB_LATEST_IMAGE}"
fi

cat <<EOF
Pushed PageBuilder images:
  ${TARGET_SERVER_IMAGE}
  ${TARGET_WEB_IMAGE}
EOF

if [ "${PUSH_LATEST}" = "true" ]; then
  cat <<EOF
  ${TARGET_SERVER_LATEST_IMAGE}
  ${TARGET_WEB_LATEST_IMAGE}
EOF
fi
