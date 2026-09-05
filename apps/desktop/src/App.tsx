import { useCallback, useEffect, useRef, useState } from "react";
import { listen } from "@tauri-apps/api/event";
import { Launcher } from "./launcher/Launcher.js";
import { NewWorldScreen } from "./screens/NewWorldScreen.js";
import { WorldsScreen } from "./screens/WorldsScreen.js";
import { BootScreen } from "./screens/BootScreen.js";
import { PlayingScreen } from "./screens/PlayingScreen.js";
import { eraById, game, online, slugForWorld, worlds } from "./worlds.js";
import type { GameInfo, OnlineTarget, WorldMeta } from "./worlds.js";
import "./screens/screens.css";

type Screen = "launcher" | "newWorld" | "worlds" | "booting" | "playing";

const IDLE: GameInfo = { running: false, port: null, slot: null, url: null };
const LOG_LINES = 14;

export function App(): JSX.Element {
  const [screen, setScreen] = useState<Screen>("launcher");
  const [allWorlds, setAllWorlds] = useState<WorldMeta[]>([]);
  const [info, setInfo] = useState<GameInfo>(IDLE);
  const [pendingEra, setPendingEra] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [bootTitle, setBootTitle] = useState("Starting");
  const [log, setLog] = useState<string[]>([]);
  const cancelled = useRef(false);

  const refreshWorlds = useCallback(async () => {
    try {
      setAllWorlds(await worlds.list());
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }, []);

  useEffect(() => {
    void refreshWorlds();
    void game.status().then(setInfo).catch(() => setInfo(IDLE));
  }, [refreshWorlds]);

  useEffect(() => {
    const subscriptions = [
      listen<{ line: string }>("game:log", (event) => {
        setLog((lines) => [...lines, event.payload.line].slice(-LOG_LINES));
      }),
      listen<{ line: string }>("game:exited", (event) => {
        setInfo(IDLE);
        setScreen((current) => {
          if (current === "playing" || current === "booting") {
            setError(event.payload.line || "The game stopped.");
            return "launcher";
          }
          return current;
        });
        void refreshWorlds();
      }),
      listen("game:window-closed", () => {
        void recordProgress();
      }),
    ];
    return () => {
      for (const subscription of subscriptions) void subscription.then((unlisten) => unlisten());
    };
    // recordProgress reads the latest info through a ref-free closure below;
    // re-subscribing on every info change would drop events mid-boot.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refreshWorlds]);

  /** Pull turn and character off the running game and remember them. */
  const recordProgress = useCallback(async () => {
    try {
      const current = await game.status();
      if (!current.running || !current.slot) return;
      const status = await game.singleplayerStatus();
      await worlds.touch(current.slot, status.turn, status.characterName);
      await refreshWorlds();
    } catch {
      // Best effort: the world still plays without an up-to-date turn badge.
    }
  }, [refreshWorlds]);

  const fail = (e: unknown) => {
    setError(e instanceof Error ? e.message : String(e));
    setScreen("launcher");
  };

  /**
   * Boot the server for a slot, optionally seed a fresh world, then open the
   * game window. The boot screen shows the server's own log lines so a
   * first-run MongoDB download reads as progress rather than a hang.
   */
  const boot = async (slot: string, fresh: { preset: string; displayName?: string } | null) => {
    cancelled.current = false;
    setBusy(true);
    setError(null);
    setLog([]);
    setBootTitle(fresh ? "Building the world" : "Starting the world");
    setScreen("booting");
    try {
      const started = await game.start(slot);
      setInfo(started);
      if (cancelled.current) return;
      if (fresh) {
        setLog((lines) => [...lines, "Seeding countries, parties, markets and the electorate"].slice(-LOG_LINES));
        await game.newGame(fresh.preset, fresh.displayName);
        if (cancelled.current) return;
      }
      const status = await game.singleplayerStatus();
      await worlds.touch(slot, status.turn, status.characterName);
      await game.openWindow("/");
      await refreshWorlds();
      setScreen("playing");
    } catch (e) {
      if (!cancelled.current) fail(e);
    } finally {
      setBusy(false);
    }
  };

  const cancelBoot = async () => {
    cancelled.current = true;
    try {
      setInfo(await game.stop());
    } catch {
      setInfo(IDLE);
    }
    setBusy(false);
    setScreen("launcher");
  };

  const handleNewWorld = (eraId: string) => {
    setPendingEra(eraId);
    setError(null);
    setScreen("newWorld");
  };

  const handleCreate = async (name: string, displayName: string) => {
    const era = eraById(pendingEra ?? "");
    if (!era) return fail(new Error("Pick an era first."));
    const slot = slugForWorld(name, allWorlds.map((w) => w.slot));
    try {
      await worlds.create(slot, name.trim() || era.label, era.preset);
    } catch (e) {
      return fail(e);
    }
    const trimmed = displayName.trim();
    await boot(slot, { preset: era.preset, ...(trimmed ? { displayName: trimmed } : {}) });
  };

  const handleContinue = (slot: string) => {
    if (info.running && info.slot === slot) {
      void game.openWindow("/").then(() => setScreen("playing")).catch(fail);
      return;
    }
    void boot(slot, null);
  };

  const handleDelete = async (slot: string) => {
    try {
      await worlds.remove(slot);
      await refreshWorlds();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  const handleStop = async () => {
    await recordProgress();
    try {
      setInfo(await game.stop());
    } catch {
      setInfo(IDLE);
    }
    setScreen("launcher");
  };

  const handlePlayOnline = (target: OnlineTarget) => {
    setError(null);
    void online.open(target).catch((e) => setError(e instanceof Error ? e.message : String(e)));
  };

  const latest = allWorlds[0] ?? null;

  if (screen === "newWorld" && pendingEra) {
    const era = eraById(pendingEra);
    if (era) {
      return (
        <NewWorldScreen
          era={era}
          taken={allWorlds.map((w) => w.name)}
          onBack={() => setScreen("launcher")}
          onCreate={handleCreate}
        />
      );
    }
  }

  if (screen === "worlds") {
    return (
      <WorldsScreen
        worlds={allWorlds}
        runningSlot={info.running ? info.slot : null}
        busy={busy}
        error={error}
        onPlay={handleContinue}
        onDelete={handleDelete}
        onBack={() => setScreen("launcher")}
      />
    );
  }

  if (screen === "booting") {
    return <BootScreen title={bootTitle} lines={log} onCancel={cancelBoot} />;
  }

  if (screen === "playing" && info.running) {
    const world = allWorlds.find((w) => w.slot === info.slot) ?? null;
    return (
      <PlayingScreen
        world={world}
        lines={log}
        onResume={() => void game.openWindow("/").catch(fail)}
        onStop={handleStop}
      />
    );
  }

  return (
    <Launcher
      onNewWorld={handleNewWorld}
      onContinue={handleContinue}
      onLoad={() => setScreen("worlds")}
      onPlayOnline={handlePlayOnline}
      error={error}
      onClearError={() => setError(null)}
      latestWorld={latest}
      runningSlot={info.running ? info.slot : null}
      continueBusy={busy}
    />
  );
}
