import { useState } from "react";

type UpdateState =
  | { kind: "idle" | "checking" | "current" | "installing" }
  | { kind: "available"; version: string; install: () => Promise<void> }
  | { kind: "error"; message: string };

export function UpdateControl(): JSX.Element {
  const [state, setState] = useState<UpdateState>({ kind: "idle" });
  const checkNow = async () => {
    setState({ kind: "checking" });
    try {
      const { check } = await import("@tauri-apps/plugin-updater");
      const update = await check({ timeout: 15_000 });
      if (!update) return setState({ kind: "current" });
      setState({ kind: "available", version: update.version, install: async () => {
        setState({ kind: "installing" });
        await update.downloadAndInstall();
        const { relaunch } = await import("@tauri-apps/plugin-process");
        await relaunch();
      }});
    } catch (error) {
      setState({ kind: "error", message: error instanceof Error ? error.message : String(error) });
    }
  };
  const message = state.kind === "current" ? "AHDClient is up to date."
    : state.kind === "available" ? `AHDClient ${state.version} is available.`
      : state.kind === "installing" ? "Installing. AHDClient will restart when ready."
        : state.kind === "error" ? state.message : "Check for a signed AHDClient release.";
  return (
    <section className="client-update-control" aria-live="polite">
      <div><strong>Desktop updates</strong><small>{message}</small></div>
      {state.kind === "available"
        ? <button type="button" onClick={() => void state.install()}>Update and restart</button>
        : <button type="button" disabled={state.kind === "checking" || state.kind === "installing"} onClick={() => void checkNow()}>{state.kind === "checking" ? "Checking…" : "Check for updates"}</button>}
    </section>
  );
}
