import { useEffect, useMemo, useState } from "react";
import desktopPackage from "../../package.json";
import ahdLogo from "../assets/ahd-logo.png";
import { ERAS, eraForPreset } from "../worlds.js";
import type { WorldMeta } from "../worlds.js";
import { CommandGlobe, themeForEra } from "./CommandGlobe.js";
import "./launcher.css";

type Mode = "sp" | "mp";

interface Props {
  onNewWorld: (eraId: string) => void;
  onContinue: (slot: string) => void;
  onLoad: () => void;
  onPlayOnline: () => void;
  error: string | null;
  onClearError: () => void;
  latestWorld: WorldMeta | null;
  runningSlot: string | null;
  continueBusy: boolean;
}

const MODE_STORAGE_KEY = "ahdclient.launcher.mode";
const ERA_STORAGE_KEY = "ahdclient.launcher.era";

function readPreference(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function writePreference(key: string, value: string): void {
  try {
    localStorage.setItem(key, value);
  } catch {
    // Preferences are optional. The launcher still works when storage is unavailable.
  }
}

export function Launcher({
  onNewWorld,
  onContinue,
  onLoad,
  onPlayOnline,
  error,
  onClearError,
  latestWorld,
  runningSlot,
  continueBusy,
}: Props): JSX.Element {
  const eras = useMemo(() => ERAS, []);
  const [mode, setMode] = useState<Mode>(() => readPreference(MODE_STORAGE_KEY) === "mp" ? "mp" : "sp");
  const [eraId, setEraId] = useState<string>(() => {
    const saved = readPreference(ERA_STORAGE_KEY);
    return saved && eras.some(({ id }) => id === saved) ? saved : eras[0]?.id ?? "1953";
  });

  useEffect(() => {
    if (eras.length > 0 && !eras.some((era) => era.id === eraId)) {
      setEraId(eras[0]!.id);
    }
  }, [eras, eraId]);

  useEffect(() => writePreference(MODE_STORAGE_KEY, mode), [mode]);
  useEffect(() => writePreference(ERA_STORAGE_KEY, eraId), [eraId]);

  const multiplayer = mode === "mp";
  const selectedEra = eras.find((era) => era.id === eraId) ?? eras[0];
  const latestEra = latestWorld ? eraForPreset(latestWorld.preset) : undefined;
  const latestRunning = latestWorld !== null && runningSlot === latestWorld.slot;

  return (
    <main className="launcher-scope" data-mode={mode}>
      <div className="launcher-pattern" aria-hidden="true" />

      <section className="launcher-stage" aria-labelledby="launcher-title">
        <header className="launcher-mast">
          <img className="launcher-logo" src={ahdLogo} alt="" />
          <div className="launcher-lockup">
            <p className="launcher-edition">AHDClient</p>
            <h1 id="launcher-title">A House Divided</h1>
            <p className="launcher-subtitle">A historical political simulation</p>
          </div>
        </header>

        <div className="launcher-console">
          <div className="launcher-toggle" data-mode={mode} aria-label="Play mode">
            <div className="launcher-toggle-thumb" aria-hidden="true" />
            <button
              className={mode === "sp" ? "active" : ""}
              onClick={() => setMode("sp")}
              aria-pressed={mode === "sp"}
            >
              Singleplayer
            </button>
            <button
              className={mode === "mp" ? "active" : ""}
              onClick={() => setMode("mp")}
              aria-pressed={mode === "mp"}
            >
              Multiplayer
            </button>
          </div>

          {error && (
            <div className="launcher-error" role="alert">
              <span>{error}</span>
              <button onClick={onClearError}>Dismiss</button>
            </div>
          )}

          {multiplayer ? (
            <div className="launcher-online-summary" aria-live="polite">
              <span className="launcher-live-dot" aria-hidden="true" />
              <span>
                <strong>Continue in the online world</strong>
                <small>Your account and session stay together in the app.</small>
              </span>
            </div>
          ) : (
            <div className="launcher-era-panel">
              <div className="launcher-panel-label">
                <span>Choose a starting era</span>
                <span>{eras.length} eras</span>
              </div>
              <div className="launcher-era-row">
                {eras.map((era) => {
                  const active = era.id === eraId;
                  const theme = themeForEra(era.id);
                  return (
                    <button
                      key={era.id}
                      className={`launcher-era-chip${active ? " active" : ""}`}
                      onClick={() => setEraId(era.id)}
                      aria-pressed={active}
                      title={era.subtitle}
                    >
                      <span
                        className="launcher-era-swatch"
                        style={{ backgroundColor: active ? theme.phosphor : undefined }}
                        aria-hidden="true"
                      />
                      <span>{era.id}</span>
                    </button>
                  );
                })}
              </div>
              <dl className="launcher-era-facts" aria-live="polite">
                <div><dt>Period</dt><dd>{selectedEra?.subtitle ?? "Unknown"}</dd></div>
                <div><dt>Begins</dt><dd>{selectedEra?.startDate ?? "Unknown"}</dd></div>
                <div><dt>World</dt><dd>The full game, locally</dd></div>
              </dl>
            </div>
          )}

          <CommandGlobe eraId={eraId} live={multiplayer} />

          <div className="launcher-actions">
            {multiplayer ? (
              <>
                <button className="launcher-btn launcher-btn-primary" onClick={onPlayOnline} disabled={continueBusy}>
                  Enter multiplayer <span aria-hidden="true">&#8599;</span>
                </button>
                <p className="launcher-caption">
                  Opens separately on desktop. Stays in the app on Android.
                </p>
              </>
            ) : (
              <>
                {latestWorld && (
                  <button
                    className="launcher-btn launcher-btn-primary launcher-btn-continue"
                    onClick={() => onContinue(latestWorld.slot)}
                    disabled={continueBusy}
                    aria-busy={continueBusy}
                    title={`${latestWorld.name}${latestWorld.turn != null ? ` · turn ${latestWorld.turn}` : ""}`}
                  >
                    <span>
                      {continueBusy ? "Starting" : latestRunning ? "Resume" : "Continue"}
                      <small>
                        {latestWorld.name}
                        {latestEra ? ` · ${latestEra.label}` : ""}
                        {latestWorld.turn != null ? ` · turn ${latestWorld.turn}` : ""}
                      </small>
                    </span>
                    <span aria-hidden="true">&#8594;</span>
                  </button>
                )}
                <button
                  className={`launcher-btn ${latestWorld ? "launcher-btn-secondary" : "launcher-btn-primary"}`}
                  onClick={() => onNewWorld(eraId)}
                  disabled={continueBusy}
                >
                  New world <span aria-hidden="true">&#8594;</span>
                </button>
                <button className="launcher-btn launcher-btn-secondary" onClick={onLoad} disabled={continueBusy}>
                  All worlds
                </button>
              </>
            )}
          </div>
        </div>
      </section>

      <footer className="launcher-footer">
        <span>AHDClient {desktopPackage.version}</span>
        <span>Singleplayer worlds stay on this device</span>
      </footer>
    </main>
  );
}
