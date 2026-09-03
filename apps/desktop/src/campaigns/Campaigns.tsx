import { useMemo, useState } from "react";
import type { WorldState } from "@ahdclient/engine";
import "./campaigns.css";

// Defensive helpers, same convention as every other screen — WorldState.campaigns
// was added in a later schema wave (W26), so older saves have no campaigns map.
function safeNum(v: unknown, fallback: number): number {
  return typeof v === "number" && Number.isFinite(v) ? v : fallback;
}
function safeStr(v: unknown, fallback: string): string {
  return typeof v === "string" ? v : fallback;
}
function safeArray<T>(v: unknown): T[] {
  return Array.isArray(v) ? (v as T[]) : [];
}

type OpsTree = { starter: boolean; a: number; b: number; c: number };

type CampaignView = {
  id: string;
  electionId: string;
  candidateId: string;
  candidateIsNPP: boolean;
  partyId: string;
  countryId: string;
  electionType: string;
  status: string;
  funds: number;
  actions: number;
  spendThisTurn: number;
  totalFundsGenerated: number;
  totalFundsSpent: number;
  totalActionsGenerated: number;
  totalActionsSpent: number;
  createdAtTurn: number;
  fundraisingTree: OpsTree;
  oppositionResearchTree: OpsTree;
  groundGameTree: OpsTree;
  mediaSpendingTree: OpsTree;
};

function treeLabel(key: string): string {
  if (key === "fundraising") return "Fundraising";
  if (key === "oppositionResearch") return "Opposition research";
  if (key === "groundGame") return "Ground game";
  if (key === "mediaSpending") return "Media spending";
  return key;
}

function TreeCard({ title, tree, effectNote, gapNote }: { title: string; tree: OpsTree; effectNote: string; gapNote: string }) {
  return (
    <div className="camps-tree">
      <div className="camps-tree-head">
        <span className="camps-tree-title">{title}</span>
        <span className={`camps-badge ${tree.starter ? "active" : ""}`}>{tree.starter ? "started" : "not started"}</span>
      </div>
      <div className="camps-branch">
        <span>branch a</span>
        <span>{tree.a} / 3</span>
      </div>
      <div className="camps-branch">
        <span>branch b</span>
        <span>{tree.b} / 3</span>
      </div>
      <div className="camps-branch">
        <span>branch c</span>
        <span>{tree.c} / 3</span>
      </div>
      <div className="camps-effect muted small">{effectNote}</div>
      <div className="camps-stub">{gapNote}</div>
    </div>
  );
}

