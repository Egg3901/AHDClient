import React, { useEffect, useMemo, useState } from "react";
import type { TurnReport, WorldState } from "@rotunda/engine";
import { listEras, listPlayableCountries } from "@rotunda/engine";
import { game } from "./game.js";
import { Launcher } from "./launcher/Launcher.js";
import { createWorldWithOverrides, listCountries } from "./worldSetup.js";
import type { WorldOverrides, CountryEconomyOverride } from "./worldSetup.js";
import { applyCheat, describeCheat } from "./cheats.js";
import type { CheatOp } from "./cheats.js";
import { GovernmentScreen } from "./government/Government.js";
import "./government/government.css";
import { EconomyScreen } from "./economy/Economy.js";
import "./economy/economy.css";
import { createHistoryMap, pushHistory, pushHistoryWithTurn } from "./economy/history.js";
import type { HistoryMap } from "./economy/history.js";
import { SavesScreen } from "./saves/SavesScreen.js";
import "./saves/saves.css";
import { maybeAutosave } from "./saves.js";

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

function randomSeed(): string {
  return Math.random().toString(36).slice(2, 10);
}

function percentInput(rate: number): string {
  // store as fraction, display as percent without trailing zeros
  const p = rate * 100;
  // keep up to 3 decimals, trim
  const s = p.toFixed(3);
  const trimmed = s.replace(/\.?0+$/, "");
  return trimmed;
}

// -------------------------------------------------------------------
// New World — granular setup
// -------------------------------------------------------------------

interface EditorRow {
  id: string;
  name: string;
  playable: boolean;
  defaultGdp: number;
  defaultGrowth: number;
  defaultInflation: number;
  defaultUnemployment: number;
  gdpStr: string;
  growthStr: string;
  inflationStr: string;
  unemploymentStr: string;
}

function isValidGdp(s: string): boolean {
  const n = Number(s);
  return Number.isFinite(n) && n > 0;
}
// growth and inflation may be negative (recession, deflation)
function isValidSignedPercent(s: string): boolean {
  const n = Number(s);
  return Number.isFinite(n) && n >= -100 && n <= 100;
}
function isValidPercent(s: string): boolean {
  const n = Number(s);
  return Number.isFinite(n) && n >= 0 && n <= 100;
}
function isValidCash(s: string): boolean {
  if (s.trim() === "") return false;
  const n = Number(s);
  return Number.isFinite(n) && n >= 0;
}

