export const LLM_SCOPES = ['CHAT', 'CREATURE_DESCRIPTION', 'NARRATIVE'] as const

export type LlmScope = (typeof LLM_SCOPES)[number]

export function isLlmScope(value: string): value is LlmScope {
  return (LLM_SCOPES as readonly string[]).includes(value)
}
