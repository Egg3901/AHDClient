import { useEffect, useState } from "react";
import { ERAS } from "../worlds.js";
import { ERA_PHOTOS } from "../launcher/eraPhotos.js";

interface Props {
  title: string;
  lines: string[];
  onCancel: () => void;
  showDebug: boolean;
}

const TIPS = [
  "Political capital is finite. Use the early turns to build durable support before attempting contentious reforms.",
  "A strong treasury can still be fragile when inflation, debt servicing, and confidence move in different directions.",
  "Parties respond to ideology, institutions, and local conditions. Winning one election does not guarantee the next.",
  "Corporations affect employment, investment, and public confidence. Their interests do not always match the government’s.",
  "Every era begins with different pressures. The Cold War, globalisation, financial crisis, and realignment all change the political field.",
];

/** Shown while the local server (and on first run, MongoDB) comes up. */
export function BootScreen({
  title,
  lines,
  onCancel,
  showDebug,
}: Props): JSX.Element {
  const [slide, setSlide] = useState(0);
  useEffect(() => {
    const timer = window.setInterval(
      () => setSlide((value) => (value + 1) % ERAS.length),
      5500,
    );
    return () => window.clearInterval(timer);
  }, []);
  const era = ERAS[slide]!;
  const photo = ERA_PHOTOS[era.id]!;
  return (
    <main className="launcher-scope screen-scope">
      <div className="launcher-pattern" aria-hidden="true">
        <div className="launcher-nebula" />
      </div>
      <section
        className="launcher-stage screen-stage"
        aria-labelledby="boot-title"
        aria-busy="true"
      >
        <header className="screen-head">
          <span className="screen-spinner" aria-hidden="true" />
          <h1 id="boot-title">{title}</h1>
        </header>
        <div className="launcher-console screen-console boot-console">
          <article className="boot-story" aria-live="polite">
            <img src={photo.src} alt={photo.alt} />
            <div>
              <p className="boot-kicker">
                {era.label} · {era.subtitle}
              </p>
              <h2>{title}</h2>
              <p>{TIPS[slide % TIPS.length]}</p>
            </div>
          </article>
          {showDebug && (
            <details className="screen-details">
              <summary>Technical startup log</summary>
              <pre className="screen-log" aria-live="polite">
                {lines.length === 0
                  ? "Starting the game server"
                  : lines.join("\n")}
              </pre>
            </details>
          )}
          <div className="launcher-actions">
            <button
              className="launcher-btn launcher-btn-secondary"
              onClick={onCancel}
            >
              Cancel
            </button>
          </div>
        </div>
      </section>
    </main>
  );
}
