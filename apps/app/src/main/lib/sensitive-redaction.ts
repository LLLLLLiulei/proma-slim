const REDACTED_SECRET = '[REDACTED_SECRET]'
const REDACTED_AUTHORIZATION = 'Authorization: [REDACTED]'
const REDACTED_BASE_URL = '[REDACTED_BASE_URL]'

export function redactSensitiveText(input: string): string {
  return input
    .replace(/\bAuthorization\s*[:=]\s*(?:Bearer\s+)?[^\s"',;)}]+/gi, REDACTED_AUTHORIZATION)
    .replace(/\bBearer\s+[A-Za-z0-9._~+/=-]{8,}/gi, 'Bearer [REDACTED]')
    .replace(/\b(apiKey|authToken|x-api-key|ANTHROPIC_API_KEY|ANTHROPIC_AUTH_TOKEN)\s*[:=]\s*(["']?)[^\s"',;)}]+/gi, (_match, key: string, quote: string) => `${key}=${quote}${REDACTED_SECRET}`)
    .replace(/\bsk-[A-Za-z0-9._~+/=-]{6,}/g, REDACTED_SECRET)
    .replace(/\b(ANTHROPIC_BASE_URL|baseUrl)\s*[:=]\s*(["']?)https?:\/\/[^\s"',;)}]+/gi, (_match, key: string, quote: string) => `${key}=${quote}${REDACTED_BASE_URL}`)
    .replace(/https?:\/\/[^\s"',;)}]*\/anthropic\b[^\s"',;)}]*/gi, REDACTED_BASE_URL)
}

