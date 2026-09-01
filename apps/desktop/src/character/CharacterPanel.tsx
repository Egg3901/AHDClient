import type { WorldState } from "@rotunda/engine";
import "./character.css";

type Props = {
  world: WorldState;
  open: boolean;
  onClose: () => void;
};

export function CharacterPanel({ world, open, onClose }: Props) {
  if (!open) return null;
  const player = world.player;
  const countryName = world.countries[player.countryId]?.name ?? player.countryId;
  // Player has no partyId in current schema; check if it exists via optional access
  const partyId = (player as unknown as { partyId?: string }).partyId;
  const party = partyId ? world.parties[partyId] : null;

  return (
    <div className="character-overlay" onClick={onClose}>
      <div className="character-panel" onClick={(e) => e.stopPropagation()} role="dialog" aria-label="Character">
        <div className="character-head row spread">
          <span className="character-title">CHARACTER</span>
          <button className="secondary small-btn" onClick={onClose}>
            Close
          </button>
        </div>

        <div className="character-section">
          <h3>Identity</h3>
          <div className="character-row">
            <span className="character-label">Name</span>
            <span className="character-value">{player.name}</span>
          </div>
          <div className="character-row">
            <span className="character-label">Country</span>
            <span className="character-value">
              {countryName} ({player.countryId})
            </span>
          </div>
          <div className="character-row">
            <span className="character-label">Party</span>
            <span className="character-value">
              {party ? `${party.name} (${party.abbreviation})` : "Unaffiliated"}
            </span>
          </div>
          {!party && (
            <div className="muted small character-note">
              Party joining lands in W36 (membership wave). Check engine PlayerCharacter for partyId when it ships.
            </div>
          )}
        </div>

        <div className="character-section">
          <h3>Resources</h3>
          <div className="character-row">
            <span className="character-label">Cash</span>
            <span className="character-value">{player.cash.toLocaleString("en-US")}</span>
          </div>
          <div className="character-row">
            <span className="character-label">Campaign funds</span>
            <span className="character-value">{(player.funds ?? 0).toLocaleString("en-US")}</span>
          </div>
          <div className="character-row">
            <span className="character-label">Action points</span>
            <span className="character-value">{player.actions ?? 0}</span>
          </div>
          <div className="muted small character-note">
            Refresh: +4 base (+ office bonus, consumes bonusActions) each turn, -4 hoard penalty above 100, cap 200. Source: src/lib/turn/actionRefresh.ts via engine actionRefreshPhase.
          </div>
          <div className="character-grid">
            <div className="character-stat">
              <span className="muted small">Donor base</span>
              <strong>{player.donorBaseLevel ?? 0}</strong>
            </div>
            <div className="character-stat">
              <span className="muted small">Influence</span>
              <strong>{(player.politicalInfluence ?? 0).toFixed(1)}</strong>
            </div>
            <div className="character-stat">
              <span className="muted small">Favorability</span>
              <strong>{player.favorability ?? 50}</strong>
            </div>
            <div className="character-stat">
              <span className="muted small">Infamy</span>
              <strong>{player.infamy ?? 0}</strong>
            </div>
          </div>
        </div>

        <div className="character-section">
          <h3>Cooldowns</h3>
          {Object.keys(player.actionCooldowns).length === 0 ? (
            <div className="muted small">No active cooldowns.</div>
          ) : (
            <ul className="character-cooldowns">
              {Object.entries(player.actionCooldowns).map(([id, readyAt]) => (
                <li key={id} className="character-cooldown">
                  <span>{id}</span>
                  <span className="muted small">
                    {world.meta.turn < readyAt ? `ready at turn ${readyAt}` : "ready"}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
