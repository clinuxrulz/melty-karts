import { describe, it, expect, beforeEach } from "vitest";
import { compile, Fn, delay, dialog, awaitActionPress, askYesNo, obtainVar, If } from "./story-lang";

class MockResource {
  _data: Record<string, any>;
  constructor(initial: Record<string, any> = {}) {
    this._data = { ...initial };
  }
  get(key: string) {
    return this._data[key];
  }
  set(key: string, value: any) {
    this._data[key] = value;
  }
}

interface MockCtxOptions {
  stage?: number;
  delayTimer?: number;
  dialogAtCharIdx?: number;
  _cacheDialogChars?: string[];
  resources?: Record<string, Record<string, any>>;
  dialogChars?: string[];
  askYesNoResult?: boolean | undefined;
}

function createMockCtx(opts: MockCtxOptions = {}): Record<string, any> {
  const resources = new Map<string, Record<string, any>>();
  for (const [key, values] of Object.entries(opts.resources ?? {})) {
    resources.set(key, { ...values });
  }

  const dialogChars: string[] = [];

  const ctx: Record<string, any> = {
    stage: opts.stage ?? 0,
    delayTimer: opts.delayTimer,
    dialogAtCharIdx: opts.dialogAtCharIdx ?? 0,
    _cacheDialogChars: opts._cacheDialogChars,

    resource(key: string): Record<string, any> {
      if (!resources.has(key)) {
        resources.set(key, {});
      }
      return resources.get(key)!;
    },

    addDialogLetter(char: string) {
      dialogChars.push(char);
    },

    askYesNo(): boolean | undefined {
      return opts.askYesNoResult;
    },

    _getDialogChars() {
      return dialogChars;
    },
    _getResource(key: string) {
      return resources.get(key);
    },
  };

  return ctx;
}

function runToEnd(ctx: Record<string, any>, storyUpdate: (ctx: Record<string, any>, dt: number) => void, dt: number = 0.016): void {
  const maxIterations = 10000;
  let iterations = 0;
  while (ctx.stage >= 0 && iterations < maxIterations) {
    storyUpdate(ctx, dt);
    iterations++;
  }
  if (iterations >= maxIterations) {
    throw new Error("runToEnd: exceeded max iterations (infinite loop?)");
  }
}

function stepUntilBlocked(ctx: Record<string, any>, storyUpdate: (ctx: Record<string, any>, dt: number) => void, dt: number = 0.016): void {
  const startStage = ctx.stage;
  const maxIterations = 100;
  let iterations = 0;
  while (iterations < maxIterations) {
    const stageBefore = ctx.stage;
    storyUpdate(ctx, dt);
    if (ctx.stage === stageBefore) {
      return;
    }
    iterations++;
  }
  if (iterations >= maxIterations) {
    throw new Error("stepUntilBlocked: exceeded max iterations");
  }
}

async function compileStory(storyFn: (...args: any[]) => any): Promise<(ctx: any, dt: number) => void> {
  const compiled = compile(storyFn([]));
  const code = compiled.code.join("\r\n");
  const dataUrl = "data:text/javascript," + encodeURIComponent(code);
  const mod = await import(/* @vite-ignore */ dataUrl);
  return mod.storyUpdate;
}

