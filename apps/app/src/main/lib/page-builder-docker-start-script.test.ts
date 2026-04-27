import { describe, expect, test } from 'bun:test'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

function readRepoFile(relativePath: string): string {
  return readFileSync(fileURLToPath(new URL(relativePath, import.meta.url)), 'utf-8')
}

describe('page-builder docker start script', () => {
  test('start script builds and starts the default page-builder services with build env defaults', () => {
    const script = readRepoFile('../../../../../build/start-page-builder.sh')

    expect(script).toContain('#!/usr/bin/env bash')
    expect(script).toContain('set -euo pipefail')
    expect(script).toContain('ENV_FILE="${SCRIPT_DIR}/.env"')
    expect(script).toContain('COMPOSE_FILE="${SCRIPT_DIR}/docker-compose.yml"')
    expect(script).toContain('docker compose version >/dev/null 2>&1')
    expect(script).toContain('build/.env is missing')
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
})
