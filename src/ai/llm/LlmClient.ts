export type LlmProvider = 'ollama' | 'llamaCpp' | 'openai'

export type LlmProviderConfig = {
  provider: LlmProvider
  baseUrl: string
  apiKey?: string
  timeoutMs: number
}

export type LlmMessage = {
  role: 'system' | 'user' | 'assistant'
  content: string
}

export type LlmCompletionRequest = {
  model: string
  messages: readonly LlmMessage[]
  temperature: number
  maxTokens: number
  jsonMode?: boolean
  stream?: boolean
  onToken?: (token: string) => void
}

function normalizeBaseUrl(raw: string): string {
  return raw.replace(/\/+$/, '')
}

function openAiEndpoint(baseUrl: string): string {
  return /\/v1$/i.test(baseUrl) ? `${baseUrl}/chat/completions` : `${baseUrl}/v1/chat/completions`
}

function extractOpenAiText(payload: unknown): string {
  if (!payload || typeof payload !== 'object') {
    return ''
  }
  const root = payload as Record<string, unknown>
  const choices = Array.isArray(root.choices) ? root.choices : []
  const first = choices[0]
  if (!first || typeof first !== 'object') {
    return ''
  }
  const message = (first as Record<string, unknown>).message
  if (!message || typeof message !== 'object') {
    return ''
  }
  const content = (message as Record<string, unknown>).content
  if (typeof content === 'string') {
    return content
  }
  if (Array.isArray(content)) {
    const parts: string[] = []
    for (let i = 0; i < content.length; i++) {
      const item = content[i]
      if (!item || typeof item !== 'object') continue
      const text = (item as Record<string, unknown>).text
      if (typeof text === 'string') {
        parts.push(text)
      }
    }
    return parts.join('\n')
  }
  return ''
}

function extractOllamaText(payload: unknown): string {
  if (!payload || typeof payload !== 'object') {
    return ''
  }
  const root = payload as Record<string, unknown>
  const message = root.message
  if (message && typeof message === 'object') {
    const content = (message as Record<string, unknown>).content
    if (typeof content === 'string') {
      return content
    }
  }
  if (typeof root.response === 'string') {
    return root.response
  }
  return ''
}

function parseSseData(buffer: string): { chunks: string[]; rest: string } {
  const chunks: string[] = []
  let start = 0
  while (true) {
    const idx = buffer.indexOf('\n\n', start)
    if (idx === -1) break
    const block = buffer.slice(start, idx)
    start = idx + 2
    const lines = block.split(/\r?\n/)
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i]
      if (!line) continue
      if (!line.startsWith('data:')) continue
      const payload = line.slice(5).trim()
      if (!payload || payload === '[DONE]') continue
      chunks.push(payload)
    }
  }
  return {
    chunks,
    rest: buffer.slice(start),
  }
}

function decodeOpenAiDelta(payload: string): string {
  try {
    const parsed = JSON.parse(payload) as Record<string, unknown>
    const choices = Array.isArray(parsed.choices) ? parsed.choices : []
    const first = choices[0]
    if (!first || typeof first !== 'object') return ''
    const delta = (first as Record<string, unknown>).delta
    if (!delta || typeof delta !== 'object') return ''
    const content = (delta as Record<string, unknown>).content
    return typeof content === 'string' ? content : ''
  } catch {
    return ''
  }
}

function decodeOllamaChunk(payload: string): string {
  try {
    const parsed = JSON.parse(payload) as Record<string, unknown>
    const message = parsed.message
    if (message && typeof message === 'object') {
      const content = (message as Record<string, unknown>).content
      return typeof content === 'string' ? content : ''
    }
    const response = parsed.response
    return typeof response === 'string' ? response : ''
  } catch {
    return ''
  }
}

function isAbortLikeError(error: unknown): boolean {
  if (error instanceof DOMException) {
    return error.name === 'AbortError'
  }
  if (!error || typeof error !== 'object') {
    return false
  }
  const rec = error as Record<string, unknown>
  if (rec.name === 'AbortError') {
    return true
  }
  const message = typeof rec.message === 'string' ? rec.message.toLowerCase() : ''
  return message.includes('abort')
}

function timeoutError(provider: string, timeoutMs: number): Error {
  return new Error(`${provider} timeout after ${timeoutMs}ms (request aborted)`)
}