describe("storyUpdate with mock ctx", () => {
  describe("delay", () => {
    it("pauses until enough time passes", async () => {
      const storyUpdate = await compileStory(Fn(() => {
        delay(1);
      }));

      const ctx = createMockCtx();
      expect(ctx.stage).toBe(0);

      storyUpdate(ctx, 0.5);
      expect(ctx.stage).toBe(0);

      storyUpdate(ctx, 0.5);
      expect(ctx.stage).toBe(-1);
    });

    it("accumulates partial dt across frames", async () => {
      const storyUpdate = await compileStory(Fn(() => {
        delay(0.5);
      }));

      const ctx = createMockCtx();

      storyUpdate(ctx, 0.2);
      expect(ctx.stage).toBe(0);
      expect(ctx.delayTimer).toBeCloseTo(0.2);

      storyUpdate(ctx, 0.2);
      expect(ctx.stage).toBe(0);
      expect(ctx.delayTimer).toBeCloseTo(0.4);

      storyUpdate(ctx, 0.2);
      expect(ctx.stage).toBe(-1);
    });

    it("clears delayTimer after completion", async () => {
      const storyUpdate = await compileStory(Fn(() => {
        delay(100);
      }));

      const ctx = createMockCtx();
      storyUpdate(ctx, 200);
      expect(ctx.delayTimer).toBeUndefined();
    });
  });

  describe("dialog", () => {
    it("outputs characters one by one with delay", async () => {
      const storyUpdate = await compileStory(Fn(() => {
        dialog("AB");
      }));

      const ctx = createMockCtx();

      storyUpdate(ctx, 0.15);
      expect(ctx._getDialogChars()).toEqual(["A"]);
      expect(ctx.stage).toBe(1);

      storyUpdate(ctx, 0.3);
      expect(ctx._getDialogChars()).toEqual(["A", "B"]);
      expect(ctx.stage).toBe(-1);
    });

    it("advances one char per sufficient delay frame", async () => {
      const storyUpdate = await compileStory(Fn(() => {
        dialog("ABC");
      }));

      const ctx = createMockCtx();

      storyUpdate(ctx, 0.3);
      expect(ctx._getDialogChars()).toEqual(["A", "B", "C"]);
      expect(ctx.stage).toBe(-1);
    });
  });

  describe("awaitActionPress", () => {
    it("pauses when action is not pressed", async () => {
      const storyUpdate = await compileStory(Fn(() => {
        awaitActionPress();
      }));

      const ctx = createMockCtx({
        resources: { Input: { actionPressed: false } },
      });

      storyUpdate(ctx, 0.016);
      expect(ctx.stage).toBe(0);
    });

    it("proceeds when action is pressed", async () => {
      const storyUpdate = await compileStory(Fn(() => {
        awaitActionPress();
      }));

      const ctx = createMockCtx({
        resources: { Input: { actionPressed: true } },
      });

      storyUpdate(ctx, 0.016);
      expect(ctx.stage).toBe(-1);
    });

    it("can proceed after initially being blocked", async () => {
      const storyUpdate = await compileStory(Fn(() => {
        awaitActionPress();
      }));

      const ctx = createMockCtx({
        resources: { Input: { actionPressed: false } },
      });

      storyUpdate(ctx, 0.016);
      expect(ctx.stage).toBe(0);

      ctx.resource("Input").actionPressed = true;
      storyUpdate(ctx, 0.016);
      expect(ctx.stage).toBe(-1);
    });
  });

  describe("askYesNo", () => {
    it("pauses when askYesNo returns undefined", async () => {
      const storyUpdate = await compileStory(Fn(() => {
        obtainVar<boolean>("GameRes", "yesNoVal").assign(askYesNo());
      }));

      const ctx = createMockCtx({
        resources: { Input: { isYes: false }, GameRes: { yesNoVal: false } },
        askYesNoResult: undefined,
      });

      storyUpdate(ctx, 0.016);
      expect(ctx.stage).toBeGreaterThanOrEqual(0);
    });

    it("writes result to Input resource and proceeds", async () => {
      const storyUpdate = await compileStory(Fn(() => {
        obtainVar<boolean>("GameRes", "yesNoVal").assign(askYesNo());
      }));

      const ctx = createMockCtx({
        resources: { Input: { isYes: false }, GameRes: { yesNoVal: false } },
        askYesNoResult: true,
      });

      runToEnd(ctx, storyUpdate);
      expect(ctx.stage).toBe(-1);
      expect(ctx.resource("Input").isYes).toBe(true);
      expect(ctx.resource("GameRes").yesNoVal).toBe(true);
    });

    it("writes false answer correctly", async () => {
      const storyUpdate = await compileStory(Fn(() => {
        obtainVar<boolean>("GameRes", "yesNoVal").assign(askYesNo());
      }));

      const ctx = createMockCtx({
        resources: { Input: { isYes: false }, GameRes: { yesNoVal: true } },
        askYesNoResult: false,
      });

      runToEnd(ctx, storyUpdate);
      expect(ctx.resource("Input").isYes).toBe(false);
      expect(ctx.resource("GameRes").yesNoVal).toBe(false);
    });
  });

  describe("introSequence", () => {
    it("runs the full intro sequence to completion", async () => {
      const { compile: c, Fn: f, delay: d, dialog: dl, awaitActionPress: aap,
        askYesNo: ayn, obtainVar: ov, If: I } = await import("./story-lang");

      const story = f(() => {
        d(1000);
        dl("Melty: Boy. Morning already?");
        aap();
        dl("Melty: Time to get ready for the day! Who knows what adventures today holds!");
        aap();
        dl("Get out of bed?");
        const r = ov<boolean>("GameRes", "yesNoVal");
        r.assign(ayn());
        I(r, () => {}).Else(() => {});
      });

      const compiled = c(story([]));
      const code = compiled.code.join("\r\n");
      const dataUrl = "data:text/javascript," + encodeURIComponent(code);
      const mod = await import(/* @vite-ignore */ dataUrl);
      const storyUpdate = mod.storyUpdate;

      const ctx = createMockCtx({
        resources: {
          Input: { isYes: false, actionPressed: false },
          GameRes: { yesNoVal: false },
        },
        askYesNoResult: true,
      });

      const maxIterations = 5000;
      let i = 0;

      while (ctx.stage >= 0 && i < maxIterations) {
        ctx.resource("Input").actionPressed = true;
        storyUpdate(ctx, 500);
        i++;
      }
      expect(ctx.stage).toBe(-1);
      expect(i).toBeLessThan(maxIterations);
    });
  });
});
