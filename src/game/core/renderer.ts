import { Application, type ApplicationOptions } from 'pixi.js'

const DEFAULT_RENDERER_OPTIONS: Partial<ApplicationOptions> = {
  antialias: true,
  autoDensity: true,
  background: 0x070b14,
}

export async function createRenderer(
  mountTarget: HTMLElement,
  options: Partial<ApplicationOptions> = {},
): Promise<Application> {
  const app = new Application()

  await app.init({
    ...DEFAULT_RENDERER_OPTIONS,
    resizeTo: mountTarget,
    ...options,
  })

  mountTarget.appendChild(app.canvas)

  return app
}
