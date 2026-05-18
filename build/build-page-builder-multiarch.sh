#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd -- "${SCRIPT_DIR}/.." && pwd)"

PLATFORMS="linux/amd64"
IMAGE_PREFIX="ai-page-builder"
TAG="v$(date +%Y%m%d%H%M)"

usage() {
  cat <<'EOF'
Usage: ./build/build-page-builder-multiarch.sh [options]

Build PageBuilder server and web Linux images and load them locally.
This script does not push images and does not start containers.

Options:
  --platforms <platforms>     Target platform. Default: linux/amd64
                              Local --load supports one platform per run.
  --image-prefix <prefix>     Image name prefix. Default: ai-page-builder
                              Example: registry.example.com/ai-page-builder
  --tag <tag>                 Version image tag. Default: vYYYYMMDDHHMM
  -h, --help                  Show this help.

Examples:
  ./build/build-page-builder-multiarch.sh
  ./build/build-page-builder-multiarch.sh --platforms linux/amd64
  ./build/build-page-builder-multiarch.sh --image-prefix registry.example.com/ai-page-builder --tag v1.0.0

Local image tags:
  <image-prefix>/server:<tag>
  <image-prefix>/server:latest
  <image-prefix>/web:<tag>
  <image-prefix>/web:latest
EOF
}

while [ $# -gt 0 ]; do
  case "$1" in
    --platforms)
      shift
      if [ $# -eq 0 ]; then
        echo "--platforms requires a value." >&2
        usage >&2
        exit 1
      fi
      PLATFORMS="$1"
      ;;
    --platforms=*)
      PLATFORMS="${1#*=}"
      ;;
    --image-prefix)
      shift
      if [ $# -eq 0 ]; then
        echo "--image-prefix requires a value." >&2
        usage >&2
        exit 1
      fi
      IMAGE_PREFIX="$1"
      ;;
    --image-prefix=*)
      IMAGE_PREFIX="${1#*=}"
      ;;
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

if ! command -v docker >/dev/null 2>&1; then
  echo "docker is not installed or not on PATH." >&2
  exit 1
fi

if ! docker buildx version >/dev/null 2>&1; then
  echo "docker buildx is not available." >&2
  exit 1
fi

IFS=',' read -r -a PLATFORM_LIST <<< "${PLATFORMS}"
if [ "${#PLATFORM_LIST[@]}" -eq 0 ]; then
  echo "--platforms must contain at least one platform." >&2
  exit 1
fi

if [ "${#PLATFORM_LIST[@]}" -ne 1 ]; then
  echo "This local-load script only supports one platform per run because Docker --load cannot keep multiple platforms under the same local tag." >&2
  echo "Run the script once per target platform, or use a registry push flow for true multi-platform manifests." >&2
  exit 1
fi

cd "${REPO_ROOT}"

BUILT_IMAGES=()

PLATFORM="$(printf '%s' "${PLATFORM_LIST[0]}" | xargs)"
if [ -z "${PLATFORM}" ]; then
  echo "--platforms did not contain any non-empty platform values." >&2
  exit 1
fi

SERVER_TAG="${IMAGE_PREFIX}/server:${TAG}"
SERVER_LATEST_TAG="${IMAGE_PREFIX}/server:latest"
WEB_TAG="${IMAGE_PREFIX}/web:${TAG}"
WEB_LATEST_TAG="${IMAGE_PREFIX}/web:latest"

echo "Building and loading PageBuilder server image for ${PLATFORM} as ${SERVER_TAG} and ${SERVER_LATEST_TAG}..."
docker buildx build \
  --platform "${PLATFORM}" \
  --load \
  --tag "${IMAGE_PREFIX}/server:${TAG}" \
  --tag "${IMAGE_PREFIX}/server:latest" \
  --file "${SCRIPT_DIR}/Dockerfile.page-builder-app" \
  "${REPO_ROOT}"

echo "Building and loading PageBuilder web image for ${PLATFORM} as ${WEB_TAG} and ${WEB_LATEST_TAG}..."
docker buildx build \
  --platform "${PLATFORM}" \
  --load \
  --tag "${IMAGE_PREFIX}/web:${TAG}" \
  --tag "${IMAGE_PREFIX}/web:latest" \
  --file "${SCRIPT_DIR}/Dockerfile.page-builder-web" \
  "${REPO_ROOT}"

BUILT_IMAGES+=("${SERVER_TAG}" "${SERVER_LATEST_TAG}" "${WEB_TAG}" "${WEB_LATEST_TAG}")

if [ "${#BUILT_IMAGES[@]}" -eq 0 ]; then
  echo "--platforms did not contain any non-empty platform values." >&2
  exit 1
fi

cat <<EOF
Local Docker images built:
EOF

for IMAGE in "${BUILT_IMAGES[@]}"; do
  echo "  ${IMAGE}"
done

cat <<'EOF'

Images were loaded into the local Docker image store. They were not pushed to a
registry and no containers were started.
EOF
