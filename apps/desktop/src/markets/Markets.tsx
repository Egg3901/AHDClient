import { useMemo, useState } from "react";
import type { WorldState } from "@ahdclient/engine";
import { game } from "../game.js";
import "./markets.css";

function safeNum(v: unknown, fallback: number): number {
  return typeof v === "number" && Number.isFinite(v) ? v : fallback;
}

function safeStr(v: unknown, fallback: string): string {
  return typeof v === "string" ? v : fallback;
}

function formatPrice(v: unknown): string {
  const n = safeNum(v, 0);
  return n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function formatShares(v: unknown): string {
  const n = safeNum(v, 0);
  return Math.round(n).toLocaleString("en-US");
}

function formatCash(v: unknown): string {
  const n = safeNum(v, 0);
  return n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function sectorLabel(s: string): string {
  return s.replace(/_/g, " ");
}

type CorpView = {
  id: string;
  ticker: string;
  sector: string;
  sharePrice: number;
  fundamentalSharePrice: number;
  publicFloat: number;
  totalShares: number;
  liquidCapital: number;
  insolventSinceTurn: number | null;
  reincorporationCount: number;
  playerShares: number;
  playerAvgCost: number | undefined;
  bankCharter: unknown | null;
};

export function MarketsScreen({
  world,
  onWorld,
  onBack,
  countryId,
}: {
  world: WorldState;
  onWorld: (w: WorldState) => void;
  onBack: () => void;
  countryId?: string;
}) {
  const homeCountryId = safeStr((world as unknown as Record<string, unknown>).player
    ? ((world.player as unknown as Record<string, unknown>)["countryId"] as unknown)
    : undefined, Object.keys((world.countries as Record<string, unknown>) ?? {})[0] ?? "US");
  const playerCountryId = countryId ?? homeCountryId;
  const countries = (world.countries as Record<string, unknown> | undefined) ?? {};
  const playerCountryName = safeStr((countries[playerCountryId] as Record<string, unknown> | undefined)?.["name"], playerCountryId);
  const turn = safeNum((world.meta as unknown as Record<string, unknown>)?.["turn"], 0);
  const date = safeStr((world.meta as unknown as Record<string, unknown>)?.["date"], "");
  const playerCash = safeNum((world.player as unknown as Record<string, unknown>)?.["cash"], 0);
  const playerSavings = safeNum((world.player as unknown as Record<string, unknown>)?.["savings"], 0);
  const savingsHolderRaw = (world.player as unknown as Record<string, unknown>)?.["savingsHolder"];
  const savingsHolder = typeof savingsHolderRaw === "string" ? savingsHolderRaw : "centralBank";

  const corporationsRaw = (world as unknown as Record<string, unknown>)["corporations"] as Record<string, unknown> | undefined;
  const corpsForCountry: CorpView[] = useMemo(() => {
    if (!corporationsRaw || typeof corporationsRaw !== "object") return [];
    const out: CorpView[] = [];
    for (const raw of Object.values(corporationsRaw)) {
      const c = raw as Record<string, unknown>;
      if (safeStr(c["countryId"], "") !== playerCountryId) continue;
      const shareholders = Array.isArray(c["shareholders"]) ? (c["shareholders"] as Array<Record<string, unknown>>) : [];
      const playerHolding = shareholders.find((s) => s["holder"] === "player");
      out.push({
        id: safeStr(c["id"], ""),
        ticker: safeStr(c["tickerSymbol"], safeStr(c["id"], "")),
        sector: safeStr(c["sectorType"], ""),
        sharePrice: safeNum(c["sharePrice"], 0),
        fundamentalSharePrice: safeNum(c["fundamentalSharePrice"], safeNum(c["sharePrice"], 0)),
        publicFloat: safeNum(c["publicFloat"], 0),
        totalShares: safeNum(c["totalShares"], 0),
        liquidCapital: safeNum(c["liquidCapital"], 0),
        insolventSinceTurn: typeof c["insolventSinceTurn"] === "number" && Number.isFinite(c["insolventSinceTurn"] as number) ? (c["insolventSinceTurn"] as number) : null,
        reincorporationCount: safeNum(c["reincorporationCount"], 0),
        playerShares: safeNum(playerHolding?.["shares"], 0),
        playerAvgCost: typeof playerHolding?.["avgCostPerShare"] === "number" && Number.isFinite(playerHolding?.["avgCostPerShare"] as number) ? (playerHolding?.["avgCostPerShare"] as number) : undefined,
        bankCharter: (c["bankCharter"] as unknown) ?? null,
      });
    }
    out.sort((a, b) => a.ticker.localeCompare(b.ticker));
    return out;
  }, [corporationsRaw, playerCountryId]);

  // Portfolio: holdings across all countries (player lens), but spec says corporation table for player country
  // Portfolio panels shows player holdings - we show all player holdings, mark country
  const portfolioHoldings = useMemo(() => {
    if (!corporationsRaw || typeof corporationsRaw !== "object") return [] as Array<CorpView & { countryId: string }>;
    const out: Array<CorpView & { countryId: string }> = [];
    for (const raw of Object.values(corporationsRaw)) {
      const c = raw as Record<string, unknown>;
      const shareholders = Array.isArray(c["shareholders"]) ? (c["shareholders"] as Array<Record<string, unknown>>) : [];
      const playerHolding = shareholders.find((s) => s["holder"] === "player");
      const shares = safeNum(playerHolding?.["shares"], 0);
      if (shares <= 0) continue;
      out.push({
        id: safeStr(c["id"], ""),
        ticker: safeStr(c["tickerSymbol"], safeStr(c["id"], "")),
        sector: safeStr(c["sectorType"], ""),
        sharePrice: safeNum(c["sharePrice"], 0),
        fundamentalSharePrice: safeNum(c["fundamentalSharePrice"], safeNum(c["sharePrice"], 0)),
        publicFloat: safeNum(c["publicFloat"], 0),
        totalShares: safeNum(c["totalShares"], 0),
        liquidCapital: safeNum(c["liquidCapital"], 0),
        insolventSinceTurn: typeof c["insolventSinceTurn"] === "number" && Number.isFinite(c["insolventSinceTurn"] as number) ? (c["insolventSinceTurn"] as number) : null,
        reincorporationCount: safeNum(c["reincorporationCount"], 0),
        playerShares: shares,
        playerAvgCost: typeof playerHolding?.["avgCostPerShare"] === "number" && Number.isFinite(playerHolding?.["avgCostPerShare"] as number) ? (playerHolding?.["avgCostPerShare"] as number) : undefined,
        bankCharter: (c["bankCharter"] as unknown) ?? null,
        countryId: safeStr(c["countryId"], ""),
      });
    }
    out.sort((a, b) => a.ticker.localeCompare(b.ticker));
    return out;
  }, [corporationsRaw]);

  const totalPortfolioValue = useMemo(() => {
    return portfolioHoldings.reduce((sum, h) => sum + h.playerShares * h.sharePrice, 0);
  }, [portfolioHoldings]);

  const totalPortfolioCost = useMemo(() => {
    let hasCost = false;
    let sum = 0;
    for (const h of portfolioHoldings) {
      if (h.playerAvgCost !== undefined) {
        hasCost = true;
        sum += h.playerShares * h.playerAvgCost;
      }
    }
    return hasCost ? sum : null;
  }, [portfolioHoldings]);

  // Banking health: all chartered banks
  const charteredBanks = useMemo(() => {
    if (!corporationsRaw || typeof corporationsRaw !== "object") return [] as Array<{ corpId: string; ticker: string; countryId: string; charter: Record<string, unknown> }>;
    const out: Array<{ corpId: string; ticker: string; countryId: string; charter: Record<string, unknown> }> = [];
    for (const raw of Object.values(corporationsRaw)) {
      const c = raw as Record<string, unknown>;
      const charter = c["bankCharter"] as Record<string, unknown> | undefined;
      if (!charter || typeof charter !== "object") continue;
      out.push({
        corpId: safeStr(c["id"], ""),
        ticker: safeStr(c["tickerSymbol"], safeStr(c["id"], "")),
        countryId: safeStr(c["countryId"], ""),
        charter: charter as Record<string, unknown>,
      });
    }
    out.sort((a, b) => a.corpId.localeCompare(b.corpId));
    return out;
  }, [corporationsRaw]);

  const depositInsuranceRaw = (world as unknown as Record<string, unknown>)["depositInsurance"] as Record<string, unknown> | undefined;

  // Per-row trade state
  const [sharesInput, setSharesInput] = useState<Record<string, string>>({});
  const [rowErrors, setRowErrors] = useState<Record<string, string>>({});
  const [rowSuccess, setRowSuccess] = useState<Record<string, string>>({});
  const [globalError, setGlobalError] = useState<string | null>(null);

  const refreshWorld = () => {
    const w = game.getStateSync();
    if (w) {
      onWorld({
        ...w,
        meta: { ...w.meta },
        player: { ...w.player },
        countries: { ...w.countries },
        corporations: { ...(w as unknown as Record<string, unknown>)["corporations"] as Record<string, unknown> },
        bankLoans: [...((w as unknown as Record<string, unknown>)["bankLoans"] as unknown[])],
        depositInsurance: { ...((w as unknown as Record<string, unknown>)["depositInsurance"] as Record<string, unknown>) },
        news: [...w.news],
      } as WorldState);
    }
  };

  const handleTrade = (corpId: string, kind: "buyShares" | "sellShares") => {
    setRowErrors((prev) => ({ ...prev, [corpId]: "" }));
    setRowSuccess((prev) => ({ ...prev, [corpId]: "" }));
    setGlobalError(null);
    const raw = (sharesInput[corpId] ?? "").trim();
    const shares = Number(raw);
    if (!Number.isInteger(shares) || shares <= 0) {
      setRowErrors((prev) => ({ ...prev, [corpId]: "Enter a positive whole number of shares." }));
      return;
    }
    const corp = corpsForCountry.find((c) => c.id === corpId) ?? portfolioHoldings.find((c) => c.id === corpId);
    if (!corp) {
      setRowErrors((prev) => ({ ...prev, [corpId]: `Unknown corporation: ${corpId}` }));
      return;
    }
    // Quote preview validation is live; execution still validates via engine and surfaces inline
    try {
      const result = game.executeAction(kind, {
        corporationId: corpId,
        corpId: corpId,
        shares,
      } as unknown as Record<string, unknown>);
      if (!result.ok) {
        setRowErrors((prev) => ({ ...prev, [corpId]: result.error }));
        return;
      }
      setRowSuccess((prev) => ({ ...prev, [corpId]: result.message }));
      refreshWorld();
    } catch (e) {
      setRowErrors((prev) => ({ ...prev, [corpId]: e instanceof Error ? e.message : String(e) }));
    }
  };

  const bankHolderLabel = (holder: string) => {
    if (holder === "centralBank") return "Central bank (default)";
    const corp = corporationsRaw?.[holder] as Record<string, unknown> | undefined;
    if (corp) {
      const ticker = safeStr(corp["tickerSymbol"], holder);
      const country = safeStr(corp["countryId"], "");
      return `${ticker} · ${holder} (${country})`;
    }
    return holder;
  };

  return (
    <div className="markets-screen">
      <header className="markets-header">
        <div className="row spread">
          <div className="row" style={{ gap: 12 }}>
            <h1 className="markets-title">MARKETS</h1>
            <span className="muted small markets-subtitle">
              {playerCountryName} ({playerCountryId}) · Turn {turn}
              {date ? ` · ${date}` : ""} · Cash ${formatCash(playerCash)}
            </span>
          </div>
          <button className="secondary small-btn" onClick={onBack}>
            Back to dashboard
          </button>
        </div>
      </header>

      <div className="markets-layout">
        {globalError && (
          <div className="error-text markets-error" role="alert">
            {globalError}
          </div>
        )}

        <section className="panel markets-section">
          <div className="row spread" style={{ marginBottom: 8 }}>
            <h2 style={{ margin: 0 }}>Corporations · {playerCountryName}</h2>
            <span className="muted small markets-note">{corpsForCountry.length} listed</span>
          </div>
          <div className="muted small markets-note" style={{ marginBottom: 12 }}>
            Prices update each turn via the fundamental formula (tangible book + earnings power + growth premium, rate-limited ±35%). Trading is cash-settled against the issuer treasury with no brokerage fee.
          </div>
          {corpsForCountry.length === 0 ? (
            <p className="muted small">No corporations for this country.</p>
          ) : (
            <div className="markets-table-wrap">
              <table className="markets-table">
                <thead>
                  <tr>
                    <th>Corporation</th>
                    <th>Sector</th>
                    <th>Share price</th>
                    <th>Your holding</th>
                    <th>Public float</th>
                    <th>Treasury health</th>
                    <th>Trade</th>
                  </tr>
                </thead>
                <tbody>
                  {corpsForCountry.map((corp) => {
                    const sharesStr = sharesInput[corp.id] ?? "";
                    const parsedShares = Number(sharesStr);
                    const validShares = Number.isInteger(parsedShares) && parsedShares > 0;
                    const quote = validShares ? Math.round(parsedShares * corp.sharePrice * 100) / 100 : 0;
                    const isBank = corp.bankCharter !== null && typeof corp.bankCharter === "object";
                    return (
                      <tr key={corp.id} className={corp.insolventSinceTurn !== null ? "is-insolvent" : undefined}>
                        <td className="markets-corp-cell">
                          <span className="markets-ticker">{corp.ticker}</span>
                          <span className="muted small markets-corp-id">{corp.id}</span>
                          {isBank && <span className="markets-badge bank">bank charter</span>}
                          {corp.insolventSinceTurn !== null && <span className="markets-badge insolvent">insolvent T{corp.insolventSinceTurn}</span>}
                        </td>
                        <td className="markets-sector">{sectorLabel(corp.sector)}</td>
                        <td className="markets-num">${formatPrice(corp.sharePrice)}</td>
                        <td className="markets-num">
                          {formatShares(corp.playerShares)}
                          {corp.playerAvgCost !== undefined && corp.playerShares > 0 && (
                            <span className="muted small" style={{ display: "block", fontSize: 11 }}>
                              avg ${formatPrice(corp.playerAvgCost)}
                            </span>
                          )}
                        </td>
                        <td className="markets-num">
                          {formatShares(corp.publicFloat)}
                          <span className="muted small" style={{ display: "block", fontSize: 11 }}>
                            of {formatShares(corp.totalShares)}
                          </span>
                        </td>
                        <td className="markets-num">
                          ${formatCash(corp.liquidCapital)}
                          {corp.insolventSinceTurn !== null ? (
                            <span className="muted small" style={{ display: "block", fontSize: 11, color: "#ff8a8a" }}>
                              insolvent
                            </span>
                          ) : corp.liquidCapital < 1_000_000 ? (
                            <span className="muted small" style={{ display: "block", fontSize: 11, color: "#ffcc66" }}>
                              thin
                            </span>
                          ) : (
                            <span className="muted small" style={{ display: "block", fontSize: 11 }}>
                              {corp.reincorporationCount > 0 ? `reincorp ×${corp.reincorporationCount}` : "solvent"}
                            </span>
                          )}
                        </td>
                        <td className="markets-trade-cell">
                          <div className="markets-trade-row">
                            <input
                              className="markets-shares-input"
                              placeholder="shares"
                              value={sharesStr}
                              onChange={(e) => {
                                const next = e.target.value;
                                setSharesInput((prev) => ({ ...prev, [corp.id]: next }));
                                setRowErrors((prev) => ({ ...prev, [corp.id]: "" }));
                                setRowSuccess((prev) => ({ ...prev, [corp.id]: "" }));
                              }}
                              inputMode="numeric"
                              aria-label={`Shares for ${corp.ticker}`}
                            />
                            <div className="markets-trade-actions">
                              <button className="secondary small-btn" onClick={() => handleTrade(corp.id, "buyShares")}>
                                Buy
                              </button>
                              <button className="secondary small-btn" onClick={() => handleTrade(corp.id, "sellShares")}>
                                Sell
                              </button>
                            </div>
                          </div>
                          <div className="markets-quote">
                            {validShares ? (
                              <span className="muted small">Quote: {formatShares(parsedShares)} × ${formatPrice(corp.sharePrice)} = ${formatCash(quote)}</span>
                            ) : sharesStr.trim() !== "" ? (
                              <span className="muted small" style={{ color: "#ffcc66" }}>
                                Enter integer shares
                              </span>
                            ) : (
                              <span className="muted small">—</span>
                            )}
                          </div>
                          {rowErrors[corp.id] && (
                            <div className="error-text small" role="alert" style={{ marginTop: 4 }}>
                              {rowErrors[corp.id]}
                            </div>
                          )}
                          {rowSuccess[corp.id] && (
                            <div className="small" role="status" style={{ marginTop: 4, color: "#2af57f" }}>
                              {rowSuccess[corp.id]}
                            </div>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </section>

        <section className="panel markets-section">
          <div className="row spread" style={{ marginBottom: 8 }}>
            <h2 style={{ margin: 0 }}>Portfolio</h2>
            <span className="muted small markets-note">
              Mark-to-market at current share price
              {totalPortfolioCost !== null ? " · cost basis tracked where available (weighted avg purchase price)" : " · cost basis not tracked for these holdings"}
            </span>
          </div>
          {portfolioHoldings.length === 0 ? (
            <p className="muted small">No holdings yet. Buy shares from the table above to build a position.</p>
          ) : (
            <>
              <div className="markets-portfolio-grid">
                {portfolioHoldings.map((h) => {
                  const currentValue = h.playerShares * h.sharePrice;
                  const costBasis = h.playerAvgCost !== undefined ? h.playerShares * h.playerAvgCost : null;
                  const unrealized = costBasis !== null ? currentValue - costBasis : null;
                  const hasCost = costBasis !== null;
                  return (
                    <div key={h.id} className="markets-holding-card">
                      <div className="markets-holding-head">
                        <span className="markets-holding-ticker">{h.ticker}</span>
                        <span className="muted small">{h.countryId} · {sectorLabel(h.sector)}</span>
                      </div>
                      <div className="markets-holding-stats">
                        <span className="markets-stat">
                          <span className="markets-stat-label">Shares</span>
                          <span className="markets-stat-value">{formatShares(h.playerShares)}</span>
                        </span>
                        <span className="markets-stat">
                          <span className="markets-stat-label">Price</span>
                          <span className="markets-stat-value">${formatPrice(h.sharePrice)}</span>
                        </span>
                        <span className="markets-stat">
                          <span className="markets-stat-label">Market value</span>
                          <span className="markets-stat-value">${formatCash(currentValue)}</span>
                        </span>
                      </div>
                      <div className="markets-holding-cost">
                        {hasCost ? (
                          <>
                            <span className="muted small">
                              Cost basis: {formatShares(h.playerShares)} × ${formatPrice(h.playerAvgCost!)} = ${formatCash(costBasis!)}
                            </span>
                            <span className="small" style={{ color: unrealized! >= 0 ? "#2af57f" : "#ff8a8a" }}>
                              Unrealized: {unrealized! >= 0 ? "+" : ""}${formatCash(unrealized!)} ({costBasis! > 0 ? `${(((currentValue / costBasis!) - 1) * 100).toFixed(1)}%` : "—"})
                            </span>
                          </>
                        ) : (
                          <span className="muted small">
                            Cost basis: not tracked for this holding — current value only (${formatCash(currentValue)}). New purchases will track weighted avg cost per share.
                          </span>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
              <div className="markets-portfolio-summary">
                <span className="small">
                  Total market value: <strong>${formatCash(totalPortfolioValue)}</strong>
                </span>
                {totalPortfolioCost !== null && (
                  <span className="small">
                    Total cost basis: ${formatCash(totalPortfolioCost)} · Unrealized:{" "}
                    <span style={{ color: totalPortfolioValue - totalPortfolioCost >= 0 ? "#2af57f" : "#ff8a8a" }}>
                      {totalPortfolioValue - totalPortfolioCost >= 0 ? "+" : ""}${formatCash(totalPortfolioValue - totalPortfolioCost)}
                    </span>
                  </span>
                )}
                {totalPortfolioCost === null && (
                  <span className="muted small">No cost basis on file — portfolio cost will appear after tracked buys establish avg cost per share.</span>
                )}
              </div>
            </>
          )}
        </section>

        <div className="markets-bottom-grid">
          <section className="panel markets-section">
            <h2>Savings</h2>
            <div className="markets-savings">
              <div className="markets-savings-row">
                <span className="markets-stat-label">Balance</span>
                <span className="markets-stat-value">${formatCash(playerSavings)}</span>
              </div>
              <div className="markets-savings-row">
                <span className="markets-stat-label">Holder</span>
                <span className="markets-stat-value small">{bankHolderLabel(savingsHolder)}</span>
              </div>
              <div className="markets-savings-row">
                <span className="markets-stat-label">Placement</span>
                <span className="muted small" style={{ textAlign: "right", maxWidth: 320 }}>
                  {savingsHolder === "centralBank"
                    ? "Held at the central bank (default, earns no interest in solo yet)."
                    : `Held at chartered bank ${bankHolderLabel(savingsHolder)} — earns interest via bankingTurn.`}
                </span>
              </div>
              <div className="markets-note-box muted small">
                Read-only: no action exists yet to move savings holder. world.player.savingsHolder is stored on WorldState but there is no
                {" "}
                <code>moveSavings</code> / <code>transferSavings</code> action wired to game.executeAction in this build. Future wave will add the holder-move flow; bankingTurn and bankSolvencyTurn already honor the pointer.
              </div>
            </div>
          </section>

          <section className="panel markets-section">
            <h2>Bank health</h2>
            <div className="muted small markets-note" style={{ marginBottom: 12 }}>
              One chartered retail bank per playable country (financial sector corp). Confidence is the solvency/liquidity signal recomputed each bankSolvencyTurn.
            </div>
            {charteredBanks.length === 0 ? (
              <p className="muted small">No chartered banks found.</p>
            ) : (
              <ul className="markets-bank-list">
                {charteredBanks.map((bank) => {
                  const confidence = safeNum(bank.charter["confidence"], 0);
                  const band = safeStr(bank.charter["warningBand"], "green");
                  const status = safeStr(bank.charter["status"], "active");
                  const panic = safeNum(bank.charter["panicTurns"], 0);
                  const cashReserves = safeNum(bank.charter["cashReserves"], 0);
                  const totalDeposits = safeNum(bank.charter["totalDeposits"], 0);
                  const postedCapital = safeNum(bank.charter["postedCapital"], 0);
                  const depositCeiling = safeNum(bank.charter["depositCeiling"], 0);
                  const totalLoans = safeNum(bank.charter["totalLoans"], 0);
                  const failedTurn = bank.charter["failedTurn"];
                  const isFailed = status === "failed";
                  return (
                    <li key={bank.corpId} className={`markets-bank-item ${isFailed ? "is-failed" : ""}`}>
                      <div className="markets-bank-head">
                        <span className="markets-bank-name">
                          {bank.ticker} <span className="muted small">({bank.corpId}) · {bank.countryId}</span>
                        </span>
                        <span className={`markets-confidence-badge ${band}`}>
                          {(confidence * 100).toFixed(0)}% {band}
                        </span>
                      </div>
                      <div className="markets-bank-meta">
                        <span className="small">
                          Status: <strong>{status}</strong>
                          {typeof failedTurn === "number" && isFailed ? ` · failed T${failedTurn}` : ""}
                        </span>
                        {panic > 0 && <span className="small" style={{ color: "#ff8a8a" }}>panic {panic} turn(s)</span>}
                      </div>
                      <div className="markets-bank-stats">
                        <span className="markets-stat">
                          <span className="markets-stat-label">Cash reserves</span>
                          <span className="markets-stat-value">${formatCash(cashReserves)}</span>
                        </span>
                        <span className="markets-stat">
                          <span className="markets-stat-label">Deposits</span>
                          <span className="markets-stat-value">${formatCash(totalDeposits)}</span>
                        </span>
                        <span className="markets-stat">
                          <span className="markets-stat-label">Posted capital</span>
                          <span className="markets-stat-value">${formatCash(postedCapital)}</span>
                        </span>
                        <span className="markets-stat">
                          <span className="markets-stat-label">Deposit ceiling</span>
                          <span className="markets-stat-value">{depositCeiling > 0 ? `$${formatCash(depositCeiling)}` : "—"}</span>
                        </span>
                        <span className="markets-stat">
                          <span className="markets-stat-label">Total loans</span>
                          <span className="markets-stat-value">${formatCash(totalLoans)}</span>
                        </span>
                        <span className="markets-stat">
                          <span className="markets-stat-label">Solvency</span>
                          <span className="markets-stat-value">{(confidence * 100).toFixed(1)}%</span>
                        </span>
                      </div>
                      {bank.countryId === playerCountryId && !!depositInsuranceRaw?.[bank.countryId] && (
                        <div className="muted small" style={{ marginTop: 8 }}>
                          Deposit insurance ({bank.countryId}): ${(safeNum((depositInsuranceRaw[bank.countryId] as Record<string, unknown>)?.["balance"], 0)).toLocaleString("en-US")} · cap ${(safeNum((depositInsuranceRaw[bank.countryId] as Record<string, unknown>)?.["insuredCap"], 0)).toLocaleString("en-US")}
                        </div>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}
