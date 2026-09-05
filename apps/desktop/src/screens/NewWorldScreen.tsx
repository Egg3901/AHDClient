import { useState } from "react";
import type { Era } from "../worlds.js";
import { themeForEra } from "../launcher/CommandGlobe.js";

interface Props {
  era: Era;
  taken: readonly string[];
  onBack: () => void;
  onCreate: (name: string, displayName: string) => void;
}

/**
 * Name the world, name yourself, go. Country and party are chosen inside
 * the game, on the same character-creation screen multiplayer uses.
 */
export function NewWorldScreen({ era, taken, onBack, onCreate }: Props): JSX.Element {
  const [name, setName] = useState(`${era.subtitle}, ${era.label}`);
  const [displayName, setDisplayName] = useState("");
  const duplicate = taken.some((existing) => existing.trim().toLowerCase() === name.trim().toLowerCase());
  const theme = themeForEra(era.id);

  return (
    <main className="launcher-scope screen-scope">
      <div className="launcher-pattern" aria-hidden="true">
        <div className="launcher-nebula" />
      </div>
      <section className="launcher-stage screen-stage" aria-labelledby="new-world-title">
        <header className="screen-head">
          <button className="launcher-btn launcher-btn-secondary screen-back" onClick={onBack}>
            <span aria-hidden="true">&#8592;</span> Back
          </button>
          <h1 id="new-world-title">New world</h1>
        </header>

        <div className="launcher-console screen-console">
          <div className="screen-era" style={{ borderColor: theme.phosphor }}>
            <span className="launcher-era-swatch" style={{ backgroundColor: theme.phosphor }} aria-hidden="true" />
            <div>
              <strong>{era.label}</strong>
              <small>{era.subtitle} · begins {era.startDate}</small>
            </div>
          </div>

          <label className="screen-field">
            <span>World name</span>
            <input
              value={name}
              maxLength={60}
              onChange={(e) => setName(e.target.value)}
              autoFocus
            />
            {duplicate && <em>You already have a world with this name. It will get a numbered folder.</em>}
          </label>

          <label className="screen-field">
            <span>Your name (optional)</span>
            <input
              value={displayName}
              maxLength={40}
              placeholder="Player"
              onChange={(e) => setDisplayName(e.target.value)}
            />
          </label>

          <p className="launcher-caption">
            Building a world seeds thirty countries and takes about a minute. The first world on this
            machine also downloads the database engine once.
          </p>

          <div className="launcher-actions">
            <button
              className="launcher-btn launcher-btn-primary"
              onClick={() => onCreate(name, displayName)}
              disabled={!name.trim()}
            >
              Create and play <span aria-hidden="true">&#8594;</span>
            </button>
          </div>
        </div>
      </section>
    </main>
  );
}
