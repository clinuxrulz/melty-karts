import { Component, createSignal, createEffect, onCleanup, Show, onSettled, getOwner, runWithOwner } from "solid-js";
import { compile, Fn, delay, dialog, awaitActionPress, askYesNo, obtainVar, If } from "./story-lang";

function createStoryCtx() {
  const [dialogText, setDialogText] = createSignal("");
  const [showYesNo, setShowYesNo] = createSignal(false);

  const resources = new Map<string, Record<string, any>>();
  resources.set("Input", { actionPressed: false, isYes: false });
  resources.set("GameRes", { yesNoVal: false });

  let yesNoAnswer: boolean | undefined;
  let hasPrompted = false;

  const ctx = {
    stage: 0,
    delayTimer: undefined as number | undefined,
    dialogAtCharIdx: 0,
    _cacheDialogChars: undefined as string[] | undefined,

    resource(key: string): Record<string, any> {
      let res = resources.get(key);
      if (!res) {
        res = {};
        resources.set(key, res);
      }
      return res;
    },

    addDialogLetter(char: string) {
      if (this.dialogAtCharIdx === 0) {
        setDialogText("");
        setShowYesNo(false);
      }
      setDialogText((prev) => prev + char);
    },

    askYesNo(): boolean | undefined {
      if (yesNoAnswer !== undefined) {
        const answer = yesNoAnswer;
        yesNoAnswer = undefined;
        hasPrompted = false;
        setShowYesNo(false);
        return answer;
      }
      if (!hasPrompted) {
        hasPrompted = true;
        setShowYesNo(true);
      }
      return;
    },

    answerYesNo(value: boolean) {
      yesNoAnswer = value;
    },

    getDialogText() { return dialogText(); },
    getShowYesNo() { return showYesNo(); },
  };

  return ctx;
}

let introSequence = Fn(() => {
  delay(1.0);
  dialog("Melty: Boy. Morning already?");
  awaitActionPress();
  dialog("Melty: Time to get ready for the day! Who knows what adventures today holds!");
  awaitActionPress();
  dialog("Get out of bed?");
  let r = obtainVar<boolean>("GameRes", "yesNoVal");
  r.assign(askYesNo());
  If(r, () => {
    dialog("You jumped out of bed.");
  }).Else(() => {
    dialog("You went back to sleep.");
  });
});

let introSequenceCode = compile(introSequence([])).code.join("\r\n");
let introSequenceBlob = new Blob([introSequenceCode], { type: "text/javascript" });
let introSequenceUrl = URL.createObjectURL(introSequenceBlob);
let introSequenceModule = await import(/* @vite-ignore */ introSequenceUrl);

const App: Component = () => {
  const ctx = createStoryCtx();

  let owner = getOwner();

  onSettled(() => runWithOwner(owner, () => {
    let lastTime = 0;
    let frameId = 0;

    function tick(time: number) {
      if (lastTime === 0) {
        lastTime = time;
      }
      const dt = (time - lastTime) / 1000.0;
      lastTime = time;

      introSequenceModule.storyUpdate(ctx, dt);

      frameId = requestAnimationFrame(tick);
    }

    frameId = requestAnimationFrame(tick);
    onCleanup(() => cancelAnimationFrame(frameId));
  }));

  const handleAction = () => {
    ctx.resource("Input").actionPressed = true;
  };

  return (
    <div
      style={{
        width: "100vw",
        height: "100vh",
        background: "#1a1a2e",
        color: "#eee",
        display: "flex",
        "flex-direction": "column",
        "align-items": "center",
        "justify-content": "center",
        "font-family": "monospace",
        cursor: "pointer",
      }}
      onClick={handleAction}
      onKeyDown={(e) => { handleAction(); }}
      tabindex={0}
    >
      <Show when={ctx.getDialogText() !== ""}>
        <div
          style={{
            background: "#16213e",
            border: "2px solid #0f3460",
            "border-radius": "8px",
            padding: "24px",
            "max-width": "600px",
            "min-height": "80px",
            "font-size": "18px",
            "line-height": "1.6",
            "white-space": "pre-wrap",
          }}
        >
          {ctx.getDialogText()}
          <Show when={ctx._cacheDialogChars !== undefined && ctx.resource("Input").actionPressed === false}>
            <span style={{ "animation": "blink 1s step-end infinite" }}>▌</span>
          </Show>
        </div>
      </Show>

      <Show when={ctx.getShowYesNo()}>
        <div style={{ display: "flex", gap: "16px", "margin-top": "24px" }}>
          <button
            onClick={() => ctx.answerYesNo(true)}
            style={{
              padding: "12px 32px",
              "font-size": "18px",
              background: "#0f3460",
              color: "#eee",
              border: "2px solid #533483",
              "border-radius": "8px",
              cursor: "pointer",
            }}
          >
            Yes
          </button>
          <button
            onClick={() => ctx.answerYesNo(false)}
            style={{
              padding: "12px 32px",
              "font-size": "18px",
              background: "#0f3460",
              color: "#eee",
              border: "2px solid #533483",
              "border-radius": "8px",
              cursor: "pointer",
            }}
          >
            No
          </button>
        </div>
      </Show>

      <Show when={ctx.resource("Input").actionPressed === false && ctx.getDialogText() !== "" && !ctx.getShowYesNo() && ctx._cacheDialogChars === undefined}>
        <div style={{ "margin-top": "16px", "font-size": "14px", opacity: 0.6 }}>
          Press any key or click to continue
        </div>
      </Show>
    </div>
  );
};

export default App;
