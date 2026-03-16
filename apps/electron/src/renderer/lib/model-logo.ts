/**
 * 模型 Logo 解析工具
 *
 * 使用正则匹配模型 ID，未命中时再按 provider 回退。
 */

import DefaultLogo from '@/assets/models/default.png'
import ClaudeLogo from '@/assets/models/claude.png'
import OpenAILogo from '@/assets/models/openai.png'
import GPT4Logo from '@/assets/models/gpt_4.png'
import GPT35Logo from '@/assets/models/gpt_3.5.png'
import GPTo1Logo from '@/assets/models/gpt_o1.png'
import GPTImageLogo from '@/assets/models/gpt_image_1.png'
import GPT5Logo from '@/assets/models/gpt-5.png'
import GPT5ChatLogo from '@/assets/models/gpt-5-chat.png'
import GPT5MiniLogo from '@/assets/models/gpt-5-mini.png'
import GPT5NanoLogo from '@/assets/models/gpt-5-nano.png'
import GPT5CodexLogo from '@/assets/models/gpt-5-codex.png'
import GPT51Logo from '@/assets/models/gpt-5.1.png'
import GPT51ChatLogo from '@/assets/models/gpt-5.1-chat.png'
import GPT51CodexLogo from '@/assets/models/gpt-5.1-codex.png'
import GPT51CodexMiniLogo from '@/assets/models/gpt-5.1-codex-mini.png'
import DeepSeekLogo from '@/assets/models/deepseek.png'
import GeminiLogo from '@/assets/models/gemini.png'
import GemmaLogo from '@/assets/models/gemma.png'
import DeepGeminiLogo from '@/assets/models/deepgemini.png'
import KimiGeminiLogo from '@/assets/models/kimigemini.png'
import QwenGeminiLogo from '@/assets/models/qwengemini.png'
import SeedGeminiLogo from '@/assets/models/seedgemini.png'
import QwenLogo from '@/assets/models/qwen.png'
import GrokLogo from '@/assets/models/grok.png'
import MoonshotLogo from '@/assets/models/moonshot.png'
import DoubaoLogo from '@/assets/models/doubao.png'
import ZhipuLogo from '@/assets/models/zhipu.png'
import ChatGLMLogo from '@/assets/models/chatglm.png'
import LlamaLogo from '@/assets/models/llama.png'
import MistralLogo from '@/assets/models/mixtral.png'
import CodestralLogo from '@/assets/models/codestral.png'
import YiLogo from '@/assets/models/yi.png'
import HunyuanLogo from '@/assets/models/hunyuan.png'
import WenxinLogo from '@/assets/models/wenxin.png'
import SparkDeskLogo from '@/assets/models/sparkdesk.png'
import StepLogo from '@/assets/models/step.png'
import MiniMaxLogo from '@/assets/models/minimax.png'
import CohereLogo from '@/assets/models/cohere.png'
import EmbeddingLogo from '@/assets/models/embedding.png'
import type { ProviderType } from '@proma/shared'

const MODEL_LOGO_MAP: Record<string, string> = {
  'gpt-image': GPTImageLogo,
  'gpt-3': GPT35Logo,
  'gpt-4': GPT4Logo,
  o1: GPTo1Logo,
  o3: GPTo1Logo,
  o4: GPTo1Logo,
  'gpt-5-mini': GPT5MiniLogo,
  'gpt-5-nano': GPT5NanoLogo,
  'gpt-5-chat': GPT5ChatLogo,
  'gpt-5-codex': GPT5CodexLogo,
  'gpt-5\\.1-codex-mini': GPT51CodexMiniLogo,
  'gpt-5\\.1-codex': GPT51CodexLogo,
  'gpt-5\\.1-chat': GPT51ChatLogo,
  'gpt-5\\.1': GPT51Logo,
  'gpt-5': GPT5Logo,
  gpts: GPT4Logo,
  '(claude|anthropic-)': ClaudeLogo,
  deepseek: DeepSeekLogo,
  deepgemini: DeepGeminiLogo,
  kimigemini: KimiGeminiLogo,
  qwengemini: QwenGeminiLogo,
  seedgemini: SeedGeminiLogo,
  veo: GeminiLogo,
  gemma: GemmaLogo,
  gemini: GeminiLogo,
  '(qwen|qwq|qvq|wan-)': QwenLogo,
  grok: GrokLogo,
  moonshot: MoonshotLogo,
  kimi: MoonshotLogo,
  doubao: DoubaoLogo,
  'ep-202': DoubaoLogo,
  zhipu: ZhipuLogo,
  cogview: ZhipuLogo,
  glm: ChatGLMLogo,
  llama: LlamaLogo,
  codestral: CodestralLogo,
  mixtral: MistralLogo,
  mistral: MistralLogo,
  ministral: MistralLogo,
  magistral: MistralLogo,
  'yi-': YiLogo,
  'ernie-': WenxinLogo,
  'tao-': WenxinLogo,
  hunyuan: HunyuanLogo,
  sparkdesk: SparkDeskLogo,
  generalv: SparkDeskLogo,
  step: StepLogo,
  minimax: MiniMaxLogo,
  cohere: CohereLogo,
  command: CohereLogo,
  'text-embedding': EmbeddingLogo,
  embedding: EmbeddingLogo,
}

const PROVIDER_LOGO_MAP: Record<ProviderType, string> = {
  anthropic: ClaudeLogo,
  openai: OpenAILogo,
  deepseek: DeepSeekLogo,
  google: GeminiLogo,
  moonshot: MoonshotLogo,
  zhipu: ZhipuLogo,
  minimax: MiniMaxLogo,
  doubao: DoubaoLogo,
  qwen: QwenLogo,
  custom: DefaultLogo,
}

function resolveModelLogoById(modelId: string): string | undefined {
  if (!modelId) return undefined

  for (const [pattern, logo] of Object.entries(MODEL_LOGO_MAP)) {
    if (new RegExp(pattern, 'i').test(modelId)) {
      return logo
    }
  }

  return undefined
}

export function getModelLogo(modelId: string, provider?: ProviderType): string {
  return resolveModelLogoById(modelId)
    ?? (provider ? PROVIDER_LOGO_MAP[provider] : undefined)
    ?? DefaultLogo
}