export function CampaignsScreen({
  world,
  onBack,
}: {
  world: WorldState;
  onBack: () => void;
}) {
  const meta = (world as unknown as Record<string, unknown>)["meta"] as Record<string, unknown> | undefined;
  const turn = safeNum(meta?.["turn"], 0);
  const date = safeStr(meta?.["date"], "");
  const player = (world as unknown as Record<string, unknown>)["player"] as Record<string, unknown> | undefined;
  const playerCountryId = safeStr(player?.["countryId"], Object.keys((world.countries as Record<string, unknown> | undefined) ?? {})[0] ?? "US");
  const countries = (world.countries as Record<string, unknown> | undefined) ?? {};
  const playerCountryName = safeStr((countries[playerCountryId] as Record<string, unknown> | undefined)?.["name"], playerCountryId);

  const campaignsRaw = (world as unknown as Record<string, unknown>)["campaigns"] as Record<string, unknown> | undefined;
  const isPreCampaigns = !campaignsRaw || typeof campaignsRaw !== "object";

  const supportsRaw = (world as unknown as Record<string, unknown>)["candidateSupports"] as Record<string, unknown> | undefined;

  const electionsRaw = safeArray<Record<string, unknown>>((world as unknown as Record<string, unknown>)["elections"] as unknown);
  const electionById = useMemo(() => {
    const m = new Map<string, Record<string, unknown>>();
    for (const e of electionsRaw) {
      const id = safeStr(e["id"], "");
      if (id) m.set(id, e);
    }
    return m;
  }, [electionsRaw]);

  const allCampaigns: CampaignView[] = useMemo(() => {
    if (!campaignsRaw || typeof campaignsRaw !== "object") return [];
    const out: CampaignView[] = [];
    for (const raw of Object.values(campaignsRaw)) {
      const c = raw as Record<string, unknown>;
      const readTree = (v: unknown): OpsTree => {
        const t = (v ?? {}) as Record<string, unknown>;
        return { starter: t["starter"] === true, a: safeNum(t["a"], 0), b: safeNum(t["b"], 0), c: safeNum(t["c"], 0) };
      };
      out.push({
        id: safeStr(c["id"], ""),
        electionId: safeStr(c["electionId"], ""),
        candidateId: safeStr(c["candidateId"], ""),
        candidateIsNPP: Boolean(c["candidateIsNPP"]),
        partyId: safeStr(c["partyId"], ""),
        countryId: safeStr(c["countryId"], ""),
        electionType: safeStr(c["electionType"], ""),
        status: safeStr(c["status"], "active"),
        funds: safeNum(c["funds"], 0),
        actions: safeNum(c["actions"], 0),
        spendThisTurn: safeNum(c["spendThisTurn"], 0),
        totalFundsGenerated: safeNum(c["totalFundsGenerated"], 0),
        totalFundsSpent: safeNum(c["totalFundsSpent"], 0),
        totalActionsGenerated: safeNum(c["totalActionsGenerated"], 0),
        totalActionsSpent: safeNum(c["totalActionsSpent"], 0),
        createdAtTurn: safeNum(c["createdAtTurn"], 0),
        fundraisingTree: readTree(c["fundraisingTree"]),
        oppositionResearchTree: readTree(c["oppositionResearchTree"]),
        groundGameTree: readTree(c["groundGameTree"]),
        mediaSpendingTree: readTree(c["mediaSpendingTree"]),
      });
    }
    out.sort((a, b) => a.electionId.localeCompare(b.electionId) || a.candidateId.localeCompare(b.candidateId));
    return out;
  }, [campaignsRaw]);

  const [filter, setFilter] = useState<"mine" | "country" | "all">("mine");
  const [statusFilter, setStatusFilter] = useState<"active" | "archived" | "all">("active");

  const filtered = useMemo(() => {
    let arr = [...allCampaigns];
    if (statusFilter !== "all") arr = arr.filter((c) => c.status === statusFilter);
    if (filter === "mine") arr = arr.filter((c) => c.candidateId === "player");
    else if (filter === "country") arr = arr.filter((c) => c.countryId === playerCountryId);
    return arr;
  }, [allCampaigns, filter, statusFilter, playerCountryId]);

  const playerCampaigns = useMemo(() => allCampaigns.filter((c) => c.candidateId === "player"), [allCampaigns]);

  return (
    <div className="camps-screen">
      <header className="camps-header">
        <div className="row spread">
          <div className="row" style={{ gap: 12 }}>
            <h1 className="camps-title">CAMPAIGNS</h1>
            <span className="muted small camps-subtitle">
              {playerCountryName} ({playerCountryId}) · Turn {turn}
              {date ? ` · ${date}` : ""} · {playerCampaigns.length} of your own · {allCampaigns.length} total
            </span>
          </div>
          <button className="secondary small-btn" onClick={onBack}>
            Back to dashboard
          </button>
        </div>
        <div className="camps-controls">
          <div className="camps-filter" role="group" aria-label="Filter campaigns">
            <button className={`secondary small-btn ${filter === "mine" ? "active" : ""}`} onClick={() => setFilter("mine")} aria-pressed={filter === "mine"}>
              my races
            </button>
            <button className={`secondary small-btn ${filter === "country" ? "active" : ""}`} onClick={() => setFilter("country")} aria-pressed={filter === "country"}>
              {playerCountryId} only
            </button>
            <button className={`secondary small-btn ${filter === "all" ? "active" : ""}`} onClick={() => setFilter("all")} aria-pressed={filter === "all"}>
              all
            </button>
          </div>
          <div className="camps-filter" role="group" aria-label="Filter status">
            <button className={`secondary small-btn ${statusFilter === "active" ? "active" : ""}`} onClick={() => setStatusFilter("active")} aria-pressed={statusFilter === "active"}>
              active
            </button>
            <button className={`secondary small-btn ${statusFilter === "archived" ? "active" : ""}`} onClick={() => setStatusFilter("archived")} aria-pressed={statusFilter === "archived"}>
              archived
            </button>
            <button className={`secondary small-btn ${statusFilter === "all" ? "active" : ""}`} onClick={() => setStatusFilter("all")} aria-pressed={statusFilter === "all"}>
              all statuses
            </button>
          </div>
        </div>
      </header>

      <div className="camps-layout">
        {isPreCampaigns && (
          <div className="panel camps-empty">
            <p className="muted small">No campaigns on this save. This world was created before the campaign system. Declare a candidacy in Elections to start a campaign, then advance a turn.</p>
            <p className="muted small">Backing: WorldState.campaigns — defensive read, no crash on missing.</p>
          </div>
        )}

        {!isPreCampaigns && filtered.length === 0 && (
          <div className="panel camps-empty">
            <p className="muted small">
              {playerCampaigns.length === 0
                ? "No campaigns yet. Declare a candidacy in Elections (house or senate) to create your first campaign. Income and maintenance run each turn."
                : "No campaigns match this filter."}
            </p>
            <p className="muted small camps-note">
              Backing: WorldState.campaigns keyed by electionId:candidateId. Eligibility: US house/senate only this wave.
            </p>
          </div>
        )}

        {!isPreCampaigns && filtered.length > 0 && (
          <div className="camps-grid">
            {filtered.map((camp) => {
              const election = electionById.get(camp.electionId);
              const electionLabel = election
                ? `${safeStr(election["countryId"], camp.countryId)} ${safeStr(election["electionType"], camp.electionType)} ${safeStr(election["state"], "")} T${safeNum(election["endTurn"], 0)}`
                : camp.electionId;
              const electionStatus = election ? safeStr(election["status"], "") : "";
              const support = supportsRaw?.[camp.candidateId] as Record<string, unknown> | undefined;
              const supportScore = support ? safeNum(support["support"], 0) : null;
              const isPlayer = camp.candidateId === "player";

              return (
                <div key={camp.id} className="camps-card">
                  <div className="camps-card-head">
                    <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                      <span className="camps-candidate">
                        {isPlayer ? "You" : camp.candidateId} · {camp.partyId} · {camp.countryId}
                      </span>
                      <span className="camps-meta">
                        {electionLabel}
                        {electionStatus ? ` · election ${electionStatus}` : ""} · created T{camp.createdAtTurn}
                      </span>
                      <span className="camps-meta" style={{ fontSize: 10 }}>{camp.id}</span>
                    </div>
                    <div style={{ display: "flex", gap: 6, flexDirection: "column", alignItems: "flex-end" }}>
                      <span className={`camps-badge ${camp.status}`}>{camp.status}</span>
                      {camp.candidateIsNPP ? <span className="camps-badge">NPP</span> : <span className="camps-badge player">player</span>}
                    </div>
                  </div>

                  <div className="camps-stats">
                    <div className="camps-stat">
                      <span className="camps-stat-label">Funds</span>
                      <span className="camps-stat-value">{camp.funds.toLocaleString("en-US")}</span>
                    </div>
                    <div className="camps-stat">
                      <span className="camps-stat-label">Actions</span>
                      <span className="camps-stat-value">{camp.actions}</span>
                    </div>
                    <div className="camps-stat">
                      <span className="camps-stat-label">Spend this turn</span>
                      <span className="camps-stat-value">{camp.spendThisTurn.toLocaleString("en-US")}</span>
                    </div>
                    <div className="camps-stat">
                      <span className="camps-stat-label">Support score</span>
                      <span className="camps-stat-value">{supportScore !== null ? supportScore.toFixed(1) : "—"}</span>
                    </div>
                  </div>
                  <div className="muted small" style={{ marginTop: -4 }}>
                    Lifetime: +{camp.totalFundsGenerated.toLocaleString()} funds / -{camp.totalFundsSpent.toLocaleString()} spent ·
                    {" "}+{camp.totalActionsGenerated} actions / -{camp.totalActionsSpent} spent
                  </div>

                  <div className="camps-trees">
                    <TreeCard
                      title={treeLabel("fundraising")}
                      tree={camp.fundraisingTree}
                      effectNote={camp.fundraisingTree.starter ? "Raises base income each turn (feeds camp.funds via calculateCampaignIncome)." : "Not started — earns only the flat base income every campaign gets."}
                      gapNote={
                        camp.candidateIsNPP
                          ? "NPC-managed: campaigns/npcInvestment.ts auto-buys the cheapest affordable tier each turn."
                          : "Read-only: no player upgradeCampaign action exists in game.executeAction's catalog yet — this tree can only advance via a future player-facing action."
                      }
                    />
                    <TreeCard
                      title={treeLabel("mediaSpending")}
                      tree={camp.mediaSpendingTree}
                      effectNote={
                        camp.mediaSpendingTree.starter
                          ? `Feeds your support score above (+favorability/turn, one-turn lag before the election tally reads it; support score currently ${supportScore !== null ? supportScore.toFixed(1) : "n/a"}).`
                          : "Not started — no media favorability passive active."
                      }
                      gapNote={
                        camp.candidateIsNPP
                          ? "NPC-managed: campaigns/npcInvestment.ts auto-buys the cheapest affordable tier each turn."
                          : "Read-only: no player upgradeCampaign action exists in game.executeAction's catalog yet."
                      }
                    />
                    <TreeCard
                      title={treeLabel("groundGame")}
                      tree={camp.groundGameTree}
                      effectNote="Gap: swing-area / GOTV bonuses have no consumer yet — solo's tally has no swing-state weighting wired (engine PORT-STUB, campaigns/opsEffects.ts). Maintenance is still charged correctly even though the effect does nothing."
                      gapNote="No NPC auto-investment either (npcInvestment.ts deliberately skips this lever so nothing is charged for a dead effect) — fully inert until swing-state persuasion lands."
                    />
                    <TreeCard
                      title={treeLabel("oppositionResearch")}
                      tree={camp.oppositionResearchTree}
                      effectNote="Gap: the drain formula (opsEffects.ts getOppoDrainPerTurn) exists but no campaign in solo can set an opposition target yet — there is no targeting UI or Campaign.oppositionTargetId flow, so this never fires."
                      gapNote="No NPC auto-investment either — buying this tree costs real funds for an effect that cannot currently trigger."
                    />
                  </div>

                  <div className="muted small camps-note">
                    Funds are local currency (frozen base rate, not live forex). Spend this turn feeds next turn's election
                    fundsByParty tally (one-turn lag by design — see campaigns/phases.ts). Upgrade $ costs and effect
                    magnitudes live in the engine's campaigns/upgradeCosts.ts table, which is not part of the public
                    @ahdclient/engine API this screen consumes, so exact costs cannot be shown here without either widening
                    the engine's exports or duplicating the balance table in the UI (risking drift) — named honestly
                    rather than guessed.
                  </div>
                </div>
              );
            })}
          </div>
        )}

        <section className="panel camps-section">
          <h2>How campaigns work</h2>
          <p className="muted small camps-note">
            Every campaign-eligible candidacy (US house/senate this wave) gets a Campaign document at entry. Income and
            maintenance run each turn (campaigns/phases.ts campaignTurnPhase); party subsidies and NPC auto-investment
            follow for NPP candidates. There is no player-facing upgrade action in game.executeAction's catalog yet — a
            human-controlled campaign's ops trees can only be advanced by a future engine wave that adds one; until then
            this screen is a readout, not a lever, and says so per tree above rather than pretending otherwise.
          </p>
        </section>
      </div>
    </div>
  );
}
