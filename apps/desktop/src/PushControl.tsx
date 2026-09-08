import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";

interface PushStatus {
  enabled: boolean;
  available: boolean;
  registered: boolean;
  permissionGranted: boolean;
  message: string;
}

export function PushControl(): JSX.Element {
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
  return <div className="client-push-control">
    <div className="client-support-control">
      <div><strong>Push notifications</strong><small>New inbox activity, including elections and corporation alerts.</small></div>
      <button type="button" onClick={() => void toggle()} disabled={busy || !status || (!status.available && !status.enabled)}
        aria-pressed={status?.enabled ?? false}>{busy ? "Updating..." : status?.enabled ? "Turn off" : "Turn on"}</button>
    </div>
    <p role="status" className="client-push-status">{error || status?.message || "Checking notification settings..."}</p>
    <p className="client-push-status">Inbox mutes and snoozes apply. Lock-screen previews keep account details private.</p>
  </div>;
}
