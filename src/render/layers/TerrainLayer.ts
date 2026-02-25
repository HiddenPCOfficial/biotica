import { Container } from 'pixi.js'

export class TerrainLayer extends Container {
  constructor() {
    super()
    this.zIndex = 10
    this.sortableChildren = false
  }
}
