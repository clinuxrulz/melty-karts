import { ReactiveECS } from "@melty-karts/reactive-ecs";
import { System } from "./System";
import { Component, createMemo, createSignal, createStore, Match, onCleanup, onSettled, Switch } from "solid-js";
import { MasterState, RegisteredKeyBindings, RegisteredMasterState } from "../World";
import { allocStringId, freeStringId, lookupString } from "../StringTable";
import { ResourceKey } from "@oasys/oecs";
import { untrack } from "@solidjs/web";

export function createKeyBindingSystem(ecs: ReactiveECS): System {
  let goBack = () => {
    ecs.setResource(
      RegisteredMasterState,
      {
        masterState: MasterState.INTRO_SCREEN,
      }
    );
  };
  type GetKeys<R> = R extends ResourceKey<infer T> ? (string & keyof T) : never;
  let keyBindings = createMemo(() => ecs.resource(RegisteredKeyBindings));
  let createKey =
    (k: GetKeys<typeof RegisteredKeyBindings>) =>
      createMemo(() => lookupString(keyBindings().get(k)));
  let updateKey =
    (
      k: GetKeys<typeof RegisteredKeyBindings>,
      value: string
    ) => {
      let keyBindings2 = untrack(keyBindings);
      let oldKeyId = keyBindings2.get(k);
      let newKeyId = allocStringId(value);
      let newKeyBindings: { [k in GetKeys<typeof RegisteredKeyBindings>]: number } = {
        upKey: keyBindings2.get("upKey"),
        downKey: keyBindings2.get("downKey"),
        leftKey: keyBindings2.get("leftKey"),
        rightKey: keyBindings2.get("rightKey"),
        actionKey: keyBindings2.get("actionKey"),
        driftKey: keyBindings2.get("driftKey"),
        useItemKey: keyBindings2.get("useItemKey"),
      };
      newKeyBindings[k] = newKeyId;
      ecs.setResource(RegisteredKeyBindings, newKeyBindings);
      freeStringId(oldKeyId);
      let toSave: { [k in GetKeys<typeof RegisteredKeyBindings>]: string } = {
        upKey: lookupString(newKeyBindings.upKey),
        downKey: lookupString(newKeyBindings.downKey),
        leftKey: lookupString(newKeyBindings.leftKey),
        rightKey: lookupString(newKeyBindings.rightKey),
        actionKey: lookupString(newKeyBindings.actionKey),
        driftKey: lookupString(newKeyBindings.driftKey),
        useItemKey: lookupString(newKeyBindings.useItemKey),
      };
      window.localStorage.setItem("melty-karts-key-binding", JSON.stringify(toSave));
    };
  let reset = () => {
    let keyBindings2 = untrack(keyBindings);
    freeStringId(keyBindings2.get("upKey"));
    freeStringId(keyBindings2.get("downKey"));
    freeStringId(keyBindings2.get("leftKey"));
    freeStringId(keyBindings2.get("rightKey"));
    freeStringId(keyBindings2.get("actionKey"));
    freeStringId(keyBindings2.get("useItemKey"));
    let newKeyBindings: { [k in GetKeys<typeof RegisteredKeyBindings>]: number } = {
      upKey: allocStringId("ArrowUp"),
      downKey: allocStringId("ArrowDown"),
      leftKey: allocStringId("ArrowLeft"),
      rightKey: allocStringId("ArrowRight"),
      actionKey: allocStringId(" "),
      driftKey: keyBindings2.get("driftKey"),
      useItemKey: allocStringId("Enter"),
    };
    ecs.setResource(RegisteredKeyBindings, newKeyBindings);
    let toSave: { [k in GetKeys<typeof RegisteredKeyBindings>]: string } = {
      upKey: lookupString(newKeyBindings.upKey),
      downKey: lookupString(newKeyBindings.downKey),
      leftKey: lookupString(newKeyBindings.leftKey),
      rightKey: lookupString(newKeyBindings.rightKey),
      actionKey: lookupString(newKeyBindings.actionKey),
      driftKey: lookupString(newKeyBindings.driftKey),
      useItemKey: lookupString(newKeyBindings.useItemKey),
    };
    window.localStorage.setItem("melty-karts-key-binding", JSON.stringify(toSave));
  };
  let upKey = createKey("upKey");
  let downKey = createKey("downKey");
  let leftKey = createKey("leftKey");
  let rightKey = createKey("rightKey");
  let actionKey = createKey("actionKey");
  let useItemKey = createKey("useItemKey");
  const ui = createMemo(() => () => {
    let [ state, setState, ] = createStore<{
      askingKeyForAction: string | undefined,
    }>({
      askingKeyForAction: undefined,
    });
    return (
      <div
        style={{
          "position": "absolute",
          "left": "0",
          "top": "0",
          "right": "0",
          "bottom": "0",
          "overflow": "auto",
        }}
      >
        <div
          style={{
            "position": "absolute",
            "left": "50%",
            "top": "50%",
            "width": "fit-content",
            "transform": "translate(-50%, -50%)",
            "border": "white 2px solid",
            "border-radius": "10px"
          }}
        >
          <h1 style={{
            "text-align": "center",
            "color": "red",
          }}>Key Bindings</h1>
          <table
            style={{
              "margin": "20px",
            }}
          >
            <thead/>
            <tbody>
              <tr>
                <KeyBindingUI
                  action="Up"
                  key={upKey()}
                  setKey={(key) => {
                    updateKey("upKey", key);
                    setState((s) => { s.askingKeyForAction = undefined; });
                  }}
                  askKey={() => setState((s) => { s.askingKeyForAction = "Up"; })}
                  askingKey={state.askingKeyForAction === "Up"}
                  onCancelAskingKey={() => {
                    setState((s) => { s.askingKeyForAction = undefined; });
                  }}
                />
                <td style={{ "width": "5px", }}/>
                <KeyBindingUI
                  action="Accelerate"
                  key={actionKey()}
                  setKey={(key) => {
                    updateKey("actionKey", key);
                    setState((s) => { s.askingKeyForAction = undefined; });
                  }}
                  askKey={() => setState((s) => { s.askingKeyForAction = "Accelerate"; })}
                  askingKey={state.askingKeyForAction === "Accelerate"}
                  onCancelAskingKey={() => {
                    setState((s) => { s.askingKeyForAction = undefined; });
                  }}
                />
              </tr>
              <tr>
                <KeyBindingUI
                  action="Down"
                  key={downKey()}
                  setKey={(key) => {
                    updateKey("downKey", key);
                    setState((s) => { s.askingKeyForAction = undefined; });
                  }}
                  askKey={() => setState((s) => { s.askingKeyForAction = "Down"; })}
                  askingKey={state.askingKeyForAction === "Down"}
                  onCancelAskingKey={() => {
                    setState((s) => { s.askingKeyForAction = undefined; });
                  }}
                />
                <td style={{ "width": "5px", }}/>
                <KeyBindingUI
                  action="Use Item"
                  key={useItemKey()}
                  setKey={(key) => {
                    updateKey("useItemKey", key);
                    setState((s) => { s.askingKeyForAction = undefined; });
                  }}
                  askKey={() => setState((s) => { s.askingKeyForAction = "Use Item"; })}
                  askingKey={state.askingKeyForAction === "Use Item"}
                  onCancelAskingKey={() => {
                    setState((s) => { s.askingKeyForAction = undefined; });
                  }}
                />
              </tr>
              <tr>
                <KeyBindingUI
                  action="Left"
                  key={leftKey()}
                  setKey={(key) => {
                    updateKey("leftKey", key);
                    setState((s) => { s.askingKeyForAction = undefined; });
                  }}
                  askKey={() => setState((s) => { s.askingKeyForAction = "Left"; })}
                  askingKey={state.askingKeyForAction === "Left"}
                  onCancelAskingKey={() => {
                    setState((s) => { s.askingKeyForAction = undefined; });
                  }}
                />
              </tr>
              <tr>
                <KeyBindingUI
                  action="Right"
                  key={rightKey()}
                  setKey={(key) => {
                    updateKey("rightKey", key)
                    setState((s) => s.askingKeyForAction = undefined);
                  }}
                  askKey={() => setState((s) => { s.askingKeyForAction = "Right"; })}
                  askingKey={state.askingKeyForAction === "Right"}
                  onCancelAskingKey={() => {
                    setState((s) => { s.askingKeyForAction = undefined; });
                  }}
                />
              </tr>
              <tr>
                <td
                  colspan="5"
                  style={{
                    "text-align": "center",
                    "padding-top": "20px",
                  }}
                >
                  <button
                    style={{
                      "background-color": "#903636",
                      "color": "#FFFFFF",
                      "margin-left": "5px",
                      "font-size": "18pt",
                      "padding": "10px",
                      "margin": "2px",
                      "border-radius": "15px",
                    }}
                    onClick={() => {
                      reset();
                    }}
                  >
                    Reset
                  </button>
                  <button
                    style={{
                      "background-color": "#36903e",
                      "color": "#FFFFFF",
                      "font-size": "18pt",
                      "padding": "10px",
                      "margin-left": "10px",
                      "border-radius": "15px",
                    }}
                    onClick={goBack}
                  >
                    Go Back
                  </button>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    );
  });
  return {
    ui,
  };
}

