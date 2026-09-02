import { useEffect, useState } from "react";
import { listEras, listPlayableCountries } from "@rotunda/engine";
import ahdLogo from "../assets/ahd-logo.png";
import { CommandGlobe, themeForEra } from "./CommandGlobe.js";
import "./launcher.css";

type Mode = "sp" | "mp";

interface Props {
  onNewWorld: (eraId: string) => void;
  onLoad: () => void;
  onPlayOnline: () => void;
  error: string | null;
  onClearError: () => void;
}

const ERA_SUBTITLES: Readonly<Record<string, string>> = {
  "1953": "Cold War dawn",
  "1979": "Late Cold War",
  "1991": "New world order",
  "2019": "Contemporary politics",
};

function eraSubtitle(id: string, label: string): string {
  const authoredSubtitle = ERA_SUBTITLES[id];
  if (authoredSubtitle) return authoredSubtitle;
  const separator = label.indexOf(":");
  return separator >= 0 ? label.slice(separator + 1).trim() : label;
}

export function Launcher({
  onNewWorld,
  onLoad,
  onPlayOnline,
  error,
  onClearError,
}: Props): JSX.Element {
  const eras = listEras();
  const [mode, setMode] = useState<Mode>("sp");
  const [eraId, setEraId] = useState<string>(() => eras[0]?.id ?? "1953");

  useEffect(() => {
    if (eras.length > 0 && !eras.some((era) => era.id === eraId)) {
      setEraId(eras[0]!.id);
    }
  }, [eras, eraId]);

  const multiplayer = mode === "mp";
  const selectedEra = eras.find((era) => era.id === eraId) ?? eras[0];
  const playableCountries = selectedEra
    ? listPlayableCountries(selectedEra.id).length
    : 0;

  return (
    <main className="launcher-scope" data-mode={mode}>
      <div className="launcher-pattern" aria-hidden="true" />

      <section className="launcher-stage" aria-labelledby="launcher-title">
        <header className="launcher-mast">
          <img className="launcher-logo" src={ahdLogo} alt="" />
          <div className="launcher-lockup">
            <p className="launcher-edition">Rotunda client</p>
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
                      title={eraSubtitle(era.id, era.label)}
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
                <div><dt>Period</dt><dd>{selectedEra ? eraSubtitle(selectedEra.id, selectedEra.label) : "Unknown"}</dd></div>
                <div><dt>Begins</dt><dd>{selectedEra?.startDate ?? "Unknown"}</dd></div>
                <div><dt>Countries</dt><dd>{playableCountries} playable</dd></div>
              </dl>
            </div>
          )}

          <CommandGlobe eraId={eraId} live={multiplayer} />

          <div className="launcher-actions">
            {multiplayer ? (
              <>
                <button className="launcher-btn launcher-btn-primary" onClick={onPlayOnline}>
                  Enter multiplayer <span aria-hidden="true">&#8599;</span>
                </button>
                <p className="launcher-caption">
                  Opens separately on desktop. Stays in the app on Android.
                </p>
              </>
            ) : (
              <>
                <button
                  className="launcher-btn launcher-btn-primary"
                  onClick={() => onNewWorld(eraId)}
                >
                  Start a new world <span aria-hidden="true">&#8594;</span>
                </button>
                <button className="launcher-btn launcher-btn-secondary" onClick={onLoad}>
                  Load a save
                </button>
              </>
            )}
          </div>
        </div>
      </section>

      <footer className="launcher-footer">
        <span>Rotunda 0.9.0</span>
        <span>Singleplayer saves stay on this device</span>
      </footer>
    </main>
  );
}
