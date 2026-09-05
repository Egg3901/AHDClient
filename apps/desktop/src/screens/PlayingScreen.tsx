import type { WorldMeta } from "../worlds.js";

interface Props {
  world: WorldMeta | null;
  lines: string[];
  onResume: () => void;
  onStop: () => void;
}

/**
 * The launcher window while a game window is open. Small on purpose: the
 * game is in the other window, this one just keeps the server honest.
 */
export function PlayingScreen({ world, lines, onResume, onStop }: Props): JSX.Element {
  return (
    <main className="launcher-scope screen-scope">
      <div className="launcher-pattern" aria-hidden="true">
        <div className="launcher-nebula" />
      </div>
      <section className="launcher-stage screen-stage" aria-labelledby="playing-title">
        <header className="screen-head">
          <span className="launcher-live-dot" aria-hidden="true" />
          <h1 id="playing-title">{world ? world.name : "Playing"}</h1>
        </header>
        <div className="launcher-console screen-console">
          <p className="launcher-caption">
            The game is open in its own window. Closing that window keeps the world running so you can
            come straight back; Stop shuts the server down and returns to the launcher.
          </p>
          <div className="launcher-actions">
            <button className="launcher-btn launcher-btn-primary" onClick={onResume}>
              Back to the game <span aria-hidden="true">&#8594;</span>
            </button>
            <button className="launcher-btn launcher-btn-secondary" onClick={onStop}>
              Stop
            </button>
          </div>
          <details className="screen-details">
            <summary>Server log</summary>
            <pre className="screen-log">{lines.join("\n") || "quiet"}</pre>
          </details>
        </div>
      </section>
    </main>
  );
}
