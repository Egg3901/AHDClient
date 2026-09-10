import { useCallback, useEffect, useRef, useState } from "react";
import { game } from "./worlds.js";
import type { SingleplayerStatus } from "./worlds.js";
import { allowedAvatarUrl, initialsFor } from "./avatar.js";

export interface ToolbarIdentity {
  displayName: string;
  avatarUrl?: string | null | undefined;
  supporter: boolean;
}

interface Props {
  worldName: string;
  /** Worldsim is playerless: End turn skips the character gate and advances one turn. */
  worldsim: boolean;
  /** Linked MP account, or null for the unlinked local player shown as Admin. */
  identity: ToolbarIdentity | null;
  onLauncher: () => void;
  onSaveAndStop: () => void;
  onOpenSettings: () => void;
  onOpenDiagnostics: () => void;
  /** Worldsim only: return to the world statistics screen. */
  onViewStats?: (() => void) | undefined;
  onTurnAdvanced?: (turn: number) => void;
}

interface TurnState {
  hasCharacter: boolean;
  characterName: string | null;
  turn: number | null;
  mode: SingleplayerStatus["mode"];
}

async function readTurnState(): Promise<TurnState | null> {
  try {
    const status: SingleplayerStatus = await game.singleplayerStatus();
    return {
      hasCharacter: status.hasCharacter,
      characterName: status.characterName,
      turn: status.turn,
      mode: status.mode,
    };
  } catch {
    return null;
  }
}

/** How often the toolbar re-reads turn and pause state while the game runs. */
const STATUS_POLL_MS = 10_000;

/**
 * The singleplayer shell: Launcher | End turn | world name | identity |
 * overflow. End turn sits next to Launcher; everything destructive or rare
 * lives behind More. Briefing PiP is deliberately absent here: it is the
 * multiplayer briefing, and this bar only ever fronts the local game.
 */
