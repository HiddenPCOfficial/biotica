import type { LlmProviderConfig } from '../llm/LlmClient'

export type LlmProvider = 'ollama' | 'llamaCpp'

export type AiCoreConfig = {
  llm: {
    provider: LlmProvider
    baseUrl: string
    timeoutMs: number
    minIntervalMs: number
    cacheTtlMs: number
    cacheMaxEntries: number
    enableStreaming: boolean
  }
}

const DEFAULT_PROVIDER: LlmProvider = 'ollama'
const DEFAULT_BASE_URL: Record<LlmProvider, string> = {
  ollama: 'http://127.0.0.1:11434',
  llamaCpp: 'http://127.0.0.1:8080',
}

function readEnv(name: string): string | undefined {
  const env = (import.meta as ImportMeta).env as Record<string, unknown> | undefined
  if (!env) return undefined
  const value = env[name]
  if (typeof value !== 'string') return undefined
  const trimmed = value.trim()
  return trimmed.length > 0 ? trimmed : undefined
}

function readBoolean(name: string, fallback: boolean): boolean {
  const value = readEnv(name)
  if (!value) return fallback
  const normalized = value.toLowerCase()
  return normalized === '1' || normalized === 'true' || normalized === 'yes' || normalized === 'on'
}

function readNumber(name: string, fallback: number, min: number, max: number): number {
  const raw = readEnv(name)
  if (!raw) return fallback
  const parsed = Number(raw)
  if (!Number.isFinite(parsed)) return fallback
  if (parsed < min) return min
  if (parsed > max) return max
  return parsed
}

function normalizeProvider(value: string | undefined): LlmProvider {
  if (!value) return DEFAULT_PROVIDER
  const normalized = value.trim().toLowerCase()
  if (normalized === 'ollama') return 'ollama'
  if (normalized === 'llama.cpp' || normalized === 'llamacpp' || normalized === 'llama_cpp') {
    return 'llamaCpp'
  }
  return DEFAULT_PROVIDER
}

function normalizeBaseUrl(raw: string): string {
  return raw.replace(/\/+$/, '')
}

export function readAiCoreConfig(): AiCoreConfig {
  const provider = normalizeProvider(readEnv('VITE_AI_PROVIDER'))
  const baseUrl = normalizeBaseUrl(readEnv('VITE_AI_BASE_URL') ?? DEFAULT_BASE_URL[provider])

  return {
    llm: {
      provider,
      baseUrl,
      timeoutMs: Math.floor(readNumber('VITE_AI_TIMEOUT_MS', 30000, 1000, 120000)),
      minIntervalMs: Math.floor(readNumber('VITE_AI_MIN_INTERVAL_MS', 250, 0, 60000)),
      cacheTtlMs: Math.floor(readNumber('VITE_AI_CACHE_TTL_MS', 5 * 60 * 1000, 1000, 24 * 60 * 60 * 1000)),
      cacheMaxEntries: Math.floor(readNumber('VITE_AI_CACHE_MAX_ENTRIES', 512, 16, 5000)),
      enableStreaming: readBoolean('VITE_AI_STREAMING', false),
    },
  }
}

export function getLlmProviderConfig(config: AiCoreConfig = readAiCoreConfig()): LlmProviderConfig {
  return {
    provider: config.llm.provider,
    baseUrl: config.llm.baseUrl,
    timeoutMs: config.llm.timeoutMs,
  }
}
