import { readAiCoreConfig } from '../core/AiConfig'
import { resolveLlmModel } from '../core/AiModelResolver'
import { AiRateLimiter } from '../core/AiRateLimiter'
import { LlmClient } from './LlmClient'
import { AiChatService } from './services/AiChatService'
import { CreatureDescriptionService } from './services/CreatureDescriptionService'
import type { ToolRouter } from './tools/ToolRouter'

let hasLoggedLlmConfig = false

/**
 * Facade unico dell'agente LLM (solo testo, read-only).
 */
export class LlmAgent {
  private readonly chatService: AiChatService
  private readonly creatureDescriptionService: CreatureDescriptionService

  constructor(toolRouter: ToolRouter) {
    const coreConfig = readAiCoreConfig()
    const chatModel = resolveLlmModel('CHAT')
    const creatureModel = resolveLlmModel('CREATURE_DESCRIPTION')

    const client = new LlmClient({
      provider: coreConfig.llm.provider,
      baseUrl: coreConfig.llm.baseUrl,
      apiKey: coreConfig.llm.apiKey,
      timeoutMs: coreConfig.llm.timeoutMs,
    })

    const limiter = new AiRateLimiter({
      minIntervalMs: coreConfig.llm.minIntervalMs,
    })

    this.chatService = new AiChatService(toolRouter, {
      model: chatModel,
      client,
      rateLimiter: limiter,
      enableStreaming: coreConfig.llm.enableStreaming,
      maxToolCalls: 3,
      maxSteps: 4,
      maxHistory: 12,
    })

    this.creatureDescriptionService = new CreatureDescriptionService({
      model: creatureModel,
      client,
      rateLimiter: limiter,
    })

    if (!hasLoggedLlmConfig) {
      hasLoggedLlmConfig = true
      console.info(
        `[LlmAgent] provider=${coreConfig.llm.provider} baseUrl=${coreConfig.llm.baseUrl} chatModel=${chatModel} creatureModel=${creatureModel} streaming=${coreConfig.llm.enableStreaming}`,
      )
    }
  }

  chat(): AiChatService {
    return this.chatService
  }

  creatureDescription(): CreatureDescriptionService {
    return this.creatureDescriptionService
  }

  // Compat API legacy.
  getChat(): AiChatService {
    return this.chat()
  }

  // Compat API legacy.
  getCreatureDescription(): CreatureDescriptionService {
    return this.creatureDescription()
  }
}
