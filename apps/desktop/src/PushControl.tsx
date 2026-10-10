import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";

interface PushStatus {
  enabled: boolean;
  available: boolean;
  registered: boolean;
  permissionGranted: boolean;
  message: string;
}

interface Props {
  /** Phones get pushes even when the app is closed; desktop alerts need the client open. */
  mobile?: boolean;
  /** Called after the alert-type settings page opens, so the dialog can get out of the way. */
  onOpenedPage?: () => void;
}

export function PushControl({ mobile = true, onOpenedPage }: Props): JSX.Element {
  const [status, setStatus] = useState<PushStatus | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => {
    let active = true;
    let pending = false;
    async function refresh() {
      if (pending) return;
      pending = true;
      try {
        const next = await invoke<PushStatus>("get_push_status");
        if (active) setStatus(next);
      } catch { if (active) setError("Could not read notification settings."); }
      finally { pending = false; }
    }
    void refresh();
    const timer = window.setInterval(() => { if (document.visibilityState === "visible") void refresh(); }, 3000);
    window.addEventListener("focus", refresh);
    return () => { active = false; window.clearInterval(timer); window.removeEventListener("focus", refresh); };
  }, []);
  async function toggle() {
    setBusy(true); setError("");
    try { setStatus(await invoke<PushStatus>("configure_push", { enabled: !status?.enabled })); }
    catch { setError("Could not change notification settings. Please try again."); }
    finally { setBusy(false); }
  }
  async function chooseTypes() {
    setError("");
    try { await invoke("open_game_page", { path: "/settings" }); onOpenedPage?.(); }
    catch { setError("Could not open the game settings. Sign in to multiplayer and try again."); }
  }
  const label = mobile ? "Push notifications" : "Desktop alerts";
  const summary = mobile
    ? "Elections, legislation, party, treasury and corporation alerts from your inbox, even when the app is closed."
    : "Elections, legislation, party, treasury and corporation alerts from your inbox, as system notifications while AHDClient is open.";
  const detail = mobile
    ? "Each alert shows its title, category and message, and tapping it opens the page it is about. To hide alert text while your phone is locked, change notification previews in your phone's settings."
    : "Each alert shows its title, category and message. Alerts stay quiet while you are looking at the live game, and routine turn income stays in the inbox.";
  return <div className="client-push-control">
    <div className="client-support-control">
      <div><strong>{label}</strong><small>{summary}</small></div>
      <button type="button" onClick={() => void toggle()} disabled={busy || !status || (!status.available && !status.enabled)}
        aria-pressed={status?.enabled ?? false}>{busy ? "Updating..." : status?.enabled ? "Turn off" : "Turn on"}</button>
    </div>
    <p role="status" className="client-push-status">{error || status?.message || "Checking notification settings..."}</p>
    <p className="client-push-status">{detail}</p>
    <div className="client-support-control">
      <div><strong>Alert types</strong><small>Mute the kinds of alerts you do not want under Game in the site settings. Mutes and snoozes apply to {mobile ? "push" : "desktop"} alerts too.</small></div>
      <button type="button" onClick={() => void chooseTypes()}>Choose</button>
    </div>
  </div>;
}
