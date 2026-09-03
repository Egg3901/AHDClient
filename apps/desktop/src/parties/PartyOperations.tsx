import { useMemo, useState } from "react";
import {
  ACTION_CATALOG,
  type ExecuteActionParams,
  type WorldState,
} from "@ahdclient/engine";
import { game } from "../game.js";
import "./partyOperations.css";

type Props = {
  world: WorldState;
  onWorld?: ((world: WorldState) => void) | undefined;
  onToast?: ((message: string) => void) | undefined;
};

type LeadershipElection =
  | WorldState["statePartyElections"][number]
  | WorldState["nationalPartyElections"][number];

function actorLabel(world: WorldState, id: string): string {
  if (id === "player") return `${world.player.name} (you)`;
  return world.politicians.find((politician) => politician.id === id)?.name ?? id;
}

function actionCost(actionId: keyof typeof ACTION_CATALOG): string {
  const action = ACTION_CATALOG[actionId];
  return `${action.baseCost} AP`;
}

function electionLabel(world: WorldState, election: LeadershipElection): string {
  const regionId = "regionId" in election ? election.regionId : null;
  const regionName = regionId ? world.regions[regionId]?.name ?? regionId : "National";
  const position = election.position === "viceChair" ? "Vice Chair" : election.position[0]!.toUpperCase() + election.position.slice(1);
  return `${regionName} ${position}`;
}

