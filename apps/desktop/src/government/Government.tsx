import { useMemo, useState } from "react";
import type { WorldState, Legislature, Chamber, Party } from "@ahdclient/engine";
import "./government.css";

const PALETTE = [
  "#3B82F6",
  "#EF4444",
  "#22C55E",
  "#F59E0B",
  "#8B5CF6",
  "#EC4899",
  "#06B6D4",
  "#EAB308",
  "#6366F1",
  "#14B8A6",
] as const;

const VACANCY_COLOR = "#4B5563";

function partyColorForCountry(partyId: string, sortedIds: string[]): string {
  const idx = sortedIds.indexOf(partyId);
  if (idx === -1) {
    let h = 0;
    for (let i = 0; i < partyId.length; i++) h = (h * 31 + partyId.charCodeAt(i)) >>> 0;
    return PALETTE[h % PALETTE.length]!;
  }
  return PALETTE[idx % PALETTE.length]!;
}

function formatIdeology(n: number): string {
  return n.toFixed(1);
}

function chamberHeld(ch: Chamber): number {
  return Object.values(ch.composition.seatsByParty).reduce((s, v) => s + v, 0);
}

function IdeologyMarker({ economic, social }: { economic: number; social: number }) {
  const size = 36;
  const pad = 2;
  const inner = size - pad * 2;
  const x = ((economic + 5) / 10) * inner + pad;
  const y = ((5 - social) / 10) * inner + pad;
  return (
    <span className="gov-marker" style={{ width: size, height: size }} aria-label={`econ ${formatIdeology(economic)} social ${formatIdeology(social)}`}>
      <span className="gov-marker-grid" />
      <span className="gov-marker-dot" style={{ left: x, top: y }} />
    </span>
  );
}

type SortKey = "name" | "party" | "age";
type SortDir = "asc" | "desc";

