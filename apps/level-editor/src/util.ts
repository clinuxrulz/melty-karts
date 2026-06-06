import { Accessor } from "solid-js";

export function constAccessor<A>(value: A): Accessor<A> {
  return () => value;
}

export function opToArr<A>(a: A | undefined): A[] {
  return a === undefined ? []: [a];
}