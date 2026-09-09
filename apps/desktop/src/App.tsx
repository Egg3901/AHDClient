import { useCallback, useEffect, useRef, useState } from "react";
import { listen } from "@tauri-apps/api/event";
import { Launcher } from "./launcher/Launcher.js";
import { NewWorldScreen } from "./screens/NewWorldScreen.js";
import { WorldsScreen } from "./screens/WorldsScreen.js";
import { BootScreen } from "./screens/BootScreen.js";
import { WorldsimScreen } from "./screens/WorldsimScreen.js";
import type { SetupOptions } from "./screens/setupOptions.js";
import { PlayingScreen } from "./screens/PlayingScreen.js";
import { eraById, game, online, slugForWorld, worlds } from "./worlds.js";
import type {
  GameInfo,
  LinkedAccount,
  OnlineTarget,
  SetupProgress,
  WorldMeta,
} from "./worlds.js";
import "./screens/screens.css";
import {
  captureStatistics,
  flushStatistics,
  setStatisticsConsent,
} from "./statisticsDelivery.js";
import { SettingsMenu } from "./SettingsMenu.js";
import { applySettings, readSettings, writeSettings } from "./settings.js";
import type { ClientSettings } from "./settings.js";
import {
  cacheSingleplayerEntitlement,
  hasCachedSingleplayerEntitlement,
} from "./entitlement.js";
import { UpdateNotice } from "./UpdateNotice.js";
import { AccountControl } from "./AccountControl.js";
import { GameToolbar } from "./GameToolbar.js";
import { GameVersionBar } from "./GameVersionBar.js";
import { DiagnosticPrompt } from "./DiagnosticPrompt.js";
import { DiagnosticPanel } from "./DiagnosticPanel.js";
import { recordDiagnostic, submitDiagnostics, type DiagnosticReason } from "./diagnostics.js";
import { mobile } from "./platform.js";
import { reportIssueRoute } from "./help.js";
import { Briefing } from "./briefing/Briefing.js";
import { briefing } from "./briefing/briefingApi.js";

type Screen =
  | "launcher"
  | "newWorld"
  | "worlds"
  | "booting"
  | "playing"
  | "online"
  | "linking"
  | "briefing"
  | "worldsim";

const IDLE: GameInfo = { running: false, port: null, slot: null, url: null };
const LOG_LINES = 14;
function accountNoticeSeen(): boolean {
  try {
    return localStorage.getItem("ahdclient.accountNotice") === "seen";
  } catch {
    return false;
  }
}
function rememberAccountNotice(): void {
  try {
    localStorage.setItem("ahdclient.accountNotice", "seen");
  } catch {
    /* Session state still remembers dismissal. */
  }
}

