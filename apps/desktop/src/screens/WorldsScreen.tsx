import { useState } from "react";
import type { WorldMeta } from "../worlds.js";
import { eraForPreset } from "../worlds.js";
import { themeForEra } from "../launcher/CommandGlobe.js";

interface Props {
  worlds: WorldMeta[];
  runningSlot: string | null;
  busy: boolean;
  error: string | null;
  onPlay: (slot: string) => void;
  onDelete: (slot: string) => void;
  onBack: () => void;
}

function whenLabel(iso: string): string {
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? "" : date.toLocaleString();
}

export function WorldsScreen({ worlds, runningSlot, busy, error, onPlay, onDelete, onBack }: Props): JSX.Element {
  const [confirming, setConfirming] = useState<string | null>(null);

  return (
    <main className="launcher-scope screen-scope">
      <div className="launcher-pattern" aria-hidden="true" />
      <section className="launcher-stage screen-stage" aria-labelledby="worlds-title">
        <header className="screen-head">
          <button className="launcher-btn launcher-btn-secondary screen-back" onClick={onBack}>
            <span aria-hidden="true">&#8592;</span> Back
          </button>
          <h1 id="worlds-title">Your worlds</h1>
        </header>

        <div className="launcher-console screen-console">
          {error && (
            <div className="launcher-error" role="alert">
              <span>{error}</span>
            </div>
          )}
          {worlds.length === 0 ? (
            <p className="launcher-caption">No worlds yet. Start one from the launcher.</p>
          ) : (
            <ul className="worlds-list">
              {worlds.map((world) => {
                const era = eraForPreset(world.preset);
                const theme = themeForEra(era?.id ?? "1953");
                const running = runningSlot === world.slot;
                return (
                  <li key={world.slot} className="worlds-row" data-running={running || undefined}>
                    <span className="launcher-era-swatch" style={{ backgroundColor: theme.phosphor }} aria-hidden="true" />
                    <div className="worlds-meta">
                      <strong>{world.name}</strong>
                      <small>
                        {era?.label ?? world.preset}
                        {world.turn != null ? ` · turn ${world.turn}` : ""}
                        {world.character ? ` · ${world.character}` : ""}
                        {running ? " · running" : ""}
                      </small>
                      <small>Last played {whenLabel(world.lastPlayedAt)}</small>
                    </div>
                    <div className="worlds-actions">
                      {confirming === world.slot ? (
                        <>
                          <button
                            className="launcher-btn launcher-btn-danger"
                            onClick={() => {
                              setConfirming(null);
                              onDelete(world.slot);
                            }}
                            disabled={running}
                          >
                            Delete for good
                          </button>
                          <button className="launcher-btn launcher-btn-secondary" onClick={() => setConfirming(null)}>
                            Keep
                          </button>
                        </>
                      ) : (
                        <>
                          <button
                            className="launcher-btn launcher-btn-primary"
                            onClick={() => onPlay(world.slot)}
                            disabled={busy}
                          >
                            {running ? "Resume" : "Play"}
                          </button>
                          <button
                            className="launcher-btn launcher-btn-secondary"
                            onClick={() => setConfirming(world.slot)}
                            disabled={busy || running}
                            title={running ? "Stop the game before deleting this world" : "Delete this world"}
                          >
                            Delete
                          </button>
                        </>
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </section>
    </main>
  );
}
