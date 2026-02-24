import type { LlmScope } from './AiScopes'

const DEFAULT_LLM_MODEL = 'vicuna-7B-1.1-q4_0'

function readEnv(name: string): string | undefined {
  const env = (import.meta as ImportMeta).env as Record<string, unknown> | undefined
  if (!env) return undefined
  const value = env[name]
  if (typeof value !== 'string') return undefined
  const trimmed = value.trim()
  return trimmed.length > 0 ? trimmed : undefined
}

/**
 * Resolver modello LLM per scope testuali.
 * Priorita: VITE_AI_<SCOPE>_MODEL > VITE_AI_MODEL > default.
 */
export function resolveLlmModel(scope: LlmScope): string {
  return readEnv(`VITE_AI_${scope}_MODEL`) ?? readEnv('VITE_AI_MODEL') ?? DEFAULT_LLM_MODEL
}

export function getDefaultLlmModel(): string {
  return DEFAULT_LLM_MODEL
}
