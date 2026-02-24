import type { ToolCallResult, ToolRouter } from './tools/ToolRouter'
import type { AiToolName } from './tools/tools'
import { AI_TOOL_DEFINITIONS } from './tools/tools'
import { getAiModelConfig, type AiModelConfig, type AiProvider } from './AiModelRegistry'

type ChatRole = 'system' | 'user' | 'assistant'

type ChatMessage = {
  role: ChatRole
  content: string
}

const ALLOWED_REFERENCE_TYPES = new Set([
  'species',
  'creature',
  'civilization',
  'event',
  'era',
  'note',
  'ethnicity',
  'religion',
])

function hashText(value: string): string {
  let h = 2166136261
  for (let i = 0; i < value.length; i++) {
    h ^= value.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return (h >>> 0).toString(16)
}

function clampInt(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, Math.floor(value)))
}

function toLowerSafe(value: unknown): string {
  return typeof value === 'string' ? value.trim().toLowerCase() : ''
}

function extractJson(raw: string): string {
  const start = raw.indexOf('{')
  const end = raw.lastIndexOf('}')
  if (start === -1 || end === -1 || end <= start) {
    throw new Error('JSON object not found in LLM output')
  }
  return raw.slice(start, end + 1)
}

function normalizeToolName(value: unknown): AiToolName | null {
  const raw = typeof value === 'string' ? value.trim() : ''
  if (!raw) return null
  for (let i = 0; i < AI_TOOL_DEFINITIONS.length; i++) {
    const def = AI_TOOL_DEFINITIONS[i]
    if (!def) continue
    if (def.name === raw) {
      return def.name
    }
  }
  return null
}

function compactJson(value: unknown, maxLen = 2200): string {
  const text = JSON.stringify(value)
  if (!text) return '{}'
  if (text.length <= maxLen) return text
  return `${text.slice(0, maxLen)}...`
}

function formatToolsForPrompt(): string {
  return AI_TOOL_DEFINITIONS.map((def) => {
    return `- ${def.name}: ${def.description}; input=${JSON.stringify(def.inputSchema)}`
  }).join('\n')
}

