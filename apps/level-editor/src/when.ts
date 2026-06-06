import { Accessor, createMemo } from "solid-js";

export function whenDefined<A,B>(
  a: Accessor<A | undefined>,
  fn: (a: Accessor<A>) => B
): Accessor<B | undefined> {
  let hasA = createMemo(() => a() !== undefined);
  return createMemo(() => {
    if (!hasA()) {
      return undefined;
    }
    return fn(a as Accessor<A>);
  });
}

type AccessorArrayMaybeUndefined<T> = [...Extract<{ [K in keyof T]: Accessor<T[K] | undefined> }, readonly unknown[]>];
type AccessorArray<T> = [...Extract<{ [K in keyof T]: Accessor<T[K]> }, readonly unknown[]>];

export function whenAllDefined<A,B>(
  a: AccessorArrayMaybeUndefined<A>,
  fn: (a: AccessorArray<A>) => B,
): Accessor<B | undefined> {
  let hasAll = createMemo(() => {
    for (let x of a) {
      if (x() === undefined) {
        return false;
      }
    }
    return true;
  });
  return createMemo(() => {
    if (!hasAll()) {
      return undefined;
    }
    return fn(a as AccessorArray<A>);
  });
}
