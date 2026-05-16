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
    expect(script).toContain('docker compose \\')
    expect(script).toContain('--env-file "${ENV_FILE}" \\')
    expect(script).toContain('-f "${COMPOSE_FILE}" \\')
    expect(script).toContain('up -d --build server playwright web')
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
    expect(script).toContain('docker compose \\')
    expect(script).toContain('up -d --no-build server playwright web')
  })

  test('start script reports the runtime public URL with base path when configured', () => {
    const script = readRepoFile('../../../../../build/start-page-builder.sh')

    expect(script).toContain('BASE_PATH="$(awk -F= \'/^AI_PAGE_BUILDER_BASE_PATH=/{print $2}\' "${ENV_FILE}" | tail -n 1)"')
    expect(script).toContain('BASE_PATH="${BASE_PATH%/}"')
    expect(script).toContain('PUBLIC_URL="http://localhost:${PORT}${BASE_PATH}/"')
    expect(script).toContain('Page Builder is available at ${PUBLIC_URL}')
  })
})
