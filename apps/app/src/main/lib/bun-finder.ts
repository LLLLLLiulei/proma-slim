/**
 * Bun 运行时路径检测模块
 *
 * 纯 Web 版本只支持：
 * - 系统 PATH 中的 Bun
 * - 项目 vendor 目录中的 Bun（可选）
 */

import { execSync, spawnSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import type { BunRuntimeStatus, PlatformArch } from '@ai-page-builder/shared'

function getVendorRoot(): string {
  return new URL('../../../vendor/bun/', import.meta.url).pathname
}

export function getCurrentPlatformArch(): PlatformArch {
  const platform = process.platform as 'darwin' | 'linux' | 'win32'
  const arch = process.arch as 'arm64' | 'x64'
  const platformArch = `${platform}-${arch}` as PlatformArch

  const supportedCombinations: PlatformArch[] = [
    'darwin-arm64',
    'darwin-x64',
    'linux-arm64',
    'linux-x64',
    'win32-x64',
  ]

  if (!supportedCombinations.includes(platformArch)) {
    throw new Error(`不支持的平台架构组合: ${platformArch}`)
  }

  return platformArch
}

function getBunBinaryName(): string {
  return process.platform === 'win32' ? 'bun.exe' : 'bun'
}

export function getBundledBunPath(): string | null {
  const bundledDir = process.env.PROMA_BUNDLED_BUN_DIR?.trim()
  if (!bundledDir) return null

  const bunPath = join(bundledDir, getBunBinaryName())
  return existsSync(bunPath) ? bunPath : null
}

export function getVendorBunPath(): string | null {
  try {
    const platformArch = getCurrentPlatformArch()
    const bunPath = join(getVendorRoot(), platformArch, getBunBinaryName())
    return existsSync(bunPath) ? bunPath : null
  } catch {
    return null
  }
}

export function getSystemBunPath(): string | null {
  try {
    const command = process.platform === 'win32' ? 'where bun' : 'which bun'
    const result = execSync(command, {
      encoding: 'utf-8',
      stdio: ['pipe', 'pipe', 'pipe'],
      timeout: 5000,
    })

    const bunPath = result.trim().split('\n')[0]
    return bunPath && existsSync(bunPath) ? bunPath : null
  } catch {
    return null
  }
}

export function validateBunExecutable(bunPath: string): string | null {
  if (!existsSync(bunPath)) return null

  try {
    const result = spawnSync(bunPath, ['--version'], {
      encoding: 'utf-8',
      timeout: 5000,
      stdio: ['pipe', 'pipe', 'pipe'],
    })

    return result.status === 0 && result.stdout ? result.stdout.trim() : null
  } catch {
    return null
  }
}

export async function detectBunRuntime(): Promise<BunRuntimeStatus> {
  console.log('[Bun 检测] 开始检测 Bun 运行时...')

  const candidates = [
    { source: 'bundled' as const, path: getBundledBunPath() },
    { source: 'system' as const, path: getSystemBunPath() },
    { source: 'vendor' as const, path: getVendorBunPath() },
  ]

  for (const candidate of candidates) {
    if (!candidate.path) continue

    const version = validateBunExecutable(candidate.path)
    if (!version) continue

    console.log(`[Bun 检测] 找到 ${candidate.source} Bun: ${candidate.path} (${version})`)
    return {
      available: true,
      path: candidate.path,
      version,
      source: candidate.source,
      error: null,
    }
  }

  return {
    available: false,
    path: null,
    version: null,
    source: null,
    error: '未找到可用的 Bun 运行时，请先安装 Bun',
  }
}
