import { useEffect, useState } from "react";
import "./update.css";

type UpdateState =
  | { kind: "checking" }
  | { kind: "current" }
  | {
      kind: "available";
      version: string;
      notes: string;
      install: () => Promise<void>;
    }
  | { kind: "installing" }
  | { kind: "error"; message: string };

export function UpdateNotice(): JSX.Element | null {
  const [state, setState] = useState<UpdateState>({ kind: "checking" });

  useEffect(() => {
    let cancelled = false;
    const timer = window.setTimeout(() => {
      void (async () => {
        try {
          const { check } = await import("@tauri-apps/plugin-updater");
          const update = await check({ timeout: 15_000 });
          if (cancelled) return;
          if (!update) {
            setState({ kind: "current" });
            return;
          }
          setState({
            kind: "available",
            version: update.version,
            notes:
              update.body ?? "A new AHDClient and paired game build are ready.",
            install: async () => {
              setState({ kind: "installing" });
              try {
                await update.downloadAndInstall();
                const { relaunch } = await import("@tauri-apps/plugin-process");
                await relaunch();
              } catch (error) {
                setState({
                  kind: "error",
                  message:
                    error instanceof Error ? error.message : String(error),
                });
              }
            },
          });
        } catch (error) {
          if (!cancelled) {
            setState({
              kind: "error",
              message: error instanceof Error ? error.message : String(error),
            });
          }
        }
      })();
    }, 4_000);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, []);

  if (state.kind === "checking" || state.kind === "current") return null;

  return (
    <aside className="client-update-notice" aria-live="polite">
      {state.kind === "error" ? (
        <strong>
          Update stopped: {state.message}. Try again from Settings.
        </strong>
      ) : state.kind === "installing" ? (
        <strong>
          Installing the update. AHDClient will restart when it is ready.
        </strong>
      ) : (
        <>
          <span>
            <strong>AHDClient {state.version} is ready.</strong> {state.notes}
          </span>
          <button type="button" onClick={() => void state.install()}>
            Update and restart
          </button>
        </>
      )}
    </aside>
  );
}
