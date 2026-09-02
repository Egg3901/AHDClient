import { useEffect, useState } from "react";
import { listEras, listPlayableCountries } from "@rotunda/engine";
import { CommandGlobe, themeForEra } from "./CommandGlobe.js";
import { StreakField } from "./StreakField.js";
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
      <StreakField />
      <div className="launcher-pattern" aria-hidden="true" />

      <div className="launcher-corner launcher-corner-left" aria-hidden="true">
        RTD / CLIENT 0.9.0
      </div>
      <div className="launcher-corner launcher-corner-right" aria-hidden="true">
        LOCAL-FIRST SIMULATION
      </div>

      <section className="launcher-stage" aria-labelledby="launcher-title">
        <header className="launcher-mast">
          <svg viewBox="0 0 184 146" aria-hidden="true">
            <g stroke="currentColor" strokeWidth="3" fill="none">
              <path d="M 14 100 A 78 78 0 0 1 170 100" />
              <path d="M 36 100 A 56 56 0 0 1 148 100" className="launcher-mast-muted" />
              <line x1="92" y1="0" x2="92" y2="22" />
              <line x1="0" y1="100" x2="184" y2="100" />
              {[32, 62, 92, 122, 152].map((x) => (
                <line key={x} x1={x} y1="100" x2={x} y2="130" className="launcher-mast-muted" />
              ))}
              <line x1="14" y1="130" x2="170" y2="130" />
              <line x1="14" y1="143" x2="86" y2="143" className="launcher-mast-red" />
              <line x1="98" y1="143" x2="170" y2="143" className="launcher-mast-blue" />
            </g>
          </svg>
          <p className="launcher-kicker">Political strategy simulation</p>
          <h1 id="launcher-title">A HOUSE DIVIDED</h1>
          <p className="launcher-subtitle">ROTUNDA CLIENT</p>
        </header>

        <div className="launcher-console">
          <div className="launcher-toggle" data-mode={mode} aria-label="Play mode">
            <div className="launcher-toggle-thumb" aria-hidden="true" />
            <button
              className={mode === "sp" ? "active" : ""}
              onClick={() => setMode("sp")}
              aria-pressed={mode === "sp"}
            >
              <span className="launcher-toggle-mark" aria-hidden="true">01</span>
              Singleplayer
            </button>
            <button
              className={mode === "mp" ? "active" : ""}
              onClick={() => setMode("mp")}
              aria-pressed={mode === "mp"}
            >
              <span className="launcher-toggle-mark" aria-hidden="true">02</span>
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
                <strong>Persistent online world</strong>
                <small>Account session continues in-app on Android</small>
              </span>
            </div>
          ) : (
            <div className="launcher-era-panel">
              <div className="launcher-panel-label">
                <span>Select a starting era</span>
                <span>{eras.length} available</span>
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
                <div><dt>Start</dt><dd>{selectedEra?.startDate ?? "Unknown"}</dd></div>
                <div><dt>Nations</dt><dd>{playableCountries} playable</dd></div>
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
                  Isolated desktop window <span aria-hidden="true">/</span> in-app on Android
                </p>
              </>
            ) : (
              <>
                <button
                  className="launcher-btn launcher-btn-primary"
                  onClick={() => onNewWorld(eraId)}
                >
                  New world <span aria-hidden="true">&#8594;</span>
                </button>
                <button className="launcher-btn launcher-btn-secondary" onClick={onLoad}>
                  Load save
                </button>
              </>
            )}
          </div>
        </div>
      </section>

      <footer className="launcher-footer">
        <span>POLYFORM NC 1.0.0</span>
        <span>Singleplayer data remains on this device</span>
      </footer>
    </main>
  );
}
