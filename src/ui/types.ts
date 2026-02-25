export type UiMountable = {
  mount(container: HTMLElement): void
  unmount(): void
}

export type UiPage = {
  mount(container: HTMLElement): void
  destroy(): void
}
