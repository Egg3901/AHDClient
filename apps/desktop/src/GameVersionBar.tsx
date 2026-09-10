import { useEffect, useState } from "react";
import { gameVersions } from "./worlds.js";
import type { GameVersion } from "./worlds.js";
import type { ClientLanguage } from "./i18n.js";

/** Runtime baked into this desktop bundle. Downloaded runtimes are versioned independently. */
const BUNDLED_GAME_VERSION = "1.8.1";

export function GameVersionBar({ language = "en" }: { language?: ClientLanguage }): JSX.Element {
  const de = language === "de";
  const [versions, setVersions] = useState<GameVersion[]>([]);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("Bundled game");
  const selected = versions.find((version) => version.selected)?.version ?? "bundled";
  const refresh = async () => {
    try {
      const listed = await gameVersions.list();
      setVersions(listed);
      return listed;
    }
    catch { setMessage("Version list unavailable offline"); }
    return [];
  };
  useEffect(() => {
    void (async () => {
      const listed = await refresh();
      const latest = listed[0];
      if (!latest || latest.version === BUNDLED_GAME_VERSION || latest.selected) return;
      setBusy(true);
      setMessage(`Updating game to ${latest.version}…`);
      try {
        if (!latest.installed) await gameVersions.install(latest.version);
        await gameVersions.select(latest.version);
        await refresh();
        setMessage(`Latest game ${latest.version} ready`);
      } catch (error) {
        setMessage(error instanceof Error ? error.message : String(error));
      } finally { setBusy(false); }
    })();
  }, []);
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
      <span>{de ? "Spielversion" : "Game runtime"}</span>
      <select aria-label={de ? "Einzelspieler-Spielversion" : "Singleplayer game version"} value={selected} disabled={busy} onChange={(event) => void choose(event.target.value)}>
        <option value="bundled">{de ? "Mitgeliefertes Spiel" : "Bundled game"} {BUNDLED_GAME_VERSION}</option>
        {versions.filter(({ version }) => version !== BUNDLED_GAME_VERSION).map((version) => <option key={version.version} value={version.version}>{version.version}{version.installed ? "" : " · download"}</option>)}
      </select>
      <small>{message}</small>
    </div>
  );
}