function normalizeBaseUrl(raw: string): string {
  return raw.replace(/\/+$/, '')
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

export type AiChatReference = {
  type: string
  id: string
  label: string
}

export type AiChatResult = {
  answer: string
  references: AiChatReference[]
  suggested_questions: string[]
  toolCalls: Array<{
    tool: AiToolName
    input: Record<string, unknown>
    ok: boolean
  }>
  cacheKey: string
}

export type AiChatHistoryMessage = {
  role: 'user' | 'assistant'
  text: string
}

export type AiChatSelectionContext = {
  type: 'species' | 'creature' | 'civilization' | 'event' | 'era' | 'note' | 'ethnicity' | 'religion'
  id: string
  label: string
}

export type AiChatRequest = {
  question: string
  mode: 'default' | 'explain'
  history: readonly AiChatHistoryMessage[]
  worldPackText: string
  worldPackHash: string
  followSelection: boolean
  selection?: AiChatSelectionContext | null
}

type StepOutput =
  | {
      kind: 'tool'
      tool: AiToolName
      input: Record<string, unknown>
      reason: string
    }
  | {
      kind: 'final'
      answer: string
      references: AiChatReference[]
      suggested_questions: string[]
    }

type ToolObservation = {
  tool: AiToolName
  input: Record<string, unknown>
  result: ToolCallResult
}

/**
 * Servizio Q&A AI locale read-only:
 * - tool calling via ReAct JSON loop
 * - max 1 richiesta concorrente
 * - cache su domanda + contesto snapshot
 */
export class AiChatService {
  private readonly modelConfig: AiModelConfig
  private queue: Promise<void> = Promise.resolve()
  private nextAllowedAt = 0

  private activeRequestKey: string | null = null
  private activePromise: Promise<AiChatResult> | null = null

  private readonly requestToCacheKey = new Map<string, string>()
  private readonly cache = new Map<string, AiChatResult>()

  constructor(
    private readonly toolRouter: ToolRouter,
    private readonly options: {
      provider?: AiProvider
      model?: string
      baseUrl?: string
      apiKey?: string
      minIntervalMs?: number
      maxToolCalls?: number
      maxSteps?: number
      maxHistory?: number
      timeoutMs?: number
    } = {},
  ) {
    this.modelConfig = getAiModelConfig('chat', {
      provider: this.options.provider,
      model: this.options.model,
      baseUrl: this.options.baseUrl,
      apiKey: this.options.apiKey,
      minIntervalMs: this.options.minIntervalMs,
      timeoutMs: this.options.timeoutMs,
    })
  }

  async ask(request: AiChatRequest): Promise<AiChatResult> {
    const normalizedRequest = {
      question: request.question.trim(),
      mode: request.mode,
      history: request.history.slice(-Math.max(2, this.options.maxHistory ?? 10)),
      worldPackHash: request.worldPackHash,
      followSelection: request.followSelection,
      selection: request.followSelection ? request.selection ?? null : null,
    }

    const requestKey = hashText(JSON.stringify(normalizedRequest))
    const cachedKey = this.requestToCacheKey.get(requestKey)
    if (cachedKey) {
      const cached = this.cache.get(cachedKey)
      if (cached) {
        return {
          ...cached,
          references: cached.references.map((ref) => ({ ...ref })),
          suggested_questions: [...cached.suggested_questions],
          toolCalls: cached.toolCalls.map((call) => ({
            tool: call.tool,
            input: { ...call.input },
            ok: call.ok,
          })),
        }
      }
    }

    if (this.activeRequestKey === requestKey && this.activePromise) {
      return this.activePromise
    }

    const execution = this.runQueued(() => this.executeRequest(request, requestKey))
    this.activeRequestKey = requestKey
    this.activePromise = execution

    execution.finally(() => {
      if (this.activePromise === execution) {
        this.activePromise = null
        this.activeRequestKey = null
      }
    })

    return execution
  }

  getProvider(): AiProvider {
    return this.modelConfig.provider
  }

  private async executeRequest(request: AiChatRequest, requestKey: string): Promise<AiChatResult> {
    const maxToolCalls = clampInt(this.options.maxToolCalls ?? 3, 1, 5)
    const maxSteps = clampInt(this.options.maxSteps ?? 4, 2, 8)

    const observations: ToolObservation[] = []
    const toolCalls: AiChatResult['toolCalls'] = []

    // Se follow-selection e' attivo, preleva subito dettaglio entita selezionata.
    if (request.followSelection && request.selection) {
      const initial = await this.buildSelectionObservation(request.selection)
      if (initial) {
        observations.push(initial)
        toolCalls.push({
          tool: initial.tool,
          input: { ...initial.input },
          ok: initial.result.ok,
        })
      }
    }

    try {
      for (let step = 0; step < maxSteps; step++) {
        const output = await this.generateStepOutput(request, observations, step, maxToolCalls)
        if (output.kind === 'final') {
          const finalResult: AiChatResult = {
            answer: output.answer,
            references: output.references,
            suggested_questions: output.suggested_questions,
            toolCalls,
            cacheKey: '',
          }
          const toolsSignature = hashText(
            JSON.stringify(
              observations.map((item) => ({
                tool: item.tool,
                input: item.input,
                ok: item.result.ok,
                data: item.result.ok ? item.result.data : item.result.error,
              })),
            ),
          )
          const cacheKey = `${requestKey}:${toolsSignature}`
          finalResult.cacheKey = cacheKey
          this.cache.set(cacheKey, {
            ...finalResult,
            references: finalResult.references.map((ref) => ({ ...ref })),
            suggested_questions: [...finalResult.suggested_questions],
            toolCalls: finalResult.toolCalls.map((call) => ({
              tool: call.tool,
              input: { ...call.input },
              ok: call.ok,
            })),
          })
          this.requestToCacheKey.set(requestKey, cacheKey)
          return finalResult
        }

        if (toolCalls.length >= maxToolCalls) {
          observations.push({
            tool: output.tool,
            input: output.input,
            result: {
              ok: false,
              tool: output.tool,
              data: null,
              error: `tool budget exceeded (${maxToolCalls})`,
            },
          })
          continue
        }

        const toolResult = await this.toolRouter.callTool(output.tool, output.input)
        observations.push({
          tool: output.tool,
          input: output.input,
          result: toolResult,
        })
        toolCalls.push({
          tool: output.tool,
          input: { ...output.input },
          ok: toolResult.ok,
        })
      }
    } catch (error) {
      observations.push({
        tool: 'getWorldSummary',
        input: {},
        result: {
          ok: false,
          tool: 'getWorldSummary',
          data: null,
          error: error instanceof Error ? error.message : 'ai_loop_failed',
        },
      })
    }

    const fallback = this.fallbackFinal(request, observations, toolCalls)
    const fallbackKey = `${requestKey}:${hashText(JSON.stringify(fallback))}`
    fallback.cacheKey = fallbackKey
    this.cache.set(fallbackKey, {
      ...fallback,
      references: fallback.references.map((ref) => ({ ...ref })),
      suggested_questions: [...fallback.suggested_questions],
      toolCalls: fallback.toolCalls.map((call) => ({
        tool: call.tool,
        input: { ...call.input },
        ok: call.ok,
      })),
    })
    this.requestToCacheKey.set(requestKey, fallbackKey)
    return fallback
  }

  private async buildSelectionObservation(
    selection: AiChatSelectionContext,
  ): Promise<ToolObservation | null> {
    switch (selection.type) {
      case 'species': {
        return {
          tool: 'getSpecies',
          input: { speciesId: selection.id },
          result: await this.toolRouter.callTool('getSpecies', { speciesId: selection.id }),
        }
      }
      case 'creature': {
        return {
          tool: 'getCreature',
          input: { creatureId: selection.id },
          result: await this.toolRouter.callTool('getCreature', { creatureId: selection.id }),
        }
      }
      case 'civilization': {
        return {
          tool: 'getCiv',
          input: { civId: selection.id },
          result: await this.toolRouter.callTool('getCiv', { civId: selection.id }),
        }
      }
      case 'event': {
        return {
          tool: 'getEvent',
          input: { eventId: selection.id },
          result: await this.toolRouter.callTool('getEvent', { eventId: selection.id }),
        }
      }
      case 'era': {
        return {
          tool: 'getEra',
          input: { eraId: selection.id },
          result: await this.toolRouter.callTool('getEra', { eraId: selection.id }),
        }
      }
      default:
        return null
    }
  }

  private async generateStepOutput(
    request: AiChatRequest,
    observations: readonly ToolObservation[],
    step: number,
    maxToolCalls: number,
  ): Promise<StepOutput> {
    const historyTail = request.history.slice(-8)
    const historyText = historyTail
      .map((msg) => `${msg.role.toUpperCase()}: ${msg.text}`)
      .join('\n')

    const selectionLine = request.followSelection && request.selection
      ? `Selection in focus: ${request.selection.type}[${request.selection.id}] ${request.selection.label}`
      : 'Selection in focus: none'

    const observationText = observations.length > 0
      ? observations
          .map((item, index) => {
            const status = item.result.ok ? 'ok' : `error=${item.result.error ?? 'unknown'}`
            const data = item.result.ok ? compactJson(item.result.data, 1800) : '{}'
            return `OBS#${index + 1} tool=${item.tool} input=${compactJson(item.input, 400)} status=${status} data=${data}`
          })
          .join('\n')
      : 'OBS: none'

    const outputSchema = [
      '{"kind":"tool","tool":"<toolName>","input":{...},"reason":"short"}',
      '{"kind":"final","answer":"string","references":[{"type":"species|creature|civilization|event|era|note|ethnicity|religion","id":"id","label":"label"}],"suggested_questions":["q1","q2"]}',
    ].join('\n')

    const messages: ChatMessage[] = [
      {
        role: 'system',
        content: [
          'You are Biotica simulator analyst. Use only provided context and tool observations.',
          'Never invent hidden data. If data is missing, request one tool call.',
          'At each step output only one JSON object following allowed schema.',
          'Do not include markdown fences. No extra text before/after JSON.',
          'When possible include IDs in references so UI can jump to entities.',
          'Use Italian language for answer.',
        ].join('\n'),
      },
      {
        role: 'user',
        content: [
          `Step ${step + 1}`,
          `Mode: ${request.mode}`,
          `Tool budget total: ${maxToolCalls}`,
          `Tools available:\n${formatToolsForPrompt()}`,
          `World pack:\n${request.worldPackText}`,
          selectionLine,
          historyText ? `History:\n${historyText}` : 'History: none',
          observationText,
          `User question: ${request.question}`,
          'If mode is explain, structure answer with explicit cause -> effect bullets.',
          `Output JSON schema (choose one):\n${outputSchema}`,
        ].join('\n\n'),
      },
    ]

    const raw = await this.invokeChat(messages, true)
    return this.parseStep(raw)
  }

  private parseStep(raw: string): StepOutput {
    try {
      const json = extractJson(raw)
      const parsed = JSON.parse(json) as Record<string, unknown>

      const kind = toLowerSafe(parsed.kind)
      if (kind === 'tool') {
        const tool = normalizeToolName(parsed.tool)
        if (!tool) {
          throw new Error('invalid tool name')
        }
        const input = parsed.input && typeof parsed.input === 'object'
          ? (parsed.input as Record<string, unknown>)
          : {}
        const reason = typeof parsed.reason === 'string' ? parsed.reason.slice(0, 180) : 'missing data'
        return {
          kind: 'tool',
          tool,
          input,
          reason,
        }
      }

      const answer = typeof parsed.answer === 'string'
        ? parsed.answer.trim()
        : String(parsed.final ?? '').trim()
      const references = this.normalizeReferences(parsed.references)
      const suggested = this.normalizeSuggested(parsed.suggested_questions)
      return {
        kind: 'final',
        answer: answer || 'Non ho dati sufficienti per una risposta affidabile con il contesto corrente.',
        references,
        suggested_questions: suggested,
      }
    } catch {
      return {
        kind: 'final',
        answer: raw.trim() || 'Risposta non disponibile.',
        references: [],
        suggested_questions: [],
      }
    }
  }

  private normalizeReferences(value: unknown): AiChatReference[] {
    if (!Array.isArray(value)) {
      return []
    }
    const out: AiChatReference[] = []
    for (let i = 0; i < value.length; i++) {
      const row = value[i]
      if (!row || typeof row !== 'object') continue
      const rec = row as Record<string, unknown>
      let type = typeof rec.type === 'string' ? rec.type.trim().toLowerCase() : ''
      if (type === 'civ') type = 'civilization'
      if (!ALLOWED_REFERENCE_TYPES.has(type)) continue
      const id = typeof rec.id === 'string' ? rec.id.trim() : ''
      if (!id) continue
      const label = typeof rec.label === 'string' && rec.label.trim().length > 0
        ? rec.label.trim().slice(0, 120)
        : `${type}:${id}`
      out.push({ type, id, label })
      if (out.length >= 12) break
    }
    return out
  }

  private normalizeSuggested(value: unknown): string[] {
    if (!Array.isArray(value)) {
      return []
    }
    const out: string[] = []
    for (let i = 0; i < value.length; i++) {
      const item = value[i]
      if (typeof item !== 'string') continue
      const text = item.trim().replace(/\s+/g, ' ')
      if (!text) continue
      out.push(text.slice(0, 180))
      if (out.length >= 4) break
    }
    return out
  }

  private fallbackFinal(
    request: AiChatRequest,
    observations: readonly ToolObservation[],
    toolCalls: AiChatResult['toolCalls'],
  ): AiChatResult {
    const obsPreview = observations
      .slice(-2)
      .map((obs) => `${obs.tool}: ${obs.result.ok ? 'ok' : obs.result.error ?? 'error'}`)
      .join(' | ')

    const answer = [
      'Non sono riuscito a completare una risposta strutturata dal modello locale entro i limiti di step.',
      `Domanda: ${request.question}`,
      `Osservazioni: ${obsPreview || 'nessuna'}`,
      'Prova a riformulare con un target esplicito (speciesId, creatureId, civId o eventId).',
    ].join('\n')

    return {
      answer,
      references: [],
      suggested_questions: [
        'Mostrami un riepilogo del mondo corrente',
        'Quali sono le specie piu popolose adesso?',
      ],
      toolCalls,
      cacheKey: '',
    }
  }

  private async invokeChat(messages: readonly ChatMessage[], jsonMode: boolean): Promise<string> {
    const provider = this.modelConfig.provider
    const model = this.modelConfig.model
    const temperature = this.modelConfig.temperature
    const maxTokens = this.modelConfig.maxTokens
    const timeoutMs = Math.max(2000, this.modelConfig.timeoutMs)

    const controller = new AbortController()
    const timeout = setTimeout(() => {
      controller.abort()
    }, timeoutMs)

    try {
      if (provider === 'openai') {
        const baseUrl = normalizeBaseUrl(this.modelConfig.baseUrl)
        const headers: Record<string, string> = {
          'Content-Type': 'application/json',
        }
        const apiKey = (this.modelConfig.apiKey ?? '').trim()
        if (apiKey && apiKey.toLowerCase() !== 'not-needed') {
          headers.Authorization = `Bearer ${apiKey}`
        }

        const response = await fetch(`${baseUrl}/chat/completions`, {
          method: 'POST',
          headers,
          body: JSON.stringify({
            model,
            messages,
            temperature,
            max_tokens: maxTokens,
            stream: false,
            ...(jsonMode ? { response_format: { type: 'json_object' } } : {}),
          }),
          signal: controller.signal,
        })

        if (!response.ok) {
          const err = await response.text().catch(() => '')
          throw new Error(`openai-compatible http ${response.status}: ${err.slice(0, 220)}`)
        }

        const payload = (await response.json()) as unknown
        const text = extractOpenAiText(payload).trim()
        if (!text) {
          throw new Error('openai-compatible response missing message content')
        }
        return text
      }

      const baseUrl = normalizeBaseUrl(this.modelConfig.baseUrl)
      const response = await fetch(`${baseUrl}/api/chat`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model,
          messages,
          stream: false,
          ...(jsonMode ? { format: 'json' } : {}),
          options: {
            temperature,
            num_predict: maxTokens,
          },
        }),
        signal: controller.signal,
      })

      if (!response.ok) {
        const err = await response.text().catch(() => '')
        throw new Error(`ollama http ${response.status}: ${err.slice(0, 220)}`)
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

  private runQueued<T>(task: () => Promise<T>): Promise<T> {
    const minIntervalMs = Math.max(0, this.modelConfig.minIntervalMs)

    const wrapped = this.queue.then(async () => {
      const now = Date.now()
      const wait = this.nextAllowedAt - now
      if (wait > 0) {
        await new Promise<void>((resolve) => {
          setTimeout(resolve, wait)
        })
      }
      this.nextAllowedAt = Date.now() + minIntervalMs
      return task()
    })

    this.queue = wrapped.then(() => undefined).catch(() => undefined)
    return wrapped
  }
}
