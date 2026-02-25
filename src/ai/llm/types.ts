export type LlmRole = 'system' | 'user' | 'assistant'

export type LlmMessage = {
  role: LlmRole
  content: string
}