/**
 * Client LLM locale (Ollama o llama.cpp server) con supporto opzionale streaming.
 */
export class LlmClient {
  constructor(private readonly providerConfig: LlmProviderConfig) {}

  getProvider(): LlmProvider {
    return this.providerConfig.provider
  }

  getBaseUrl(): string {
    return this.providerConfig.baseUrl
  }

  async complete(request: LlmCompletionRequest): Promise<string> {
    if (request.stream && request.onToken) {
      return this.stream(request)
    }

    if (this.providerConfig.provider === 'ollama') {
      return this.completeWithOllama(request)
    }
    return this.completeWithOpenAiCompatible(request)
  }

  async stream(request: LlmCompletionRequest): Promise<string> {
    if (this.providerConfig.provider === 'ollama') {
      return this.streamWithOllama(request)
    }
    return this.streamWithOpenAiCompatible(request)
  }

  private ensureOpenAiApiKeyIfNeeded(): void {
    if (this.providerConfig.provider !== 'openai') {
      return
    }
    if (this.providerConfig.apiKey && this.providerConfig.apiKey.trim().length > 0) {
      return
    }
    throw new Error('openai provider selected but VITE_AI_API_KEY is missing')
  }

  private openAiHeaders(): Record<string, string> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    }
    const apiKey = this.providerConfig.apiKey?.trim()
    if (apiKey) {
      headers.Authorization = `Bearer ${apiKey}`
    }
    return headers
  }

  private openAiProviderLabel(): string {
    return this.providerConfig.provider === 'openai' ? 'openai' : 'llama.cpp'
  }

  private async completeWithOpenAiCompatible(request: LlmCompletionRequest): Promise<string> {
    const baseUrl = normalizeBaseUrl(this.providerConfig.baseUrl)
    this.ensureOpenAiApiKeyIfNeeded()
    const endpoint = openAiEndpoint(baseUrl)
    const providerLabel = this.openAiProviderLabel()
    const controller = new AbortController()
    const timeoutMs = Math.max(1000, this.providerConfig.timeoutMs)
    const timeout = setTimeout(() => controller.abort(`timeout:${timeoutMs}`), timeoutMs)

    try {
      let response: Response
      try {
        response = await fetch(endpoint, {
          method: 'POST',
          headers: this.openAiHeaders(),
          body: JSON.stringify({
            model: request.model,
            messages: request.messages,
            temperature: request.temperature,
            max_tokens: request.maxTokens,
            stream: false,
            ...(request.jsonMode ? { response_format: { type: 'json_object' } } : {}),
          }),
          signal: controller.signal,
        })
      } catch (error) {
        if (controller.signal.aborted || isAbortLikeError(error)) {
          throw timeoutError(providerLabel, timeoutMs)
        }
        throw error
      }

      if (!response.ok) {
        const err = await response.text().catch(() => '')
        throw new Error(`${providerLabel} http ${response.status}: ${err.slice(0, 320)}`)
      }

      const payload = (await response.json()) as unknown
      const text = extractOpenAiText(payload).trim()
      if (!text) {
        throw new Error(`${providerLabel} response missing message content`)
      }
      return text
    } finally {
      clearTimeout(timeout)
    }
  }

  private async completeWithOllama(request: LlmCompletionRequest): Promise<string> {
    const baseUrl = normalizeBaseUrl(this.providerConfig.baseUrl)
    const controller = new AbortController()
    const timeoutMs = Math.max(1000, this.providerConfig.timeoutMs)
    const timeout = setTimeout(() => controller.abort(`timeout:${timeoutMs}`), timeoutMs)

    try {
      let response: Response
      try {
        response = await fetch(`${baseUrl}/api/chat`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            model: request.model,
            messages: request.messages,
            stream: false,
            ...(request.jsonMode ? { format: 'json' } : {}),
            options: {
              temperature: request.temperature,
              num_predict: request.maxTokens,
            },
          }),
          signal: controller.signal,
        })
      } catch (error) {
        if (controller.signal.aborted || isAbortLikeError(error)) {
          throw timeoutError('ollama', timeoutMs)
        }
        throw error
      }

      if (!response.ok) {
        const err = await response.text().catch(() => '')
        throw new Error(`ollama http ${response.status}: ${err.slice(0, 320)}`)
      }

      const payload = (await response.json()) as unknown
      const text = extractOllamaText(payload).trim()
      if (!text) {
        throw new Error('ollama response missing message content')
      }
      return text
    } finally {
      clearTimeout(timeout)
    }
  }

  private async streamWithOpenAiCompatible(request: LlmCompletionRequest): Promise<string> {
    const baseUrl = normalizeBaseUrl(this.providerConfig.baseUrl)
    this.ensureOpenAiApiKeyIfNeeded()
    const endpoint = openAiEndpoint(baseUrl)
    const providerLabel = this.openAiProviderLabel()
    const controller = new AbortController()
    const timeoutMs = Math.max(1000, this.providerConfig.timeoutMs)
    const timeout = setTimeout(() => controller.abort(`timeout:${timeoutMs}`), timeoutMs)
    const onToken = request.onToken ?? (() => undefined)

    try {
      let response: Response
      try {
        response = await fetch(endpoint, {
          method: 'POST',
          headers: this.openAiHeaders(),
          body: JSON.stringify({
            model: request.model,
            messages: request.messages,
            temperature: request.temperature,
            max_tokens: request.maxTokens,
            stream: true,
            ...(request.jsonMode ? { response_format: { type: 'json_object' } } : {}),
          }),
          signal: controller.signal,
        })
      } catch (error) {
        if (controller.signal.aborted || isAbortLikeError(error)) {
          throw timeoutError(`${providerLabel} stream`, timeoutMs)
        }
        throw error
      }

      if (!response.ok || !response.body) {
        const err = await response.text().catch(() => '')
        throw new Error(`${providerLabel} stream http ${response.status}: ${err.slice(0, 320)}`)
      }

      const reader = response.body.getReader()
      const decoder = new TextDecoder()
      let text = ''
      let buffer = ''

      while (true) {
        const chunk = await reader.read()
        if (chunk.done) break
        buffer += decoder.decode(chunk.value, { stream: true })
        const parsed = parseSseData(buffer)
        buffer = parsed.rest

        for (let i = 0; i < parsed.chunks.length; i++) {
          const delta = decodeOpenAiDelta(parsed.chunks[i]!)
          if (!delta) continue
          text += delta
          onToken(delta)
        }
      }

      if (!text.trim()) {
        throw new Error(`${providerLabel} stream produced empty text`)
      }

      return text
    } finally {
      clearTimeout(timeout)
    }
  }

  private async streamWithOllama(request: LlmCompletionRequest): Promise<string> {
    const baseUrl = normalizeBaseUrl(this.providerConfig.baseUrl)
    const controller = new AbortController()
    const timeoutMs = Math.max(1000, this.providerConfig.timeoutMs)
    const timeout = setTimeout(() => controller.abort(`timeout:${timeoutMs}`), timeoutMs)
    const onToken = request.onToken ?? (() => undefined)

    try {
      let response: Response
      try {
        response = await fetch(`${baseUrl}/api/chat`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            model: request.model,
            messages: request.messages,
            stream: true,
            ...(request.jsonMode ? { format: 'json' } : {}),
            options: {
              temperature: request.temperature,
              num_predict: request.maxTokens,
            },
          }),
          signal: controller.signal,
        })
      } catch (error) {
        if (controller.signal.aborted || isAbortLikeError(error)) {
          throw timeoutError('ollama stream', timeoutMs)
        }
        throw error
      }

      if (!response.ok || !response.body) {
        const err = await response.text().catch(() => '')
        throw new Error(`ollama stream http ${response.status}: ${err.slice(0, 320)}`)
      }

      const reader = response.body.getReader()
      const decoder = new TextDecoder()
      let text = ''
      let buffer = ''

      while (true) {
        const chunk = await reader.read()
        if (chunk.done) break
        buffer += decoder.decode(chunk.value, { stream: true })

        const lines = buffer.split(/\r?\n/)
        buffer = lines.pop() ?? ''
        for (let i = 0; i < lines.length; i++) {
          const line = lines[i]?.trim()
          if (!line) continue
          const delta = decodeOllamaChunk(line)
          if (!delta) continue
          text += delta
          onToken(delta)
        }
      }

      if (!text.trim()) {
        throw new Error('ollama stream produced empty text')
      }

      return text
    } finally {
      clearTimeout(timeout)
    }
  }
}
