import { useEffect, useRef, useState } from "react";
import { game } from "../worlds.js";

export interface WorldsimHeadline {
  turn: number;
  nppCount: number;
  nppHeldPct: number;
  activeCrises: number;
  inflationIndex: number;
  totalWealth: number;
  effectivePartyCount: number;
}
interface Props {
  name: string;
  onBack: () => void;
  onView: () => void;
  onStop: () => Promise<void>;
  onTurnCompleted?: () => Promise<void>;
}
const format = new Intl.NumberFormat(undefined, { maximumFractionDigits: 2, notation: "compact" });
export function WorldsimScreen({ name, onBack, onView, onStop, onTurnCompleted }: Props): JSX.Element {
  const [turns, setTurns] = useState(12);
  const [completed, setCompleted] = useState(0);
  const [running, setRunning] = useState(false);
  const [stopping, setStopping] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [headline, setHeadline] = useState<WorldsimHeadline | null>(null);
  const cancel = useRef(false);
  const active = useRef(true);
  const refresh = async () => {
    const result = await game.request<{ headline: WorldsimHeadline }>("GET", "/api/singleplayer/worldsim/stats");
    if (active.current) setHeadline(result.headline);
  };
  useEffect(() => {
    active.current = true;
    void refresh().catch((e: unknown) => { if (active.current) setError(String(e)); });
    return () => { active.current = false; cancel.current = true; };
  }, []);
  const run = async () => {
    if (running || !Number.isInteger(turns) || turns < 1 || turns > 1000) return;
    cancel.current = false;
    setRunning(true); setStopping(false); setCompleted(0); setError(null);
    try {
      for (let index = 0; index < turns && !cancel.current; index++) {
        await game.request("POST", "/api/singleplayer/worldsim/advance", { turns: 1 });
        if (!active.current) break;
        setCompleted(index + 1);
        await refresh();
        await onTurnCompleted?.();
      }
    } catch (e) { if (active.current) setError(e instanceof Error ? e.message : String(e)); }
    finally { if (active.current) { setRunning(false); setStopping(false); } }
  };
  return <main className="launcher-scope screen-scope"><section className="launcher-stage screen-stage">
    <header className="screen-head"><button className="launcher-btn launcher-btn-secondary" onClick={onBack} disabled={running}>Launcher</button>
      <h1>Worldsim <span className="client-beta">Beta</span></h1></header>
    <div className="launcher-console screen-console">
      <h2>{name}</h2><p className="launcher-caption">A world run entirely by NPPs. No player character is created.</p>
      {error && <p role="alert">{error}</p>}
      <label className="screen-field">Turns to simulate<input type="number" min={1} max={1000} step={1} value={turns} disabled={running} onChange={(e) => setTurns(e.target.valueAsNumber)} /></label>
      <div className="launcher-actions">
        <button className="launcher-btn launcher-btn-primary" disabled={running || !Number.isInteger(turns) || turns < 1 || turns > 1000} onClick={() => void run()}>Run simulation</button>
        {running && <button className="launcher-btn launcher-btn-secondary" disabled={stopping} onClick={() => { cancel.current = true; setStopping(true); }}>Stop after this turn</button>}
        <button className="launcher-btn launcher-btn-secondary" disabled={running} onClick={onView}>View all world</button>
        <button className="launcher-btn launcher-btn-secondary" disabled={running} onClick={() => void onStop()}>Save and stop</button>
      </div>
      <p role="status">{stopping ? "Finishing the current turn" : running ? "Simulating" : "Ready"}{completed > 0 ? ` · ${completed} turns completed` : ""}</p>
      {headline && <dl className="worldsim-stats">{([
        ["Turn", headline.turn], ["NPPs", headline.nppCount], ["Offices held by NPPs (%)", headline.nppHeldPct * 100],
        ["Effective party count", headline.effectivePartyCount], ["Active crises", headline.activeCrises],
        ["Inflation index", headline.inflationIndex], ["NPP wealth", headline.totalWealth],
      ] as const).map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{format.format(value)}</dd></div>)}</dl>}
    </div></section></main>;
}
