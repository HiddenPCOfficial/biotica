import { Container } from 'pixi.js'

export class DebugLayer extends Container {
  constructor() {
    super()
    this.zIndex = 40
  }
}
