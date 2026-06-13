import { Accessor, createRenderEffect, onCleanup } from "solid-js";

export function constAccessor<A>(value: A): Accessor<A> {
  return () => value;
}

export function opToArr<A>(a: A | undefined): A[] {
  return a === undefined ? []: [a];
}

export function bidirectionalBindForInputNumber(params: {
  input: HTMLInputElement,
  value: Accessor<number>,
  setValue: (x: number) => void,
}) {
  let selfSetting = false;
  let listener = () => {
    let value = Number.parseFloat(params.input.value.trim());
    if (Number.isNaN(value)) {
      return;
    }
    selfSetting = true;
    if (value === params.value()) {
      return;
    }
    params.setValue(value);
  };
  createRenderEffect(
    params.value,
    (value) => {
      if (selfSetting) {
        selfSetting = false;
        return;
      }
      params.input.value = value.toFixed(3);
    },
  );
  params.input.addEventListener("input", listener);
  onCleanup(() => {
    params.input.removeEventListener("input", listener);
  });
};
