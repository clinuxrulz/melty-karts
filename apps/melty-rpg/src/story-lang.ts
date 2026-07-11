
let __brand = Symbol();
export interface Node<A> {
  [__brand]: A,

  type: string,
  params?: Node<unknown>[],
  value?: unknown,

  assign: (value: Node<A>) => void;
}

function node<A>(params: {
  type: string,
  params?: Node<unknown>[],
  value?: unknown,
}): Node<A> {
  let selfNode: Node<A> = {
    ...params,
    assign: (value) => {
      assertBlockScope("assign", (blockScope) => {
        blockScope.push(node({
          type: "assign",
          params: [
            selfNode as Node<unknown>,
            value as Node<unknown>,
          ],
        }))
      })
    },
  };
  return selfNode;
}

export type BooleanLike = boolean | Node<boolean>;
export type NumberLike = number | Node<number>;
export type StringLike = string | Node<string>;
export type VoidLike = void | Node<void>;
export type ValueLike = BooleanLike | NumberLike | StringLike | VoidLike;

type ExtractTypeFromValueLike<A extends ValueLike> =
  A extends BooleanLike
    ? boolean :
  A extends NumberLike
    ? number :
  A extends StringLike
    ? string :
  A extends VoidLike
    ? void :
  never;

function wrapValueLike<A extends ValueLike>(x: A): Node<ExtractTypeFromValueLike<A>> {
  if (x === undefined) {
    return node({ type: "void", });
  } else if (typeof x === "boolean") {
    return node({ type: "boolean", value: x, });
  } else if (typeof x === "number") {
    return node({ type: "number", value: x, });
  } else if (typeof x === "string") {
    return node({ type: "string", value: x, });
  } else {
    return x as unknown as Node<ExtractTypeFromValueLike<A>>;
  }
}

let blockScope: Node<unknown>[] | undefined = undefined;

export function assertBlockScope(fnName: string, fn: (blockScope: Node<unknown>[]) => void) {
  if (blockScope === undefined) {
    throw new Error(`${fnName} must be called inside a Fn(() => { ... }) scope.`);
  }
  fn(blockScope);
}

type ValueToNodeOfValue<A> =
  A extends BooleanLike
    ? BooleanLike :
  A extends NumberLike
    ? NumberLike :
  A extends StringLike
    ? StringLike :
  A extends VoidLike
    ? VoidLike :
  Node<A>;

type ArrayToNodesOfArray<A extends unknown[]> = { [K in keyof A]: ValueToNodeOfValue<A[K]> };

export function Fn<A extends unknown[] = [], R = void>(fn: (a: ArrayToNodesOfArray<A>) => ValueToNodeOfValue<R>): (a: ArrayToNodesOfArray<A>) => ValueToNodeOfValue<R> {
  return (a: ArrayToNodesOfArray<A>) => {
    let oldBlockScope: Node<unknown>[] | undefined = undefined;
    try {
      oldBlockScope = blockScope;
      blockScope = [];
      let r = fn(a);
      return node({
        type: "seq", params: [ ...blockScope, wrapValueLike(r as unknown as ValueLike) as Node<unknown>, ],
      }) as any;
    } finally {
      blockScope = oldBlockScope;
    }
  };
}

type ElseIfChain = {
  ElseIf: (a: BooleanLike, body: () => VoidLike) => ElseIfChain,
  Else: (body: () => VoidLike) => void,
};

export function If(a: BooleanLike, body: () => VoidLike): ElseIfChain {
  throw new Error("TODO");
}

export function delay(time: NumberLike) {
  assertBlockScope("delay", (blockScope) => {
    blockScope.push(node({ type: "delay", params: [ wrapValueLike(time) as Node<unknown>, ], }));
  });
}

export function dialog(text: StringLike) {
  assertBlockScope("dialog", (blockScope) => {
    blockScope.push(node({ type: "dialog", params: [ wrapValueLike(text) as Node<unknown>, ], }));
  });
}

export function awaitActionPress() {
  assertBlockScope("awaitActionPress", (blockScope) => {
    blockScope.push(node({ type: "awaitActionPress", }));
  });
}

export function askYesNo(): Node<boolean> {
  return node({ type: "askYesNo", });
}

export function obtainVar<A>(componentDef: string, field: string): Node<A> {
  throw new Error("TODO");
}

let introSequence = Fn(() => {
  delay(1000);
  dialog("Melty: Boy. Morning already?");
  awaitActionPress();
  dialog("Melty: Time to get ready for the day! Who knows what adventures today holds!");
  awaitActionPress();
  // . . .
  dialog("Get out of bed?");
  let r = obtainVar<boolean>("GameRes", "yesNoVal");
  r.assign(askYesNo());
  If(r, () => {
    // . . .
  }).Else(() => {
    // . . .
  });
});