function NewWorldScreen({
  onBack,
  onCreated,
  initialEra,
}: {
  onBack: () => void;
  onCreated: (world: WorldState) => void;
  initialEra?: string | undefined;
}) {
  const eras = listEras();
  const [era, setEra] = useState<string>(() => initialEra ?? eras[0]?.id ?? "1953");
  const playable = useMemo(() => {
    try {
      return listPlayableCountries(era);
    } catch {
      return [];
    }
  }, [era]);
  const [countryId, setCountryId] = useState<string>(() => playable[0]?.id ?? "US");
  const [seed, setSeed] = useState(() => randomSeed());
  const [name, setName] = useState("Player");
  const [startingCash, setStartingCash] = useState("10000");
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [rows, setRows] = useState<EditorRow[]>(() => {
    try {
      const roster = listCountries(era);
      return roster.map((c) => ({
        id: c.id,
        name: c.name,
        playable: c.playable,
        defaultGdp: c.economy.gdp,
        defaultGrowth: c.economy.growthRate,
        defaultInflation: c.economy.inflationRate,
        defaultUnemployment: c.economy.unemploymentRate,
        gdpStr: String(Math.round(c.economy.gdp)),
        growthStr: percentInput(c.economy.growthRate),
        inflationStr: percentInput(c.economy.inflationRate),
        unemploymentStr: percentInput(c.economy.unemploymentRate),
      }));
    } catch {
      return [];
    }
  });
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // sync era change -> rebuild rows and validate country
  useEffect(() => {
    if (initialEra && eras.some((e) => e.id === initialEra) && initialEra !== era) {
      setEra(initialEra);
    }
  }, [initialEra, eras, era]);

  useEffect(() => {
    const list = playable;
    if (list.length > 0 && !list.some((c) => c.id === countryId)) {
      const first = list[0];
      if (first) setCountryId(first.id);
    }
  }, [playable, countryId]);

  useEffect(() => {
    try {
      const roster = listCountries(era);
      setRows(
        roster.map((c) => ({
          id: c.id,
          name: c.name,
          playable: c.playable,
          defaultGdp: c.economy.gdp,
          defaultGrowth: c.economy.growthRate,
          defaultInflation: c.economy.inflationRate,
          defaultUnemployment: c.economy.unemploymentRate,
          gdpStr: String(Math.round(c.economy.gdp)),
          growthStr: percentInput(c.economy.growthRate),
          inflationStr: percentInput(c.economy.inflationRate),
          unemploymentStr: percentInput(c.economy.unemploymentRate),
        })),
      );
    } catch {
      setRows([]);
    }
  }, [era]);

  const modifiedCount = useMemo(() => {
    let n = 0;
    for (const r of rows) {
      const gdp = Number(r.gdpStr);
      const growth = Number(r.growthStr);
      const inflation = Number(r.inflationStr);
      const unemployment = Number(r.unemploymentStr);
      // if any parse invalid, we count as not yet but will block creation
      const isModified =
        (Number.isFinite(gdp) && Math.abs(gdp - r.defaultGdp) > 1e-6) ||
        (Number.isFinite(growth) && Math.abs(growth / 100 - r.defaultGrowth) > 1e-9) ||
        (Number.isFinite(inflation) && Math.abs(inflation / 100 - r.defaultInflation) > 1e-9) ||
        (Number.isFinite(unemployment) && Math.abs(unemployment / 100 - r.defaultUnemployment) > 1e-9);
      if (isModified) n++;
    }
    return n;
  }, [rows]);

  const cashModified = useMemo(() => {
    const n = Number(startingCash);
    if (!Number.isFinite(n)) return false;
    return Math.abs(n - 10000) > 1e-6;
  }, [startingCash]);

  const totalModified = modifiedCount + (cashModified ? 1 : 0);

  const hasInvalid = useMemo(() => {
    if (!isValidCash(startingCash)) return true;
    for (const r of rows) {
      if (!isValidGdp(r.gdpStr) || !isValidSignedPercent(r.growthStr) || !isValidSignedPercent(r.inflationStr) || !isValidPercent(r.unemploymentStr)) {
        return true;
      }
    }
    return false;
  }, [rows, startingCash]);

  const handleRandomize = () => setSeed(randomSeed());

  const updateRow = (id: string, patch: Partial<Pick<EditorRow, "gdpStr" | "growthStr" | "inflationStr" | "unemploymentStr">>) => {
    setRows((prev) => prev.map((r) => (r.id === id ? { ...r, ...patch } : r)));
  };

  const resetRow = (id: string) => {
    setRows((prev) =>
      prev.map((r) =>
        r.id === id
          ? {
              ...r,
              gdpStr: String(Math.round(r.defaultGdp)),
              growthStr: percentInput(r.defaultGrowth),
              inflationStr: percentInput(r.defaultInflation),
              unemploymentStr: percentInput(r.defaultUnemployment),
            }
          : r,
      ),
    );
  };

  const resetAll = () => {
    setRows((prev) =>
      prev.map((r) => ({
        ...r,
        gdpStr: String(Math.round(r.defaultGdp)),
        growthStr: percentInput(r.defaultGrowth),
        inflationStr: percentInput(r.defaultInflation),
        unemploymentStr: percentInput(r.defaultUnemployment),
      })),
    );
    setStartingCash("10000");
  };

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
    if (!isValidCash(startingCash)) {
      setError("Correct highlighted fields before creating. Starting cash must be a finite number >= 0.");
      return;
    }
    for (const r of rows) {
      if (!isValidGdp(r.gdpStr) || !isValidSignedPercent(r.growthStr) || !isValidSignedPercent(r.inflationStr) || !isValidPercent(r.unemploymentStr)) {
        setError("Correct highlighted fields before creating. GDP must be > 0 and growth and inflation -100 to 100, unemployment 0-100.");
        return;
      }
    }
    setBusy(true);
    try {
      const overrides: WorldOverrides = {};
      const cashNum = Number(startingCash);
      if (Math.abs(cashNum - 10000) > 1e-6) {
        overrides.playerCash = cashNum;
      }
      const countries: Record<string, CountryEconomyOverride> = {};
      for (const r of rows) {
        const gdp = Number(r.gdpStr);
        const growth = Number(r.growthStr) / 100;
        const inflation = Number(r.inflationStr) / 100;
        const unemployment = Number(r.unemploymentStr) / 100;
        const ov: CountryEconomyOverride = {};
        let changed = false;
        if (Math.abs(gdp - r.defaultGdp) > 1e-6) {
          ov.gdp = gdp;
          changed = true;
        }
        if (Math.abs(growth - r.defaultGrowth) > 1e-9) {
          ov.growthRate = growth;
          changed = true;
        }
        if (Math.abs(inflation - r.defaultInflation) > 1e-9) {
          ov.inflationRate = inflation;
          changed = true;
        }
        if (Math.abs(unemployment - r.defaultUnemployment) > 1e-9) {
          ov.unemploymentRate = unemployment;
          changed = true;
        }
        if (changed) countries[r.id] = ov;
      }
      if (Object.keys(countries).length > 0) overrides.countries = countries;

      const world = await createWorldWithOverrides(
        { seed: seed.trim(), playerName: name.trim(), countryId, era },
        overrides,
      );
      onCreated(world);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const eraLabel = eras.find((e) => e.id === era)?.label ?? era;
  const countryLabel = playable.find((c) => c.id === countryId)?.name ?? countryId;

  return (
    <div className="new-world">
      <div className="new-world-inner">
        <div className="new-world-head">
          <h1>New World</h1>
          <p className="muted small">Local world. Turns run on your machine.</p>
        </div>

        <div className="panel new-world-panel">
          <section className="nw-section">
            <h2>Identity</h2>
            <label>
              Character name
              <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Player" />
            </label>
          </section>

          <section className="nw-section">
            <h2>World</h2>
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
              Playable country
              <select value={countryId} onChange={(e) => setCountryId(e.target.value)}>
                {playable.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </label>
            <label>
              World seed
              <div className="row seed-row">
                <input value={seed} onChange={(e) => setSeed(e.target.value)} className="seed-input" />
                <button type="button" className="secondary" onClick={handleRandomize}>
                  Randomize
                </button>
              </div>
            </label>
          </section>

          <section className="nw-section">
            <button type="button" className="secondary nw-advanced-toggle" onClick={() => setAdvancedOpen((v) => !v)}>
              <span className="nw-chevron">{advancedOpen ? "▾" : "▸"}</span> Advanced
              <span className="muted small" style={{ marginLeft: 8 }}>
                {totalModified > 0 ? `${totalModified} modified` : "defaults"}
              </span>
            </button>
            {advancedOpen && (
              <div className="nw-advanced">
                <label>
                  Starting cash
                  <input
                    value={startingCash}
                    onChange={(e) => setStartingCash(e.target.value)}
                    className={isValidCash(startingCash) ? "" : "invalid"}
                  />
                </label>

                <div className="nw-editor-head row spread">
                  <span className="small muted">Economy — {rows.length} countries</span>
                  <button type="button" className="secondary small-btn" onClick={resetAll}>
                    Reset all
                  </button>
                </div>

                <div className="nw-table-wrap">
                  <table className="nw-table">
                    <thead>
                      <tr>
                        <th>Country</th>
                        <th>GDP ($M)</th>
                        <th>Growth %</th>
                        <th>Inflation %</th>
                        <th>Unemployment %</th>
                        <th></th>
                      </tr>
                    </thead>
                    <tbody>
                      {rows.map((r) => {
                        const gdpInvalid = !isValidGdp(r.gdpStr);
                        const growthInvalid = !isValidSignedPercent(r.growthStr);
                        const inflationInvalid = !isValidSignedPercent(r.inflationStr);
                        const unemploymentInvalid = !isValidPercent(r.unemploymentStr);
                        return (
                          <tr key={r.id}>
                            <td className="nw-country-cell">
                              <span className="nw-country-name">{r.name}</span>
                              <span className="nw-country-id muted small">{r.id}</span>
                              {r.playable && <span className="nw-playable-dot" title="playable" />}
                            </td>
                            <td>
                              <input
                                value={r.gdpStr}
                                onChange={(e) => updateRow(r.id, { gdpStr: e.target.value })}
                                className={gdpInvalid ? "invalid" : ""}
                              />
                            </td>
                            <td>
                              <input
                                value={r.growthStr}
                                onChange={(e) => updateRow(r.id, { growthStr: e.target.value })}
                                className={growthInvalid ? "invalid" : ""}
                              />
                            </td>
                            <td>
                              <input
                                value={r.inflationStr}
                                onChange={(e) => updateRow(r.id, { inflationStr: e.target.value })}
                                className={inflationInvalid ? "invalid" : ""}
                              />
                            </td>
                            <td>
                              <input
                                value={r.unemploymentStr}
                                onChange={(e) => updateRow(r.id, { unemploymentStr: e.target.value })}
                                className={unemploymentInvalid ? "invalid" : ""}
                              />
                            </td>
                            <td>
                              <button type="button" className="secondary small-btn" onClick={() => resetRow(r.id)}>
                                Reset
                              </button>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </section>

          <div className="nw-summary muted small">
            {eraLabel} · {countryLabel} · seed {seed.trim() || "—"} · {modifiedCount} {modifiedCount === 1 ? "country" : "countries"} modified
            {cashModified ? " · cash modified" : ""}
          </div>

          {error && (
            <div className="error-text" role="alert">
              {error}
            </div>
          )}

          <div className="row">
            <button onClick={() => void handleCreate()} disabled={busy || hasInvalid}>
              {busy ? "Creating" : "Create world"}
            </button>
            <button className="secondary" onClick={onBack}>
              Back
            </button>
          </div>
          {hasInvalid && <div className="muted small">Correct highlighted fields before creating.</div>}
        </div>
      </div>
    </div>
  );
}

// -------------------------------------------------------------------
// Cheat panel (singleplayer only)
// -------------------------------------------------------------------

function CheatPanel({
  open,
  onClose,
  world,
  onWorld,
  onCheatApplied,
  log,
}: {
  open: boolean;
  onClose: () => void;
  world: WorldState;
  onWorld: (w: WorldState) => void;
  onCheatApplied: (entry: string, advanceCount?: number) => void;
  log: string[];
}) {
  const [cashInput, setCashInput] = useState("");
  const [econCountry, setEconCountry] = useState<string>(() => Object.keys(world.countries)[0] ?? "US");
  const [econField, setEconField] = useState<"gdp" | "growthRate" | "inflationRate" | "unemploymentRate" | "outputGap">("gdp");
  const [econValue, setEconValue] = useState("");
  const [timeCount, setTimeCount] = useState("1");
  const [lastElapsed, setLastElapsed] = useState<number | null>(null);
  const [headline, setHeadline] = useState("");
  const [cheatError, setCheatError] = useState<string | null>(null);

  useEffect(() => {
    if (!world.countries[econCountry]) {
      const first = Object.keys(world.countries)[0];
      if (first) setEconCountry(first);
    }
  }, [world.countries, econCountry]);

  const refreshWorld = () => {
    const w = game.getStateSync();
    if (w) {
      // shallow clone to trigger React update; nested objects already mutated
      onWorld({
        ...w,
        meta: { ...w.meta },
        player: { ...w.player },
        countries: { ...w.countries },
        news: [...w.news],
        parties: { ...w.parties },
        legislatures: { ...w.legislatures },
      });
    }
  };

  const handleSetCash = () => {
    setCheatError(null);
    const amount = Number(cashInput);
    try {
      const op: CheatOp = { kind: "setPlayerCash", amount };
      const result = applyCheat(op);
      void result;
      onCheatApplied(describeCheat(op));
      refreshWorld();
    } catch (e) {
      setCheatError(e instanceof Error ? e.message : String(e));
    }
  };

  const handleSetEconomy = () => {
    setCheatError(null);
    const value = Number(econValue);
    try {
      const op: CheatOp = { kind: "setCountryEconomy", countryId: econCountry, field: econField, value };
      applyCheat(op);
      onCheatApplied(describeCheat(op));
      refreshWorld();
    } catch (e) {
      setCheatError(e instanceof Error ? e.message : String(e));
    }
  };

  const handleAdvance = () => {
    setCheatError(null);
    const count = Number(timeCount);
    try {
      const op: CheatOp = { kind: "advanceTurns", count };
      const { elapsedMs } = applyCheat(op);
      if (elapsedMs !== undefined) setLastElapsed(elapsedMs);
      onCheatApplied(
        describeCheat(op, elapsedMs !== undefined ? `(${elapsedMs.toFixed(1)}ms)` : undefined),
        count,
      );
      refreshWorld();
    } catch (e) {
      setCheatError(e instanceof Error ? e.message : String(e));
    }
  };

  const handleAddNews = () => {
    setCheatError(null);
    try {
      const op: CheatOp = { kind: "addNews", headline };
      applyCheat(op);
      onCheatApplied(describeCheat(op));
      setHeadline("");
      refreshWorld();
    } catch (e) {
      setCheatError(e instanceof Error ? e.message : String(e));
    }
  };

  if (!open) return null;

  return (
    <div className="cheat-overlay" onClick={onClose}>
      <div className="cheat-panel" onClick={(e) => e.stopPropagation()} role="dialog" aria-label="Cheats">
        <div className="cheat-head row spread">
          <span className="cheat-title">CHEATS</span>
          <button className="secondary small-btn" onClick={onClose}>
            Close
          </button>
        </div>

        <div className="cheat-section">
          <h3>Player</h3>
          <div className="row">
            <input placeholder="cash amount" value={cashInput} onChange={(e) => setCashInput(e.target.value)} className="cheat-input" />
            <button className="secondary small-btn" onClick={handleSetCash}>
              Set cash
            </button>
          </div>
          <div className="muted small">Current: {world.player.cash.toLocaleString("en-US")}</div>
        </div>

        <div className="cheat-section">
          <h3>Economy</h3>
          <div className="cheat-economy-row">
            <select value={econCountry} onChange={(e) => setEconCountry(e.target.value)}>
              {Object.values(world.countries).map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name} ({c.id})
                </option>
              ))}
            </select>
            <select value={econField} onChange={(e) => setEconField(e.target.value as typeof econField)}>
              <option value="gdp">GDP ($M)</option>
              <option value="growthRate">growthRate 0-1</option>
              <option value="inflationRate">inflationRate 0-1</option>
              <option value="unemploymentRate">unemploymentRate 0-1</option>
              <option value="outputGap">outputGap</option>
            </select>
          </div>
          <div className="row">
            <input placeholder="value" value={econValue} onChange={(e) => setEconValue(e.target.value)} className="cheat-input" />
            <button className="secondary small-btn" onClick={handleSetEconomy}>
              Apply
            </button>
          </div>
          <div className="muted small">Enter raw value. Rates 0-1 (0.05 = 5%). GDP &gt; 0.</div>
        </div>

        <div className="cheat-section">
          <h3>Time</h3>
          <div className="row">
            <input value={timeCount} onChange={(e) => setTimeCount(e.target.value)} className="cheat-input" style={{ maxWidth: 100 }} />
            <button className="secondary small-btn" onClick={handleAdvance}>
              Advance
            </button>
          </div>
          {lastElapsed !== null && <div className="muted small">Elapsed: {lastElapsed.toFixed(1)}ms</div>}
        </div>

        <div className="cheat-section">
          <h3>News</h3>
          <div className="row">
            <input
              placeholder="headline"
              value={headline}
              onChange={(e) => setHeadline(e.target.value)}
              className="cheat-input"
            />
            <button className="secondary small-btn" onClick={handleAddNews}>
              Inject
            </button>
          </div>
        </div>

        {cheatError && (
          <div className="cheat-error" role="alert">
            {cheatError}
          </div>
        )}

        <div className="cheat-log">
          <h3>Session log</h3>
          {log.length === 0 ? (
            <div className="muted small">No cheats applied yet.</div>
          ) : (
            <ul className="cheat-log-list">
              {log.map((entry, i) => (
                <li key={i} className="cheat-log-entry">
                  {entry}
                </li>
              ))}
            </ul>
          )}
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
  onOpenSaves,
  isDirty,
  history,
  onRecordHistory,
}: {
  world: WorldState;
  onWorld: (world: WorldState) => void;
  onExit: () => void;
  onOpenSaves: () => void;
  isDirty: boolean;
  history: HistoryMap;
  onRecordHistory: (w: WorldState, count?: number) => void;
}) {
  const [lastReport, setLastReport] = useState<TurnReport | null>(null);
  const [busy, setBusy] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [cheatOpen, setCheatOpen] = useState(false);
  const [cheatsUsed, setCheatsUsed] = useState(false);
  const [cheatLog, setCheatLog] = useState<string[]>([]);
  const [govOpen, setGovOpen] = useState(false);
  const [ecoOpen, setEcoOpen] = useState(false);

  const advance = async () => {
    const prevTurn = world.meta.turn;
    setBusy(true);
    try {
      const { report, world: next } = await game.advanceTurn();
      setLastReport(report);
      onRecordHistory(next);
      onWorld(next);
      try {
        await maybeAutosave(prevTurn, next);
      } catch (e) {
        setSaveError(e instanceof Error ? e.message : String(e));
      }
    } finally {
      setBusy(false);
    }
  };

  const handleExit = () => {
    if (isDirty) {
      const ok = window.confirm("You have unsaved turns since the last save. Leave and lose them?");
      if (!ok) return;
    }
    onExit();
  };

  const handleCheatApplied = (entry: string, advanceCount?: number) => {
    setCheatsUsed(true);
    const ts = new Date().toLocaleTimeString("en-GB", { hour12: false });
    setCheatLog((prev) => [...prev, `[${ts}] ${entry}`]);
    if (advanceCount !== undefined && advanceCount > 0) {
      const current = game.getStateSync();
      if (current) {
        // Cheat batch advanceTurns already mutated world; try autosave
        const prevTurn = current.meta.turn - advanceCount;
        void maybeAutosave(prevTurn, current).catch((e) => {
          setSaveError(e instanceof Error ? e.message : String(e));
        });
      }
    }
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "`" || e.code === "Backquote") {
        // avoid toggling when typing in an input
        const target = e.target as HTMLElement | null;
        if (target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.tagName === "SELECT")) {
          return;
        }
        setCheatOpen((v) => !v);
      }
      if (e.key === "Escape" && cheatOpen) {
        setCheatOpen(false);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [cheatOpen]);

  if (govOpen) {
    return (
      <GovernmentScreen
        world={world}
        onBack={() => setGovOpen(false)}
        initialCountryId={world.player.countryId}
      />
    );
  }

  if (ecoOpen) {
    return <EconomyScreen world={world} history={history} onBack={() => setEcoOpen(false)} />;
  }

  return (
    <div className="dashboard">
      <header className="row spread dashboard-header">
        <div className="row" style={{ gap: 12 }}>
          <div>
            <strong>Turn {world.meta.turn}</strong> · {world.meta.date} · era {world.meta.era}
          </div>
          {cheatsUsed && <span className="cheats-tag">CHEATS ACTIVE</span>}
        </div>
        <div className="row">
          <button className="secondary small-btn" onClick={() => setGovOpen(true)}>
            GOVERNMENT
          </button>
          <button className="secondary small-btn" onClick={() => setEcoOpen(true)}>
            ECONOMY
          </button>
          <button className="secondary small-btn cheat-toggle" onClick={() => setCheatOpen((v) => !v)}>
            CHEATS
          </button>
          <button onClick={() => void advance()} disabled={busy}>
            {busy ? "Processing" : "End turn"}
          </button>
          <button className="secondary" onClick={onOpenSaves}>
            Save
          </button>
          <button className="secondary" onClick={handleExit}>
            Back to launcher
          </button>
        </div>
      </header>

      <CheatPanel
        open={cheatOpen}
        onClose={() => setCheatOpen(false)}
        world={world}
        onWorld={(w) => {
          onWorld(w);
        }}
        onCheatApplied={(entry, count) => {
          handleCheatApplied(entry);
          const current = game.getStateSync();
          if (current) {
            onRecordHistory(current, count);
          }
        }}
        log={cheatLog}
      />

      {saveError && (
        <div className="panel error-banner" role="alert">
          <span>{saveError}</span>
          <button className="secondary small-btn" onClick={() => setSaveError(null)}>
            Dismiss
          </button>
        </div>
      )}

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
  const [screen, setScreen] = useState<"launcher" | "newWorld" | "game" | "saves">("launcher");
  const [savesReturn, setSavesReturn] = useState<"launcher" | "game">("launcher");
  const [pendingEra, setPendingEra] = useState<string | null>(null);
  const [world, setWorld] = useState<WorldState | null>(null);
  const [isDirty, setIsDirty] = useState(false);
  const [launcherError, setLauncherError] = useState<string | null>(null);
  const [savesError, setSavesError] = useState<string | null>(null);
  const historyRef = React.useRef<HistoryMap>(createHistoryMap());
  const [historyVersion, setHistoryVersion] = useState(0);

  const recordHistory = (w: WorldState, count?: number) => {
    if (count !== undefined && Number.isFinite(count) && count > 1) {
      const endTurn = typeof w.meta?.turn === "number" && Number.isFinite(w.meta.turn) ? w.meta.turn : 0;
      const startTurn = endTurn - count + 1;
      for (let t = startTurn; t <= endTurn; t++) {
        pushHistoryWithTurn(historyRef.current, w, t);
      }
    } else {
      pushHistory(historyRef.current, w);
    }
    setHistoryVersion((v) => v + 1);
  };

  const resetHistory = (w: WorldState) => {
    historyRef.current.clear();
    pushHistory(historyRef.current, w);
    setHistoryVersion((v) => v + 1);
  };

  const handleNewWorldCreated = (w: WorldState) => {
    resetHistory(w);
    setWorld(w);
    setIsDirty(false);
    setScreen("game");
  };

  const openSavesFromLauncher = () => {
    setSavesError(null);
    setSavesReturn("launcher");
    setScreen("saves");
  };

  const openSavesFromGame = () => {
    setSavesError(null);
    setSavesReturn("game");
    setScreen("saves");
  };

  const handleSavesClose = () => {
    setScreen(savesReturn);
  };

  const handleSavesLoad = (loaded: WorldState) => {
    resetHistory(loaded);
    setWorld(loaded);
    setIsDirty(false);
    setLauncherError(null);
    setSavesError(null);
    setScreen("game");
  };

  const handleAdvanceWorld = (w: WorldState) => {
    setWorld(w);
    setIsDirty(true);
  };

  const handleExitToLauncher = () => {
    setWorld(null);
    setIsDirty(false);
    setScreen("launcher");
  };

  if (screen === "saves") {
    return (
      <>
        <SavesScreen currentWorld={world} onLoad={handleSavesLoad} onClose={handleSavesClose} isDirty={isDirty} />
        {savesError && (
          <div className="panel error-banner" role="alert" style={{ margin: 12 }}>
            <span>{savesError}</span>
            <button className="secondary small-btn" onClick={() => setSavesError(null)}>
              Dismiss
            </button>
          </div>
        )}
      </>
    );
  }

  if (screen === "game" && world) {
    // historyVersion forces re-render when history mutates; map reference stays stable
    void historyVersion;
    return (
      <Dashboard
        world={world}
        onWorld={handleAdvanceWorld}
        onExit={handleExitToLauncher}
        onOpenSaves={openSavesFromGame}
        isDirty={isDirty}
        history={historyRef.current}
        onRecordHistory={recordHistory}
      />
    );
  }

  if (screen === "newWorld") {
    return (
      <NewWorldScreen
        onBack={() => setScreen("launcher")}
        onCreated={handleNewWorldCreated}
        initialEra={pendingEra ?? undefined}
      />
    );
  }

  return (
    <>
      <Launcher
        onPlayOnline={() => void openOnline()}
        onNewWorld={(eraId) => {
          setPendingEra(eraId);
          setScreen("newWorld");
        }}
        onLoad={openSavesFromLauncher}
        error={launcherError}
        onClearError={() => setLauncherError(null)}
      />
      {savesError && (
        <div className="panel error-banner" role="alert" style={{ margin: 12 }}>
          <span>{savesError}</span>
          <button className="secondary small-btn" onClick={() => setSavesError(null)}>
            Dismiss
          </button>
        </div>
      )}
    </>
  );
}
