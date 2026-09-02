import { useEffect, useState } from "react";
import { listEras } from "@rotunda/engine";
import { CommandGlobe, themeForEra } from "./CommandGlobe.js";
import { StreakField } from "./StreakField.js";
import { ONLINE_URL } from "../onlineTarget.js";
import "./launcher.css";

type Mode = "sp" | "mp";
type ConnStatus = "unknown" | "checking" | "online" | "offline";

/**
 * Attempt-and-report reachability check against the live site, using the
 * normal browser `fetch` API from the "main" renderer — not the Tauri HTTP
 * plugin, so no capability grant is needed for this (per FRAMEWORK.md
 * security doctrine, capabilities stay minimal and per-window; this call
 * needs none). `no-cors`/`HEAD` means we can't read a status code, but a
 * resolved fetch confirms the network path exists; a thrown error (DNS
 * failure, connection refused, timeout) confirms it doesn't.
 */
async function pingOnline(url: string, timeoutMs = 4000): Promise<boolean> {
  if (typeof fetch !== "function") return true;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    await fetch(url, {
      method: "HEAD",
      mode: "no-cors",
      cache: "no-store",
      signal: controller.signal,
    });
    return true;
  } catch {
    return false;
  } finally {
    clearTimeout(timer);
  }
}

interface Props {
  onNewWorld: (eraId: string) => void;
  onLoad: () => void;
  onPlayOnline: () => void;
  error: string | null;
  onClearError: () => void;
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
  const [connStatus, setConnStatus] = useState<ConnStatus>("unknown");
  const [connError, setConnError] = useState<string | null>(null);

  useEffect(() => {
    if (eras.length > 0 && !eras.some((e) => e.id === eraId)) {
      setEraId(eras[0]!.id);
    }
  }, [eras, eraId]);

  const mp = mode === "mp";

  // Ping as soon as multiplayer is selected so the status badge reflects
  // reality before the player ever clicks ENTER WORLD.
  useEffect(() => {
    if (!mp) return;
    let cancelled = false;
    setConnStatus("checking");
    void pingOnline(ONLINE_URL).then((ok) => {
      if (!cancelled) setConnStatus(ok ? "online" : "offline");
    });
    return () => {
      cancelled = true;
    };
  }, [mp]);

  const handleEnterWorld = async () => {
    setConnError(null);
    // Trust a fresh "online" read; otherwise re-check right now so a stale
    // "offline" badge (or a flaky first ping) doesn't block a working
    // connection, and a truly dead connection gets reported instead of
    // opening a window onto nothing.
    let status = connStatus;
    if (status !== "online") {
      setConnStatus("checking");
      const ok = await pingOnline(ONLINE_URL);
      status = ok ? "online" : "offline";
      setConnStatus(status);
    }
    if (status !== "online") {
      setConnError("Can't reach ahousedividedgame.com right now. Check your connection and try again.");
      return;
    }
    onPlayOnline();
  };

