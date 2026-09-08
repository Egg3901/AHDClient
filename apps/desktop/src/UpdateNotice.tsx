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

interface Props {
  /** App-store builds update through their store and have no updater ACL. */
  enabled?: boolean;
}

export function UpdateNotice({ enabled = true }: Props): JSX.Element | null {
  const [state, setState] = useState<UpdateState>({ kind: "checking" });
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    if (!enabled) return;
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
  }, [enabled]);

  if (state.kind === "checking" || state.kind === "current" || dismissed)
    return null;

  const notes =
    state.kind === "available"
      ? state.notes
          .split("\n")
          .map((note) => note.trim().replace(/^[-*]\s+/, ""))
          .filter(Boolean)
      : [];

  return (
    <aside className="client-update-notice" role="status" aria-live="polite">
      {state.kind === "error" ? (
        <>
          <div className="client-update-heading">
            <span className="client-update-mark" aria-hidden="true">
              !
            </span>
            <div>
              <strong>Update stopped</strong>
              <p>{state.message}. Try again from Settings.</p>
            </div>
          </div>
          <button
            className="client-update-later"
            type="button"
            onClick={() => setDismissed(true)}
          >
            Dismiss
          </button>
        </>
      ) : state.kind === "installing" ? (
        <div className="client-update-heading">
          <span
            className="client-update-mark client-update-mark-pulse"
            aria-hidden="true"
          >
            &#8593;
          </span>
          <div>
            <strong>Installing update</strong>
            <p>AHDClient will restart when it is ready.</p>
          </div>
        </div>
      ) : (
        <>
          <div className="client-update-heading">
            <span className="client-update-mark" aria-hidden="true">
              &#8593;
            </span>
            <div>
              <strong>AHDClient {state.version} is ready</strong>
              <p>A new client and paired game build are available.</p>
            </div>
          </div>
          {notes.length > 0 && (
            <details className="client-update-details">
              <summary>What's new</summary>
              <ul>
                {notes.map((note, index) => (
                  <li key={`${index}-${note}`}>{note}</li>
                ))}
              </ul>
            </details>
          )}
          <div className="client-update-actions">
            <button
              className="client-update-primary"
              type="button"
              onClick={() => void state.install()}
            >
              Update and restart
            </button>
            <button
              className="client-update-later"
              type="button"
              onClick={() => setDismissed(true)}
            >
              Later
            </button>
          </div>
        </>
      )}
    </aside>
  );
}
