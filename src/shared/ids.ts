export function createScopedId(scope: string, index: number): string {
  return `${scope}-${index}`
}

export function createDeterministicScopedId(scope: string, seed: number, index: number): string {
  return `${scope}-${seed}-${index}`
}
