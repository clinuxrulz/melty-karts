import { createEffect, createSignal, onCleanup, onSettled, type Component, For, Show } from "solid-js";
import { ReactiveECS } from "@melty-karts/reactive-ecs";
import QRCode from "qrcode";
import { multiplayerSession } from "../netcode/MultiplayerSession";
import { MasterState, RegisteredGameMode, RegisteredMasterState } from "../World";
import { System } from "./System";

export function createMultiplayerLobbySystem(ecs: ReactiveECS): System {
  const [snapshot, setSnapshot] = createSignal(multiplayerSession.getSnapshot());
  const [qrCode, setQrCode] = createSignal<string>();
  const [copied, setCopied] = createSignal(false);
  const [manualCode, setManualCode] = createSignal("");

  const unsubscribe = multiplayerSession.subscribe(() => {
    setSnapshot(multiplayerSession.getSnapshot());
  });
  onCleanup(unsubscribe);

  const copyToClipboard = async () => {
    const data = snapshot();
    if (data.invitePayload) {
      await navigator.clipboard.writeText(data.invitePayload);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  createEffect(
    () => snapshot().inviteUrl,
    (inviteUrl) => {
      if (!inviteUrl) {
        setQrCode(undefined);
        return;
      }
      QRCode.toDataURL(inviteUrl, {
        margin: 1,
        width: 240,
        errorCorrectionLevel: "L",
      }).then(setQrCode).catch(() => setQrCode(undefined));
    },
  );

  onSettled(() => {
    if (multiplayerSession.isActive) {
      return;
    }
    if (multiplayerSession.hasInviteInUrl()) {
      void multiplayerSession.joinFromUrl(ecs);
    }
  });

  const UI: Component = () => {
    const isHost = () => snapshot().players.find((player) => player.id === snapshot().localPlayerId)?.isHost ?? false;
    const isActive = () => snapshot().status !== "idle";
    const isReady = () => snapshot().status === "lobby" || snapshot().status === "playing";

    return (
      <div
        style={{
          position: "absolute",
          inset: "0",
          display: "flex",
          "flex-direction": "column",
          "align-items": "center",
          "justify-content": "center",
          padding: "24px",
          background: "#121212",
          color: "#ffffff",
          "font-family": "Arial, sans-serif",
          overflow: "auto",
        }}
      >
        <div style={{ width: "100%", "max-width": "360px", display: "flex", "flex-direction": "column", gap: "24px" }}>
          
          <div style={{ "text-align": "center" }}>
            <div style={{ "font-size": "32px", "font-weight": "900", "letter-spacing": "-0.02em" }}>
              {!isActive() ? "MULTIPLAYER" : isHost() ? "LOBBY HOST" : "JOINED"}
            </div>
            {snapshot().error && <div style={{ color: "#ff5555", "margin-top": "8px" }}>{snapshot().error}</div>}
            {!isReady() && isActive() && <div style={{ "margin-top": "8px", opacity: 0.6 }}>Loading...</div>}
          </div>

          <Show when={isReady()}>
            <div style={{ display: "flex", "flex-direction": "column", "align-items": "center", gap: "16px" }}>
              {isHost() && qrCode() && (
                <div style={{ background: "#ffffff", padding: "12px", "border-radius": "16px", "box-shadow": "0 8px 30px rgba(0,0,0,0.5)" }}>
                  <img src={qrCode()} alt="Invite QR" style={{ width: "180px", height: "180px", display: "block" }} />
                </div>
              )}
              
              <div style={{ width: "100%", background: "#1a1a1a", padding: "16px", "border-radius": "16px", border: "1px solid #333", "text-align": "center" }}>
                <div style={{ "font-size": "11px", opacity: 0.5, "text-transform": "uppercase", "letter-spacing": "0.1em", "margin-bottom": "8px" }}>
                  Invite Code
                </div>
                <div style={{ display: "flex", "align-items": "center", "justify-content": "center", gap: "12px" }}>
                  <span style={{ "font-size": "24px", "font-weight": "bold", "font-family": "monospace" }}>{snapshot().inviteCode}</span>
                  <button 
                    onClick={copyToClipboard}
                    style={{
                      background: copied() ? "#5fcf8f" : "#ffffff",
                      color: "#000000",
                      border: "none",
                      padding: "6px 12px",
                      "border-radius": "6px",
                      "font-size": "12px",
                      "font-weight": "bold",
                      cursor: "pointer",
                      "min-width": "60px"
                    }}
                  >
                    {copied() ? "DONE" : "COPY"}
                  </button>
                </div>
              </div>
            </div>
          </Show>

          <Show when={!isActive()}>
             <div style={{ display: "flex", "flex-direction": "column", gap: "24px" }}>
                <button
                  onClick={() => multiplayerSession.host(ecs)}
                  style={btnStyle("#ffffff", "#000")}
                >
                  HOST A RACE
                </button>

                <div style={{ display: "flex", "flex-direction": "column", gap: "12px" }}>
                  <div style={{ "font-size": "11px", opacity: 0.5, "text-transform": "uppercase", "letter-spacing": "0.1em", "text-align": "center" }}>
                    Or Join via Code
                  </div>
                  <input
                    type="text"
                    placeholder="ENTER 6-CHAR CODE"
                    value={manualCode()}
                    onInput={(e) => setManualCode(e.currentTarget.value.toUpperCase())}
                    style={{
                      padding: "16px",
                      "border-radius": "12px",
                      border: "1px solid #333",
                      background: "#000",
                      color: "#fff",
                      "font-size": "18px",
                      "text-align": "center",
                      "font-family": "monospace",
                      "letter-spacing": "0.2em"
                    }}
                  />
                  <button
                    onClick={() => {
                      if (manualCode().trim()) {
                        void multiplayerSession.joinByPayload(ecs, manualCode().trim());
                        setManualCode("");
                      }
                    }}
                    style={btnStyle("#5fcf8f", "#000")}
                  >
                    JOIN RACE
                  </button>
                </div>
             </div>
          </Show>

          <Show when={isReady()}>
            <div style={{ width: "100%" }}>
              <div style={{ "font-size": "11px", opacity: 0.5, "text-transform": "uppercase", "letter-spacing": "0.1em", "margin-bottom": "12px" }}>
                Drivers ({snapshot().players.length}/4)
              </div>
              <div style={{ display: "flex", "flex-direction": "column", gap: "8px" }}>
                <For each={snapshot().players}>
                  {(p) => (
                    <div style={{ 
                      padding: "10px 16px", 
                      background: p.id === snapshot().localPlayerId ? "#ffffff" : "#1a1a1a",
                      color: p.id === snapshot().localPlayerId ? "#000000" : "#ffffff",
                      "border-radius": "10px",
                      "font-size": "14px",
                      display: "flex",
                      "justify-content": "space-between",
                      "align-items": "center"
                    }}>
                      <span style={{ "font-family": "monospace" }}>{(p.id || "").slice(0, 12)}</span>
                      {p.isHost && <span style={{ "font-size": "10px", "font-weight": "bold", opacity: 0.7 }}>HOST</span>}
                    </div>
                  )}
                </For>
              </div>
            </div>
          </Show>

          <div style={{ display: "flex", gap: "12px", "margin-top": "8px" }}>
            <button
              onClick={() => {
                multiplayerSession.leave();
                ecs.set_resource(RegisteredGameMode, { mode: 0 });
                ecs.set_resource(RegisteredMasterState, { masterState: MasterState.INTRO_SCREEN });
              }}
              style={{ ...btnStyle("#222", "#fff"), flex: 1, "font-size": "14px" }}
            >
              EXIT
            </button>
            <Show when={isHost() && isReady()}>
              <button
                disabled={snapshot().players.length === 0}
                onClick={() => multiplayerSession.startGame(ecs)}
                style={{ ...btnStyle("#ffffff", "#000"), flex: 2, opacity: snapshot().players.length === 0 ? 0.5 : 1 }}
              >
                START RACE
              </button>
            </Show>
          </div>
        </div>
      </div>
    );
  };

  return {
    ui: () => UI,
  };
}

function btnStyle(bg: string, fg: string) {
  return {
    padding: "16px 20px",
    "border-radius": "12px",
    border: "none",
    background: bg,
    color: fg,
    "font-size": "16px",
    "font-weight": "900",
    cursor: "pointer",
    "transition": "transform 0.1s active"
  };
}
