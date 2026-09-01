import { useEffect, useState } from "react";
import type { TurnReport, WorldState } from "./engineContract.js";
import { listEras, listPlayableCountries } from "./engineContract.js";
import { game } from "./game.js";

const ONLINE_URL = "https://www.ahousedividedgame.com";

async function openOnline(): Promise<void> {
  try {
    const mod = await import("@tauri-apps/api/webviewWindow");
    const WebviewWindow = (mod as unknown as { WebviewWindow: unknown }).WebviewWindow as {
      getByLabel: (label: string) => Promise<{ setFocus: () => Promise<void> } | null>;
      prototype: unknown;
      new (label: string, opts: Record<string, unknown>): {
        once: (event: string, handler: (e: unknown) => void) => void;
      };
    };
    const existing = await WebviewWindow.getByLabel("online");
    if (existing) {
      await existing.setFocus();
      return;
    }
    const win = new (WebviewWindow as unknown as new (label: string, opts: Record<string, unknown>) => { once: (e: string, h: (x: unknown) => void) => void })(
      "online",
      {
        url: ONLINE_URL,
        title: "A House Divided - Online",
        width: 1280,
        height: 800,
        center: true,
        resizable: true,
      },
    );
    win.once("tauri://error", (e) => {
      console.error("online window error", e);
    });
  } catch {
    window.open(ONLINE_URL, "_blank", "noopener");
  }
}

function formatPct(rate: number): string {
  return `${(rate * 100).toFixed(1)}%`;
}

// -------------------------------------------------------------------
// Launcher
// -------------------------------------------------------------------

function LauncherScreen({
  onPlayOnline,
  onNewWorld,
  onLoad,
  error,
  onClearError,
}: {
  onPlayOnline: () => void;
  onNewWorld: () => void;
  onLoad: () => void;
  error: string | null;
  onClearError: () => void;
}) {
  return (
    <div className="launcher">
      <div className="launcher-inner">
        <div className="launcher-head">
          <h1>A House Divided: Solo</h1>
          <p className="muted small">Local singleplayer. Online viewer. One launcher.</p>
        </div>

        {error && (
          <div className="error-banner" role="alert">
            <span>{error}</span>
            <button className="secondary small-btn" onClick={onClearError}>
              Dismiss
            </button>
          </div>
        )}

        <div className="launcher-actions">
          <button className="launcher-item" onClick={onPlayOnline}>
            <span className="launcher-item-title">Play Online</span>
            <span className="launcher-item-desc muted small">Open the live multiplayer game</span>
          </button>

          <button className="launcher-item" onClick={onNewWorld}>
            <span className="launcher-item-title">New World</span>
            <span className="launcher-item-desc muted small">Create a local singleplayer world</span>
          </button>

          <button className="launcher-item secondary" onClick={onLoad}>
            <span className="launcher-item-title">Load Save</span>
            <span className="launcher-item-desc muted small">Open a save from disk</span>
          </button>
        </div>

        <p className="muted small launcher-foot">Singleplayer is fully local. No network.</p>
      </div>
    </div>
  );
}

// -------------------------------------------------------------------
// New World
// -------------------------------------------------------------------

