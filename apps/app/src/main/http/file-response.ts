import { createReadStream } from 'node:fs'
import { extname } from 'node:path'
import { Readable } from 'node:stream'

const CONTENT_TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.txt': 'text/plain; charset=utf-8',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.zip': 'application/zip',
  '.mp3': 'audio/mpeg',
  '.mp4': 'video/mp4',
  '.pdf': 'application/pdf',
}

function resolveContentType(filePath: string): string | null {
  return CONTENT_TYPES[extname(filePath).toLowerCase()] ?? null
}

export function createFileResponse(
  filePath: string,
  init?: ResponseInit,
): Response {
  const headers = new Headers(init?.headers)
  const contentType = resolveContentType(filePath)

  if (contentType && !headers.has('content-type')) {
    headers.set('content-type', contentType)
  }

  return new Response(
    Readable.toWeb(createReadStream(filePath)) as unknown as ReadableStream<Uint8Array>,
    {
      ...init,
      headers,
    },
  )
}
