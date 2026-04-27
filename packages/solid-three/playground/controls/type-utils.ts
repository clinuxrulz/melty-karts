export type Args<T> = T extends new (...args: any) => any ? ConstructorParameters<T> : T

export type Mandatory<T, K extends keyof T> = T & { [P in K]-?: T[P] }

export type KeyOfOptionals<T> = keyof {
  [K in keyof T as T extends Record<K, T[K]> ? never : K]: T[K]
}

/** Allows using a TS v4 labeled tuple even with older typescript versions */
export type NamedArrayTuple<T extends (...args: any) => any> = Parameters<T>

export type Intersect<T extends any[]> = T extends [infer U, ...infer Rest]
  ? Rest["length"] extends 0
    ? U
    : U & Intersect<Rest>
  : T
