import { useEffect, useState } from "react";
import type { TurnReport, WorldState } from "@ahdsolo/engine";

function formatPct(rate: number): string {
  return `${(rate * 100).toFixed(1)}%`;
}

function NewGameForm({ onStart }: { onStart: (world: WorldState) => void }) {
  const [seed, setSeed] = useState(() => Math.random().toString(36).slice(2, 10));
  const [name, setName] = useState("Player");

  return (
    <div className="panel new-game">
      <h1>A House Divided: Solo</h1>
      <label>
        Character name
        <input value={name} onChange={(e) => setName(e.target.value)} />
      </label>
      <label>
        World seed
        <input value={seed} onChange={(e) => setSeed(e.target.value)} />
      </label>
      <div className="row">
        <button
          onClick={() => {
            void window.game
              .newGame({ seed, playerName: name, countryId: "us" })
              .then(onStart);
          }}
        >
          New game
        </button>
        <button
          className="secondary"
          onClick={() => {
            void window.game.load().then((w) => w && onStart(w));
          }}
        >
          Load save
        </button>
      </div>
    </div>
  );
}

function Dashboard({
  world,
  onWorld,
}: {
  world: WorldState;
  onWorld: (world: WorldState) => void;
}) {
  const [lastReport, setLastReport] = useState<TurnReport | null>(null);
  const [busy, setBusy] = useState(false);

  const advance = async () => {
    setBusy(true);
    try {
      const { report, world: next } = await window.game.advanceTurn();
      setLastReport(report);
      onWorld(next);
    } finally {
      setBusy(false);
    }
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
          <button className="secondary" onClick={() => void window.game.save()}>
            Save
          </button>
        </div>
      </header>

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

export function App() {
  const [world, setWorld] = useState<WorldState | null>(null);

  useEffect(() => {
    void window.game.getState().then((w) => w && setWorld(w));
  }, []);

  return world ? (
    <Dashboard world={world} onWorld={setWorld} />
  ) : (
    <NewGameForm onStart={setWorld} />
  );
}