const KeyBindingUI: Component<{
  action: string,
  key: string,
  setKey: (key: string) => void,
  askKey: () => void,
  askingKey: boolean,
  onCancelAskingKey: () => void,
}> = (props) => {
  return (
    <>
      <td style="white-space: nowrap;">
        <text
          style={{
            "font-size": "18pt",
            "color": "cyan",
          }}
        >
          {props.action}:
        </text>
      </td>
      <td>
        <Switch>
          <Match when={!props.askingKey}>
            <button
              style={{
                "background-color": "#2e28c7",
                "color": "#FFFFFF",
                "margin-left": "5px",
                "font-size": "18pt",
                "padding": "10px",
                "margin": "2px",
                "border-radius": "15px",
              }}
              onClick={() => props.askKey()}
            >
              {props.key === " " ? "Space" : props.key}
            </button>
          </Match>
          <Match when={props.askingKey}>
            <KeyReceiverUI
              onKey={(key) => props.setKey(key)}
              onCancel={() => props.onCancelAskingKey()}
            />
          </Match>
        </Switch>
      </td>
    </>
  );
};

const KeyReceiverUI: Component<{
  onKey: (key: string) => void,
  onCancel: () => void,
}> = (props) => {
  let keyDownListener = (e: KeyboardEvent) => {
    if (e.key === "Escape") {
      props.onCancel();
      return;
    }
    props.onKey(e.key);
  };
  document.addEventListener("keydown", keyDownListener);
  onCleanup(() => {
    document.removeEventListener("keydown", keyDownListener);
  });
  return (
    <div
      style={{
        "color": "#FFFFFF",
        "margin-left": "5px",
        "font-size": "18pt",
        "padding": "10px",
        "margin": "2px",
        "border": "2px solid white",
        "border-radius": "15px",
      }}
    >
      Press a key
    </div>
  );
};
