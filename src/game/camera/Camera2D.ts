import type { Container } from 'pixi.js'

type Camera2DOptions = {
  zoom?: number
  minZoom?: number
  maxZoom?: number
  zoomStep?: number
  x?: number
  y?: number
}

type CameraBounds = {
  viewportWidth: number
  viewportHeight: number
  worldWidth: number
  worldHeight: number
}

/**
 * Camera 2D con pan + zoom centrato sul puntatore.
 */
export class Camera2D {
  private _zoom: number
  private readonly baseMinZoom: number
  private readonly baseMaxZoom: number
  private minZoomLimit: number
  private maxZoomLimit: number
  private readonly zoomStep: number

  private x: number
  private y: number
  private isDragging = false
  private lastPointerX = 0
  private lastPointerY = 0
  private bounds: CameraBounds | null = null

  constructor(options: Camera2DOptions = {}) {
    this.baseMinZoom = options.minZoom ?? 0.5
    this.baseMaxZoom = options.maxZoom ?? 6
    this.minZoomLimit = this.baseMinZoom
    this.maxZoomLimit = this.baseMaxZoom
    this.zoomStep = options.zoomStep ?? 0.0015
    this._zoom = this.clampZoom(options.zoom ?? 1)
    this.x = options.x ?? 0
    this.y = options.y ?? 0
  }

  get zoom(): number {
    return this._zoom
  }

  setPosition(x: number, y: number): void {
    this.x = x
    this.y = y
    this.clampPosition()
  }

  /**
   * Centra il mondo nel viewport con lo zoom corrente.
   */
  centerOn(viewWidth: number, viewHeight: number, worldWidth: number, worldHeight: number): void {
    this.setBounds(viewWidth, viewHeight, worldWidth, worldHeight)
    this.x = (viewWidth - worldWidth * this._zoom) * 0.5
    this.y = (viewHeight - worldHeight * this._zoom) * 0.5
    this.clampPosition()
  }

  /**
   * Imposta i limiti dinamici mappa/viewport.
   * Lo zoom non puo scendere sotto il valore necessario a restare nei limiti mappa.
   */
  setBounds(viewportWidth: number, viewportHeight: number, worldWidth: number, worldHeight: number): void {
    const safeViewportW = Math.max(1, viewportWidth)
    const safeViewportH = Math.max(1, viewportHeight)
    const safeWorldW = Math.max(1, worldWidth)
    const safeWorldH = Math.max(1, worldHeight)

    this.bounds = {
      viewportWidth: safeViewportW,
      viewportHeight: safeViewportH,
      worldWidth: safeWorldW,
      worldHeight: safeWorldH,
    }

    // Zoom minimo necessario per non uscire oltre i bordi mappa.
    const fitZoom = Math.max(safeViewportW / safeWorldW, safeViewportH / safeWorldH)
    this.minZoomLimit = Math.max(this.baseMinZoom, fitZoom)
    this.maxZoomLimit = Math.max(this.baseMaxZoom, this.minZoomLimit)
    this._zoom = this.clampZoom(this._zoom)
    this.clampPosition()
  }

  /**
   * Applica la trasformazione camera al container di mondo.
   */
  applyTo(target: Container): void {
    this.clampPosition()
    target.scale.set(this._zoom)
    target.position.set(this.x, this.y)
  }

  /**
   * Zoom con rotella, mantenendo il punto sotto il cursore fisso a schermo.
   */
  handleWheel(event: WheelEvent, canvas: HTMLCanvasElement): void {
    event.preventDefault()

    const rect = canvas.getBoundingClientRect()
    const screenX = event.clientX - rect.left
    const screenY = event.clientY - rect.top
    const zoomFactor = Math.exp(-event.deltaY * this.zoomStep)
    const nextZoom = this.clampZoom(this._zoom * zoomFactor)

    this.zoomAt(screenX, screenY, nextZoom)
  }

  handlePointerDown(event: PointerEvent): void {
    if (event.button !== 0) {
      return
    }

    this.isDragging = true
    this.lastPointerX = event.clientX
    this.lastPointerY = event.clientY
  }

  handlePointerMove(event: PointerEvent): void {
    if (!this.isDragging) {
      return
    }

    const dx = event.clientX - this.lastPointerX
    const dy = event.clientY - this.lastPointerY

    this.x += dx
    this.y += dy
    this.clampPosition()

    this.lastPointerX = event.clientX
    this.lastPointerY = event.clientY
  }

  handlePointerUp(): void {
    this.isDragging = false
  }

  private zoomAt(screenX: number, screenY: number, nextZoom: number): void {
    if (nextZoom === this._zoom) {
      return
    }

    const worldX = (screenX - this.x) / this._zoom
    const worldY = (screenY - this.y) / this._zoom

    this._zoom = nextZoom
    this.x = screenX - worldX * this._zoom
    this.y = screenY - worldY * this._zoom
    this.clampPosition()
  }

  private clampZoom(value: number): number {
    if (value < this.minZoomLimit) return this.minZoomLimit
    if (value > this.maxZoomLimit) return this.maxZoomLimit
    return value
  }

  private clampPosition(): void {
    if (!this.bounds) {
      return
    }

    const scaledWorldWidth = this.bounds.worldWidth * this._zoom
    const scaledWorldHeight = this.bounds.worldHeight * this._zoom
    const viewWidth = this.bounds.viewportWidth
    const viewHeight = this.bounds.viewportHeight

    if (scaledWorldWidth <= viewWidth) {
      this.x = (viewWidth - scaledWorldWidth) * 0.5
    } else {
      const minX = viewWidth - scaledWorldWidth
      if (this.x < minX) this.x = minX
      if (this.x > 0) this.x = 0
    }

    if (scaledWorldHeight <= viewHeight) {
      this.y = (viewHeight - scaledWorldHeight) * 0.5
    } else {
      const minY = viewHeight - scaledWorldHeight
      if (this.y < minY) this.y = minY
      if (this.y > 0) this.y = 0
    }
  }
}
