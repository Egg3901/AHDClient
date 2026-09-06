import { useEffect, useState } from "react";
import { ERAS } from "../worlds.js";
import { ERA_PHOTOS } from "../launcher/eraPhotos.js";
import ahdLogo from "../assets/ahd-logo.png";

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
  "Credit booms can conceal weak balance sheets. Watch leverage, liquidity, and asset prices together.",
  "Coalitions are agreements between competing interests. A narrow majority needs more maintenance than a broad one.",
  "Trade, energy, and security shocks cross borders quickly. Domestic policy rarely stays domestic for long.",
];

/** Shown while the local server (and on first run, MongoDB) comes up. */
export function BootScreen({
  title,
  lines,
  onCancel,
  showDebug,
}: Props): JSX.Element {
  const [slide, setSlide] = useState(0);
  const [cardVisible, setCardVisible] = useState(true);
  useEffect(() => {
    let swapTimer: number | undefined;
    const timer = window.setInterval(() => {
      setCardVisible(false);
      swapTimer = window.setTimeout(() => {
        setSlide((value) => (value + 1) % ERAS.length);
        window.requestAnimationFrame(() => setCardVisible(true));
      }, 380);
    }, 5500);
    return () => {
      window.clearInterval(timer);
      if (swapTimer !== undefined) window.clearTimeout(swapTimer);
    };
  }, []);
  const era = ERAS[slide]!;
  const photo = ERA_PHOTOS[era.id]!;
  const progress = Math.min(92, 16 + lines.length * 4);
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
        <header className="screen-head boot-head">
          <img className="boot-logo" src={ahdLogo} alt="" />
          <div>
            <p className="boot-eyebrow">A House Divided</p>
            <h1 id="boot-title">{title}</h1>
          </div>
        </header>
        <div className="screen-console">
          <div className="boot-progress-wrap">
            <div
              className="boot-progress"
              role="progressbar"
              aria-label="Building world"
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={progress}
            >
              <span style={{ width: `${progress}%` }} />
            </div>
            <div className="boot-progress-labels" aria-hidden="true">
              <span>Preparing history</span>
              <span>Seeding institutions</span>
              <span>Opening the world</span>
            </div>
          </div>
          <article
            className={`boot-story ${cardVisible ? "visible" : ""}`}
            aria-live="polite"
          >
            <img src={photo.src} alt={photo.alt} />
            <div>
              <p className="boot-kicker">
                {era.label} · {era.subtitle}
              </p>
              <h2>{era.subtitle}</h2>
              <p>{TIPS[slide]}</p>
            </div>
          </article>
          <div className="boot-card-track" aria-label="Loading stories">
            {ERAS.map((item, index) => (
              <span
                key={item.id}
                className={index === slide ? "active" : ""}
                aria-current={index === slide ? "true" : undefined}
              >
                {item.label}
              </span>
            ))}
          </div>
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
