import './styles/menu.css'

export class MenuRoot {
  readonly root = document.createElement('div')
  readonly backdrop = document.createElement('div')
  readonly panel = document.createElement('div')
  readonly pageHost = document.createElement('div')

  private mounted = false

  constructor() {
    this.root.className = 'bi-menu-root'
    this.backdrop.className = 'bi-menu-backdrop'
    this.panel.className = 'bi-menu-panel'
    this.pageHost.className = 'bi-menu-page-host'

    this.panel.appendChild(this.pageHost)
    this.root.append(this.backdrop, this.panel)
  }

  mount(container: HTMLElement): void {
    if (this.mounted) {
      return
    }
    this.mounted = true
    container.appendChild(this.root)
  }

  unmount(): void {
    if (!this.mounted) {
      return
    }
    this.mounted = false
    this.root.remove()
  }

  setVisible(value: boolean): void {
    this.root.classList.toggle('is-hidden', !value)
  }

  setCompact(compact: boolean): void {
    this.root.classList.toggle('is-compact', compact)
  }

  setCanvasBlurEnabled(enabled: boolean, host: HTMLElement): void {
    host.classList.toggle('bi-menu-blur-canvas', enabled)
  }
}
