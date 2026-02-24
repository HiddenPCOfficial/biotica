import type {
  AiChatMessage,
  OverlayActionHandler,
  OverlayPage,
  SimulationSnapshot,
} from '../types'

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

function renderInlineMarkdown(text: string): string {
  const escaped = escapeHtml(text)
  return escaped.replace(/`([^`]+)`/g, '<code>$1</code>')
}

function renderMarkdown(text: string): string {
  const lines = text.split(/\r?\n/)
  const out: string[] = []
  let inList = false

  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i] ?? ''
    const line = raw.trimEnd()
    if (!line.trim()) {
      if (inList) {
        out.push('</ul>')
        inList = false
      }
      continue
    }

    const trimmed = line.trimStart()
    if (trimmed.startsWith('- ') || trimmed.startsWith('* ')) {
      if (!inList) {
        out.push('<ul>')
        inList = true
      }
      out.push(`<li>${renderInlineMarkdown(trimmed.slice(2))}</li>`)
      continue
    }

    if (inList) {
      out.push('</ul>')
      inList = false
    }
    out.push(`<p>${renderInlineMarkdown(line)}</p>`)
  }

  if (inList) {
    out.push('</ul>')
  }

  return out.join('')
}

function roleLabel(role: AiChatMessage['role']): string {
  if (role === 'assistant') return 'AI'
  if (role === 'user') return 'You'
  return 'System'
}

/**
 * Tab AI Chat:
 * - Q&A read-only sul simulatore
 * - quick prompts
 * - context inspector selection-aware
 */
export class AiChatPage implements OverlayPage {
  readonly id = 'aiChat' as const
  readonly title = 'AI Chat'
  readonly root = document.createElement('section')

  private readonly messagesWrap = document.createElement('div')
  private readonly messagesList = document.createElement('ul')
  private readonly quickPromptsWrap = document.createElement('div')
  private readonly contextInspector = document.createElement('div')

  private readonly input = document.createElement('textarea')
  private readonly sendBtn = document.createElement('button')
  private readonly followSelectionCheck = document.createElement('input')
  private readonly explainModeCheck = document.createElement('input')
  private readonly statusLine = document.createElement('div')

  private lastMessagesRenderKey = ''
  private lastContextRenderKey = ''
  private lastQuickPromptsKey = ''

  constructor(private readonly emitAction: OverlayActionHandler) {
    this.root.className = 'bi-ov-page bi-ov-ai-chat'

    const split = document.createElement('div')
    split.className = 'bi-ov-ai-chat-layout'

    const left = document.createElement('article')
    left.className = 'bi-ov-card bi-ov-ai-chat-left'
    left.append(this.createTitle('AI Chat'))

    const toggles = document.createElement('div')
    toggles.className = 'bi-ov-controls-row'

    const followLabel = document.createElement('label')
    followLabel.className = 'bi-ov-toggle'
    this.followSelectionCheck.type = 'checkbox'
    this.followSelectionCheck.addEventListener('change', () => {
      this.emitAction('aiChatSetFollowSelection', { enabled: this.followSelectionCheck.checked })
    })
    followLabel.append(this.followSelectionCheck, document.createTextNode('Follow Selection'))

    const explainLabel = document.createElement('label')
    explainLabel.className = 'bi-ov-toggle'
    this.explainModeCheck.type = 'checkbox'
    this.explainModeCheck.addEventListener('change', () => {
      this.emitAction('aiChatSetExplainMode', { enabled: this.explainModeCheck.checked })
    })
    explainLabel.append(this.explainModeCheck, document.createTextNode('Explain Mode'))

    this.statusLine.className = 'bi-ov-inline-stat'
    this.statusLine.textContent = 'offline'

    toggles.append(followLabel, explainLabel, this.statusLine)

    const qpTitle = document.createElement('div')
    qpTitle.className = 'bi-ov-inline-stat'
    qpTitle.innerHTML = '<strong>Quick prompts</strong>'
    this.quickPromptsWrap.className = 'bi-ov-ai-chat-prompts'

    this.messagesWrap.className = 'bi-ov-ai-chat-messages bi-ov-scroll'
    this.messagesList.className = 'bi-ov-list'
    this.messagesWrap.appendChild(this.messagesList)

    const inputWrap = document.createElement('div')
    inputWrap.className = 'bi-ov-ai-chat-input-wrap'

    this.input.className = 'bi-ov-input bi-ov-ai-chat-input'
    this.input.rows = 3
    this.input.placeholder = 'Ask anything about world, species, creatures, civilizations, events...'
    this.input.addEventListener('keydown', (event) => {
      if (event.key === 'Enter' && !event.shiftKey) {
        event.preventDefault()
        this.sendCurrentInput()
      }
    })

    this.sendBtn.type = 'button'
    this.sendBtn.className = 'bi-ov-btn'
    this.sendBtn.textContent = 'Send'
    this.sendBtn.addEventListener('click', () => {
      this.sendCurrentInput()
    })

    inputWrap.append(this.input, this.sendBtn)

    left.append(toggles, qpTitle, this.quickPromptsWrap, this.messagesWrap, inputWrap)

    const right = document.createElement('article')
    right.className = 'bi-ov-card bi-ov-ai-chat-right'
    right.append(this.createTitle('Context Inspector'))

    this.contextInspector.className = 'bi-ov-text-block bi-ov-scroll bi-ov-ai-chat-context'
    this.contextInspector.textContent = 'No selection context.'
    right.appendChild(this.contextInspector)

    split.append(left, right)
    this.root.appendChild(split)
  }

  mount(container: HTMLElement): void {
    container.appendChild(this.root)
  }

  setVisible(visible: boolean): void {
    this.root.classList.toggle('is-active', visible)
  }

  update(snapshot: SimulationSnapshot): void {
    const aiChat = snapshot.aiChat
    if (!aiChat) {
      this.statusLine.textContent = 'offline'
      this.sendBtn.disabled = true
      this.lastMessagesRenderKey = ''
      this.lastContextRenderKey = ''
      this.lastQuickPromptsKey = ''
      this.quickPromptsWrap.innerHTML = ''
      this.messagesList.innerHTML = '<li class="bi-ov-list-item">AI chat unavailable.</li>'
      this.contextInspector.textContent = 'No context available.'
      return
    }

    this.followSelectionCheck.checked = aiChat.followSelection
    this.explainModeCheck.checked = aiChat.explainMode
    this.sendBtn.disabled = aiChat.busy
    this.statusLine.textContent = aiChat.busy
      ? `${aiChat.provider} · thinking...`
      : `${aiChat.provider} · ready`

    const quickPromptsKey = aiChat.quickPrompts.join('\u0001')
    if (quickPromptsKey !== this.lastQuickPromptsKey) {
      this.lastQuickPromptsKey = quickPromptsKey
      this.renderQuickPrompts(aiChat.quickPrompts)
    }

    const latest = aiChat.messages[aiChat.messages.length - 1] ?? null
    const messagesRenderKey = [
      aiChat.messages.length,
      latest?.id ?? 'none',
      latest?.content ?? '',
      latest?.pending ? '1' : '0',
      latest?.error ?? '',
      latest?.references.length ?? 0,
      latest?.suggestedQuestions.length ?? 0,
    ].join('|')

    const contextRenderKey = [
      aiChat.busy ? '1' : '0',
      aiChat.followSelection ? '1' : '0',
      aiChat.explainMode ? '1' : '0',
      aiChat.contextInspector.selectionType ?? '-',
      aiChat.contextInspector.selectionId ?? '-',
      aiChat.contextInspector.title,
      aiChat.contextInspector.lines.join('|'),
      aiChat.contextInspector.payloadPreview,
    ].join('|')

    if (messagesRenderKey !== this.lastMessagesRenderKey) {
      this.lastMessagesRenderKey = messagesRenderKey
      this.renderMessages(aiChat.messages)
    }

    if (contextRenderKey !== this.lastContextRenderKey) {
      this.lastContextRenderKey = contextRenderKey
      this.renderContext(aiChat.contextInspector.title, aiChat.contextInspector.lines, aiChat.contextInspector.payloadPreview)
    }
  }

  destroy(): void {
    this.root.remove()
  }

  private sendCurrentInput(): void {
    const text = this.input.value.trim()
    if (!text) {
      return
    }
    this.emitAction('aiChatSendMessage', { text })
    this.input.value = ''
  }

  private renderQuickPrompts(prompts: readonly string[]): void {
    this.quickPromptsWrap.innerHTML = ''
    for (let i = 0; i < prompts.length; i++) {
      const prompt = prompts[i]
      if (!prompt) continue
      const btn = document.createElement('button')
      btn.type = 'button'
      btn.className = 'bi-ov-btn bi-ov-btn-ghost bi-ov-ai-chat-chip'
      btn.textContent = prompt
      btn.addEventListener('click', () => {
        this.input.value = prompt
        this.sendCurrentInput()
      })
      this.quickPromptsWrap.appendChild(btn)
    }
  }

  private renderMessages(messages: readonly AiChatMessage[]): void {
    this.messagesList.innerHTML = ''

    if (messages.length === 0) {
      const item = document.createElement('li')
      item.className = 'bi-ov-list-item'
      item.textContent = 'Ask a question to start.'
      this.messagesList.appendChild(item)
      return
    }

    const start = Math.max(0, messages.length - 200)
    for (let i = start; i < messages.length; i++) {
      const message = messages[i]
      if (!message) continue

      const li = document.createElement('li')
      li.className = `bi-ov-list-item bi-ov-ai-chat-message is-${message.role}`

      const head = document.createElement('div')
      head.className = 'bi-ov-ai-chat-message-head'
      head.textContent = `${roleLabel(message.role)} · t${message.tick}`

      const body = document.createElement('div')
      body.className = 'bi-ov-ai-chat-message-body'
      body.innerHTML = renderMarkdown(message.content)

      li.append(head, body)

      if (message.error) {
        const err = document.createElement('div')
        err.className = 'bi-ov-inline-stat'
        err.style.color = 'var(--ov-danger)'
        err.textContent = message.error
        li.appendChild(err)
      }

      if (message.references.length > 0) {
        const refs = document.createElement('div')
        refs.className = 'bi-ov-ai-chat-refs'
        for (let r = 0; r < message.references.length; r++) {
          const ref = message.references[r]
          if (!ref) continue
          const btn = document.createElement('button')
          btn.type = 'button'
          btn.className = 'bi-ov-btn bi-ov-btn-ghost bi-ov-ai-chat-ref'
          btn.textContent = `Jump to ${ref.label}`
          btn.addEventListener('click', () => {
            this.emitAction('aiChatJumpToReference', {
              referenceType: ref.type,
              id: ref.id,
            })
          })
          refs.appendChild(btn)
        }
        li.appendChild(refs)
      }

      if (message.suggestedQuestions.length > 0) {
        const suggestions = document.createElement('div')
        suggestions.className = 'bi-ov-ai-chat-suggestions'
        for (let s = 0; s < message.suggestedQuestions.length; s++) {
          const next = message.suggestedQuestions[s]
          if (!next) continue
          const btn = document.createElement('button')
          btn.type = 'button'
          btn.className = 'bi-ov-btn bi-ov-btn-ghost bi-ov-ai-chat-chip'
          btn.textContent = next
          btn.addEventListener('click', () => {
            this.input.value = next
          })
          suggestions.appendChild(btn)
        }
        li.appendChild(suggestions)
      }

      this.messagesList.appendChild(li)
    }

    this.messagesWrap.scrollTop = this.messagesWrap.scrollHeight
  }

  private renderContext(title: string, lines: readonly string[], payloadPreview: string): void {
    const block = [
      title || 'No selected entity',
      ...lines,
      payloadPreview ? `\n${payloadPreview}` : '',
    ]
      .filter(Boolean)
      .join('\n')

    this.contextInspector.textContent = block
  }

  private createTitle(text: string): HTMLElement {
    const title = document.createElement('h3')
    title.className = 'bi-ov-card-title'
    title.textContent = text
    return title
  }
}
