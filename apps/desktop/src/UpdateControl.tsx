import { useEffect, useState } from "react";
import {
  checkForUpdatesNow,
  confirmRestartToUpdate,
  getUpdaterSnapshot,
  subscribeUpdater,
  type UpdaterSnapshot,
} from "./updater.js";

function messageFor(state: UpdaterSnapshot): string {
  switch (state.kind) {
    case "current":
      return "AHDClient is up to date.";
    case "downloading":
      return state.total
        ? `Downloading AHDClient ${state.version} (${Math.min(100, Math.round((state.received / state.total) * 100))}%).`
        : `Downloading AHDClient ${state.version} in the background.`;
    case "ready":
      return `AHDClient ${state.version} is downloaded. Restart to install it.`;
    case "installing":
      return "Installing the downloaded update.";
    case "error":
      return state.message;
    case "checking":
      return "Checking for a signed AHDClient release.";
    default:
      return "Check for a signed AHDClient release.";
  }
}

export function UpdateControl(): JSX.Element {
  const [state, setState] = useState<UpdaterSnapshot>(getUpdaterSnapshot);
  useEffect(() => subscribeUpdater(() => setState(getUpdaterSnapshot())), []);

  const busy = state.kind === "checking" || state.kind === "downloading" || state.kind === "installing";
  const label =
    state.kind === "ready"
      ? "Restart to update"
      : state.kind === "checking"
        ? "Checking…"
        : state.kind === "downloading"
          ? "Downloading…"
          : state.kind === "installing"
            ? "Installing…"
            : "Check for updates";

  return (
    <section className="client-update-control" aria-live="polite">
      <div>
        <strong>Desktop updates</strong>
        <small>{messageFor(state)}</small>
      </div>
      <button
        type="button"
        disabled={busy}
        onClick={() => {
          if (state.kind === "ready") void confirmRestartToUpdate();
          else void checkForUpdatesNow();
        }}
      >
        {label}
      </button>
    </section>
  );
}
