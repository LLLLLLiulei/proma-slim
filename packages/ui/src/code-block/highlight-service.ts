import { createHighlighter, bundledLanguages } from 'shiki'
import type { HighlighterGeneric, BundledLanguage, BundledTheme } from 'shiki'

type ShikiHighlighter = HighlighterGeneric<BundledLanguage, BundledTheme>

const DEFAULT_LANGS: BundledLanguage[] = [
  'javascript', 'typescript', 'python', 'java', 'json',
  'markdown', 'html', 'css', 'shellscript', 'go', 'rust', 'sql',
  'tsx', 'jsx', 'yaml', 'toml', 'c', 'cpp',
]

const DEFAULT_THEMES: BundledTheme[] = ['github-light', 'github-dark']

const LANGUAGE_ALIASES: Record<string, string> = {
  sh: 'shellscript',
  bash: 'shellscript',
  shell: 'shellscript',
  zsh: 'shellscript',
  js: 'javascript',
  ts: 'typescript',
  py: 'python',
  rb: 'ruby',
  yml: 'yaml',
  'c++': 'cpp',
  'c#': 'csharp',
  cs: 'csharp',
  kt: 'kotlin',
  rs: 'rust',
  md: 'markdown',
  tf: 'terraform',
  dockerfile: 'docker',
  plaintext: 'text',
  txt: 'text',
  plain: 'text',
}

export interface HighlightOptions {
  code: string
  language: string
  theme?: string
}

export interface HighlightResult {
  html: string
  language: string
}

export interface HighlightToken {
  content: string
  color?: string
}

export interface HighlightTokensResult {
  lines: HighlightToken[][]
  bgColor: string
  fgColor: string
  language: string
}

let highlighterPromise: Promise<ShikiHighlighter> | null = null
let cachedHighlighter: ShikiHighlighter | null = null

function getHighlighter(): Promise<ShikiHighlighter> {
  if (!highlighterPromise) {
    highlighterPromise = createHighlighter({
      themes: DEFAULT_THEMES,
      langs: DEFAULT_LANGS,
    }).then((hl: ShikiHighlighter) => {
      cachedHighlighter = hl
      return hl
    })
  }
  return highlighterPromise as Promise<ShikiHighlighter>
}

function resolveLanguage(lang: string): string {
  const normalized = lang.toLowerCase().trim()
  const resolved = LANGUAGE_ALIASES[normalized] ?? normalized

  if (resolved === 'text') return 'text'
  if (resolved in bundledLanguages) return resolved
  return 'text'
}

function resolveLoadedLanguage(highlighter: ShikiHighlighter, lang: string): string {
  const resolved = resolveLanguage(lang)
  if (resolved === 'text') return 'text'
  return highlighter.getLoadedLanguages().includes(resolved) ? resolved : 'text'
}

async function resolveAndLoadLanguage(highlighter: ShikiHighlighter, lang: string): Promise<string> {
  const resolved = resolveLanguage(lang)

  if (resolved === 'text') return 'text'
  if (highlighter.getLoadedLanguages().includes(resolved)) return resolved

  try {
    await highlighter.loadLanguage(resolved as BundledLanguage)
    return resolved
  } catch {
    console.warn(`[highlight-service] 加载语言 "${resolved}" 失败，回退到 text`)
    return 'text'
  }
}

export async function highlightCode(options: HighlightOptions): Promise<HighlightResult> {
  const { code, language, theme = 'github-dark' } = options

  const highlighter = await getHighlighter()
  const resolvedLang = await resolveAndLoadLanguage(highlighter, language)

  const html = highlighter.codeToHtml(code, {
    lang: resolvedLang as BundledLanguage,
    theme: theme as BundledTheme,
  })

  return { html, language: resolvedLang }
}

export function highlightCodeSync(options: HighlightOptions): HighlightResult | null {
  if (!cachedHighlighter) return null

  const { code, language, theme = 'github-dark' } = options
  const lang = resolveLoadedLanguage(cachedHighlighter, language)

  const html = cachedHighlighter.codeToHtml(code, {
    lang: lang as BundledLanguage,
    theme: theme as BundledTheme,
  })

  return { html, language: lang }
}

export function highlightToTokens(options: HighlightOptions): HighlightTokensResult | null {
  if (!cachedHighlighter) return null

  const { code, language, theme = 'github-dark' } = options
  const lang = resolveLoadedLanguage(cachedHighlighter, language)

  const result = cachedHighlighter.codeToTokens(code, {
    lang: lang as BundledLanguage,
    theme: theme as BundledTheme,
  })

  return {
    lines: result.tokens.map((line: Array<{ content: string; color?: string }>) =>
      line.map((token: { content: string; color?: string }) => ({ content: token.content, color: token.color }))
    ),
    bgColor: result.bg ?? '#24292e',
    fgColor: result.fg ?? '#e1e4e8',
    language: lang,
  }
}
