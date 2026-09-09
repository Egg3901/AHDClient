import { PushControl } from "./PushControl.js";
import type { ClientSettings } from "./settings.js";
import { UpdateControl } from "./UpdateControl.js";
import "./settings.css";

interface Props {
  /** Android or iOS: no local game, no separate window, no desktop updater. */
  mobile?: boolean;
  open: boolean;
  settings: ClientSettings;
  onChange: (settings: ClientSettings) => void;
  onClose: () => void;
  onReportIssue: () => void;
  onOpenDiagnostics: () => void;
}

function Section({ id, title, children }: { id: string; title: string; children: React.ReactNode }) {
  return (
    <section className="client-settings-section" aria-labelledby={id}>
      <h3 id={id}>{title}</h3>
      <div className="client-settings-options">{children}</div>
    </section>
  );
}

export function SettingsMenu({ mobile = false, open, settings, onChange, onClose, onReportIssue, onOpenDiagnostics }: Props): JSX.Element | null {
  if (!open) return null;
  if (mobile) return (
    <div className="client-settings-backdrop" role="presentation" onMouseDown={onClose}>
      <section className="client-settings-dialog" role="dialog" aria-modal="true" aria-labelledby="client-settings-title" onMouseDown={(event) => event.stopPropagation()}>
        <header>
          <div><span className="client-settings-kicker">AHDClient</span><h2 id="client-settings-title">Settings</h2></div>
          <button className="client-settings-close" type="button" aria-label="Close settings" onClick={onClose}>×</button>
        </header>
        <Section id="client-settings-launcher" title="Launcher">
          <label><span><strong>Launcher animation</strong><small>Animate the globe and atmospheric background.</small></span><input type="checkbox" checked={settings.animations} onChange={(event) => onChange({ ...settings, animations: event.target.checked })} /></label>
        </Section>
        <PushControl />
        <Section id="client-settings-updates" title="Updates">
          <p className="client-settings-note">Updates arrive through the app store.</p>
        </Section>
        <div className="client-support-control"><div><strong>Found a problem?</strong><small>Send a report with your client version attached.</small></div><button type="button" onClick={onReportIssue}>Report a problem</button></div>
        <div className="client-support-control"><div><strong>Developer diagnostics</strong><small>View console output and runtime information.</small></div><button type="button" onClick={onOpenDiagnostics}>Open</button></div>
        <footer><button type="button" onClick={onClose}>Done</button></footer>
      </section>
    </div>
  );
  return (
    <div className="client-settings-backdrop" role="presentation" onMouseDown={onClose}>
      <section className="client-settings-dialog" role="dialog" aria-modal="true" aria-labelledby="client-settings-title" onMouseDown={(event) => event.stopPropagation()}>
        <header>
          <div><span className="client-settings-kicker">AHDClient</span><h2 id="client-settings-title">Settings</h2></div>
          <button className="client-settings-close" type="button" aria-label="Close settings" onClick={onClose}>×</button>
        </header>
        <Section id="client-settings-launcher" title="Launcher">
          <label><span><strong>Separate gameplay window</strong><small>Open gameplay outside the launcher next time.</small></span><input type="checkbox" checked={settings.separateWindow} onChange={(event) => onChange({ ...settings, separateWindow: event.target.checked })} /></label>
          <label><span><strong>Launcher animation</strong><small>Animate the globe and atmospheric background.</small></span><input type="checkbox" checked={settings.animations} onChange={(event) => onChange({ ...settings, animations: event.target.checked })} /></label>
        </Section>
        <Section id="client-settings-game" title="Game">
          <label><span><strong>Anonymous simulation statistics</strong><small>Share world settings and aggregate outcomes. Never account details, character names, or raw saves.</small></span><input type="checkbox" checked={settings.shareStatistics} onChange={(event) => onChange({ ...settings, shareStatistics: event.target.checked })} /></label>
        </Section>
        <Section id="client-settings-updates" title="Updates">
          <UpdateControl />
        </Section>
        <Section id="client-settings-support" title="Support">
          <div className="client-support-control"><div><strong>Found a problem?</strong><small>Send a report with your client version attached.</small></div><button type="button" onClick={onReportIssue}>Report a problem</button></div>
        </Section>
        <details className="client-settings-advanced">
          <summary>Advanced</summary>
          <div className="client-settings-options">
            <label><span><strong>Technical startup logs</strong><small>Show detailed logs while diagnosing a launch issue.</small></span><input type="checkbox" checked={settings.showBootLogs} onChange={(event) => onChange({ ...settings, showBootLogs: event.target.checked })} /></label>
          </div>
          <div className="client-support-control"><div><strong>Developer diagnostics</strong><small>View console output and runtime information.</small></div><button type="button" onClick={onOpenDiagnostics}>Open</button></div>
        </details>
        <footer><span>Press Esc to close</span><button type="button" onClick={onClose}>Done</button></footer>
      </section>
    </div>
  );
}
