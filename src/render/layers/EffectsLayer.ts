import { Container } from 'pixi.js'

export class EffectsLayer extends Container {
  constructor() {
    super()
    this.zIndex = 20
  }
}
