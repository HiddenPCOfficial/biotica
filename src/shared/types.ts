export type Nullable<T> = T | null

export type Maybe<T> = T | undefined

export type Mutable<T> = {
  -readonly [K in keyof T]: T[K]
}