export function App(): JSX.Element {
  const [screen, setScreen] = useState<Screen>("launcher");
  const [allWorlds, setAllWorlds] = useState<WorldMeta[]>([]);
  const [info, setInfo] = useState<GameInfo>(IDLE);
  const [pendingWorldsim, setPendingWorldsim] = useState(false);
  const [runningWorldsim, setRunningWorldsim] = useState(false);
  const [pendingEra, setPendingEra] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [bootTitle, setBootTitle] = useState("Starting");
  const [bootProgress, setBootProgress] = useState<SetupProgress | null>(null);
  const [log, setLog] = useState<string[]>([]);
  const [diagnosticIncident, setDiagnosticIncident] = useState<{ reason: DiagnosticReason; message: string; lines: string[] } | null>(null);
  const [sendingDiagnostics, setSendingDiagnostics] = useState(false);
  const cancelled = useRef(false);
  const bootId = useRef(0);
  const creating = useRef(false);
  const [settings, setSettings] = useState(readSettings);
  const [account, setAccount] = useState<LinkedAccount | null>(null);
  const [accountChecked, setAccountChecked] = useState(false);
  const [embedded, setEmbedded] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [diagnosticsOpen, setDiagnosticsOpen] = useState(false);
  const [accountNotice, setAccountNotice] = useState(
    () => !accountNoticeSeen(),
  );
  useEffect(() => {
    applySettings(settings);
    if (mobile) return;
    void setStatisticsConsent(settings.shareStatistics)
      .then(() => flushStatistics())
      .catch(() => {});
  }, [settings]);
  useEffect(() => {
    const retry = () => {
      void flushStatistics();
    };
    window.addEventListener("online", retry);
    return () => window.removeEventListener("online", retry);
  }, []);
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      if (screen === "briefing") { setScreen("launcher"); return; }
      setSettingsOpen((open) => !open);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [screen]);
  const changeSettings = (next: ClientSettings) => {
    // Clear pending data before saving an opt-out so a storage error cannot
    // leave previously queued reports available for transmission.
    if (!next.shareStatistics) void setStatisticsConsent(false).catch(() => {});
    setSettings(next);
    try {
      writeSettings(next);
    } catch {
      setError("Settings could not be saved on this device.");
    }
  };
  const checkAccount = useCallback(async () => {
    try {
      const linked = await online.account();
      if (linked?.singleplayer)
        cacheSingleplayerEntitlement(linked.singleplayer);
      setAccount(linked?.linked ? linked : null);
      setAccountChecked(true);
      return linked;
    } catch {
      return null;
    }
  }, []);
  const requireSingleplayerEntitlement =
    useCallback(async (): Promise<boolean> => {
      try {
        const linked = await online.account();
        setAccount(linked?.linked ? linked : null);
        setAccountChecked(true);
        if (linked?.singleplayer.entitled) {
          cacheSingleplayerEntitlement(linked.singleplayer);
          return true;
        }
        setError(
          linked
            ? "Singleplayer access is not enabled for this account."
            : "Link an entitled game account to use singleplayer.",
        );
        setScreen("launcher");
        return false;
      } catch {
        if (hasCachedSingleplayerEntitlement()) return true;
        setError(
          "Singleplayer needs an entitled account. Connect once to validate access.",
        );
        setScreen("launcher");
        return false;
      }
    }, []);
  useEffect(() => {
    void checkAccount();
  }, [checkAccount]);
  useEffect(() => {
    if (screen !== "linking") return;
    let active = true;
    let timer: ReturnType<typeof setTimeout>;
    const deadline = Date.now() + 10 * 60 * 1000;
    const poll = async () => {
      const linked = await checkAccount();
      if (!active) return;
      if (linked?.linked) {
        await game.closeEmbedded();
        if (!active) return;
        setEmbedded(false);
        setScreen("launcher");
        setAccountNotice(false);
        rememberAccountNotice();
      } else if (Date.now() < deadline)
        timer = setTimeout(() => void poll(), 2500);
    };
    void poll();
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [screen, checkAccount]);

  const refreshWorlds = useCallback(async () => {
    if (mobile) return;
    try {
      setAllWorlds(await worlds.list());
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }, []);

  useEffect(() => {
    if (mobile) return;
    void refreshWorlds();
    void game
      .status()
      .then(setInfo)
      .catch(() => setInfo(IDLE));
  }, [refreshWorlds]);

  useEffect(() => {
    const subscriptions = [
      listen<{ line: string }>("game:log", (event) => {
        recordDiagnostic("native", event.payload.line);
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
      listen("client:settings", () => setSettingsOpen((open) => !open)),
    ];
    return () => {
      for (const subscription of subscriptions)
        void subscription.then((unlisten) => unlisten());
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
    const message = e instanceof Error ? e.message : String(e);
    setError(message);
    setDiagnosticIncident({
      reason: message.includes("stopped reporting progress") ? "stalled" : "error",
      message,
      lines: [...log],
    });
    setScreen("launcher");
  };

  /**
   * Boot the server for a slot, optionally seed a fresh world, then open the
   * game window. The boot screen shows the server's own log lines so a
   * first-run MongoDB download reads as progress rather than a hang.
   */
  const boot = async (
    slot: string,
    fresh: { preset: string; displayName?: string; setup: SetupOptions } | null,
  ) => {
    const generation = ++bootId.current;
    cancelled.current = false;
    setBusy(true);
    setError(null);
    setLog([]);
    setBootProgress(null);
    setBootTitle(fresh ? "Building the world" : "Starting the world");
    setScreen("booting");
    try {
      const started = await game.start(slot);
      if (cancelled.current || generation !== bootId.current) return;
      setInfo(started);
      if (fresh) {
        setLog((lines) =>
          [
            ...lines,
            "Seeding countries, parties, markets and the electorate",
          ].slice(-LOG_LINES),
        );
        let polling = true;
        let rejectStalledSetup: ((error: Error) => void) | null = null;
        const stalledSetup = new Promise<never>((_resolve, reject) => {
          rejectStalledSetup = reject;
        });
        const pollProgress = async () => {
          while (
            polling &&
            !cancelled.current &&
            generation === bootId.current
          ) {
            try {
              const nextProgress = await game.setupProgress();
              if (polling && generation === bootId.current) {
                setBootProgress(nextProgress);
                if (nextProgress.stalled) {
                  polling = false;
                  rejectStalledSetup?.(
                    new Error(
                      "World setup stopped reporting progress. The local game was stopped safely; retry the world or report diagnostics.",
                    ),
                  );
                }
              }
            } catch {
              // The setup POST is authoritative; progress is supplemental.
            }
            await new Promise((resolve) => window.setTimeout(resolve, 750));
          }
        };
        void pollProgress();
        try {
          await Promise.race([
            game.setup(fresh.preset, fresh.setup, fresh.displayName),
            stalledSetup,
          ]);
        } finally {
          polling = false;
        }
        if (cancelled.current || generation !== bootId.current) return;
      }
      let status = await game.singleplayerStatus();
      if (!status.hasWorld) {
        const saved = allWorlds.find((world) => world.slot === slot);
        if (!saved?.setup)
          throw new Error(
            "This world did not finish setup. Start a new game to create it.",
          );
        await game.setup(saved.preset, saved.setup);
        status = await game.singleplayerStatus();
      }
      if (cancelled.current || generation !== bootId.current) return;
      await worlds.touch(slot, status.turn, status.characterName);
      const simulation =
        status.mode === "worldsim" || fresh?.setup.mode === "worldsim";
      setRunningWorldsim(simulation);
      if (simulation) {
        await refreshWorlds();
        setEmbedded(false);
        setScreen("worldsim");
        return;
      }
      await game.openWindow(
        status.hasCharacter ? "/profile" : "/create-character",
        settings.separateWindow,
      );
      setEmbedded(!settings.separateWindow);
      await refreshWorlds();
      setScreen("playing");
    } catch (e) {
      if (!cancelled.current && generation === bootId.current) {
        try {
          setInfo(await game.stop());
        } catch {
          setInfo(IDLE);
        }
        fail(e);
      }
    } finally {
      if (generation === bootId.current) setBusy(false);
    }
  };

  const cancelBoot = async () => {
    const diagnosticLines = [...log];
    cancelled.current = true;
    bootId.current += 1;
    try {
      setInfo(await game.stop());
    } catch {
      setInfo(IDLE);
    }
    setBusy(false);
    setBootProgress(null);
    setScreen("launcher");
    setDiagnosticIncident({
      reason: "cancelled",
      message: "The local game was cancelled while it was loading.",
      lines: diagnosticLines,
    });
  };

  const handleNewWorld = (eraId: string, worldsim = false) => {
    setPendingWorldsim(worldsim);
    setPendingEra(eraId);
    setError(null);
    setScreen("newWorld");
  };

  const handleCreate = async (
    name: string,
    displayName: string,
    setup: SetupOptions,
  ) => {
    if (creating.current) return;
    if (!(await requireSingleplayerEntitlement())) return;
    const era = eraById(pendingEra ?? "");
    if (!era) return fail(new Error("Pick an era first."));
    creating.current = true;
    const slot = slugForWorld(
      name,
      allWorlds.map((w) => w.slot),
    );
    try {
      await worlds.create(slot, name.trim() || era.label, era.preset, setup);
      await refreshWorlds();
    } catch (e) {
      creating.current = false;
      return fail(e);
    }
    const trimmed = displayName.trim();
    try {
      await boot(slot, {
        preset: era.preset,
        setup,
        ...(trimmed ? { displayName: trimmed } : {}),
      });
    } finally {
      creating.current = false;
    }
  };

  const handleContinue = (slot: string) => {
    void (async () => {
      if (!(await requireSingleplayerEntitlement())) return;
      if (info.running && info.slot === slot) {
        if (runningWorldsim) {
          setScreen("worldsim");
          return;
        }
        void game
          .openWindow("/profile", settings.separateWindow)
          .then(() => {
            setEmbedded(!settings.separateWindow);
            setScreen("playing");
          })
          .catch(fail);
        return;
      }
      void boot(slot, null);
    })();
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
    if (info.slot) await captureStatistics(info.slot, true);
    await recordProgress();
    try {
      setInfo(await game.stop());
    } catch {
      setInfo(IDLE);
    }
    setScreen("launcher");
  };

  // On mobile the site replaces the launcher in the same webview, so there
  // is no embedded state to track: the page unloads as soon as it navigates.
  const showOnline = () => {
    if (mobile) return;
    setEmbedded(!settings.separateWindow);
    if (!settings.separateWindow) setScreen("online");
  };
  const handlePlayOnline = (target: OnlineTarget) => {
    setError(null);
    if (target === "sandbox") {
      void online
        .account()
        .then((linked) => {
          setAccount(linked?.linked ? linked : null);
          setAccountChecked(true);
          if (!linked?.linked || !linked.supporter) return;
          return online.open(target, settings.separateWindow).then(showOnline);
        })
        .catch(() =>
          setError("Connect to the internet to check sandbox access."),
        );
      return;
    }
    void online
      .open(target, settings.separateWindow)
      .then(showOnline)
      .catch((e) => setError(e instanceof Error ? e.message : String(e)));
  };

  const linkAccount = () => {
    setError(null);
    void online
      .link(settings.separateWindow)
      .then(() => {
        if (mobile) return;
        setEmbedded(!settings.separateWindow);
        setScreen("linking");
      })
      .catch(fail);
  };
  const returnToLauncher = async () => {
    await game.closeEmbedded();
    setEmbedded(false);
    await recordProgress();
    setScreen("launcher");
  };
  const settingsControl = (
    <>
    <button className="client-settings-trigger" type="button" onClick={() => setScreen("briefing")}>Briefing</button>
    <button
      className="client-settings-trigger"
      type="button"
      onClick={() => setSettingsOpen(true)}
    >
      Settings
    </button>
    </>
  );
  const accountControl = (
    <AccountControl
      checked={accountChecked}
      linked={Boolean(account)}
      displayName={account?.displayName}
      avatarUrl={account?.avatarUrl}
      supporter={account?.supporter}
      onLink={linkAccount}
      onProfile={() => void online.help("help.profile").catch(fail)}
      onManage={() => void online.help("help.account").catch(fail)}
    />
  );
  const settingsMenu = (
    <SettingsMenu
      mobile={mobile}
      open={settingsOpen}
      settings={settings}
      onChange={changeSettings}
      onClose={() => setSettingsOpen(false)}
      onReportIssue={() =>
        void online.help(reportIssueRoute(mobile)).catch(fail)
      }
      onOpenDiagnostics={() => {
        setSettingsOpen(false);
        setDiagnosticsOpen(true);
      }}
    />
  );
  const diagnosticPanel = (
    <DiagnosticPanel
      open={diagnosticsOpen}
      screen={screen}
      game={mobile ? "remote only" : info.running ? "local game running" : "local game stopped"}
      onClose={() => setDiagnosticsOpen(false)}
    />
  );
  const diagnosticPrompt = (
    <DiagnosticPrompt
      incident={diagnosticIncident}
      sending={sendingDiagnostics}
      onDismiss={() => setDiagnosticIncident(null)}
      onSend={() => {
        if (!diagnosticIncident || sendingDiagnostics) return;
        setSendingDiagnostics(true);
        void submitDiagnostics(
          diagnosticIncident.reason,
          diagnosticIncident.message,
          diagnosticIncident.lines,
        ).then(() => setDiagnosticIncident(null)).catch(() => {
          setError("Diagnostics could not be sent. Use Report issue in Settings instead.");
        }).finally(() => setSendingDiagnostics(false));
      }}
    />
  );
  const withSettings = (content: JSX.Element) => (
    <>
      {content}
      {settingsMenu}
      {diagnosticPanel}
      {diagnosticPrompt}
    </>
  );
  const latest = allWorlds[0] ?? null;
  const sandboxGate = !accountChecked
    ? null
    : !account
      ? "unlinked"
      : !account.supporter
        ? "upgrade"
        : null;
  if (
    embedded &&
    (screen === "playing" || screen === "online" || screen === "linking")
  ) {
    if (screen === "playing") {
      const world = allWorlds.find((w) => w.slot === info.slot) ?? null;
      return (
        <>
          <main>
            <GameToolbar
              worldName={world?.name ?? "A House Divided"}
              worldsim={runningWorldsim}
              identity={
                account
                  ? {
                      displayName: account.displayName,
                      avatarUrl: account.avatarUrl,
                      supporter: account.supporter,
                    }
                  : null
              }
              onLauncher={() => void returnToLauncher().catch(fail)}
              onSaveAndStop={() => void handleStop().catch(fail)}
              onOpenSettings={() => setSettingsOpen(true)}
              onOpenDiagnostics={() => setDiagnosticsOpen(true)}
              onPopOutBriefing={() => void briefing.popOut().catch(fail)}
              onViewStats={
                runningWorldsim
                  ? () => {
                      void game.closeEmbedded().then(() => {
                        setEmbedded(false);
                        setScreen("worldsim");
                      });
                    }
                  : undefined
              }
              onTurnAdvanced={() => void recordProgress().catch(() => {})}
            />
          </main>
          {settingsMenu}
          {diagnosticPanel}
          {diagnosticPrompt}
        </>
      );
    }
    return (
      <>
        <main>
          <nav className="client-game-toolbar" aria-label="Client controls">
            <button onClick={() => void returnToLauncher().catch(fail)}>
              Launcher
            </button>
            <strong>
              {screen === "linking"
                ? "Link your game account"
                : "A House Divided"}
            </strong>
            <button title="Multiplayer briefing in picture-in-picture" onClick={() => void briefing.popOut().catch(fail)}>PiP</button>
            <button onClick={() => setSettingsOpen(true)}>Settings</button>
          </nav>
        </main>
        {settingsMenu}
        {diagnosticPanel}
        {diagnosticPrompt}
      </>
    );
  }
  if (screen === "linking") {
    return withSettings(
      <main className="launcher-scope screen-scope">
        <h1>Link your game account</h1>
        <p>
          Complete sign-in in the game window. Your session stays in the app.
        </p>
        <button onClick={() => setScreen("launcher")}>Back to launcher</button>
      </main>,
    );
  }

  if (screen === "briefing") return <Briefing mobile={mobile} onBack={() => setScreen("launcher")} />;

  if (screen === "newWorld" && pendingEra) {
    const era = eraById(pendingEra);
    if (era) {
      return withSettings(
        <NewWorldScreen
          era={era}
          initialWorldsim={pendingWorldsim}
          shareStatistics={settings.shareStatistics}
          onStatisticsChange={(shareStatistics) =>
            changeSettings({ ...settings, shareStatistics })
          }
          taken={allWorlds.map((w) => w.name)}
          onBack={() => setScreen("launcher")}
          onCreate={handleCreate}
        />,
      );
    }
  }

  if (screen === "worldsim" && info.running && info.slot) {
    return withSettings(
      <WorldsimScreen
        name={
          allWorlds.find((world) => world.slot === info.slot)?.name ??
          "World simulation"
        }
        onBack={() => setScreen("launcher")}
        onStop={handleStop}
        onTurnCompleted={() => captureStatistics(info.slot!)}
        onView={() => {
          void game
            .openWindow("/singleplayer/worldsim", settings.separateWindow)
            .then(() => {
              setEmbedded(!settings.separateWindow);
              if (!settings.separateWindow) setScreen("playing");
            })
            .catch(fail);
        }}
      />,
    );
  }
  if (screen === "worlds") {
    return withSettings(
      <WorldsScreen
        worlds={allWorlds}
        runningSlot={info.running ? info.slot : null}
        busy={busy}
        error={error}
        onPlay={handleContinue}
        onDelete={handleDelete}
        onBack={() => setScreen("launcher")}
      />,
    );
  }

  if (screen === "booting") {
    return withSettings(
      <BootScreen
        title={bootTitle}
        lines={log}
        onCancel={cancelBoot}
        showDebug={settings.showBootLogs}
        progress={bootProgress}
      />,
    );
  }

  if (screen === "playing" && info.running) {
    const world = allWorlds.find((w) => w.slot === info.slot) ?? null;
    return withSettings(
      <PlayingScreen
        world={world}
        lines={log}
        onResume={() => handleContinue(info.slot!)}
        onStop={handleStop}
      />,
    );
  }

  return (
    <>
      <UpdateNotice enabled={!mobile} />
      {!mobile && accountChecked && accountNotice && !account && (
        <aside className="client-account-notice">
          <span>
            Link an entitled game account to use Singleplayer and Worldsim.
            After validation, access works offline for a limited period.
          </span>
          <button onClick={linkAccount}>Link account</button>
          <button
            onClick={() => {
              setAccountNotice(false);
              rememberAccountNotice();
            }}
          >
            Later
          </button>
        </aside>
      )}
      <Launcher
        mobile={mobile}
        settingsControl={settingsControl}
        accountControl={accountControl}
        gameVersionControl={mobile ? undefined : <GameVersionBar />}
        onPhotoSource={(eraId) => {
          void online.help(`help.era-photo-${eraId}`).catch(fail);
        }}
        onNewWorld={handleNewWorld}
        onContinue={handleContinue}
        onLoad={() => setScreen("worlds")}
        onPlayOnline={handlePlayOnline}
        error={error}
        onClearError={() => setError(null)}
        latestWorld={latest}
        runningSlot={info.running ? info.slot : null}
        continueBusy={busy}
        sandboxGate={sandboxGate}
        onLinkAccount={linkAccount}
        onUpgradeSupporter={() => {
          void online.help("help.patreon").catch(fail);
        }}
      />
      {settingsMenu}
      {diagnosticPanel}
      {diagnosticPrompt}
    </>
  );
}
