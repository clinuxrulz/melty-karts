const __brand = Symbol();

export interface BaseNode<A> {
  [__brand]: A;
  type: string;
  params?: BaseNode<unknown>[];
  value?: unknown;
  assign(value: BaseNode<A>): void;
}
export type Node<A> = BaseNode<A> 
  & (A extends number ? {
    add(other: NumberLike): Node<number>,
    sub(other: NumberLike): Node<number>,
    mult(other: NumberLike): Node<number>,
    div(other: NumberLike): Node<number>,
  } : {})
  & (A extends boolean ? {
    and(other: BooleanLike): Node<boolean>
  } : {});

class NodeImpl<A> implements BaseNode<A> {
  declare [__brand]: A;
  type: string;
  params?: BaseNode<unknown>[];
  value?: unknown;

  constructor(config: { type: string; params?: BaseNode<unknown>[]; value?: unknown }) {
    this.type = config.type;
    this.params = config.params;
    this.value = config.value;
  }

  assign(value: BaseNode<A>): void {
    assertBlockScope("assign", (blockScope) => {
      blockScope.push(new Node({
        type: "assign",
        params: [
          this,
          value,
        ],
      }));
    });
  }

  add(other: NumberLike): Node<number> {
    return new Node({
      type: "add",
      params: [
        this,
        wrapValueLike(other),
      ],
    }) as Node<number>;
  }

  sub(other: NumberLike): Node<number> {
    return new Node({
      type: "sub",
      params: [
        this,
        wrapValueLike(other),
      ],
    });
  }

  mult(other: NumberLike): Node<number> {
    return new Node({
      type: "mult",
      params: [
        this,
        wrapValueLike(other),
      ],
    });
  }

  div(other: NumberLike): Node<number> {
    return new Node({
      type: "div",
      params: [
        this,
        wrapValueLike(other),
      ],
    });
  }

  and(other: BooleanLike): Node<boolean> {
    return new Node({
      type: "and",
      params: [
        this,
        wrapValueLike(other),
      ],
    });
  }
}

export const Node = NodeImpl as unknown as new <A>(config: { 
  type: string; 
  params?: BaseNode<unknown>[]; 
  value?: unknown 
}) => Node<A>;

function node<A>(params: {
  type: string,
  params?: Node<unknown>[],
  value?: unknown,
}): Node<A> {
  return new Node<A>(params);
}

export type BooleanLike = boolean | BaseNode<boolean>;
export type NumberLike = number | BaseNode<number>;
export type StringLike = string | BaseNode<string>;
export type VoidLike = void | BaseNode<void>;
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

function buildBlock(body: () => VoidLike): Node<void> {
  let oldBlockScope = blockScope;
  blockScope = [];
  try {
    let r = body();
    return node({
      type: "seq",
      params: [ ...blockScope, wrapValueLike(r as unknown as ValueLike) as Node<unknown> ],
    }) as Node<void>;
  } finally {
    blockScope = oldBlockScope;
  }
}

type ElseIfChain = {
  ElseIf: (a: BooleanLike, body: () => VoidLike) => ElseIfChain,
  Else: (body: () => VoidLike) => void,
};

export function If(a: BooleanLike, body: () => VoidLike): ElseIfChain {
  let ifNode = node({
    type: "if",
    params: [
      wrapValueLike(a) as Node<unknown>,
      buildBlock(body) as Node<unknown>
    ],
  });
  assertBlockScope("If", (scope) => {
    scope.push(ifNode);
  });
  let deepestIf = ifNode;
  const chain: ElseIfChain = {
    ElseIf: (cond, nextBody) => {
      let nextIf = node({
        type: "if",
        params: [
          wrapValueLike(cond) as Node<unknown>,
          buildBlock(nextBody) as Node<unknown>
        ],
      });
      deepestIf.params![2] = nextIf as Node<unknown>;
      deepestIf = nextIf;
      return chain;
    },
    Else: (elseBody) => {
      deepestIf.params![2] = buildBlock(elseBody) as Node<unknown>;
    },
  };
  return chain;
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
  return node({ type: "obtainVar", value: { componentDef, field, }, });
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

console.log(introSequence([]));
