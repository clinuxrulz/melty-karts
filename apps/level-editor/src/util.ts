import { Accessor } from "solid-js";

export function constAccessor<A>(value: A): Accessor<A> {
  return () => value;
}
