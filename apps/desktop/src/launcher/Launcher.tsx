import { useEffect, useMemo, useState } from "react";
import type { CSSProperties, ReactNode } from "react";
import desktopPackage from "../../package.json";
import ahdLogo from "../assets/ahd-logo.png";
import { ERAS, eraForPreset } from "../worlds.js";
import type { WorldMeta } from "../worlds.js";
import { CommandGlobe, themeForEra } from "./CommandGlobe.js";
import { ERA_PHOTOS } from "./eraPhotos.js";
import "./launcher.css";

type Mode = "sp" | "mp" | "sandbox" | "worldsim";

export type OnlineTarget = "live" | "sandbox";

interface Props {
  settingsControl?: ReactNode;
  accountControl?: ReactNode;
  gameVersionControl?: ReactNode;
  onPhotoSource?: (eraId: string) => void;
  onNewWorld: (eraId: string, worldsim?: boolean) => void;
  onContinue: (slot: string) => void;
  onLoad: () => void;
  onPlayOnline: (target: OnlineTarget) => void;
  error: string | null;
  onClearError: () => void;
  latestWorld: WorldMeta | null;
  runningSlot: string | null;
  continueBusy: boolean;
  sandboxGate?: "unlinked" | "upgrade" | null;
  onLinkAccount?: () => void;
  onUpgradeSupporter?: () => void;
}

const MODE_STORAGE_KEY = "ahdclient.launcher.mode";
const ERA_STORAGE_KEY = "ahdclient.launcher.era";

