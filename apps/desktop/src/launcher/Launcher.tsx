import { useEffect, useState } from "react";
import { listEras, listPlayableCountries } from "@rotunda/engine";
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
  "1991": "Post-Cold War order",
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
      <header className="launcher-topbar">
        <div className="launcher-identity">
          <span className="launcher-mark" aria-hidden="true">AHD</span>
          <span className="launcher-wordmark">
            <strong>A House Divided</strong>
            <small>Rotunda client</small>
          </span>
        </div>
        <div className="launcher-build">
          <span className="launcher-build-dot" aria-hidden="true" />
          Local client <b>0.9.0</b>
        </div>
      </header>

      <div className="launcher-grid">
        <section className="launcher-control" aria-labelledby="launcher-title">
          <div className="launcher-heading">
            <p className="launcher-kicker">Political strategy simulation</p>
            <h1 id="launcher-title">History is a system. Enter it.</h1>
            <p className="launcher-lede">
              Build a career, command a government, and watch institutions
              answer back. One week at a time.
            </p>
          </div>

          <div className="launcher-mode-picker" aria-label="Play mode">
            <button
              className={`launcher-mode${mode === "sp" ? " active" : ""}`}
              onClick={() => setMode("sp")}
              aria-pressed={mode === "sp"}
            >
              <span className="launcher-mode-index">01</span>
              <span className="launcher-mode-copy">
                <strong>Solo world</strong>
                <small>Local simulation and saves</small>
              </span>
              <span className="launcher-mode-arrow" aria-hidden="true">&#8594;</span>
            </button>
            <button
              className={`launcher-mode${mode === "mp" ? " active" : ""}`}
              onClick={() => setMode("mp")}
              aria-pressed={mode === "mp"}
            >
              <span className="launcher-mode-index">02</span>
              <span className="launcher-mode-copy">
                <strong>Multiplayer</strong>
                <small>Enter the persistent online world</small>
              </span>
              <span className="launcher-mode-arrow" aria-hidden="true">&#8594;</span>
            </button>
          </div>

          {error && (
            <div className="launcher-error" role="alert">
              <span>{error}</span>
              <button onClick={onClearError}>Dismiss</button>
            </div>
          )}

          {multiplayer ? (
            <div className="launcher-online-panel">
              <div>
                <span className="launcher-section-label">Online service</span>
                <h2>The persistent world</h2>
              </div>
              <p>
                Continue in the live A House Divided service. Your local saves
                and device permissions remain separate from the online session.
              </p>
            </div>
          ) : (
            <div className="launcher-era-panel">
              <div className="launcher-section-head">
                <div>
                  <span className="launcher-section-label">Starting point</span>
                  <h2>Choose an era</h2>
                </div>
                <span className="launcher-era-count">{eras.length} worlds</span>
              </div>
              <div className="launcher-era-list">
                {eras.map((era) => {
                  const active = era.id === eraId;
                  const theme = themeForEra(era.id);
                  return (
                    <button
                      key={era.id}
                      className={`launcher-era${active ? " active" : ""}`}
                      onClick={() => setEraId(era.id)}
                      aria-pressed={active}
                    >
                      <span
                        className="launcher-era-signal"
                        style={{ backgroundColor: theme.phosphor }}
                        aria-hidden="true"
                      />
                      <strong>{era.id}</strong>
                      <small>{eraSubtitle(era.id, era.label)}</small>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          <div className="launcher-actions">
            {multiplayer ? (
              <>
                <button className="launcher-primary" onClick={onPlayOnline}>
                  Open multiplayer <span aria-hidden="true">&#8599;</span>
                </button>
                <span className="launcher-action-note">
                  Isolated window on desktop. In-app session on Android.
                </span>
              </>
            ) : (
              <>
                <button
                  className="launcher-primary"
                  onClick={() => onNewWorld(eraId)}
                >
                  Configure new world <span aria-hidden="true">&#8594;</span>
                </button>
                <button className="launcher-secondary" onClick={onLoad}>
                  Load save
                </button>
              </>
            )}
          </div>
        </section>

        <aside className="launcher-visual" aria-label="Selected world summary">
          <div className="launcher-visual-head">
            <span>{multiplayer ? "Network view" : "World preview"}</span>
            <span>{multiplayer ? "External session" : `Era ${eraId}`}</span>
          </div>
          <CommandGlobe eraId={eraId} live={multiplayer} />
          <dl className="launcher-telemetry">
            {multiplayer ? (
              <>
                <div><dt>World</dt><dd>Persistent</dd></div>
                <div><dt>Access</dt><dd>Web service</dd></div>
                <div><dt>Local permissions</dt><dd>None</dd></div>
              </>
            ) : (
              <>
                <div><dt>Start</dt><dd>{selectedEra?.startDate ?? "Unknown"}</dd></div>
                <div><dt>Playable nations</dt><dd>{playableCountries}</dd></div>
                <div><dt>Turn cadence</dt><dd>Weekly</dd></div>
              </>
            )}
          </dl>
        </aside>
      </div>

      <footer className="launcher-footer">
        <span>PolyForm NC 1.0.0</span>
        <span>Singleplayer data remains on this device</span>
      </footer>
    </main>
  );
}
