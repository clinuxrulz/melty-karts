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

function var_<A>(varName: string): Node<A> {
  return new Node<A>({
    type: "var",
    value: {
      varName,
    },
  });
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
let nextVarId = 0;

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
  let varName = `x${nextVarId++}`;
  assertBlockScope("askYesNo", (blockScope) => {
    blockScope.push(node({ type: "askYesNo", value: { varName, }, }));
  });
  return var_(varName);
}

export function obtainVar<A>(componentDef: string, field: string): Node<A> {
  return var_(`ecs.resource(${componentDef}).${field}`);
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

interface StageBlock {
  stageId: number;
  lines: string[];
}

interface CompileCtx {
  nextStageId: number;
  storedVarNames: Set<string>;
}

function compileStage(
  node: ValueLike | Node<unknown>,
  ctx: CompileCtx,
  nextStage: number,
): { blocks: StageBlock[]; entryStage: number; value: string } {
  if (node === undefined) {
    return { blocks: [], entryStage: nextStage, value: "undefined" };
  } else if (typeof node === "boolean") {
    return { blocks: [], entryStage: nextStage, value: node ? "true" : "false" };
  } else if (typeof node === "number") {
    return { blocks: [], entryStage: nextStage, value: node.toString() };
  } else if (typeof node === "string") {
    return { blocks: [], entryStage: nextStage, value: JSON.stringify(node) };
  }
  switch (node.type) {
    case "number": {
      return { blocks: [], entryStage: nextStage, value: String(node.value) };
    }
    case "string": {
      return { blocks: [], entryStage: nextStage, value: JSON.stringify(node.value) };
    }
    case "void": {
      return { blocks: [], entryStage: nextStage, value: "undefined" };
    }
    case "var": {
      let varName: string = (node.value as any).varName;
      if (ctx.storedVarNames.has(varName)) {
        return { blocks: [], entryStage: nextStage, value: `ctx.${varName}` };
      }
      return { blocks: [], entryStage: nextStage, value: varName };
    }
    case "add": {
      let lhs = compileStage(node.params![0], ctx, nextStage);
      let rhs = compileStage(node.params![1], ctx, nextStage);
      return {
        blocks: [...lhs.blocks, ...rhs.blocks],
        entryStage: nextStage,
        value: `(${lhs.value} + ${rhs.value})`,
      };
    }
    case "sub": {
      let lhs = compileStage(node.params![0], ctx, nextStage);
      let rhs = compileStage(node.params![1], ctx, nextStage);
      return {
        blocks: [...lhs.blocks, ...rhs.blocks],
        entryStage: nextStage,
        value: `(${lhs.value} - ${rhs.value})`,
      };
    }
    case "mult": {
      let lhs = compileStage(node.params![0], ctx, nextStage);
      let rhs = compileStage(node.params![1], ctx, nextStage);
      return {
        blocks: [...lhs.blocks, ...rhs.blocks],
        entryStage: nextStage,
        value: `(${lhs.value} * ${rhs.value})`,
      };
    }
    case "div": {
      let lhs = compileStage(node.params![0], ctx, nextStage);
      let rhs = compileStage(node.params![1], ctx, nextStage);
      return {
        blocks: [...lhs.blocks, ...rhs.blocks],
        entryStage: nextStage,
        value: `(${lhs.value} / ${rhs.value})`,
      };
    }
    case "and": {
      let lhs = compileStage(node.params![0], ctx, nextStage);
      let rhs = compileStage(node.params![1], ctx, nextStage);
      return {
        blocks: [...lhs.blocks, ...rhs.blocks],
        entryStage: nextStage,
        value: `(${lhs.value} && ${rhs.value})`,
      };
    }
    case "assign": {
      let lhs = compileStage(node.params![0], ctx, nextStage);
      let rhs = compileStage(node.params![1], ctx, nextStage);
      let stageId = ctx.nextStageId++;
      return {
        blocks: [{
          stageId,
          lines: [
            ...lhs.blocks.flatMap(b => b.lines),
            ...rhs.blocks.flatMap(b => b.lines),
            `${lhs.value} = ${rhs.value};`,
            `ctx.stage = ${nextStage};`,
          ],
        }],
        entryStage: stageId,
        value: "undefined",
      };
    }
    case "seq": {
      let params = node.params ?? [];
      if (params.length === 0) {
        return { blocks: [], entryStage: nextStage, value: "undefined" };
      }
      let currentNext = nextStage;
      let allBlocks: StageBlock[] = [];
      let value = "undefined";
      for (let i = params.length - 1; i >= 0; i--) {
        let r = compileStage(params[i], ctx, currentNext);
        allBlocks = [...r.blocks, ...allBlocks];
        currentNext = r.entryStage;
        if (i === params.length - 1) {
          value = r.value;
        }
      }
      return { blocks: allBlocks, entryStage: currentNext, value };
    }
    case "if": {
      let cond = compileStage(node.params![0], ctx, nextStage);
      let body = compileStage(node.params![1], ctx, nextStage);
      let elseBody: { blocks: StageBlock[]; entryStage: number; value: string };
      if (node.params!.length >= 3 && node.params![2] !== undefined) {
        elseBody = compileStage(node.params![2], ctx, nextStage);
      } else {
        elseBody = { blocks: [], entryStage: nextStage, value: "undefined" };
      }
      let condStageId = ctx.nextStageId++;
      let condBlock: StageBlock = {
        stageId: condStageId,
        lines: [
          ...cond.blocks.flatMap(b => b.lines),
          `if (${cond.value}) { ctx.stage = ${body.entryStage}; } else { ctx.stage = ${elseBody.entryStage}; }`,
        ],
      };
      return {
        blocks: [condBlock, ...body.blocks, ...elseBody.blocks],
        entryStage: condStageId,
        value: "undefined",
      };
    }
    case "delay": {
      let time = compileStage(node.params![0], ctx, nextStage);
      let stageId = ctx.nextStageId++;
      return {
        blocks: [{
          stageId,
          lines: [
            ...time.blocks.flatMap(b => b.lines),
            `ctx.delayTimer = (ctx.delayTimer ?? 0) + dt;`,
            `if (ctx.delayTimer < ${time.value}) { return; }`,
            `ctx.delayTimer = undefined;`,
            `ctx.stage = ${nextStage};`,
          ],
        }],
        entryStage: stageId,
        value: "undefined",
      };
    }
    case "dialog": {
      let text = compileStage(node.params![0], ctx, nextStage);
      let stageId = ctx.nextStageId++;
      return {
        blocks: [{
          stageId,
          lines: [
            ...text.blocks.flatMap(b => b.lines),
            `dialog(${text.value});`,
            `ctx.stage = ${nextStage};`,
          ],
        }],
        entryStage: stageId,
        value: "undefined",
      };
    }
    case "awaitActionPress": {
      let stageId = ctx.nextStageId++;
      return {
        blocks: [{
          stageId,
          lines: [
            `if (!ecs.resource("Input").actionPressed) { return; }`,
            `ctx.stage = ${nextStage};`,
          ],
        }],
        entryStage: stageId,
        value: "undefined",
      };
    }
    case "askYesNo": {
      let varName: string = (node.value as any).varName;
      let stageId = ctx.nextStageId++;
      return {
        blocks: [{
          stageId,
          lines: [
            `let result = askYesNo();`,
            `if (result === undefined) { return; }`,
            `ctx.${varName} = result;`,
            `ctx.stage = ${nextStage};`,
          ],
        }],
        entryStage: stageId,
        value: `ctx.${varName}`,
      };
    }
    default: {
      return { blocks: [], entryStage: nextStage, value: "undefined" };
    }
  }
}

function collectStoredVarNames(node: ValueLike | Node<unknown>): Set<string> {
  let names = new Set<string>();
  function walk(n: ValueLike | Node<unknown>): void {
    if (n && typeof n === "object" && "type" in n) {
      let node = n as Node<unknown>;
      if (node.type === "askYesNo") {
        names.add((node.value as any).varName);
      }
      for (let param of (node as any).params ?? []) {
        walk(param);
      }
    }
  }
  walk(node);
  return names;
}

function renumberStages(blocks: StageBlock[], entryStage: number): { blocks: StageBlock[]; entryStage: number } {
  let map = new Map<number, number>();
  for (let i = 0; i < blocks.length; i++) {
    map.set(blocks[i].stageId, i);
  }
  for (let block of blocks) {
    block.stageId = map.get(block.stageId)!;
    for (let j = 0; j < block.lines.length; j++) {
      block.lines[j] = block.lines[j].replace(/ctx\.stage = (\d+)/g, (_, num) => {
        return `ctx.stage = ${map.get(parseInt(num))!}`;
      });
    }
  }
  return { blocks, entryStage: map.get(entryStage) ?? entryStage };
}

export function compile(node: ValueLike | Node<unknown>): {
  code: string[],
  value: string,
} {
  let storedVarNames = collectStoredVarNames(node);
  let ctx: CompileCtx = { nextStageId: 0, storedVarNames };
  let result = compileStage(node, ctx, -1);
  let remapped = renumberStages(result.blocks, result.entryStage);
  let lines: string[] = [];
  lines.push("function storyUpdate(ecs, ctx, dt) {");
  lines.push("  while (ctx.stage !== -1) {");
  lines.push("    switch (ctx.stage) {");
  for (let block of remapped.blocks) {
    lines.push(`      case ${block.stageId}:`);
    for (let line of block.lines) {
      lines.push(`        ${line}`);
    }
    lines.push(`        break;`);
  }
  lines.push("      default:");
  lines.push("        ctx.stage = -1;");
  lines.push("        break;");
  lines.push("    }");
  lines.push("  }");
  lines.push("}");
  return { code: lines, value: result.value };
}

console.log(compile(introSequence([])).code.join("\r\n"));
