export type AiProvider = 'ollama' | 'openai'

export type AiModelPurpose =
  | 'creatureDescription'
  | 'narrative'
  | 'worldGenesis'
  | 'itemCatalog'
  | 'chat'

export type AiModelConfig = {
  purpose: AiModelPurpose
  provider: AiProvider
  model: string
  baseUrl: string
  apiKey?: string
  temperature: number
  maxTokens: number
  timeoutMs: number
  minIntervalMs: number
}

export type AiModelOverrides = Partial<
  Pick<
    AiModelConfig,
    'provider' | 'model' | 'baseUrl' | 'apiKey' | 'temperature' | 'maxTokens' | 'timeoutMs' | 'minIntervalMs'
  >
>

type PurposeSpec = {
  envScope: string
  temperature: number
  maxTokens: number
  timeoutMs: number
  minIntervalMs: number
}

const DEFAULT_MODEL = 'TheBloke/vicuna-7B-1.1-q4_0'
const DEFAULT_PROVIDER: AiProvider = 'ollama'
const DEFAULT_BASE_URL_BY_PROVIDER: Record<AiProvider, string> = {
  ollama: 'http://127.0.0.1:11434',
  openai: 'http://127.0.0.1:8080/v1',
}

const PURPOSE_SPECS: Record<AiModelPurpose, PurposeSpec> = {
  creatureDescription: {
    envScope: 'CREATURE_DESCRIPTION',
    temperature: 0.2,
    maxTokens: 420,
    timeoutMs: 25000,
    minIntervalMs: 400,
  },
  narrative: {
    envScope: 'NARRATIVE',
    temperature: 0.2,
    maxTokens: 280,
    timeoutMs: 26000,
    minIntervalMs: 650,
  },
  worldGenesis: {
    envScope: 'WORLD_GENESIS',
    temperature: 0.2,
    maxTokens: 1600,
    timeoutMs: 40000,
    minIntervalMs: 500,
  },
  itemCatalog: {
    envScope: 'ITEM_CATALOG',
    temperature: 0,
    maxTokens: 1800,
    timeoutMs: 40000,
    minIntervalMs: 500,
  },
  chat: {
    envScope: 'CHAT',
    temperature: 0.1,
    maxTokens: 640,
    timeoutMs: 30000,
    minIntervalMs: 400,
  },
}

function readEnv(name: string): string | undefined {
  const env = (import.meta as ImportMeta).env as Record<string, unknown> | undefined
  if (!env) return undefined
  const value = env[name]
  if (typeof value !== 'string') return undefined
  const trimmed = value.trim()
  return trimmed.length > 0 ? trimmed : undefined
}

function normalizeProvider(value: unknown): AiProvider | undefined {
  if (typeof value !== 'string') return undefined
  const lowered = value.trim().toLowerCase()
  if (lowered === 'ollama') return 'ollama'
  if (lowered === 'openai') return 'openai'
  return undefined
}

function readNumber(value: string | undefined): number | undefined {
  if (!value) return undefined
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : undefined
}

function clampNumber(value: number, min: number, max: number): number {
  if (value < min) return min
  if (value > max) return max
  return value
}

function envScoped(scope: string, key: string): string {
  return `VITE_AI_${scope}_${key}`
}

/**
 * Registro centralizzato configurazioni modelli AI.
 * Priorita: overrides runtime > env scope-specific > env global > default statico.
 */
export function getAiModelConfig(
  purpose: AiModelPurpose,
  overrides: AiModelOverrides = {},
): AiModelConfig {
  const spec = PURPOSE_SPECS[purpose]

  const provider =
    overrides.provider ??
    normalizeProvider(readEnv(envScoped(spec.envScope, 'PROVIDER'))) ??
    normalizeProvider(readEnv('VITE_AI_PROVIDER')) ??
    DEFAULT_PROVIDER

  const model =
    overrides.model ??
    readEnv(envScoped(spec.envScope, 'MODEL')) ??
    readEnv('VITE_AI_MODEL') ??
    DEFAULT_MODEL

  const baseUrl =
    overrides.baseUrl ??
    readEnv(envScoped(spec.envScope, 'BASE_URL')) ??
    readEnv('VITE_AI_BASE_URL') ??
    DEFAULT_BASE_URL_BY_PROVIDER[provider]

  const apiKey =
    overrides.apiKey ??
    readEnv(envScoped(spec.envScope, 'API_KEY')) ??
    readEnv('VITE_AI_API_KEY')

  const temperature = clampNumber(
    overrides.temperature ??
      readNumber(readEnv(envScoped(spec.envScope, 'TEMPERATURE'))) ??
      readNumber(readEnv('VITE_AI_TEMPERATURE')) ??
      spec.temperature,
    0,
    2,
  )

  const maxTokens = Math.max(
    64,
    Math.floor(
      overrides.maxTokens ??
        readNumber(readEnv(envScoped(spec.envScope, 'MAX_TOKENS'))) ??
        readNumber(readEnv('VITE_AI_MAX_TOKENS')) ??
        spec.maxTokens,
    ),
  )

  const timeoutMs = Math.max(
    1000,
    Math.floor(
      overrides.timeoutMs ??
        readNumber(readEnv(envScoped(spec.envScope, 'TIMEOUT_MS'))) ??
        readNumber(readEnv('VITE_AI_TIMEOUT_MS')) ??
        spec.timeoutMs,
    ),
  )

  const minIntervalMs = Math.max(
    0,
    Math.floor(
      overrides.minIntervalMs ??
        readNumber(readEnv(envScoped(spec.envScope, 'MIN_INTERVAL_MS'))) ??
        readNumber(readEnv('VITE_AI_MIN_INTERVAL_MS')) ??
        spec.minIntervalMs,
    ),
  )

  return {
    purpose,
    provider,
    model,
    baseUrl,
    apiKey,
    temperature,
    maxTokens,
    timeoutMs,
    minIntervalMs,
  }
}

export function getAllAiModelConfigs(): Record<AiModelPurpose, AiModelConfig> {
  return {
    creatureDescription: getAiModelConfig('creatureDescription'),
    narrative: getAiModelConfig('narrative'),
    worldGenesis: getAiModelConfig('worldGenesis'),
    itemCatalog: getAiModelConfig('itemCatalog'),
    chat: getAiModelConfig('chat'),
  }
}
