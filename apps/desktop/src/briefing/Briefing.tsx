import { useCallback, useEffect, useRef, useState } from "react";
import { briefing, freshness, money, nextSection, number, percent, readSection, saveSection, SECTIONS, SECTION_LABELS } from "./briefingApi.js";
import type { Section, Snapshot } from "./briefingApi.js";
import "./briefing.css";

function Stats({ items }: { items: [string, string][] }): JSX.Element {
  return <dl className="briefing-stats">{items.map(([label, value]) =>
    <div key={label}><dt>{label}</dt><dd>{value}</dd></div>,
  )}</dl>;
}

export function Briefing({ floating = false, mobile = false, onBack }: {
  floating?: boolean; mobile?: boolean; onBack?: () => void;
}): JSX.Element {
  const [section, setSection] = useState(readSection);
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [opening, setOpening] = useState(false);
  const [pinned, setPinned] = useState(true);
  const [pinning, setPinning] = useState(false);
  const [now, setNow] = useState(Date.now);
  const alive = useRef(false);
  const inFlight = useRef(false);
  const touch = useRef<{ x: number; y: number } | null>(null);
  const tabs = useRef<Partial<Record<Section, HTMLButtonElement | null>>>({});

  const refresh = useCallback(async () => {
    if (inFlight.current) return;
    inFlight.current = true;
    setBusy(true);
    try {
      const next = await briefing.read();
      if (alive.current) { setSnapshot(next); setError(null); setNow(Date.now()); }
    } catch (failure) {
      if (alive.current) {
        if (String(failure) === "session-changed") setSnapshot(null);
        setError("Cannot refresh. Check your connection and try again.");
      }
    } finally {
      inFlight.current = false;
      if (alive.current) setBusy(false);
    }
  }, []);
  useEffect(() => {
    alive.current = true;
    void refresh();
    const resume = () => { if (!document.hidden) void refresh(); };
    const timer = setInterval(resume, 60_000);
    const clock = setInterval(() => setNow(Date.now()), 15_000);
    window.addEventListener("focus", resume);
    window.addEventListener("online", resume);
    document.addEventListener("visibilitychange", resume);
    return () => {
      alive.current = false;
      clearInterval(timer); clearInterval(clock);
      window.removeEventListener("focus", resume);
      window.removeEventListener("online", resume);
      document.removeEventListener("visibilitychange", resume);
    };
  }, [refresh]);

  const select = (next: Section, focus = false) => {
    setSection(next); saveSection(next);
    if (focus) tabs.current[next]?.focus();
  };
  const expired = snapshot != null && now - snapshot.updatedAt > 24 * 60 * 60_000;
  const ready = snapshot?.status === "ready" && !expired;
  const profile = ready ? snapshot.profile : null;
  const election = ready ? snapshot.election : null;
  const corp = ready ? snapshot.corporation : null;
  const stale = ready && (Boolean(error) || now - snapshot.updatedAt >= 120_000);
  const open = async () => {
    setOpening(true);
    try { await briefing.open(section); } catch { setError("Could not open the game page. Try again."); }
    finally { if (alive.current) setOpening(false); }
  };

  return <main className={`briefing ${floating ? "briefing-floating" : "briefing-page"}`}>
    <header className="briefing-header">
      <div><span className="briefing-eyebrow">A House Divided · Multiplayer</span><h1>Briefing</h1></div>
      {onBack && <button onClick={onBack}>Back</button>}
      {floating && <button aria-pressed={pinned} disabled={pinning} onClick={() => {
        setPinning(true);
        void briefing.pin(!pinned).then(() => setPinned(!pinned))
          .catch(() => setError("Could not change the window pin."))
          .finally(() => setPinning(false));
      }}>{pinned ? "Pinned" : "Pin on top"}</button>}
      {!floating && !mobile && <button onClick={() => void briefing.popOut().catch(() => setError("Could not open picture-in-picture."))}>Picture-in-picture</button>}
    </header>
    <div className="briefing-tabs" role="tablist" aria-label="Briefing cards" onKeyDown={(event) => {
      const next = event.key === "ArrowRight" ? nextSection(section, 1)
        : event.key === "ArrowLeft" ? nextSection(section, -1)
          : event.key === "Home" ? "profile" : event.key === "End" ? "corporation" : null;
      if (next) { event.preventDefault(); select(next, true); }
    }}>
      {SECTIONS.map((s) => <button key={s} ref={(el) => { tabs.current[s] = el; }}
        id={`briefing-tab-${s}`} role="tab" aria-selected={section === s}
        aria-controls="briefing-card" tabIndex={section === s ? 0 : -1}
        onClick={() => select(s)}>{SECTION_LABELS[s]}</button>)}
    </div>
    <section className="briefing-card" id="briefing-card" role="tabpanel"
      aria-labelledby={`briefing-tab-${section}`} tabIndex={0}
      onTouchStart={(event) => {
        const point = event.touches.length === 1 ? event.touches[0] : null;
        touch.current = point ? { x: point.clientX, y: point.clientY } : null;
      }}
      onTouchCancel={() => { touch.current = null; }}
      onTouchEnd={(event) => {
        const start = touch.current; touch.current = null;
        const point = event.changedTouches[0];
        if (!start || !point) return;
        const dx = point.clientX - start.x, dy = point.clientY - start.y;
        if (Math.abs(dx) > 55 && Math.abs(dx) > Math.abs(dy) * 1.5) select(nextSection(section, dx < 0 ? 1 : -1));
      }}>
      {!snapshot ? <p>{busy ? "Loading your briefing…" : "Your briefing is unavailable. Tap Refresh to try again."}</p>
        : snapshot.status === "signed-out" ? <div><h2>Sign in to see your stats</h2><p>Open your profile and sign in with your game account.</p></div>
          : snapshot.status === "no-character" ? <div><h2>No active character</h2><p>Open your profile to choose or create a character.</p></div>
            : expired ? <p>Your saved briefing has expired. Refresh to see current stats.</p>
              : section === "profile" && profile ? <>
                <h2>{profile.name}</h2>
                <Stats items={[
                  ...(profile.isImperial ? [] : [
                    ["Actions", `${number(profile.actions, 0)}${profile.actionCap == null ? "" : ` / ${number(profile.actionCap, 0)}`}`],
                    ["Campaign funds", money(profile.funds, profile.homeCurrency)],
                  ] as [string, string][]),
                  ["Personal cash", money(profile.personalHomeLiquid, profile.homeCurrency)],
                  ...(profile.isImperial ? [] : [
                    ["Influence", number(profile.politicalInfluence)],
                    ["Favorability", percent(profile.favorability)],
                  ] as [string, string][]),
                ]} />
              </> : section === "election" ? <>
                <h2>Your election</h2>
                {election ? <Stats items={[
                  ["Vote share", percent(election.myVotePct)],
                  ["Margin", percent(election.marginPct, true, " pp")],
                  ...(election.isMultiSeat ? [["Projected seats", `${number(election.seatsProjected, 0)} / ${number(election.totalSeats, 0)}`]] as [string, string][] : []),
                ]} /> : <p>No election tally is available for your character yet.</p>}
              </> : section === "corporation" ? <>
                <h2>{corp?.name ?? "Your corporation"}</h2>
                {corp ? <Stats items={[
                  ["Share price", money(corp.sharePrice, corp.liquidCurrencyCode)],
                  ["Price change", percent(corp.priceChange1h, true)],
                  ["Liquid capital", money(corp.liquidCapital, corp.liquidCurrencyCode)],
                  ["Marketing", number(corp.marketingStrength)],
                ]} /> : <p>Your active character does not lead a corporation.</p>}
              </> : null}
    </section>
    <div className="briefing-pagination" aria-label="Change card">
      <button aria-label="Previous card" onClick={() => select(nextSection(section, -1))}>‹</button>
      <span>{SECTIONS.indexOf(section) + 1} / {SECTIONS.length} · Swipe to change</span>
      <button aria-label="Next card" onClick={() => select(nextSection(section, 1))}>›</button>
    </div>
    {error && <p className="briefing-error" role="status">{error}</p>}
    <footer className="briefing-footer">
      <p className={stale ? "briefing-stale" : ""}>
        {ready ? <>{stale ? "Saved data · " : ""}<time dateTime={new Date(snapshot.updatedAt).toISOString()}>{freshness(snapshot.updatedAt, now)}</time></> : "Multiplayer stats"}
      </p>
      <div><button disabled={busy} onClick={() => void refresh()}>{busy ? "Refreshing…" : "Refresh"}</button>
        <button className="briefing-open" disabled={opening} onClick={() => void open()}>{opening ? "Opening…" : `Open ${SECTION_LABELS[section].toLowerCase()}`}</button></div>
    </footer>
    {mobile && <p className="briefing-widget-help">Add AHDClient widgets from your Home Screen widget picker. Widgets refresh when your device allows; the update time shows how recent the stats are.</p>}
  </main>;
}
