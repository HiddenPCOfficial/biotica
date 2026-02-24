export type MainMenuActions = {
  onNewWorld: () => void
  onLoadWorld: () => void
  onSettings: () => void
  onQuit: () => void
}

export class MainMenuPage {
  readonly root = document.createElement('section')

  constructor(actions: MainMenuActions) {
    this.root.className = 'bi-menu-page'

    const title = document.createElement('h1')
    title.className = 'bi-menu-title'
    title.textContent = 'BIOTICA'

    const subtitle = document.createElement('p')
    subtitle.className = 'bi-menu-subtitle'
    subtitle.textContent = 'Darwinian Worlds • Civilizations • Emergence'

    const actionsBox = document.createElement('div')
    actionsBox.className = 'bi-menu-actions'

    actionsBox.append(
      this.makeButton('New World', actions.onNewWorld),
      this.makeButton('Load World', actions.onLoadWorld),
      this.makeButton('Settings', actions.onSettings),
      this.makeButton('Quit', actions.onQuit, 'ghost'),
    )

    this.root.append(title, subtitle, actionsBox)
  }

  mount(container: HTMLElement): void {
    container.appendChild(this.root)
  }

  destroy(): void {
    this.root.remove()
  }

  private makeButton(label: string, onClick: () => void, variant: 'primary' | 'ghost' = 'primary'): HTMLButtonElement {
    const button = document.createElement('button')
    button.type = 'button'
    button.className = `bi-menu-btn ${variant === 'ghost' ? 'is-ghost' : ''}`
    button.textContent = label
    button.addEventListener('click', onClick)
    return button
  }
}