function NewWorldScreen({
  onBack,
  onCreated,
}: {
  onBack: () => void;
  onCreated: (world: WorldState) => void;
}) {
  const eras = listEras();
  const [era, setEra] = useState<string>(() => eras[0]?.id ?? "1953");
  const countries = listPlayableCountries(era);
  const [countryId, setCountryId] = useState<string>(() => countries[0]?.id ?? "us");
  const [seed, setSeed] = useState(() => Math.random().toString(36).slice(2, 10));
  const [name, setName] = useState("Player");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const list = listPlayableCountries(era);
    if (list.length > 0 && !list.some((c) => c.id === countryId)) {
      const first = list[0];
      if (first) setCountryId(first.id);
    }
  }, [era, countryId]);

  const handleCreate = async () => {
    setError(null);
    if (!seed.trim()) {
      setError("Seed is required.");
      return;
    }
    if (!name.trim()) {
      setError("Character name is required.");
      return;
    }
    if (!countryId) {
      setError("Pick a country.");
      return;
    }
    setBusy(true);
    try {
      const world = await game.newGame({ seed: seed.trim(), playerName: name.trim(), countryId, era });
      onCreated(world);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="launcher">
      <div className="launcher-inner">
        <div className="launcher-head">
          <h1>New World</h1>
          <p className="muted small">Local world. Turns run on your machine.</p>
        </div>

        <div className="panel new-game">
          <label>
            Era
            <select value={era} onChange={(e) => setEra(e.target.value)}>
              {eras.map((er) => (
                <option key={er.id} value={er.id}>
                  {er.label} - {er.startDate}
                </option>
              ))}
            </select>
          </label>

          <label>
            Country
            <select value={countryId} onChange={(e) => setCountryId(e.target.value)}>
              {countries.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </label>

          <label>
            Character name
            <input value={name} onChange={(e) => setName(e.target.value)} />
          </label>

          <label>
            World seed
            <input value={seed} onChange={(e) => setSeed(e.target.value)} />
          </label>

          {error && (
            <div className="error-text" role="alert">
              {error}
            </div>
          )}

          <div className="row">
            <button onClick={() => void handleCreate()} disabled={busy}>
              {busy ? "Creating" : "Create world"}
            </button>
            <button className="secondary" onClick={onBack}>
              Back
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// -------------------------------------------------------------------
// Dashboard
// -------------------------------------------------------------------

function Dashboard({
  world,
  onWorld,
  onExit,
  onSaved,
  isDirty,
}: {
  world: WorldState;
  onWorld: (world: WorldState) => void;
  onExit: () => void;
  onSaved: () => void;
  isDirty: boolean;
}) {
  const [lastReport, setLastReport] = useState<TurnReport | null>(null);
  const [busy, setBusy] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const advance = async () => {
    setBusy(true);
    try {
      const { report, world: next } = await game.advanceTurn();
      setLastReport(report);
      onWorld(next);
    } finally {
      setBusy(false);
    }
  };

  const handleSave = async () => {
    setSaveError(null);
    try {
      const result = await game.save();
      if (result.saved) onSaved();
    } catch (e) {
      setSaveError(e instanceof Error ? e.message : String(e));
    }
  };

  const handleExit = () => {
    if (isDirty) {
      const ok = window.confirm("You have unsaved turns since the last save. Leave and lose them?");
      if (!ok) return;
    }
    onExit();
  };

  return (
    <div className="dashboard">
      <header className="row spread">
        <div>
          <strong>Turn {world.meta.turn}</strong> · {world.meta.date} · era {world.meta.era}
        </div>
        <div className="row">
          <button onClick={() => void advance()} disabled={busy}>
            {busy ? "Processing" : "End turn"}
          </button>
          <button className="secondary" onClick={() => void handleSave()}>
            Save
          </button>
          <button className="secondary" onClick={handleExit}>
            Back to launcher
          </button>
        </div>
      </header>

      {saveError && (
        <div className="panel error-banner" role="alert">
          <span>{saveError}</span>
          <button className="secondary small-btn" onClick={() => setSaveError(null)}>
            Dismiss
          </button>
        </div>
      )}

      <div className="panel">
        <h2>Economies</h2>
        <table>
          <thead>
            <tr>
              <th>Country</th>
              <th>GDP ($M)</th>
              <th>Growth</th>
              <th>Inflation</th>
              <th>Unemployment</th>
            </tr>
          </thead>
          <tbody>
            {Object.values(world.countries).map((c) => (
              <tr key={c.id}>
                <td>{c.name}</td>
                <td>{Math.round(c.economy.gdp).toLocaleString("en-US")}</td>
                <td>{formatPct(c.economy.growthRate)}</td>
                <td>{formatPct(c.economy.inflationRate)}</td>
                <td>{formatPct(c.economy.unemploymentRate)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="panel">
        <h2>News</h2>
        <ul className="news">
          {world.news.slice(-10).reverse().map((n, i) => (
            <li key={`${n.turn}-${i}`}>
              <span className="muted">t{n.turn}</span> {n.headline}
            </li>
          ))}
        </ul>
      </div>

      {lastReport && (
        <div className="panel muted small">
          Last turn: {lastReport.phaseTimings.map((p) => `${p.name} ${p.ms.toFixed(1)}ms`).join(" · ")}
        </div>
      )}
    </div>
  );
}

// -------------------------------------------------------------------
// Root
// -------------------------------------------------------------------

export function App() {
  const [screen, setScreen] = useState<"launcher" | "newWorld" | "game">("launcher");
  const [world, setWorld] = useState<WorldState | null>(null);
  const [isDirty, setIsDirty] = useState(false);
  const [launcherError, setLauncherError] = useState<string | null>(null);

  const handleNewWorldCreated = (w: WorldState) => {
    setWorld(w);
    setIsDirty(false);
    setScreen("game");
  };

  const handleLoad = async () => {
    setLauncherError(null);
    try {
      const loaded = await game.load();
      if (!loaded) return;
      setWorld(loaded);
      setIsDirty(false);
      setScreen("game");
    } catch (e) {
      setLauncherError(e instanceof Error ? e.message : String(e));
    }
  };

  const handleAdvanceWorld = (w: WorldState) => {
    setWorld(w);
    setIsDirty(true);
  };

  const handleSaved = () => {
    setIsDirty(false);
  };

  const handleExitToLauncher = () => {
    setWorld(null);
    setIsDirty(false);
    setScreen("launcher");
  };

  if (screen === "game" && world) {
    return (
      <Dashboard
        world={world}
        onWorld={handleAdvanceWorld}
        onExit={handleExitToLauncher}
        onSaved={handleSaved}
        isDirty={isDirty}
      />
    );
  }

  if (screen === "newWorld") {
    return <NewWorldScreen onBack={() => setScreen("launcher")} onCreated={handleNewWorldCreated} />;
  }

  return (
    <LauncherScreen
      onPlayOnline={() => void openOnline()}
      onNewWorld={() => setScreen("newWorld")}
      onLoad={() => void handleLoad()}
      error={launcherError}
      onClearError={() => setLauncherError(null)}
    />
  );
}
