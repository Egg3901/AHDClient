import { useEffect, useRef, useState } from "react";
import { ERAS } from "../worlds.js";
import { ERA_PHOTOS } from "../launcher/eraPhotos.js";
import ahdLogo from "../assets/ahd-logo.png";

interface Props {
  title: string;
  lines: string[];
  onCancel: () => void;
  showDebug: boolean;
  progress?: {
    label: string;
    detail: string;
    progress: number;
    stalled: boolean;
  } | null;
}

const TIPS = [
  "Build political capital before proposing contentious legislation. A failed vote can cost more than waiting one turn.",
  "Check inflation alongside growth. A booming economy can still punish households and weaken approval.",
  "State and regional politics can diverge sharply from national polling. Local organization matters.",
  "Corporations create jobs and tax revenue, but concentrated market power can become a political liability.",
  "High leverage amplifies both growth and losses. Review liquidity before expanding through debt.",
  "Coalition partners have their own priorities. Keep enough common ground to survive confidence votes.",
  "Energy shortages travel through production chains. Strategic reserves buy time, not a permanent solution.",
  "Your cabinet is more than decoration. Strong appointments improve the government’s ability to deliver policy.",
  "Read the election calendar before spending campaign resources. Timing can matter as much as total spending.",
];

/** Shown while the local server (and on first run, MongoDB) comes up. */
export function BootScreen({
  title,
  lines,
  onCancel,
  showDebug,
  progress: liveProgress,
}: Props): JSX.Element {
  const [slide, setSlide] = useState(0);
  const [cardVisible, setCardVisible] = useState(true);
  useEffect(() => {
    let swapTimer: number | undefined;
    const timer = window.setInterval(() => {
      setCardVisible(false);
      swapTimer = window.setTimeout(() => {
        setSlide((value) => (value + 1) % TIPS.length);
        window.requestAnimationFrame(() => setCardVisible(true));
      }, 380);
    }, 5500);
    return () => {
      window.clearInterval(timer);
      if (swapTimer !== undefined) window.clearTimeout(swapTimer);
    };
  }, []);
  const era = ERAS[slide % ERAS.length]!;
  const photo = ERA_PHOTOS[era.id]!;
  const highestProgress = useRef(0);
  const reportedProgress = liveProgress?.progress ?? Math.min(18, 6 + lines.length * 2);
  highestProgress.current = Math.max(highestProgress.current, Math.min(100, Math.max(0, reportedProgress)));
  const progress = highestProgress.current;
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
            <div className="boot-current" aria-live="polite">
              <strong>
                {liveProgress?.label ?? "Starting the local game"}
              </strong>
              <span>
                {liveProgress?.detail ?? "Loading the server and database"}
              </span>
              {liveProgress?.stalled && (
                <em>
                  Still waiting. The last setup step has not reported progress
                  for 30 seconds.
                </em>
              )}
            </div>
            <div
              className="boot-progress"
              role="progressbar"
              aria-label="Building world"
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={Math.round(progress)}
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
              <span className="boot-hint-label">Gameplay hint</span>
              <p>{TIPS[slide]}</p>
            </div>
          </article>
          <div className="boot-card-track" aria-label="Loading stories">
            {TIPS.map((_tip, index) => (
              <span
                key={index}
                className={index === slide ? "active" : ""}
                aria-current={index === slide ? "true" : undefined}
              >
                {index + 1}
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
