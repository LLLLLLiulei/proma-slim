import { describe, expect, test } from 'bun:test'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

function readRepoFile(relativePath: string): string {
  return readFileSync(fileURLToPath(new URL(relativePath, import.meta.url)), 'utf-8')
}

describe('page-builder docker start script', () => {
  test('start script builds and starts the default page-builder services with standalone env defaults', () => {
    const script = readRepoFile('../../../../../build/start-page-builder.sh')

    expect(script).toContain('#!/usr/bin/env bash')
    expect(script).toContain('set -euo pipefail')
    expect(script).toContain('ENV_FILE="${SCRIPT_DIR}/.env.standalone.example"')
    expect(script).toContain('COMPOSE_FILE="${SCRIPT_DIR}/docker-compose.yml"')
    expect(script).toContain('--env-file)')
    expect(script).toContain('--env-file=*)')
    expect(script).toContain('if [ -f "${REPO_ROOT}/${ENV_FILE}" ]; then')
    expect(script).toContain('ENV_FILE="${SCRIPT_DIR}/${ENV_FILE}"')
    expect(script).toContain('docker compose version >/dev/null 2>&1')
    expect(script).toContain('Use build/.env.standalone.example or build/.env.cms.example')
    expect(script).toContain('run_docker_compose \\')
    expect(script).toContain('--env-file "${ENV_FILE}" \\')
    expect(script).toContain('-f "${COMPOSE_FILE}" \\')
    expect(script).toContain('up -d --build server playwright web')
    expect(script).toContain('-u AI_PAGE_BUILDER_AI_PROVIDERS_CONFIG_FILE')
    expect(script).toContain('-u AI_PAGE_BUILDER_AGENT_MODELS_CONFIG_FILE')
  })

  test('start script supports prebuilding linux/amd64 images before compose startup', () => {
    const script = readRepoFile('../../../../../build/start-page-builder.sh')

    expect(script).toContain('PLATFORM=""')
    expect(script).toContain('--platform)')
    expect(script).toContain('docker buildx version >/dev/null 2>&1')
    expect(script).toContain('docker buildx build \\')
    expect(script).toContain('--platform "${PLATFORM}" \\')
    expect(script).toContain('--load \\')
    expect(script).toContain('--tag ai-page-builder-server \\')
    expect(script).toContain('--tag ai-page-builder-web \\')
    expect(script).toContain('run_docker_compose \\')
    expect(script).toContain('up -d --no-build server playwright web')
  })

  test('start script reports the runtime public URL with base path when configured', () => {
    const script = readRepoFile('../../../../../build/start-page-builder.sh')

    expect(script).toContain('BASE_PATH="$(awk -F= \'/^AI_PAGE_BUILDER_BASE_PATH=/{print $2}\' "${ENV_FILE}" | tail -n 1)"')
    expect(script).toContain('BASE_PATH="${BASE_PATH%/}"')
    expect(script).toContain('PUBLIC_URL="http://localhost:${PORT}${BASE_PATH}/"')
    expect(script).toContain('Page Builder is available at ${PUBLIC_URL}')
  })

  test('multi-arch build script loads timestamp and latest tags locally without publishing or starting services', () => {
    const script = readRepoFile('../../../../../build/build-page-builder-multiarch.sh')

    expect(script).toContain('#!/usr/bin/env bash')
    expect(script).toContain('set -euo pipefail')
    expect(script).toContain('PLATFORMS="linux/amd64"')
    expect(script).toContain('TAG="v$(date +%Y%m%d%H%M)"')
    expect(script).toContain('docker buildx version >/dev/null 2>&1')
    expect(script).toContain('IFS=\',\' read -r -a PLATFORM_LIST <<< "${PLATFORMS}"')
    expect(script).toContain('This local-load script only supports one platform per run')
    expect(script).toContain('--platform "${PLATFORM}"')
    expect(script).toContain('--load')
    expect(script).toContain('--file "${SCRIPT_DIR}/Dockerfile.page-builder-app"')
    expect(script).toContain('--file "${SCRIPT_DIR}/Dockerfile.page-builder-web"')
    expect(script).toContain('--tag "${IMAGE_PREFIX}/server:${TAG}"')
    expect(script).toContain('--tag "${IMAGE_PREFIX}/server:latest"')
    expect(script).toContain('--tag "${IMAGE_PREFIX}/web:${TAG}"')
    expect(script).toContain('--tag "${IMAGE_PREFIX}/web:latest"')
    expect(script).not.toContain('${TAG}-${SAFE_PLATFORM}')
    expect(script).not.toContain('--push')
    expect(script).not.toContain('type=oci')
    expect(script).not.toContain('docker compose')
    expect(script).not.toContain('up -d')
  })

  test('tencent registry push script tags and pushes server and web images without hardcoding the password', () => {
    const script = readRepoFile('../../../../../build/push-page-builder-tencent.sh')

    expect(script).toContain('#!/usr/bin/env bash')
    expect(script).toContain('set -euo pipefail')
    expect(script).toContain('REGISTRY="ccr.ccs.tencentyun.com"')
    expect(script).toContain('NAMESPACE="ai-page-builder"')
    expect(script).toContain('USERNAME="100029519653"')
    expect(script).toContain('docker login "${REGISTRY}" --username "${USERNAME}" --password-stdin')
    expect(script).toContain('SOURCE_SERVER_IMAGE="${SOURCE_PREFIX}/server:${TAG}"')
    expect(script).toContain('SOURCE_WEB_IMAGE="${SOURCE_PREFIX}/web:${TAG}"')
    expect(script).toContain('TARGET_SERVER_IMAGE="${REGISTRY}/${NAMESPACE}/page-builder-server:${TAG}"')
    expect(script).toContain('TARGET_WEB_IMAGE="${REGISTRY}/${NAMESPACE}/page-builder-web:${TAG}"')
    expect(script).toContain('docker tag "${SOURCE_SERVER_IMAGE}" "${TARGET_SERVER_IMAGE}"')
    expect(script).toContain('docker tag "${SOURCE_WEB_IMAGE}" "${TARGET_WEB_IMAGE}"')
    expect(script).toContain('docker push "${TARGET_SERVER_IMAGE}"')
    expect(script).toContain('docker push "${TARGET_WEB_IMAGE}"')
    expect(script).not.toContain('--password=')
    expect(script).not.toMatch(/--password\s+/)
  })
})
