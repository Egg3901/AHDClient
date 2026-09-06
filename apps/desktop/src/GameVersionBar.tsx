import { useEffect, useState } from "react";
import { gameVersions } from "./worlds.js";
import type { GameVersion } from "./worlds.js";

export function GameVersionBar(): JSX.Element {
  const [versions, setVersions] = useState<GameVersion[]>([]);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("Bundled game");
  const selected = versions.find((version) => version.selected)?.version ?? "bundled";
  const refresh = async () => {
    try { setVersions(await gameVersions.list()); }
    catch { setMessage("Version list unavailable offline"); }
  };
  useEffect(() => { void refresh(); }, []);
  const choose = async (version: string) => {
    setBusy(true);
    setMessage(version === "bundled" ? "Selecting bundled game…" : `Preparing game ${version}…`);
    try {
      const target = versions.find((item) => item.version === version);
      if (version !== "bundled" && !target?.installed) await gameVersions.install(version);
      await gameVersions.select(version === "bundled" ? null : version);
      await refresh();
      setMessage(version === "bundled" ? "Bundled game selected" : `Game ${version} ready`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : String(error));
    } finally { setBusy(false); }
  };
  return (
    <div className="client-game-version-bar">
      <span>Singleplayer version</span>
      <select aria-label="Singleplayer game version" value={selected} disabled={busy} onChange={(event) => void choose(event.target.value)}>
        <option value="bundled">Bundled</option>
        {versions.map((version) => <option key={version.version} value={version.version}>{version.version}{version.installed ? "" : " · download"}</option>)}
      </select>
      <small>{message}</small>
    </div>
  );
}