export function GovernmentScreen({
  world,
  onBack,
  initialCountryId,
}: {
  world: WorldState;
  onBack: () => void;
  initialCountryId?: string;
}) {
  const legislatureCountryIds = useMemo(() => {
    return Object.keys(world.legislatures).sort();
  }, [world.legislatures]);

  const [selectedCountryId, setSelectedCountryId] = useState<string>(() => {
    if (initialCountryId && world.legislatures[initialCountryId]) return initialCountryId;
    return legislatureCountryIds[0] ?? initialCountryId ?? Object.keys(world.countries)[0] ?? "US";
  });

  const legislature: Legislature | undefined = world.legislatures[selectedCountryId];
  const countryName = world.countries[selectedCountryId]?.name ?? selectedCountryId;
  const chambers: Chamber[] = legislature?.chambers ?? [];

  const [selectedChamberKey, setSelectedChamberKey] = useState<string>(() => chambers[0]?.key ?? "");

  // keep selected chamber in sync when country changes
  const effectiveChamberKey = useMemo(() => {
    if (chambers.some((c) => c.key === selectedChamberKey)) return selectedChamberKey;
    return chambers[0]?.key ?? "";
  }, [chambers, selectedChamberKey]);

  const selectedChamber = useMemo(
    () => chambers.find((c) => c.key === effectiveChamberKey) ?? null,
    [chambers, effectiveChamberKey],
  );

  const countryParties: Party[] = useMemo(() => {
    return Object.values(world.parties)
      .filter((p) => p.countryId === selectedCountryId)
      .sort((a, b) => a.id.localeCompare(b.id));
  }, [world.parties, selectedCountryId]);

  const sortedPartyIds = useMemo(() => countryParties.map((p) => p.id), [countryParties]);

  const politicians = useMemo(() => {
    if (!selectedChamber) return [];
    return world.politicians.filter(
      (p) => p.countryId === selectedCountryId && p.chamberKey === effectiveChamberKey,
    );
  }, [world.politicians, selectedCountryId, effectiveChamberKey, selectedChamber]);

  const [sortKey, setSortKey] = useState<SortKey>("name");
  const [sortDir, setSortDir] = useState<SortDir>("asc");

  const sortedPoliticians = useMemo(() => {
    const arr = [...politicians];
    arr.sort((a, b) => {
      let cmp = 0;
      if (sortKey === "name") cmp = a.name.localeCompare(b.name);
      else if (sortKey === "party") cmp = a.partyId.localeCompare(b.partyId);
      else if (sortKey === "age") cmp = a.age - b.age;
      return sortDir === "asc" ? cmp : -cmp;
    });
    return arr;
  }, [politicians, sortKey, sortDir]);

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir("asc");
    }
  };

  const sortIndicator = (key: SortKey) => {
    if (sortKey !== key) return "";
    return sortDir === "asc" ? " \u25B2" : " \u25BC";
  };

  return (
    <div className="gov-screen">
      <header className="gov-header">
        <div className="row spread gov-header-inner">
          <div className="row" style={{ gap: 12 }}>
            <h1 className="gov-title">GOVERNMENT</h1>
            <span className="muted small gov-subtitle">
              {countryName} · {legislature?.name ?? "No legislature"} · Turn {world.meta.turn} · {world.meta.date}
            </span>
          </div>
          <div className="row">
            <button className="secondary small-btn" onClick={onBack}>
              Back to dashboard
            </button>
          </div>
        </div>
        <div className="gov-controls">
          <label className="gov-label">
            Country
            <select
              value={selectedCountryId}
              onChange={(e) => {
                const next = e.target.value;
                setSelectedCountryId(next);
                const leg = world.legislatures[next];
                const first = leg?.chambers[0]?.key ?? "";
                setSelectedChamberKey(first);
              }}
            >
              {legislatureCountryIds.map((id) => (
                <option key={id} value={id}>
                  {world.countries[id]?.name ?? id} ({id})
                </option>
              ))}
            </select>
          </label>
          {chambers.length > 0 && (
            <label className="gov-label">
              Chamber
              <select value={effectiveChamberKey} onChange={(e) => setSelectedChamberKey(e.target.value)}>
                {chambers.map((ch) => (
                  <option key={ch.key} value={ch.key}>
                    {ch.name} ({ch.seats} seats)
                  </option>
                ))}
              </select>
            </label>
          )}
        </div>
      </header>

      {!legislature ? (
        <div className="panel">
          <p className="muted">No legislature data for {selectedCountryId}.</p>
        </div>
      ) : (
        <div className="gov-layout">
          <div className="gov-main">
            <section className="panel gov-section">
              <h2>Chambers</h2>
              <div className="gov-chambers">
                {chambers.map((ch) => {
                  const held = chamberHeld(ch);
                  const vacancies = ch.composition.vacancies;
                  const isActive = ch.key === effectiveChamberKey;
                  const entries = Object.entries(ch.composition.seatsByParty).sort(([a], [b]) =>
                    a.localeCompare(b),
                  );
                  return (
                    <div
                      key={ch.key}
                      className={`gov-chamber ${isActive ? "active" : ""}`}
                      onClick={() => setSelectedChamberKey(ch.key)}
                      role="button"
                      tabIndex={0}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" || e.key === " ") setSelectedChamberKey(ch.key);
                      }}
                      aria-pressed={isActive}
                    >
                      <div className="gov-chamber-head row spread">
                        <div className="gov-chamber-title">
                          <strong>{ch.name}</strong>
                          <span className="muted small"> {ch.shortName}</span>
                        </div>
                        <span className={`gov-tag ${ch.elected ? "elected" : "appointed"}`}>
                          {ch.elected ? "elected" : "appointed"}
                        </span>
                      </div>
                      {ch.description && <div className="muted small gov-chamber-desc">{ch.description}</div>}
                      <div className="gov-bar" aria-label={`${ch.name} seat composition`}>
                        {entries.map(([partyId, count]) => {
                          const w = (count / ch.seats) * 100;
                          const color = partyColorForCountry(partyId, sortedPartyIds);
                          return (
                            <span
                              key={partyId}
                              className="gov-bar-seg"
                              style={{ width: `${w}%`, background: color }}
                              title={`${partyId} ${count}`}
                            />
                          );
                        })}
                        {vacancies > 0 && (
                          <span
                            className="gov-bar-seg gov-bar-vacancy"
                            style={{ width: `${(vacancies / ch.seats) * 100}%`, background: VACANCY_COLOR }}
                            title={`vacancies ${vacancies}`}
                          />
                        )}
                      </div>
                      <div className="gov-chamber-meta muted small">
                        {ch.seats} seats · {held} held · {vacancies} vacant
                      </div>
                      <div className="gov-legend">
                        {entries.map(([partyId, count]) => {
                          const color = partyColorForCountry(partyId, sortedPartyIds);
                          const party = world.parties[partyId];
                          return (
                            <span key={partyId} className="gov-legend-item">
                              <span className="gov-swatch" style={{ background: color }} />
                              <span>{party?.abbreviation ?? partyId}</span>
                              <span className="muted">{count}</span>
                            </span>
                          );
                        })}
                        {vacancies > 0 && (
                          <span className="gov-legend-item">
                            <span className="gov-swatch" style={{ background: VACANCY_COLOR }} />
                            <span>Vacant</span>
                            <span className="muted">{vacancies}</span>
                          </span>
                        )}
                        {entries.length === 0 && vacancies === ch.seats && (
                          <span className="gov-legend-item">
                            <span className="gov-swatch" style={{ background: VACANCY_COLOR }} />
                            <span>Vacant</span>
                            <span className="muted">{vacancies}</span>
                          </span>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </section>

            <section className="panel gov-section">
              <div className="row spread">
                <h2>Roster · {selectedChamber?.name ?? "—"}</h2>
                {selectedChamber && (
                  <span className="muted small gov-countline">
                    {selectedChamber.seats} seats, {chamberHeld(selectedChamber)} held, {selectedChamber.composition.vacancies} vacant
                  </span>
                )}
              </div>

              {!selectedChamber ? (
                <p className="muted">No chamber selected.</p>
              ) : chamberHeld(selectedChamber) === 0 || politicians.length === 0 ? (
                <div className="gov-empty">
                  <p className="muted">no seated members</p>
                  <p className="muted small">
                    {selectedChamber.elected
                      ? "This elected chamber has no current allocations. All seats are vacant."
                      : "This chamber is appointed. No seated members are listed here."}
                  </p>
                </div>
              ) : (
                <div className="gov-table-wrap">
                  <table className="gov-table">
                    <thead>
                      <tr>
                        <th>
                          <button className="gov-sort" onClick={() => toggleSort("name")}>
                            Name{sortIndicator("name")}
                          </button>
                        </th>
                        <th>
                          <button className="gov-sort" onClick={() => toggleSort("party")}>
                            Party{sortIndicator("party")}
                          </button>
                        </th>
                        <th>
                          <button className="gov-sort" onClick={() => toggleSort("age")}>
                            Age{sortIndicator("age")}
                          </button>
                        </th>
                        <th>Ideology (econ / social)</th>
                      </tr>
                    </thead>
                    <tbody>
                      {sortedPoliticians.map((pol) => {
                        const party = world.parties[pol.partyId];
                        const color = partyColorForCountry(pol.partyId, sortedPartyIds);
                        return (
                          <tr key={pol.id}>
                            <td className="gov-name-cell">{pol.name}</td>
                            <td>
                              <span className="gov-party-cell">
                                <span className="gov-swatch small" style={{ background: color }} />
                                {party?.abbreviation ?? pol.partyId}
                              </span>
                            </td>
                            <td style={{ textAlign: "right" }}>{pol.age}</td>
                            <td style={{ textAlign: "right" }}>
                              {formatIdeology(pol.ideology.economic)} / {formatIdeology(pol.ideology.social)}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </section>
          </div>

          <aside className="panel gov-side">
            <h2>Parties · {countryName}</h2>
            {countryParties.length === 0 ? (
              <p className="muted small">No parties for this country.</p>
            ) : (
              <ul className="gov-party-list">
                {countryParties.map((party) => {
                  const color = partyColorForCountry(party.id, sortedPartyIds);
                  return (
                    <li key={party.id} className="gov-party-item">
                      <span className="gov-party-meta">
                        <span className="gov-swatch" style={{ background: color }} />
                        <span className="gov-party-name">{party.name}</span>
                        <span className="muted small gov-party-abbr">({party.abbreviation})</span>
                      </span>
                      <IdeologyMarker economic={party.economicPosition} social={party.socialPosition} />
                      <span className="muted small gov-party-pos">
                        {formatIdeology(party.economicPosition)}, {formatIdeology(party.socialPosition)}
                      </span>
                    </li>
                  );
                })}
              </ul>
            )}
            <div className="muted small gov-side-note">
              Marker: left economic -5 to right +5, bottom libertarian -5 to top authoritarian +5.
            </div>
          </aside>
        </div>
      )}
    </div>
  );
}