function readPreference(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function writePreference(key: string, value: string): void {
  try {
    localStorage.setItem(key, value);
  } catch {
    // Preferences are optional. The launcher still works when storage is unavailable.
  }
}

export function Launcher({
  settingsControl,
  accountControl,
  gameVersionControl,
  onPhotoSource,
  onNewWorld,
  onContinue,
  onLoad,
  onPlayOnline,
  error,
  onClearError,
  latestWorld,
  runningSlot,
  continueBusy,
  sandboxGate,
  onLinkAccount,
  onUpgradeSupporter,
}: Props): JSX.Element {
  const eras = useMemo(() => ERAS, []);
  const [mode, setMode] = useState<Mode>(() => {
    const saved = readPreference(MODE_STORAGE_KEY);
    return saved === "mp" || saved === "sandbox" || saved === "worldsim"
      ? saved
      : "sp";
  });
  const [eraId, setEraId] = useState<string>(() => {
    const saved = readPreference(ERA_STORAGE_KEY);
    return saved && eras.some(({ id }) => id === saved)
      ? saved
      : (eras[0]?.id ?? "1953");
  });
  const [choosingEra, setChoosingEra] = useState(false);

  useEffect(() => {
    if (eras.length > 0 && !eras.some((era) => era.id === eraId)) {
      setEraId(eras[0]!.id);
    }
  }, [eras, eraId]);

  useEffect(() => writePreference(MODE_STORAGE_KEY, mode), [mode]);
  useEffect(() => writePreference(ERA_STORAGE_KEY, eraId), [eraId]);

  const multiplayer = mode === "mp" || mode === "sandbox";
  const onlineTarget: OnlineTarget = mode === "sandbox" ? "sandbox" : "live";
  const selectedEra = eras.find((era) => era.id === eraId) ?? eras[0];
  const latestEra = latestWorld ? eraForPreset(latestWorld.preset) : undefined;
  const latestRunning =
    latestWorld !== null && runningSlot === latestWorld.slot;
  const selectedPhoto = selectedEra ? ERA_PHOTOS[selectedEra.id] : undefined;

  return (
    <main
      className="launcher-scope"
      data-mode={mode}
      data-choosing-era={choosingEra && !multiplayer}
    >
      <div
        className="launcher-pattern"
        aria-hidden="true"
        style={{ "--nebula": themeForEra(eraId).dim } as CSSProperties}
      >
        <div className="launcher-nebula" />
      </div>

      <section className="launcher-stage" aria-labelledby="launcher-title">
        <header className="launcher-mast">
          <img className="launcher-logo" src={ahdLogo} alt="" />
          <div className="launcher-lockup">
            <p className="launcher-edition">AHDClient</p>
            <h1 id="launcher-title">A House Divided</h1>
            <p className="launcher-subtitle">
              A historical political simulation
            </p>
          </div>
          {(accountControl || settingsControl) && (
            <div className="launcher-settings">
              {accountControl}
              {settingsControl}
            </div>
          )}
        </header>

        <div className="launcher-console">
          <div
            className="launcher-toggle"
            data-mode={mode}
            aria-label="Play mode"
          >
            <div className="launcher-toggle-thumb" aria-hidden="true" />
            <button
              className={mode === "sp" ? "active" : ""}
              onClick={() => setMode("sp")}
              aria-pressed={mode === "sp"}
            >
              Singleplayer <span className="client-beta">Beta</span>
            </button>
            <button
              className={mode === "mp" ? "active" : ""}
              onClick={() => setMode("mp")}
              aria-pressed={mode === "mp"}
            >
              Multiplayer
            </button>
            <button
              className={mode === "sandbox" ? "active" : ""}
              onClick={() => setMode("sandbox")}
              aria-pressed={mode === "sandbox"}
            >
              Sandbox
            </button>
            <button
              className={mode === "worldsim" ? "active" : ""}
              onClick={() => {
                setMode("worldsim");
                setChoosingEra(false);
              }}
              aria-pressed={mode === "worldsim"}
            >
              Worldsim <span className="client-beta">Beta</span>
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
                <strong>
                  {mode === "sandbox"
                    ? "Enter the sandbox server"
                    : "Continue in the online world"}
                </strong>
                <small>
                  {mode === "sandbox"
                    ? "A separate world for trying things out. Nothing here touches the main game."
                    : "Your account and session stay together in the app."}
                </small>
              </span>
              {mode === "sandbox" && sandboxGate === "unlinked" && (
                <span className="launcher-sandbox-gate">
                  <strong>Link your account to enter the sandbox.</strong>
                  <button onClick={onLinkAccount}>Link account</button>
                </span>
              )}
              {mode === "sandbox" && sandboxGate === "upgrade" && (
                <span className="launcher-sandbox-gate">
                  <strong>
                    Sandbox access requires an active Supporter tier.
                  </strong>
                  <button onClick={onUpgradeSupporter}>
                    View Supporter tiers
                  </button>
                </span>
              )}
            </div>
          ) : choosingEra ? (
            <div className="launcher-era-panel" aria-label="New game setup">
              <div className="launcher-panel-label">
                <button
                  className="launcher-back"
                  onClick={() => setChoosingEra(false)}
                >
                  Back
                </button>
                <span>Choose a starting era</span>
                <span>{eras.length} eras</span>
              </div>
              <div className="launcher-era-carousel">
                {[-1, 1].map((offset) => {
                  const era =
                    eras[
                      (eras.findIndex((item) => item.id === eraId) +
                        offset +
                        eras.length) %
                        eras.length
                    ]!;
                  return (
                    <div
                      key={offset}
                      className={`launcher-era-preview ${offset < 0 ? "previous" : "next"}`}
                      aria-hidden="true"
                    >
                      <img src={ERA_PHOTOS[era.id]?.src} alt="" />
                      <span>{era.label}</span>
                    </div>
                  );
                })}
                <button
                  className="launcher-era-arrow"
                  aria-label="Previous era"
                  onClick={() => {
                    const index = eras.findIndex((era) => era.id === eraId);
                    setEraId(eras[(index - 1 + eras.length) % eras.length]!.id);
                  }}
                >
                  ‹
                </button>
                <div className="launcher-era-card" aria-live="polite">
                  {selectedPhoto && (
                    <img
                      className="launcher-era-photo"
                      src={selectedPhoto.src}
                      alt={selectedPhoto.alt}
                    />
                  )}
                  <span className="launcher-era-year">
                    {selectedEra?.label}
                  </span>
                  <strong>{selectedEra?.subtitle}</strong>
                  <span>{selectedEra?.startDate}</span>
                  <p>{selectedEra?.description}</p>
                  <p className="launcher-playable">
                    <strong>Playable nations</strong>
                    <br />
                    {selectedEra?.playableNations?.join(" · ") ||
                      "Availability is checked during setup"}
                  </p>
                  {selectedPhoto && (
                    <div className="launcher-era-attribution">
                      <span>
                        {selectedPhoto.credit} · {selectedPhoto.license}
                      </span>
                      {onPhotoSource ? (
                        <button
                          type="button"
                          onClick={() => onPhotoSource(selectedEra!.id)}
                        >
                          Photo source
                        </button>
                      ) : null}
                    </div>
                  )}
                </div>
                <button
                  className="launcher-era-arrow"
                  aria-label="Next era"
                  onClick={() => {
                    const index = eras.findIndex((era) => era.id === eraId);
                    setEraId(eras[(index + 1) % eras.length]!.id);
                  }}
                >
                  ›
                </button>
              </div>
            </div>
          ) : null}

          <div className="launcher-actions">
            {multiplayer ? (
              <>
                <button
                  className="launcher-btn launcher-btn-primary"
                  onClick={() => onPlayOnline(onlineTarget)}
                  disabled={
                    continueBusy || (mode === "sandbox" && sandboxGate !== null)
                  }
                >
                  {mode === "sandbox" ? "Enter sandbox" : "Enter multiplayer"}{" "}
                  <span aria-hidden="true">&#8599;</span>
                </button>
              </>
            ) : (
              <>
                <button
                  className="launcher-btn launcher-btn-primary"
                  onClick={() =>
                    choosingEra
                      ? mode === "worldsim"
                        ? onNewWorld(eraId, true)
                        : onNewWorld(eraId)
                      : setChoosingEra(true)
                  }
                  disabled={continueBusy}
                >
                  {choosingEra ? "Start new game" : "New Game"}{" "}
                  <span aria-hidden="true">&#8594;</span>
                </button>
                {!choosingEra && (
                  <button
                    className="launcher-btn launcher-btn-secondary"
                    onClick={onLoad}
                    disabled={continueBusy}
                  >
                    Load Game
                  </button>
                )}
                {latestWorld && !choosingEra && (
                  <button
                    className="launcher-btn launcher-btn-secondary launcher-btn-continue"
                    onClick={() => onContinue(latestWorld.slot)}
                    disabled={continueBusy}
                    aria-busy={continueBusy}
                    title={`${latestWorld.name}${latestWorld.turn != null ? ` · turn ${latestWorld.turn}` : ""}`}
                  >
                    <span>
                      {continueBusy
                        ? "Starting"
                        : latestRunning
                          ? "Resume"
                          : "Continue"}
                      <small>
                        {latestWorld.name}
                        {latestEra ? ` · ${latestEra.label}` : ""}
                        {latestWorld.turn != null
                          ? ` · turn ${latestWorld.turn}`
                          : ""}
                      </small>
                    </span>
                    <span aria-hidden="true">&#8594;</span>
                  </button>
                )}
              </>
            )}
          </div>

          <CommandGlobe eraId={eraId} live={multiplayer} />
        </div>
      </section>

      <footer className="launcher-footer">
        <span>AHDClient {desktopPackage.version}</span>
        {gameVersionControl}
      </footer>
    </main>
  );
}
