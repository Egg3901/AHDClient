import { useCallback, useEffect, useState } from "react";
import type { WorldState } from "@ahdclient/engine";
import { deserializeSave } from "@ahdclient/engine";
import { open, save } from "@tauri-apps/plugin-dialog";
import { readTextFile, writeTextFile } from "@tauri-apps/plugin-fs";
import {
  listSlots,
  saveToSlot,
  loadFromSlot,
  deleteSlot,
  readSlotRaw,
  getAutosaveConfig,
  setAutosaveConfig,
  filterSaveSlots,
  preferredSaveSlot,
} from "../saves.js";
import type { SaveSlotMeta, AutosaveConfig, AutosaveInterval } from "../saves.js";
import "./saves.css";

interface Props {
  currentWorld: WorldState | null;
  onLoad: (world: WorldState) => void;
  onClose: () => void;
  onSaved: () => void;
  isDirty?: boolean;
}

function formatSavedAt(iso: string): string {
  try {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return iso;
    return d.toLocaleString("en-GB", {
      year: "numeric",
      month: "short",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hour12: false,
    });
  } catch {
    return iso;
  }
}

export function SavesScreen({ currentWorld, onLoad, onClose, onSaved, isDirty }: Props): JSX.Element {
  const [slots, setSlots] = useState<SaveSlotMeta[]>([]);
  const [loading, setLoading] = useState(true);
  const [banner, setBanner] = useState<string | null>(null);
  const [newName, setNewName] = useState("");
  const [selected, setSelected] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [autosave, setAutosave] = useState<AutosaveConfig>(() => getAutosaveConfig());
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const [confirmOverwrite, setConfirmOverwrite] = useState<string | null>(null);
  const [query, setQuery] = useState("");

  const refresh = useCallback(async () => {
    setLoading(true);
    setBanner(null);
    try {
      const list = await listSlots();
      setSlots(list);
      setSelected((current) => preferredSaveSlot(list, current));
    } catch (e) {
      setBanner(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const handleAutosaveToggle = (enabled: boolean) => {
    const next = { ...autosave, enabled };
    setAutosave(next);
    setAutosaveConfig(next);
  };

  const handleIntervalChange = (value: string) => {
    if (value === "off") {
      const next: AutosaveConfig = { ...autosave, enabled: false };
      setAutosave(next);
      setAutosaveConfig(next);
      return;
    }
    const n = Number(value) as AutosaveInterval;
    const interval: AutosaveInterval = n === 2 ? 2 : n === 8 ? 8 : 4;
    const next: AutosaveConfig = { enabled: true, interval, nextSlotIndex: autosave.nextSlotIndex };
    setAutosave(next);
    setAutosaveConfig(next);
  };

  const autosaveSelectValue = autosave.enabled ? String(autosave.interval) : "off";

  const doSaveNew = async () => {
    const name = newName.trim();
    if (!name) {
      setBanner("Enter a slot name.");
      return;
    }
    if (!currentWorld) {
      setBanner("No world to save.");
      return;
    }
    const exists = slots.some((s) => s.slot === name);
    if (exists && confirmOverwrite !== name) {
      setConfirmOverwrite(name);
      return;
    }
    setBusy(true);
    setBanner(null);
    try {
      await saveToSlot(name, currentWorld);
      setSelected(name);
      setNewName("");
      setConfirmOverwrite(null);
      onSaved();
      await refresh();
    } catch (e) {
      setBanner(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const doSaveToSelected = async () => {
    if (!selected) {
      setBanner("Select a slot to overwrite.");
      return;
    }
    if (!currentWorld) {
      setBanner("No world to save.");
      return;
    }
    if (confirmOverwrite !== selected) {
      setConfirmOverwrite(selected);
      return;
    }
    setBusy(true);
    setBanner(null);
    try {
      await saveToSlot(selected, currentWorld);
      setConfirmOverwrite(null);
      onSaved();
      await refresh();
    } catch (e) {
      setBanner(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const doLoad = async (slot: string) => {
    if (isDirty) {
      const ok = window.confirm("You have unsaved changes. Load and lose them?");
      if (!ok) return;
    }
    setBusy(true);
    setBanner(null);
    try {
      const world = await loadFromSlot(slot);
      onLoad(world);
    } catch (e) {
      setBanner(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const doDelete = async (slot: string) => {
    if (confirmDelete !== slot) {
      setConfirmDelete(slot);
      return;
    }
    setBusy(true);
    setBanner(null);
    try {
      await deleteSlot(slot);
      setConfirmDelete(null);
      if (selected === slot) setSelected(null);
      await refresh();
    } catch (e) {
      setBanner(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const doImport = async () => {
    setBanner(null);
    try {
      const picked = await open({
        multiple: false,
        filters: [{ name: "AHD Solo save", extensions: ["json"] }],
      });
      if (!picked || Array.isArray(picked)) return;
      const raw = await readTextFile(picked);
      let world: WorldState;
      try {
        world = deserializeSave(raw);
      } catch (e) {
        setBanner(e instanceof Error ? e.message : String(e));
        return;
      }
      const suggested = picked.split(/[/\\]/).pop()?.replace(/\.json$/i, "") ?? "imported";
      const slotName = window.prompt("Import as slot name:", suggested);
      if (!slotName) return;
      const trimmed = slotName.trim();
      if (!trimmed) {
        setBanner("Slot name required.");
        return;
      }
      const existsSlot = slots.some((s) => s.slot === trimmed);
      if (existsSlot) {
        const ok = window.confirm(`Slot "${trimmed}" exists. Overwrite?`);
        if (!ok) return;
      }
      setBusy(true);
      try {
        await saveToSlot(trimmed, world);
        setSelected(trimmed);
        await refresh();
      } finally {
        setBusy(false);
      }
    } catch (e) {
      setBanner(e instanceof Error ? e.message : String(e));
    }
  };

  const doExport = async () => {
    if (!selected) {
      setBanner("Select a slot to export.");
      return;
    }
    setBanner(null);
    try {
      const raw = await readSlotRaw(selected);
      // validate
      try {
        deserializeSave(raw);
      } catch (e) {
        setBanner(e instanceof Error ? e.message : String(e));
        return;
      }
      const filePath = await save({
        defaultPath: `${selected}.json`,
        filters: [{ name: "AHD Solo save", extensions: ["json"] }],
      });
      if (!filePath) return;
      await writeTextFile(filePath, raw);
    } catch (e) {
      setBanner(e instanceof Error ? e.message : String(e));
    }
  };

  const selectedMeta = selected ? slots.find((s) => s.slot === selected) ?? null : null;
  const visibleSlots = filterSaveSlots(slots, query);

  return (
    <div className="saves-screen">
      <header className="saves-header row spread">
        <div>
          <h1 className="saves-title">Saves</h1>
          <div className="muted small">Slots in app data saves</div>
        </div>
        <button className="secondary small-btn" onClick={onClose}>
          Back
        </button>
      </header>

      {banner && (
        <div className="panel error-banner" role="alert">
          <span>{banner}</span>
          <button className="secondary small-btn" onClick={() => setBanner(null)}>
            Dismiss
          </button>
        </div>
      )}

      <div className="saves-layout">
        <div className="saves-list-pane panel">
          <div className="row spread saves-list-head">
            <h2>Slots</h2>
            <button className="secondary small-btn" onClick={() => void refresh()} disabled={loading || busy}>
              Refresh
            </button>
          </div>

          {slots.length > 0 && (
            <label className="saves-search">
              Search saves
              <input
                type="search"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Name, player, country, era or turn"
              />
            </label>
          )}

          {loading ? (
            <div className="muted small">Loading</div>
          ) : slots.length === 0 ? (
            <div className="muted small">No saves yet. Create one below.</div>
          ) : visibleSlots.length === 0 ? (
            <div className="muted small">No saves match “{query.trim()}”.</div>
          ) : (
            <ul className="saves-list">
              {visibleSlots.map((s) => {
                const active = s.slot === selected;
                const isAutosave = s.slot === "autosave-a" || s.slot === "autosave-b";
                return (
                  <li key={s.slot}>
                    <button
                      className={`saves-slot${active ? " active" : ""}${isAutosave ? " autosave" : ""}`}
                      onClick={() => {
                        setSelected(s.slot);
                        setConfirmDelete(null);
                        setConfirmOverwrite(null);
                      }}
                    >
                      <span className="saves-slot-name">{s.slot}</span>
                      <span className="muted small saves-slot-meta">
                        t{s.turn} · {s.date} · era {s.era} · {s.country} · {s.playerName}
                        {s.cheatsUsed ? " · cheats" : ""}
                      </span>
                      <span className="muted small">{formatSavedAt(s.savedAt)}</span>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}

          <div className="saves-actions row">
            <button
              className="secondary small-btn"
              onClick={() => selected && void doLoad(selected)}
              disabled={!selected || busy}
            >
              Load
            </button>
            <button
              className="secondary small-btn"
              onClick={() => selected && void doDelete(selected)}
              disabled={!selected || busy}
            >
              {confirmDelete === selected ? "Confirm delete" : "Delete"}
            </button>
            {confirmDelete === selected && (
              <button className="secondary small-btn" onClick={() => setConfirmDelete(null)}>
                Cancel
              </button>
            )}
            <button className="secondary small-btn" onClick={() => void doExport()} disabled={!selected || busy}>
              Export
            </button>
          </div>
          {selectedMeta && (
            <div className="muted small saves-selected-detail">
              Selected: {selectedMeta.slot} · t{selectedMeta.turn} · {selectedMeta.date}
            </div>
          )}
        </div>

        <div className="saves-detail-pane">
          <div className="panel">
            <h2>Save current world</h2>
            {!currentWorld ? (
              <div className="muted small">No world loaded. Load a save or start a new world to save.</div>
            ) : (
              <>
                <div className="muted small" style={{ marginBottom: 8 }}>
                  Turn {currentWorld.meta.turn} · {currentWorld.meta.date} · {currentWorld.meta.era} · {currentWorld.player.name}
                </div>
                <label>
                  New slot name
                  <div className="row">
                    <input
                      value={newName}
                      onChange={(e) => {
                        setNewName(e.target.value);
                        setConfirmOverwrite(null);
                      }}
                      placeholder="my-save"
                      disabled={busy}
                    />
                    <button onClick={() => void doSaveNew()} disabled={busy || !newName.trim()}>
                      {confirmOverwrite === newName.trim() ? "Confirm overwrite" : "Save as new"}
                    </button>
                  </div>
                </label>
                {confirmOverwrite === newName.trim() && (
                  <div className="row" style={{ marginTop: 8 }}>
                    <span className="small" style={{ color: "#ffcc00" }}>
                      Slot exists. Confirm overwrite?
                    </span>
                    <button className="secondary small-btn" onClick={() => setConfirmOverwrite(null)}>
                      Cancel
                    </button>
                  </div>
                )}

                <div className="saves-overwrite">
                  <div className="muted small">Or overwrite selected slot</div>
                  <button
                    className="secondary small-btn"
                    onClick={() => void doSaveToSelected()}
                    disabled={busy || !selected || !currentWorld}
                  >
                    {selected && confirmOverwrite === selected ? "Confirm overwrite" : "Save to selected"}
                  </button>
                  {selected && confirmOverwrite === selected && (
                    <button className="secondary small-btn" onClick={() => setConfirmOverwrite(null)}>
                      Cancel
                    </button>
                  )}
                </div>
              </>
            )}
          </div>

          <div className="panel">
            <h2>File exchange</h2>
            <div className="muted small" style={{ marginBottom: 8 }}>
              Import brings a file into a slot. Export writes a slot to a file.
            </div>
            <div className="row">
              <button className="secondary small-btn" onClick={() => void doImport()} disabled={busy}>
                Import
              </button>
              <button className="secondary small-btn" onClick={() => void doExport()} disabled={busy || !selected}>
                Export
              </button>
            </div>
          </div>

          <div className="panel saves-autosave">
            <h2>Autosave</h2>
            <div className="saves-autosave-row row">
              <label className="saves-autosave-toggle">
                <input
                  type="checkbox"
                  checked={autosave.enabled}
                  onChange={(e) => handleAutosaveToggle(e.target.checked)}
                />
                <span>Enabled</span>
              </label>
              <label className="saves-autosave-interval">
                Interval
                <select value={autosaveSelectValue} onChange={(e) => handleIntervalChange(e.target.value)}>
                  <option value="off">Off</option>
                  <option value="2">2 turns</option>
                  <option value="4">4 turns</option>
                  <option value="8">8 turns</option>
                </select>
              </label>
            </div>
            <div className="muted small">
              Writes to rotating slots autosave-a and autosave-b, alternating so a crash mid-write leaves the previous intact.
              {autosave.enabled ? ` Next: ${autosave.nextSlotIndex === 0 ? "autosave-a" : "autosave-b"} · every ${autosave.interval} turns` : " Currently off."}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
