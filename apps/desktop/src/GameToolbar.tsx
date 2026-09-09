import { useCallback, useEffect, useState } from "react";
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
  /** Worldsim runs its own turn loop, so it never gets an End turn button. */
  worldsim: boolean;
  /** Linked MP account, or null for the unlinked local player shown as Admin. */
  identity: ToolbarIdentity | null;
  onLauncher: () => void;
  onSaveAndStop: () => void;
  onOpenSettings: () => void;
  onOpenDiagnostics: () => void;
  onPopOutBriefing: () => void;
  /** Worldsim only: return to the world statistics screen. */
  onViewStats?: (() => void) | undefined;
  onTurnAdvanced?: (turn: number) => void;
}

interface TurnState {
  hasCharacter: boolean;
  characterName: string | null;
  turn: number | null;
}

async function readTurnState(): Promise<TurnState | null> {
  try {
    const status: SingleplayerStatus = await game.singleplayerStatus();
    return {
      hasCharacter: status.hasCharacter,
      characterName: status.characterName,
      turn: status.turn,
    };
  } catch {
    return null;
  }
}

/**
 * The singleplayer shell: Launcher | world name | End turn (locked until a
 * character exists, absent for worldsim) | identity | overflow. Quiet by
 * design, no motion, so there is nothing for `settings.animations` to gate.
 */
export function GameToolbar({
  worldName,
  worldsim,
  identity,
  onLauncher,
  onSaveAndStop,
  onOpenSettings,
  onOpenDiagnostics,
  onPopOutBriefing,
  onViewStats,
  onTurnAdvanced,
}: Props): JSX.Element {
  const [turnState, setTurnState] = useState<TurnState | null>(null);
  const [endingTurn, setEndingTurn] = useState(false);
  const [turnError, setTurnError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setTurnState(await readTurnState());
  }, []);

  useEffect(() => {
    void refresh();
    window.addEventListener("focus", refresh);
    return () => window.removeEventListener("focus", refresh);
  }, [refresh]);

  const endTurn = async () => {
    if (endingTurn) return;
    setEndingTurn(true);
    setTurnError(null);
    try {
      const result = await game.advanceTurn();
      await refresh();
      onTurnAdvanced?.(result.turn);
    } catch (error) {
      setTurnError(error instanceof Error ? error.message : String(error));
    } finally {
      setEndingTurn(false);
    }
  };

  const canEndTurn = !worldsim && (turnState?.hasCharacter ?? false);
  const endTurnTitle = worldsim
    ? "Worldsim runs its own turns"
    : turnState == null
      ? "Checking for your character"
      : turnState.hasCharacter
        ? "Advance the world by one turn"
        : "Create a character in the game to enable End turn";
  const avatar = identity ? allowedAvatarUrl(identity.avatarUrl) : null;

  return (
    <nav className="client-game-toolbar" aria-label="Client controls">
      <button type="button" onClick={onLauncher}>
        Launcher
      </button>
      <strong title={worldName}>{worldName}</strong>
      {!worldsim && (
        <button
          type="button"
          className="client-toolbar-end-turn"
          disabled={!canEndTurn || endingTurn}
          title={turnError ?? endTurnTitle}
          onClick={() => void endTurn()}
        >
          {endingTurn ? "Running turn" : "End turn"}
        </button>
      )}
      {worldsim && onViewStats && (
        <button type="button" onClick={onViewStats}>
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
      <details className="client-toolbar-overflow">
        <summary aria-label="More actions">···</summary>
        <div role="menu">
          <button role="menuitem" type="button" onClick={onSaveAndStop}>
            Save and stop
          </button>
          <button role="menuitem" type="button" onClick={onOpenDiagnostics}>
            Diagnostics
          </button>
          <button role="menuitem" type="button" onClick={onOpenSettings}>
            Settings
          </button>
          <button role="menuitem" type="button" onClick={onPopOutBriefing}>
            Briefing in picture-in-picture
          </button>
        </div>
      </details>
    </nav>
  );
}