  return (
    <div className="launcher-scope">
      <div className="launcher-pattern" aria-hidden="true" />
      <StreakField />

      <div className="launcher-stage">
        <div className="launcher-mast">
          <svg
            width="84"
            height="66"
            viewBox="0 0 184 146"
            aria-hidden="true"
          >
            <g stroke="#141414" strokeWidth="3" fill="none">
              <path d="M 14 100 A 78 78 0 0 1 170 100" />
              <path
                d="M 36 100 A 56 56 0 0 1 148 100"
                stroke="#8a8a8a"
                strokeWidth="2"
              />
              <line x1="92" y1="0" x2="92" y2="22" />
              <line x1="0" y1="100" x2="184" y2="100" />
              <line
                x1="32"
                y1="100"
                x2="32"
                y2="130"
                stroke="#8a8a8a"
                strokeWidth="2"
              />
              <line
                x1="62"
                y1="100"
                x2="62"
                y2="130"
                stroke="#8a8a8a"
                strokeWidth="2"
              />
              <line
                x1="92"
                y1="100"
                x2="92"
                y2="130"
                stroke="#8a8a8a"
                strokeWidth="2"
              />
              <line
                x1="122"
                y1="100"
                x2="122"
                y2="130"
                stroke="#8a8a8a"
                strokeWidth="2"
              />
              <line
                x1="152"
                y1="100"
                x2="152"
                y2="130"
                stroke="#8a8a8a"
                strokeWidth="2"
              />
              <line x1="14" y1="130" x2="170" y2="130" />
              <line
                x1="14"
                y1="143"
                x2="86"
                y2="143"
                stroke="#b3232a"
                strokeWidth="2.5"
              />
              <line
                x1="98"
                y1="143"
                x2="170"
                y2="143"
                stroke="#1f3f9e"
                strokeWidth="2.5"
              />
            </g>
          </svg>
          <h1>A HOUSE DIVIDED</h1>
          <div className="sub">ROTUNDA CLIENT</div>
        </div>

        <div className="launcher-toggle" data-mode={mode}>
          <div className="thumb" aria-hidden="true" />
          <button
            className={mode === "sp" ? "active" : ""}
            onClick={() => setMode("sp")}
            aria-pressed={mode === "sp"}
          >
            <span className="tick">&#10003;</span>SINGLEPLAYER
          </button>
          <button
            className={mode === "mp" ? "active" : ""}
            onClick={() => setMode("mp")}
            aria-pressed={mode === "mp"}
          >
            <span className="tick">&#10003;</span>MULTIPLAYER
          </button>
        </div>

        <div
          className="launcher-era-row"
          aria-hidden={mp}
          style={{ visibility: mp ? "hidden" : "visible" }}
        >
          {eras.map((e) => {
            const active = e.id === eraId;
            const theme = themeForEra(e.id);
            return (
              <button
                key={e.id}
                className={`launcher-era-chip${active ? " active" : ""}`}
                onClick={() => setEraId(e.id)}
                aria-pressed={active}
              >
                <span
                  className="swatch"
                  style={{ background: active ? theme.phosphor : undefined }}
                  aria-hidden="true"
                />
                {e.id}
              </button>
            );
          })}
        </div>

        {error && (
          <div className="launcher-error" role="alert">
            <span>{error}</span>
            <button onClick={onClearError}>Dismiss</button>
          </div>
        )}

        <CommandGlobe eraId={eraId} live={mp} />

        {mp ? (
          <div className="launcher-actions">
            <button
              className="launcher-btn"
              onClick={() => void handleEnterWorld()}
              disabled={connStatus === "checking"}
            >
              {connStatus === "checking" ? "CONNECTING…" : "ENTER WORLD"}
            </button>
            <span className="launcher-caption launcher-conn-status" data-status={connStatus}>
              <span className={`launcher-conn-dot launcher-conn-dot-${connStatus}`} aria-hidden="true" />
              {connStatus === "checking" && "checking connection…"}
              {connStatus === "online" && "reachable · ahousedividedgame.com"}
              {connStatus === "offline" && "unreachable · ahousedividedgame.com"}
              {connStatus === "unknown" && "ahousedividedgame.com"}
            </span>
          </div>
        ) : (
          <div className="launcher-actions">
            <button
              className="launcher-btn"
              onClick={() => onNewWorld(eraId)}
            >
              NEW WORLD
            </button>
            <button className="launcher-btn ghost" onClick={onLoad}>
              LOAD SAVE
            </button>
          </div>
        )}

        {mp && connError && (
          <div className="launcher-error" role="alert">
            <span>{connError}</span>
            <button onClick={() => setConnError(null)}>Dismiss</button>
          </div>
        )}
      </div>

      <footer className="launcher-footer">
        ROTUNDA 0.1 &middot; POLYFORM NC 1.0.0
      </footer>
    </div>
  );
}