export function GameToolbar({
  worldName,
  worldsim,
  identity,
  onLauncher,
  onSaveAndStop,
  onOpenSettings,
  onOpenDiagnostics,
  onViewStats,
  onTurnAdvanced,
}: Props): JSX.Element {
  const [turnState, setTurnState] = useState<TurnState | null>(null);
  const [availability, setAvailability] = useState<"open" | "sealed" | null>(null);
  const [endingTurn, setEndingTurn] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [pauseBusy, setPauseBusy] = useState(false);
  const [turnBriefing, setTurnBriefing] = useState<string | null>(null);
  const [turnError, setTurnError] = useState<string | null>(null);
  /** Guards the interval against overlapping reads on a slow local server. */
  const refreshing = useRef(false);

  const refreshTurn = useCallback(async () => {
    if (refreshing.current) return;
    refreshing.current = true;
    try {
      const next = await readTurnState();
      setTurnState(next);
    } finally {
      refreshing.current = false;
    }
  }, []);

  const refreshAvailability = useCallback(async () => {
    try {
      setAvailability((await game.worldAvailability()).availability);
    } catch {
      setAvailability(null);
    }
  }, []);

  useEffect(() => {
    void refreshTurn();
    void refreshAvailability();
    const refreshBoth = () => {
      void refreshTurn();
      void refreshAvailability();
    };
    window.addEventListener("focus", refreshBoth);
    // Character creation and death both happen inside the child game webview,
    // where the launcher window gets no focus event, and the server can be
    // paused out from under the toolbar. Keep polling at a sane interval for
    // as long as the bar is mounted; the interval dies with the toolbar when
    // the game stops.
    const timer = window.setInterval(refreshBoth, STATUS_POLL_MS);
    return () => {
      window.removeEventListener("focus", refreshBoth);
      window.clearInterval(timer);
    };
  }, [refreshTurn, refreshAvailability]);

  const endTurn = async () => {
    if (endingTurn) return;
    setEndingTurn(true);
    setTurnError(null);
    try {
      const result = worldsim ? await game.advanceWorldsim() : await game.advanceTurn();
      const briefing = result.briefing;
      const signed = (value: number) => `${value >= 0 ? "+" : ""}${value.toLocaleString()}`;
      setTurnBriefing(briefing
        ? `Turn ${result.turn}: funds ${signed(briefing.fundsDelta)}, actions ${signed(briefing.actionsDelta)}`
        : `Turn ${result.turn} complete`);
      await refreshTurn();
      await refreshAvailability();
      onTurnAdvanced?.(result.turn);
    } catch (error) {
      setTurnError(error instanceof Error ? error.message : String(error));
    } finally {
      setEndingTurn(false);
    }
  };

  const togglePause = async () => {
    if (pauseBusy || availability == null) return;
    setPauseBusy(true);
    setTurnError(null);
    try {
      const next = await game.setWorldAvailability(availability === "open" ? "sealed" : "open");
      setAvailability(next.availability);
    } catch (error) {
      setTurnError(error instanceof Error ? error.message : String(error));
    } finally {
      setPauseBusy(false);
    }
  };

  const paused = availability === "sealed";
  // Worldsim is exempt from the character gate only. Paused, busy and
  // not-yet-loaded disable End turn for both modes: the server answers 409
  // while paused, and an unknown state must not offer a turn that fails.
  const canEndTurn =
    !endingTurn && availability === "open" && turnState != null && (worldsim || turnState.hasCharacter);
  const endTurnTitle = endingTurn
    ? "The turn is running"
    : paused
      ? "Resume the world to advance the turn"
      : turnState == null
        ? "Checking for your character"
        : !worldsim && !turnState.hasCharacter
          ? "Create a character in the game to enable End turn"
          : "Advance the world by one turn";
  const avatar = identity ? allowedAvatarUrl(identity.avatarUrl) : null;
  const headOfState = turnState?.mode === "head-of-state";

  return (
    <nav className="client-game-toolbar" aria-label="Client controls">
      <button type="button" className="client-toolbar-quiet" onClick={onLauncher}>
        <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true"><path d="m14 6-6 6 6 6M8 12h12" /></svg>
        Launcher
      </button>
      <button
        type="button"
        className="client-toolbar-end-turn"
        disabled={!canEndTurn}
        title={turnError ?? endTurnTitle}
        onClick={() => void endTurn()}
      >
        <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true"><path d="m5 5 10 7L5 19ZM19 5v14" /></svg>
        {endingTurn ? "Running turn" : "End turn"}
      </button>
      <strong title={worldName}>{worldName}</strong>
      {turnBriefing && <small className="client-toolbar-briefing" role="status" title={turnBriefing}>{turnBriefing}</small>}
      {headOfState && (
        <small
          className="client-toolbar-mode"
          title="Permanent head of state. You entered as head of state and remain head of state; this mode is in beta."
        >
          Head of state <span className="client-beta">Beta</span>
        </small>
      )}
      {paused && (
        <small title="Paused: the current turn finishes, the next one waits until you resume.">
          Paused
        </small>
      )}
      {worldsim && onViewStats && (
        <button type="button" className="client-toolbar-quiet" onClick={onViewStats}>
          World statistics
        </button>
      )}
      <span className="client-toolbar-identity" aria-label={identity ? `Linked as ${identity.displayName}` : "Local player"}>
        {identity ? (
          <>
            {avatar ? (
              <img src={avatar} alt="" referrerPolicy="no-referrer" />
            ) : (
              <span aria-hidden="true">{initialsFor(identity.displayName)}</span>
            )}
            <span className="client-toolbar-name">{identity.displayName}</span>
            {identity.supporter && <small>Supporter</small>}
          </>
        ) : (
          <span className="client-toolbar-name">Admin</span>
        )}
      </span>
      {turnError && (
        <span className="client-toolbar-error" role="alert">
          {turnError}
        </span>
      )}
      <details className="client-toolbar-overflow" onToggle={(event) => setMenuOpen(event.currentTarget.open)}>
        <summary aria-label={menuOpen ? "Close actions" : "More actions"}>{menuOpen ? "×" : "···"}</summary>
        <div role="menu">
          <button
            role="menuitem"
            type="button"
            disabled={availability == null || pauseBusy}
            title={
              paused
                ? "Resume the world so turns can advance again."
                : "Pause the world. The current turn finishes; the next one waits until you resume."
            }
            onClick={() => void togglePause()}
          >
            {pauseBusy ? "Working" : paused ? "Resume world" : "Pause world"}
          </button>
          <button role="menuitem" type="button" onClick={onSaveAndStop}>
            Save and stop
          </button>
          <button role="menuitem" type="button" onClick={onOpenDiagnostics}>
            Diagnostics
          </button>
          <button role="menuitem" type="button" onClick={onOpenSettings}>
            Settings
          </button>
        </div>
      </details>
    </nav>
  );
}
