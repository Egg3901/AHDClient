import type { ClientSettings } from "./settings.js";
import "./settings.css";

interface Props {
  settings: ClientSettings;
  onChange: (settings: ClientSettings) => void;
  onLinkAccount: () => void;
  accountLabel?: string | undefined;
}
export function SettingsMenu({
  settings,
  onChange,
  onLinkAccount,
  accountLabel,
}: Props): JSX.Element {
  return (
    <details className="client-settings">
      <summary>Settings</summary>
      <div className="client-settings-panel">
        <label>
          <input
            type="checkbox"
            checked={settings.separateWindow}
            onChange={(e) =>
              onChange({ ...settings, separateWindow: e.target.checked })
            }
          />
          Open gameplay in a separate window
        </label>
        <small>Applies the next time you open gameplay.</small>
        <label>
          <input
            type="checkbox"
            checked={settings.animations}
            onChange={(e) =>
              onChange({ ...settings, animations: e.target.checked })
            }
          />
          Animate the launcher
        </label>
        <label>
          <input
            type="checkbox"
            checked={settings.shareStatistics}
            onChange={(e) =>
              onChange({ ...settings, shareStatistics: e.target.checked })
            }
          />
          Share anonymous simulation statistics
        </label>
        <small>
          Help improve the game with world settings and aggregate political,
          economic and population outcomes. No account details, character names
          or raw saves. Turning this off clears unsent reports.
        </small>
        <label>
          <input
            type="checkbox"
            checked={settings.showBootLogs}
            onChange={(e) =>
              onChange({ ...settings, showBootLogs: e.target.checked })
            }
          />
          Show technical startup logs
        </label>
        <small>Use this only when diagnosing a launch issue.</small>
        <hr />
        <p>{accountLabel ?? "No game account linked"}</p>
        <button type="button" onClick={onLinkAccount}>
          {accountLabel ? "Manage game account" : "Link game account"}
        </button>
      </div>
    </details>
  );
}
