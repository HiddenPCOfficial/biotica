export type PauseMenuActions = {
  onResume: () => void
  onSave: () => void
  onStructures: () => void
  onSettings: () => void
  onExitToMenu: () => void
  onQuit: () => void
}

export class PauseMenuPage {
  readonly root = document.createElement('section')

  private readonly status = document.createElement('p')
  private readonly saveButton = document.createElement('button')

  constructor(private readonly actions: PauseMenuActions) {
    this.root.className = 'bi-menu-page bi-menu-pause-page'

    const title = document.createElement('h1')
    title.className = 'bi-menu-title'
    title.textContent = 'Paused'

    const subtitle = document.createElement('p')
    subtitle.className = 'bi-menu-subtitle'
    subtitle.textContent = 'Simulation is paused while this menu is open.'

    this.status.className = 'bi-menu-status'
    this.status.textContent = ''

    const actionsBox = document.createElement('div')
    actionsBox.className = 'bi-menu-actions'

    const resumeBtn = this.makeButton('Resume', () => this.actions.onResume())
    this.saveButton = this.makeButton('Save', () => this.actions.onSave())
    const structuresBtn = this.makeButton('Structures', () => this.actions.onStructures(), 'ghost')
    const settingsBtn = this.makeButton('Settings', () => this.actions.onSettings(), 'ghost')
    const exitBtn = this.makeButton('Exit to Main Menu', () => this.actions.onExitToMenu(), 'ghost')
    const quitBtn = this.makeButton('Quit', () => this.actions.onQuit(), 'danger')

    actionsBox.append(resumeBtn, this.saveButton, structuresBtn, settingsBtn, exitBtn, quitBtn)
    this.root.append(title, subtitle, this.status, actionsBox)
  }

  mount(container: HTMLElement): void {
    container.appendChild(this.root)
  }

  destroy(): void {
    this.root.remove()
  }

  setStatus(text: string): void {
    this.status.textContent = text
  }

  setSaving(saving: boolean): void {
    this.saveButton.disabled = saving
    this.saveButton.textContent = saving ? 'Saving...' : 'Save'
  }

  private makeButton(
    label: string,
    onClick: () => void,
    variant: 'primary' | 'ghost' | 'danger' = 'primary',
  ): HTMLButtonElement {
    const button = document.createElement('button')
    button.type = 'button'
    button.className = `bi-menu-btn${variant === 'ghost' ? ' is-ghost' : variant === 'danger' ? ' is-danger' : ''}`
    button.textContent = label
    button.addEventListener('click', onClick)
    return button
  }
}
