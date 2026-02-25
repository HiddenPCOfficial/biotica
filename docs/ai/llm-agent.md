# LLM Agent

## Purpose

LLM subsystem provides read-only textual assistance.

Primary files:
- `src/ai/llm/LlmAgent.ts`
- `src/ai/llm/LlmClient.ts`
- `src/ai/llm/services/AiChatService.ts`
- `src/ai/llm/services/CreatureDescriptionService.ts`
- `src/ai/core/AiConfig.ts`
- `src/ai/core/AiCache.ts`
- `src/ai/core/AiRateLimiter.ts`
- `src/ai/core/AiModelResolver.ts`

## Runtime Scope

Allowed LLM scope:
- In-game chat Q&A (`AiChatService`).
- On-demand creature/species/civilization textual descriptions (`CreatureDescriptionService`).

Not used for:
- Core tick-loop world mutation.
- Deterministic worldgen tuning.

In `TerrainScene`, LLM is called only on explicit UI actions.

## Components

### `LlmAgent`

Facade that wires:
- Provider config.
- Model resolution by scope.
- Shared client and rate limiter.
- Service instances (`chat()`, `creatureDescription()`).

### `LlmClient`

Provider-compatible client supporting:
- `ollama`
- `llamaCpp` (OpenAI-compatible endpoint style)
- `openai`

Features:
- Timeout/abort control.
- Optional streaming support.
- JSON mode support.

### `AiChatService`

Implements read-only ReAct-like loop:
- Prompt -> optional tool call -> observation -> final response.
- Tool budget and step limits.
- Structured references/suggested questions output.

Tool calls route through:
- `src/ai/llm/tools/ToolRouter.ts`

### `CreatureDescriptionService`

Generates JSON-formatted technical descriptions for selected entities.
Fallback behavior:
- If LLM fails, deterministic fallback text is produced.

## Config via `.env`

Configured through Vite env vars (`AiConfig`):

| Variable | Meaning |
|---|---|
| `VITE_AI_PROVIDER` | `ollama`/`llamaCpp`/`openai` |
| `VITE_AI_BASE_URL` | provider base URL |
| `VITE_AI_API_KEY` | optional (required for OpenAI provider) |
| `VITE_AI_MODEL` | global model fallback |
| `VITE_AI_CHAT_MODEL` | chat scope model |
| `VITE_AI_CREATURE_DESCRIPTION_MODEL` | description scope model |
| `VITE_AI_TIMEOUT_MS` | request timeout |
| `VITE_AI_MIN_INTERVAL_MS` | rate-limiter min interval |
| `VITE_AI_STREAMING` | stream on/off |
| `VITE_AI_CACHE_TTL_MS` | cache TTL |
| `VITE_AI_CACHE_MAX_ENTRIES` | cache size |

Reference template:
- `.env.example`

## Caching

`AiCache<T>`:
- In-memory TTL cache.
- LRU eviction behavior.
- Used by both chat and description services.

## Rate Limiting

`AiRateLimiter`:
- FIFO queue.
- Enforces minimum interval between async jobs.
- Prevents request bursts and provider overload.

## Safety and Boundaries

- LLM output should be treated as advisory text.
- Gameplay-critical decisions remain deterministic in simulation systems.
- Avoid introducing LLM dependency inside fixed-step loops.