export function PartyOperations({ world, onWorld, onToast }: Props) {
  const partyId = world.player.partyId ?? world.player.hosPartyId;
  const party = partyId ? world.parties[partyId] : null;
  const [error, setError] = useState<string | null>(null);
  const [endorsementType, setEndorsementType] = useState<"politician" | "party">("politician");
  const [endorsementTarget, setEndorsementTarget] = useState("");
  const [leadershipVotes, setLeadershipVotes] = useState<Record<string, string>>({});
  const [committeeVotes, setCommitteeVotes] = useState<Record<string, string[]>>({});
  const [coalitionName, setCoalitionName] = useState("");
  const [coalitionAbbr, setCoalitionAbbr] = useState("");

  const endorsementTargets = useMemo(() => {
    if (!party) return [];
    if (endorsementType === "party") {
      return Object.values(world.parties)
        .filter((candidate) => candidate.countryId === world.player.countryId)
        .sort((left, right) => left.name.localeCompare(right.name))
        .map((candidate) => ({ id: candidate.id, label: candidate.name }));
    }
    return world.politicians
      .filter((politician) => politician.countryId === world.player.countryId)
      .sort((left, right) => left.name.localeCompare(right.name))
      .map((politician) => ({ id: politician.id, label: politician.name }));
  }, [endorsementType, party, world.parties, world.player.countryId, world.politicians]);

  const effectiveEndorsementTarget = endorsementTargets.some(({ id }) => id === endorsementTarget)
    ? endorsementTarget
    : endorsementTargets[0]?.id ?? "";

  const leadershipElections = useMemo<LeadershipElection[]>(() => {
    if (!partyId) return [];
    return [...world.statePartyElections, ...world.nationalPartyElections]
      .filter((election) => election.partyId === partyId && election.status === "voting")
      .sort((left, right) => left.endTurn - right.endTurn || left.id.localeCompare(right.id));
  }, [partyId, world.nationalPartyElections, world.statePartyElections]);

  const committeeElections = useMemo(() => {
    if (!partyId) return [];
    return world.nationalCommitteeElections
      .filter((election) => election.partyId === partyId && election.status === "voting")
      .sort((left, right) => left.endTurn - right.endTurn || left.id.localeCompare(right.id));
  }, [partyId, world.nationalCommitteeElections]);

  const playerCoalition = partyId
    ? world.coalitions.find((coalition) => coalition.memberPartyIds.includes(partyId)) ?? null
    : null;
  const joinableCoalitions = partyId
    ? world.coalitions.filter(
      (coalition) =>
        coalition.countryId === world.player.countryId &&
        !coalition.memberPartyIds.includes(partyId),
    )
    : [];

  function refreshWorld() {
    const current = game.getStateSync();
    if (!current) return;
    onWorld?.({
      ...current,
      player: {
        ...current.player,
        actionCooldowns: { ...current.player.actionCooldowns },
      },
      parties: { ...current.parties },
      endorsements: [...current.endorsements],
      statePartyElections: current.statePartyElections.map((election) => ({
        ...election,
        candidateIds: [...election.candidateIds],
        votes: { ...election.votes },
      })),
      nationalPartyElections: current.nationalPartyElections.map((election) => ({
        ...election,
        candidateIds: [...election.candidateIds],
        votes: { ...election.votes },
      })),
      nationalCommitteeElections: current.nationalCommitteeElections.map((election) => ({
        ...election,
        candidateIds: [...election.candidateIds],
        votes: Object.fromEntries(
          Object.entries(election.votes).map(([voterId, picks]) => [voterId, [...picks]]),
        ),
      })),
      coalitions: current.coalitions.map((coalition) => ({
        ...coalition,
        memberPartyIds: [...coalition.memberPartyIds],
        disbandVote: coalition.disbandVote
          ? { ...coalition.disbandVote, votes: { ...coalition.disbandVote.votes } }
          : null,
      })),
    });
  }

  function execute(actionId: string, params: ExecuteActionParams): boolean {
    setError(null);
    const result = game.executeAction(actionId, params);
    if (!result.ok) {
      setError(result.error);
      return false;
    }
    refreshWorld();
    onToast?.(result.message);
    return true;
  }

  function toggleCommitteePick(electionId: string, candidateId: string, existing: string[]) {
    const current = committeeVotes[electionId] ?? existing;
    const next = current.includes(candidateId)
      ? current.filter((id) => id !== candidateId)
      : current.length < 6 ? [...current, candidateId] : current;
    setCommitteeVotes((votes) => ({ ...votes, [electionId]: next }));
  }

  if (!party || !partyId) {
    return (
      <section className="par-operations" aria-label="Party operations">
        <h3>Party Operations</h3>
        <p className="muted small">Join a party to endorse candidates, enter party elections, and manage coalitions.</p>
      </section>
    );
  }

  const alreadyEndorsed = world.endorsements.some(
    (endorsement) =>
      endorsement.active &&
      endorsement.endorserId === "player" &&
      endorsement.endorsedId === effectiveEndorsementTarget,
  );

  return (
    <section className="par-operations" aria-label="Party operations">
      <h3>Party Operations</h3>
      <p className="muted small">Actions below apply to {party.name}. You have {world.player.actions} AP.</p>

      <div className="par-ops-block">
        <div className="par-ops-heading">
          <strong>Endorsement</strong>
          <span className="muted small">{actionCost("endorse")}</span>
        </div>
        {endorsementTargets.length === 0 ? (
          <p className="muted small">No endorsement targets exist in your country.</p>
        ) : (
          <div className="par-ops-controls">
            <label>
              Target type
              <select
                aria-label="Endorsement target type"
                value={endorsementType}
                onChange={(event) => {
                  setEndorsementType(event.target.value as "politician" | "party");
                  setEndorsementTarget("");
                }}
              >
                <option value="politician">Politician</option>
                <option value="party">Party</option>
              </select>
            </label>
            <label>
              Target
              <select
                aria-label="Endorsement target"
                value={effectiveEndorsementTarget}
                onChange={(event) => setEndorsementTarget(event.target.value)}
              >
                {endorsementTargets.map((target) => (
                  <option key={target.id} value={target.id}>{target.label}</option>
                ))}
              </select>
            </label>
            <button
              type="button"
              className="secondary small-btn"
              disabled={!effectiveEndorsementTarget || alreadyEndorsed}
              onClick={() => execute("endorse", {
                endorsedId: effectiveEndorsementTarget,
                endorsedType: endorsementType,
              })}
            >
              {alreadyEndorsed ? "Already endorsed" : "Endorse"}
            </button>
          </div>
        )}
      </div>

      <div className="par-ops-block">
        <div className="par-ops-heading">
          <strong>Leadership Elections</strong>
          <span className="muted small">Enter {actionCost("contestPartyLeadership")}, vote {actionCost("votePartyLeadership")}</span>
        </div>
        {leadershipElections.length === 0 ? (
          <p className="muted small">No state or national party leadership election is open.</p>
        ) : leadershipElections.map((election) => {
          const selectedCandidate = leadershipVotes[election.id] ?? election.votes.player ?? election.candidateIds[0] ?? "";
          return (
            <article className="par-ops-election" key={election.id}>
              <div className="par-ops-heading">
                <span><strong>{electionLabel(world, election)}</strong> <span className="muted small">closes turn {election.endTurn}</span></span>
                {!election.candidateIds.includes("player") && (
                  <button
                    type="button"
                    className="secondary small-btn"
                    onClick={() => execute("contestPartyLeadership", { intrapartyElectionId: election.id })}
                  >
                    Enter race
                  </button>
                )}
              </div>
              {election.candidateIds.length === 0 ? (
                <p className="muted small">No candidates have entered this race.</p>
              ) : (
                <div className="par-ops-controls">
                  <label>
                    Candidate
                    <select
                      aria-label={`Candidate for ${electionLabel(world, election)}`}
                      value={selectedCandidate}
                      onChange={(event) => setLeadershipVotes((votes) => ({ ...votes, [election.id]: event.target.value }))}
                    >
                      {election.candidateIds.map((candidateId) => (
                        <option key={candidateId} value={candidateId}>{actorLabel(world, candidateId)}</option>
                      ))}
                    </select>
                  </label>
                  <button
                    type="button"
                    className="secondary small-btn"
                    onClick={() => execute("votePartyLeadership", {
                      intrapartyElectionId: election.id,
                      candidateId: selectedCandidate,
                    })}
                  >
                    {election.votes.player ? "Update vote" : "Cast vote"}
                  </button>
                </div>
              )}
            </article>
          );
        })}
      </div>

      <div className="par-ops-block">
        <div className="par-ops-heading">
          <strong>National Committee</strong>
          <span className="muted small">Enter {actionCost("contestCommittee")}, vote {actionCost("voteCommittee")}</span>
        </div>
        {committeeElections.length === 0 ? (
          <p className="muted small">No national committee election is open.</p>
        ) : committeeElections.map((election) => {
          const picks = committeeVotes[election.id] ?? election.votes.player ?? [];
          return (
            <article className="par-ops-election" key={election.id}>
              <div className="par-ops-heading">
                <span><strong>Committee ballot</strong> <span className="muted small">closes turn {election.endTurn}</span></span>
                {!election.candidateIds.includes("player") && (
                  <button
                    type="button"
                    className="secondary small-btn"
                    onClick={() => execute("contestCommittee", { intrapartyElectionId: election.id })}
                  >
                    Enter race
                  </button>
                )}
              </div>
              {election.candidateIds.length === 0 ? (
                <p className="muted small">No candidates have entered the committee race.</p>
              ) : (
                <>
                  <div className="par-ops-picks" role="group" aria-label="Committee candidates">
                    {election.candidateIds.map((candidateId) => (
                      <label key={candidateId}>
                        <input
                          type="checkbox"
                          checked={picks.includes(candidateId)}
                          onChange={() => toggleCommitteePick(election.id, candidateId, election.votes.player ?? [])}
                        />
                        {actorLabel(world, candidateId)}
                      </label>
                    ))}
                  </div>
                  <div className="par-ops-heading">
                    <span className="muted small">Choose up to 6 candidates. Selected: {picks.length}</span>
                    <button
                      type="button"
                      className="secondary small-btn"
                      disabled={picks.length === 0}
                      onClick={() => execute("voteCommittee", {
                        intrapartyElectionId: election.id,
                        committeeCandidateIds: picks,
                      })}
                    >
                      {election.votes.player ? "Update committee vote" : "Cast committee vote"}
                    </button>
                  </div>
                </>
              )}
            </article>
          );
        })}
      </div>

      <div className="par-ops-block">
        <div className="par-ops-heading">
          <strong>Coalition</strong>
          <span className="muted small">Create {actionCost("createCoalition")}, join {actionCost("joinCoalition")}</span>
        </div>
        {playerCoalition ? (
          <article className="par-ops-election">
            <div className="par-ops-heading">
              <span><strong>{playerCoalition.name}</strong> <span className="muted small">{playerCoalition.memberPartyIds.length} member parties</span></span>
              {!playerCoalition.disbandVote && (
                <button
                  type="button"
                  className="secondary small-btn"
                  onClick={() => execute("initiateCoalitionDisband", { coalitionId: playerCoalition.id })}
                >
                  Start disband vote ({actionCost("initiateCoalitionDisband")})
                </button>
              )}
            </div>
            {playerCoalition.disbandVote && (
              <div className="par-ops-controls">
                <span className="muted small">Vote closes turn {playerCoalition.disbandVote.expiresOnTurn}</span>
                <button
                  type="button"
                  className="secondary small-btn"
                  onClick={() => execute("voteCoalitionDisband", { coalitionId: playerCoalition.id, disbandVote: "yes" })}
                >
                  Vote yes
                </button>
                <button
                  type="button"
                  className="secondary small-btn"
                  onClick={() => execute("voteCoalitionDisband", { coalitionId: playerCoalition.id, disbandVote: "no" })}
                >
                  Vote no
                </button>
              </div>
            )}
          </article>
        ) : (
          <>
            <div className="par-ops-controls">
              <label>
                Coalition name
                <input
                  aria-label="Coalition name"
                  value={coalitionName}
                  onChange={(event) => setCoalitionName(event.target.value)}
                  placeholder="Common Ground Coalition"
                />
              </label>
              <label>
                Abbreviation
                <input
                  aria-label="Coalition abbreviation"
                  value={coalitionAbbr}
                  onChange={(event) => setCoalitionAbbr(event.target.value)}
                  placeholder="CGC"
                />
              </label>
              <button
                type="button"
                className="secondary small-btn"
                disabled={!coalitionName.trim() || !coalitionAbbr.trim()}
                onClick={() => {
                  if (execute("createCoalition", {
                    coalitionName: coalitionName.trim(),
                    coalitionAbbr: coalitionAbbr.trim(),
                    countryId: world.player.countryId,
                  })) {
                    setCoalitionName("");
                    setCoalitionAbbr("");
                  }
                }}
              >
                Create coalition
              </button>
            </div>
            {joinableCoalitions.length === 0 ? (
              <p className="muted small">No coalition in your country is available to join.</p>
            ) : (
              <div className="par-ops-join-list">
                {joinableCoalitions.map((coalition) => (
                  <div className="par-ops-heading" key={coalition.id}>
                    <span>{coalition.name} <span className="muted small">{coalition.memberPartyIds.length} members</span></span>
                    <button
                      type="button"
                      className="secondary small-btn"
                      onClick={() => execute("joinCoalition", { coalitionId: coalition.id })}
                    >
                      Join
                    </button>
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      </div>

      {error && <p className="action-error" role="alert">{error}</p>}
    </section>
  );
}
